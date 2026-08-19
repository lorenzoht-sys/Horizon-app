// api/cron/rappels.ts
//
// POST /api/cron/rappels — endpoint déclenché périodiquement par un job
// pg_cron (Supabase, via pg_net). Voir RAPPORT_RAPPELS.md pour la
// configuration complète côté Supabase.
//
// Protection : l'appelant doit fournir l'en-tête `x-cron-secret` avec la
// valeur de la variable d'environnement CRON_SECRET (jamais exposée au
// client, configurée uniquement sur Vercel).
//
// À chaque exécution, deux traitements indépendants, tous deux basés sur les
// séances ENCADRÉES (table seances, statut 'planifiee') :
//   - rappel de séance : l'heure de début tombe dans la fenêtre configurée
//     (rappel_seance_delai_heures) → push + entrée dans rappels_envoyes.
//   - rappel veille de séance : une séance existe DEMAIN pour ce patient et
//     l'heure civile Paris a atteint l'heure configurée
//     (rappel_jour_seance_heure, défaut 19h) → push la veille au soir +
//     entrée dans rappels_envoyes (au plus un par jour, quel que soit le
//     nombre de séances le lendemain). Remplace l'ancienne relance
//     d'inactivité (basée sur seances_patient).
//
// Le journal rappels_envoyes garantit qu'un même rappel n'est jamais envoyé
// deux fois, même si le cron tourne plusieurs fois dans la fenêtre.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '../_lib/patientAuth.js';
import { withSentry } from '../_lib/sentry.js';
import { compareSecretTimingSafe } from '../_lib/guard.js';
import { envoyerRappel } from '../_lib/notifications.js';
import {
  resoudrePrefs,
  dateHeureParisVersUTC,
  seanceDansLaFenetreDeRappel,
  doitEnvoyerRappelVeilleSeance,
  MESSAGE_RAPPEL_SEANCE,
  MESSAGE_RAPPEL_VEILLE_SEANCE,
  type RowPrefs,
} from '../_lib/rappels.js';

export default withSentry(async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'CRON_SECRET non configuré' });
  }

  const header = req.headers['x-cron-secret'];
  const fourni = Array.isArray(header) ? header[0] : header;
  // Comparaison à temps constant (docs/RAPPORT_SECURITE.md) : un `!==`
  // classique compare caractère par caractère et peut fuiter, via le temps
  // de réponse, la longueur du préfixe correct du secret deviné.
  if (!compareSecretTimingSafe(fourni ?? '', secret)) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  let supabase: SupabaseClient;
  try {
    supabase = getServiceClient();
  } catch (err) {
    console.error('[api/cron/rappels] getServiceClient:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }

  try {
    const [rappelsSeance, rappelsVeilleSeance] = await Promise.all([
      traiterRappelsSeance(supabase),
      traiterRappelsVeilleSeance(supabase),
    ]);

    return res.status(200).json({ rappelsSeance, rappelsVeilleSeance });
  } catch (err) {
    // En cas d'échec, on renvoie le détail de l'exception (au moins le
    // message) plutôt qu'un "Erreur serveur" générique : utile pour
    // diagnostiquer un futur problème depuis les logs Vercel sans avoir à
    // deviner.
    const detail = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: 'Erreur serveur', detail: detail.slice(0, 500) });
  }
});

async function chargerPrefsGlobales(supabase: SupabaseClient, praticienIds: string[]): Promise<Map<string, RowPrefs>> {
  if (praticienIds.length === 0) return new Map();
  const { data } = await supabase
    .from('rappel_preferences')
    .select('*')
    .is('participant_id', null)
    .in('praticien_id', praticienIds);
  return new Map((data ?? []).map((r: any) => [r.praticien_id as string, r as RowPrefs]));
}

async function chargerPrefsParticipants(supabase: SupabaseClient, participantIds: string[]): Promise<Map<string, RowPrefs>> {
  if (participantIds.length === 0) return new Map();
  const { data } = await supabase
    .from('rappel_preferences')
    .select('*')
    .in('participant_id', participantIds);
  return new Map((data ?? []).map((r: any) => [r.participant_id as string, r as RowPrefs]));
}

