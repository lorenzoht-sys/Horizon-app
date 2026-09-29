// api/_lib/notifications.ts
//
// Module d'envoi des notifications push — canal isolé, deux destinataires :
//   - le PATIENT (rappels de séance/exercices, V1 historique) ;
//   - le PRATICIEN (chantier « push praticien », lot E — alerte à la
//     signalisation d'une absence par un bénéficiaire).
// Même mécanique pour les deux (web-push + VAPID, une seule fois configuré),
// deux tables d'abonnement distinctes (push_subscriptions / participant_id,
// praticien_push_subscriptions / praticien_id — voir
// 20260929_praticien_push_subscriptions.sql), toutes deux en service_role
// (contourne RLS). La planification patient (api/cron/rappels.ts) n'appelle
// que `envoyerRappel(...)` ; le déclenchement praticien vit dans
// api/patient/activite.ts (action 'seance-absence').

import type { SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export interface MessageRappel {
  titre: string;
  corps: string;
}

export interface MessagePraticien {
  titre: string;
  corps: string;
  /** Route à ouvrir au clic sur la notification — voir push-sw.js. */
  url: string;
}

export interface ResultatEnvoi {
  nbEnvoyes: number;
  nbEchecs: number;
}

let vapidConfigure = false;

function configurerVapid(): boolean {
  if (vapidConfigure) return true;
  const publicKey = process.env.VITE_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  const contact = process.env.VAPID_CONTACT_EMAIL || 'mailto:contact@example.com';
  // setVapidDetails valide la forme des clés et lève une exception
  // synchrone si elles sont invalides (mauvaise longueur, caractères non
  // base64url...). On ne doit pas laisser planter tout le cron pour autant :
  // on désactive juste le push, comme si VAPID n'était pas configuré.
  try {
    webpush.setVapidDetails(contact, publicKey, privateKey);
  } catch (err) {
    console.error('[rappels] Configuration VAPID invalide, notifications push désactivées :', err);
    return false;
  }
  vapidConfigure = true;
  return true;
}

/**
 * Envoie une notification push à tous les appareils abonnés du patient.
 * Supprime automatiquement les abonnements expirés/invalides (404/410).
 */
async function envoyerPush(supabase: SupabaseClient, participantId: string, message: MessageRappel): Promise<ResultatEnvoi> {
  if (!configurerVapid()) return { nbEnvoyes: 0, nbEchecs: 0 };

  const { data: abonnements } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .eq('participant_id', participantId);

  if (!abonnements || abonnements.length === 0) return { nbEnvoyes: 0, nbEchecs: 0 };

  // `url` explicite dès ce déploiement (repli /patient côté service worker
  // pour les payloads déjà en file d'attente au moment du déploiement, voir
  // push-sw.js) — un seul destinataire possible pour un rappel patient,
  // contrairement au praticien où la route dépend de l'événement.
  const payload = JSON.stringify({ title: message.titre, body: message.corps, url: '/patient' });

  let nbEnvoyes = 0;
  let nbEchecs = 0;

  for (const abo of abonnements) {
    try {
      await webpush.sendNotification(
        { endpoint: abo.endpoint, keys: { p256dh: abo.p256dh, auth: abo.auth_key } },
        payload,
      );
      nbEnvoyes++;
    } catch (err: unknown) {
      nbEchecs++;
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', abo.id);
      }
    }
  }

  return { nbEnvoyes, nbEchecs };
}

/**
 * Point d'entrée unique pour l'envoi d'un rappel à un patient. V1 : push web
 * uniquement (silencieux si aucun abonnement ou clés VAPID absentes).
 */
export async function envoyerRappel(supabase: SupabaseClient, participantId: string, message: MessageRappel): Promise<ResultatEnvoi> {
  return envoyerPush(supabase, participantId, message);
}

/**
 * Envoie une alerte push à tous les appareils abonnés du PRATICIEN
 * propriétaire (praticien_id — jamais aux autres membres d'une éventuelle
 * organisation). Supprime automatiquement les abonnements expirés/invalides
 * (404/410), même logique qu'envoyerPush ci-dessus. Ne lève jamais : un
 * échec d'envoi ne doit jamais faire échouer l'action qui le déclenche (voir
 * api/patient/activite.ts, action 'seance-absence').
 */
async function envoyerPushPraticien(supabase: SupabaseClient, praticienId: string, message: MessagePraticien): Promise<ResultatEnvoi> {
  if (!configurerVapid()) return { nbEnvoyes: 0, nbEchecs: 0 };

  const { data: abonnements } = await supabase
    .from('praticien_push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .eq('praticien_id', praticienId);

  if (!abonnements || abonnements.length === 0) return { nbEnvoyes: 0, nbEchecs: 0 };

  const payload = JSON.stringify({ title: message.titre, body: message.corps, url: message.url });

  let nbEnvoyes = 0;
  let nbEchecs = 0;

  for (const abo of abonnements) {
    try {
      await webpush.sendNotification(
        { endpoint: abo.endpoint, keys: { p256dh: abo.p256dh, auth: abo.auth_key } },
        payload,
      );
      nbEnvoyes++;
    } catch (err: unknown) {
      nbEchecs++;
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from('praticien_push_subscriptions').delete().eq('id', abo.id);
      }
    }
  }

  return { nbEnvoyes, nbEchecs };
}

/**
 * Point d'entrée unique pour l'envoi d'une alerte au praticien propriétaire
 * d'une séance. Silencieux si aucun abonnement ou clés VAPID absentes —
 * jamais d'exception : voir envoyerPushPraticien.
 */
export async function envoyerAlertePraticien(supabase: SupabaseClient, praticienId: string, message: MessagePraticien): Promise<ResultatEnvoi> {
  return envoyerPushPraticien(supabase, praticienId, message);
}
