// Helpers d'abonnement aux notifications push (rappels-patients, T2).
//
// V1 : un seul canal d'envoi (push web), géré par api/_lib/notifications.ts.
// Ces helpers gèrent uniquement l'abonnement côté navigateur (permission +
// PushManager) ; l'enregistrement côté serveur se fait via
// src/lib/patientApi.ts (patientActiverRappels).

export function pushSupporte(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

export function estIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
}

export function estInstalleeSurEcranAccueil(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export type RaisonEchecActivation =
  | 'non_supporte'
  | 'ios_non_installee'
  | 'permission_refusee'
  | 'cle_manquante'
  | 'erreur';

export type ActivationRappelsResultat =
  | { ok: true; subscription: PushSubscriptionJSON }
  | { ok: false; raison: RaisonEchecActivation };

/**
 * Demande la permission de notification puis crée (ou récupère) un
 * abonnement push pour cet appareil. Ne fait AUCUN appel réseau vers le
 * serveur Horizon — l'appelant doit ensuite enregistrer l'abonnement via
 * patientActiverRappels().
 */
export async function activerRappelsPush(): Promise<ActivationRappelsResultat> {
  if (estIOS() && !estInstalleeSurEcranAccueil()) {
    return { ok: false, raison: 'ios_non_installee' };
  }
  if (!pushSupporte()) {
    return { ok: false, raison: 'non_supporte' };
  }

  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!vapidKey) {
    return { ok: false, raison: 'cle_manquante' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, raison: 'permission_refusee' };
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return { ok: false, raison: 'erreur' };

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }
    return { ok: true, subscription: subscription.toJSON() as PushSubscriptionJSON };
  } catch {
    return { ok: false, raison: 'erreur' };
  }
}

export type EtatAbonnementPush = 'abonne' | 'non_abonne' | 'non_supporte';

export async function etatAbonnementPush(): Promise<EtatAbonnementPush> {
  if (!pushSupporte()) return 'non_supporte';
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return 'non_abonne';
    const subscription = await registration.pushManager.getSubscription();
    return subscription ? 'abonne' : 'non_abonne';
  } catch {
    return 'non_supporte';
  }
}

/**
 * Désabonne cet appareil et renvoie l'endpoint (à transmettre à
 * patientDesactiverRappels pour le supprimer côté serveur), ou null si
 * aucun abonnement n'existait.
 */
export async function desactiverRappelsPush(): Promise<string | null> {
  if (!pushSupporte()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return null;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  return endpoint;
}