async function traiterRappelsSeance(supabase: SupabaseClient): Promise<{ examinees: number; envoyes: number }> {
  const maintenant = new Date();
  const aujourdhui = maintenant.toISOString().slice(0, 10);
  const demain = new Date(maintenant.getTime() + 86_400_000).toISOString().slice(0, 10);

  // Les séances "lointaines" sont écartées avant même de calculer la fenêtre
  // précise (qui dépend des préférences) : aujourd'hui ou demain (UTC)
  // couvre toujours la fenêtre de rappel (max 48h) avec la marge du
  // décalage horaire Europe/Paris.
  const { data: seances, error } = await supabase
    .from('seances')
    .select('id, participant_id, praticien_id, date, heure_debut')
    .eq('statut', 'planifiee')
    .in('date', [aujourdhui, demain]);

  if (error || !seances || seances.length === 0) return { examinees: 0, envoyes: 0 };

  const participantIds = [...new Set(seances.map((s: any) => s.participant_id as string))];
  const praticienIds = [...new Set(seances.map((s: any) => s.praticien_id as string | null).filter((id): id is string => !!id))];

  const [prefsGlobales, prefsParticipants] = await Promise.all([
    chargerPrefsGlobales(supabase, praticienIds),
    chargerPrefsParticipants(supabase, participantIds),
  ]);

  let envoyes = 0;
  for (const seance of seances as any[]) {
    const prefs = resoudrePrefs(prefsParticipants.get(seance.participant_id), prefsGlobales.get(seance.praticien_id));
    const dateHeure = dateHeureParisVersUTC(seance.date, seance.heure_debut);
    if (!seanceDansLaFenetreDeRappel(maintenant, dateHeure, prefs)) continue;

    const { data: dejaEnvoye } = await supabase
      .from('rappels_envoyes')
      .select('id')
      .eq('participant_id', seance.participant_id)
      .eq('type', 'rappel_seance')
      .eq('reference_id', seance.id)
      .maybeSingle();
    if (dejaEnvoye) continue;

    await envoyerRappel(supabase, seance.participant_id, MESSAGE_RAPPEL_SEANCE);
    await supabase.from('rappels_envoyes').insert({
      participant_id: seance.participant_id,
      type: 'rappel_seance',
      reference_id: seance.id,
    });
    envoyes++;
  }

  return { examinees: seances.length, envoyes };
}

async function traiterRappelsVeilleSeance(supabase: SupabaseClient): Promise<{ examines: number; envoyes: number }> {
  const maintenant = new Date();
  const aujourdhui = maintenant.toISOString().slice(0, 10);
  const demain = new Date(maintenant.getTime() + 86_400_000).toISOString().slice(0, 10);

  // Même table/filtre que traiterRappelsSeance (séances encadrées
  // "planifiee"), restreint à DEMAIN (le rappel part la veille au soir) : un
  // seul rappel par jour, quel que soit le nombre de séances le lendemain —
  // pas de fenêtre horaire à calculer par séance ici, contrairement à
  // rappel_seance.
  const { data: seances, error } = await supabase
    .from('seances')
    .select('participant_id, praticien_id')
    .eq('statut', 'planifiee')
    .eq('date', demain);

  if (error || !seances || seances.length === 0) return { examines: 0, envoyes: 0 };

  const praticienIdParParticipant = new Map<string, string | null>();
  for (const s of seances as any[]) {
    if (!praticienIdParParticipant.has(s.participant_id)) {
      praticienIdParParticipant.set(s.participant_id, s.praticien_id ?? null);
    }
  }
  const participantIds = [...praticienIdParParticipant.keys()];
  const praticienIds = [...new Set([...praticienIdParParticipant.values()].filter((id): id is string => !!id))];

  const [prefsGlobales, prefsParticipants] = await Promise.all([
    chargerPrefsGlobales(supabase, praticienIds),
    chargerPrefsParticipants(supabase, participantIds),
  ]);

  // Dernier rappel "veille de séance" déjà envoyé par patient (au plus un
  // par jour). Le type en base reste 'rappel_jour_seance' (journal
  // rappels_envoyes inchangé) — seule la logique de déclenchement change.
  const { data: derniersRappels } = await supabase
    .from('rappels_envoyes')
    .select('participant_id, envoye_le')
    .eq('type', 'rappel_jour_seance')
    .in('participant_id', participantIds)
    .order('envoye_le', { ascending: false });

  const dernierEnvoiParPatient = new Map<string, string>();
  for (const r of (derniersRappels ?? []) as any[]) {
    if (!dernierEnvoiParPatient.has(r.participant_id)) {
      dernierEnvoiParPatient.set(r.participant_id, r.envoye_le);
    }
  }

  let envoyes = 0;
  for (const participantId of participantIds) {
    const praticienId = praticienIdParParticipant.get(participantId) ?? null;
    const prefs = resoudrePrefs(prefsParticipants.get(participantId), praticienId ? prefsGlobales.get(praticienId) : undefined);

    const dernierEnvoiISO = dernierEnvoiParPatient.get(participantId) ?? null;
    const dejaEnvoyeAujourdhui = dernierEnvoiISO ? dernierEnvoiISO.slice(0, 10) === aujourdhui : false;

    if (!doitEnvoyerRappelVeilleSeance(maintenant, prefs, dejaEnvoyeAujourdhui)) continue;

    await envoyerRappel(supabase, participantId, MESSAGE_RAPPEL_VEILLE_SEANCE);
    await supabase.from('rappels_envoyes').insert({ participant_id: participantId, type: 'rappel_jour_seance' });
    envoyes++;
  }

  return { examines: participantIds.length, envoyes };
}
