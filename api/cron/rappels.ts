// api/cron/rappels.ts
//
// POST|GET /api/cron/rappels — POINT D'ENTRÉE CRON UNIQUE, déclenché toutes
// les heures par un job pg_cron (Supabase, via pg_net).
//
// ⚠️ Le nom du fichier ne dit plus tout ce qu'il fait. Cet endpoint porte
// désormais DEUX traitements sans rapport l'un avec l'autre :
//
//   - les rappels patients, à chaque exécution (toutes les heures) ;
//   - le renouvellement des contrats à durée indéterminée, une seule fois
//     par jour, à HEURE_RENOUVELLEMENT_UTC (voir api/_lib/cronTaches.ts).
//
// Le nom `rappels` est conservé volontairement : l'URL /api/cron/rappels est
// déjà câblée dans les jobs pg_cron de production ET de staging. La renommer
// ferait tomber les rappels en 404 tant que le script SQL n'est pas rejoué à
// la main sur les deux projets Supabase — un mode de panne bien pire que ce
// nom devenu imprécis.
//
// Pourquoi cette fusion : le plan Vercel Hobby plafonne à 12 fonctions
// serverless. L'ajout de api/cron/renouveler-contrats.ts portait le projet à
// 13 et faisait échouer le build staging. Les deux endpoints partageaient
// déjà la même protection (CRON_SECRET) et le même déclencheur pg_cron.
//
// Protection : l'appelant doit fournir l'en-tête `x-cron-secret` avec la
// valeur de la variable d'environnement CRON_SECRET (jamais exposée au
// client, configurée uniquement sur Vercel).
//
// Les deux traitements s'exécutent l'un après l'autre et sont ISOLÉS : un
// contrat mal formé qui fait lever le renouvellement n'empêche pas l'envoi
// des rappels du jour, et inversement (voir api/_lib/cronTaches.ts). La
// réponse HTTP est 207 dès qu'au moins un des deux a échoué, 200 sinon — un
// 200 franc ne doit jamais masquer une tâche tombée.
//
// ── Rappels patients ────────────────────────────────────────────────────────
// Deux traitements indépendants, tous deux basés sur les séances ENCADRÉES
// (table seances, statut 'planifiee') :
//   - rappel de séance : l'heure de début tombe dans la fenêtre configurée
//     (rappel_seance_delai_heures) → push + entrée dans rappels_envoyes.
//   - rappel veille de séance : une séance existe DEMAIN pour ce patient et
//     l'heure civile Paris a atteint l'heure configurée
//     (rappel_jour_seance_heure, défaut 19h) → push la veille au soir +
//     entrée dans rappels_envoyes (au plus un par jour, quel que soit le
//     nombre de séances le lendemain).
// Le journal rappels_envoyes garantit qu'un même rappel n'est jamais envoyé
// deux fois, même si le cron tourne plusieurs fois dans la fenêtre.
// Voir RAPPORT_RAPPELS.md pour la configuration complète côté Supabase.
//
// ── Renouvellement des contrats ─────────────────────────────────────────────
// Prolonge silencieusement (aucune notification à Pierre) les contrats à
// durée indéterminée dont l'échéance approche : date_fin + 1 an et génération
// des séances de la nouvelle période, d'après le motif déclaré sur le contrat
// — jamais d'après les séances déjà générées. Toute la logique est dans
// api/_lib/renouvellementContrats.ts, inchangée par la fusion.

