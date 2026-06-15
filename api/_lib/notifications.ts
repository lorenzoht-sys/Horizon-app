// api/_lib/notifications.ts
//
// Module d'envoi des rappels patients — canal isolé.
//
// V1 : un seul canal, notification push web (PWA), via la librairie
// `web-push`. La planification (api/cron/rappels.ts) n'appelle que
// `envoyerRappel(...)` : pour ajouter un canal SMS plus tard, il suffira
// d'ajouter une branche ici (ex: si aucun abonnement push, envoyer un SMS),
// sans rien changer côté planification/journalisation.

import type { SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export interface MessageRappel {
  titre: string;
  corps: string;
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

  const payload = JSON.stringify({ title: message.titre, body: message.corps });

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
