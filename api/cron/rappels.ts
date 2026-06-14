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
// À chaque exécution, deux traitements indépendants :
//   - rappel de séance : séances "planifiee" dont l'heure de début tombe
//     dans la fenêtre configurée (rappel_seance_delai_heures) → push +
//     entrée dans rappels_envoyes.
//   - relance exercices : patients avec un programme actif, inactifs depuis
//     au moins relance_exercices_seuil_jours, et n'ayant pas déjà reçu de
//     relance dans cette fenêtre → push + entrée dans rappels_envoyes.
//
// Le journal rappels_envoyes garantit qu'un même rappel n'est jamais envoyé
// deux fois, même si le cron tourne plusieurs fois dans la fenêtre.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '../_lib/patientAuth.js';
import { withSentry } from '../_lib/sentry.js';
import { envoyerRappel } from '../_lib/notifications.js';
import {
  resoudrePrefs,
  dateHeureParisVersUTC,
  seanceDansLaFenetreDeRappel,
  doitRelancerExercices,
  MESSAGE_RAPPEL_SEANCE,
  MESSAGE_RELANCE_EXERCICES,
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
  if (fourni !== secret) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  let supabase: SupabaseClient;
  try {
    supabase = getServiceClient();
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }

  const [rappelsSeance, relances] = await Promise.all([
    traiterRappelsSeance(supabase),
    traiterRelancesExercices(supabase),
  ]);

  return res.status(200).json({ rappelsSeance, relances });
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

async function traiterRelancesExercices(supabase: SupabaseClient): Promise<{ examines: number; envoyes: number }> {
  const maintenant = new Date();

  // Seuls les patients avec un programme actif sont éligibles à la relance.
  const { data: programmesActifs } = await supabase
    .from('programmes')
    .select('participant_id')
    .eq('actif', true);

  const participantIds = [...new Set((programmesActifs ?? []).map((p: any) => p.participant_id as string))];
  if (participantIds.length === 0) return { examines: 0, envoyes: 0 };

  const { data: participants } = await supabase
    .from('participants')
    .select('id, praticien_id, date_creation')
    .in('id', participantIds);
  if (!participants || participants.length === 0) return { examines: 0, envoyes: 0 };

  const praticienIds = [...new Set(participants.map((p: any) => p.praticien_id as string | null).filter((id): id is string => !!id))];
  const [prefsGlobales, prefsParticipants] = await Promise.all([
    chargerPrefsGlobales(supabase, praticienIds),
    chargerPrefsParticipants(supabase, participantIds),
  ]);

  // Dernière activité = dernière séance enregistrée par le patient (même
  // métrique que l'onglet "Assiduité" de la fiche patient).
  const { data: dernieresSeances } = await supabase
    .from('seances_patient')
    .select('participant_id, date_seance')
    .in('participant_id', participantIds)
    .order('date_seance', { ascending: false });

  const derniereActiviteParPatient = new Map<string, string>();
  for (const sp of (dernieresSeances ?? []) as any[]) {
    if (!derniereActiviteParPatient.has(sp.participant_id)) {
      derniereActiviteParPatient.set(sp.participant_id, sp.date_seance);
    }
  }

  // Dernière relance déjà envoyée par patient (anti-harcèlement).
  const { data: dernieresRelances } = await supabase
    .from('rappels_envoyes')
    .select('participant_id, envoye_le')
    .eq('type', 'relance_exercices')
    .in('participant_id', participantIds)
    .order('envoye_le', { ascending: false });

  const derniereRelanceParPatient = new Map<string, string>();
  for (const r of (dernieresRelances ?? []) as any[]) {
    if (!derniereRelanceParPatient.has(r.participant_id)) {
      derniereRelanceParPatient.set(r.participant_id, r.envoye_le);
    }
  }

  let envoyes = 0;
  for (const participant of participants as any[]) {
    const prefs = resoudrePrefs(prefsParticipants.get(participant.id), prefsGlobales.get(participant.praticien_id));

    const derniereActiviteISO: string | null = derniereActiviteParPatient.get(participant.id)
      ?? participant.date_creation
      ?? null;
    if (!derniereActiviteISO) continue;

    const derniereActivite = new Date(derniereActiviteISO.length === 10 ? `${derniereActiviteISO}T12:00:00Z` : derniereActiviteISO);

    const derniereRelanceISO = derniereRelanceParPatient.get(participant.id) ?? null;
    const derniereRelance = derniereRelanceISO ? new Date(derniereRelanceISO) : null;

    if (!doitRelancerExercices(maintenant, derniereActivite, derniereRelance, prefs)) continue;

    await envoyerRappel(supabase, participant.id, MESSAGE_RELANCE_EXERCICES);
    await supabase.from('rappels_envoyes').insert({ participant_id: participant.id, type: 'relance_exercices' });
    envoyes++;
  }

  return { examines: participants.length, envoyes };
}