import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, format } from 'date-fns';
import { getServiceClient } from '../_lib/patientAuth.js';
import { withSentry } from '../_lib/sentry.js';
import { secretsIdentiques } from '../_lib/secrets.js';
import { envoyerRappel } from '../_lib/notifications.js';
import {
  doitRenouvelerMaintenant,
  executerTachesCron,
  HEURE_RENOUVELLEMENT_UTC,
  type ResultatTache,
  type Tache,
} from '../_lib/cronTaches.js';
import { MARGE_RENOUVELLEMENT_JOURS, renouvelerContratsEligibles } from '../_lib/renouvellementContrats.js';
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
  // Comparaison a temps constant : un `!==` s'arrete au premier caractere
  // qui differe et fuite, par le temps de reponse, la longueur du prefixe
  // correct du secret devine. Voir api/_lib/secrets.ts.
  if (!secretsIdentiques(fourni ?? '', secret)) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  let supabase: SupabaseClient;
  try {
    supabase = getServiceClient();
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }

  const maintenant = new Date();
  const { resultats } = await executerTachesCron(construireTaches(supabase, maintenant));

  // Le renouvellement est absent des 23 exécutions horaires qui ne le
  // concernent pas : on le dit explicitement plutôt que de le laisser
  // manquant dans la réponse, pour qu'un coup d'oeil aux logs distingue
  // « ce n'était pas l'heure » de « tombé sans rien dire ».
  if (!doitRenouvelerMaintenant(maintenant)) {
    resultats.renouvellement = {
      statut: 'ignoree',
      raison: `hors fenêtre — renouvellement quotidien à ${HEURE_RENOUVELLEMENT_UTC}h UTC`,
    };
  }

  const enEchec = Object.values(resultats).some((r: ResultatTache) => r.statut === 'erreur');
  return res.status(enEchec ? 207 : 200).json(resultats);
});

/**
 * Liste des tâches de cette exécution, dans l'ordre où elles doivent
 * tourner. Les rappels d'abord : ils sont sensibles à l'heure (fenêtre de
 * rappel, 19h pour la veille de séance), alors que le renouvellement ne
 * l'est plus une fois sa fenêtre quotidienne atteinte.
 */
function construireTaches(supabase: SupabaseClient, maintenant: Date): Tache[] {
  const taches: Tache[] = [
    {
      nom: 'rappels',
      executer: async () => {
        const [rappelsSeance, rappelsVeilleSeance] = await Promise.all([
          traiterRappelsSeance(supabase),
          traiterRappelsVeilleSeance(supabase),
        ]);
        return { rappelsSeance, rappelsVeilleSeance };
      },
    },
  ];

  if (doitRenouvelerMaintenant(maintenant)) {
    taches.push({
      nom: 'renouvellement',
      executer: () => traiterRenouvellementContrats(supabase, maintenant),
    });
  }

  return taches;
}

/**
 * Renouvellement des contrats à durée indéterminée — corps repris tel quel
 * de l'ancien api/cron/renouveler-contrats.ts, sans changement de logique.
 */
async function traiterRenouvellementContrats(supabase: SupabaseClient, maintenant: Date) {
  const aujourdhuiStr = format(maintenant, 'yyyy-MM-dd');
  const seuilDateFin = format(addDays(maintenant, MARGE_RENOUVELLEMENT_JOURS), 'yyyy-MM-dd');

  const resultats = await renouvelerContratsEligibles(supabase, seuilDateFin, aujourdhuiStr);
  const seancesCreees = resultats.reduce((acc, r) => acc + ('seancesCreees' in r ? r.seancesCreees : 0), 0);
  const erreurs = resultats.filter((r): r is { contratId: string; erreur: string } => 'erreur' in r);
  // jours_fixe manquant : ni erreur technique ni renouvellement, contrat
  // volontairement non touché. Remonté ici pour les logs Vercel, mais le
  // signalement qui compte pour Pierre est côté UI (useContrats.ts,
  // contratsSansJours), indépendant de cette réponse.
  const anomalies = resultats.filter((r): r is { contratId: string; anomalie: 'jours_fixe_manquant' } => 'anomalie' in r);

  return {
    examines: resultats.length,
    renouveles: resultats.length - erreurs.length - anomalies.length,
    seancesCreees,
    erreurs,
    anomalies,
  };
}

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
