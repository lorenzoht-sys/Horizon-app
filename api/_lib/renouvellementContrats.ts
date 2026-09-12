// api/_lib/renouvellementContrats.ts
//
// Renouvellement automatique et silencieux des contrats à durée
// indéterminée (contrats.duree_indeterminee = true) : prolonge date_fin d'un
// an et génère les séances de la nouvelle période. Décision produit :
// aucune notification à Pierre, le contrat existant est prolongé (même id,
// jamais de nouveau contrat créé).
//
// Motif hebdomadaire : dérivé EXCLUSIVEMENT des colonnes du contrat
// (jours_fixe, nb_seances_semaine, durees_seances, heure_debut) — jamais des
// séances déjà générées, même quand elles existent et semblent exploitables.
// Une séance déplacée manuellement (PlanningGrilleView) ou un historique
// récent qui ne correspond plus à la fréquence déclarée sur le contrat ne
// doivent jamais influencer la génération : le contrat est la seule source
// de vérité. jours_fixe[i] et durees_seances[i] se correspondent dans
// l'ordre chronologique de la semaine (lundi → dimanche) — voir
// ORDRE_JOURS_SEMAINE. Si jours_fixe est vide (contrat créé avant que ce
// champ soit obligatoire, jamais rétro-rempli — voir
// supabase/migrations/20260911_02_jours_fixe_contrats.sql), le contrat
// n'est PAS renouvelé : ni date_fin ni séances ne sont touchées, et
// l'anomalie remonte dans le résultat pour que l'appelant la signale
// (useContrats.ts, contratsSansJours — le même prédicat pilote un badge sur
// le contrat et une alerte dashboard, indépendamment de ce que ce module
// renvoie, pour ne pas dépendre de la réponse du cron que personne ne lit
// à 3h15).
//
// L'adresse et les coordonnées d'une séance ne sont pas des colonnes du
// contrat : elles sont lues sur le PARTICIPANT au moment du renouvellement
// (participants.adresse_rue / adresse_code_postal / adresse_ville /
// coordonnees_lat / coordonnees_lng), exactement comme le fait la création
// manuelle (ModalInsererPatient.tsx, PlanningGrilleView.tsx) — l'adresse
// actuelle du bénéficiaire, jamais un instantané figé dans une séance
// passée.
//
// Réutilise genererDatesSeances (src/utils/horaires.ts), la même primitive
// que l'écran manuel, pour générer les dates de chaque jour du motif.
//
// Idempotence : chaque séance générée est vérifiée contre les séances déjà
// en base pour ce contrat (participant+contrat+date, hors annulées — voir
// supabase/migrations/20260622_unique_seances_patient.sql) avant insertion.
// L'extension de date_fin est elle-même sans effet si rejouée : une fois
// prolongée d'un an, le contrat sort immédiatement de la fenêtre de
// sélection et n'est plus resélectionné avant sa prochaine échéance réelle.

import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, addYears, format } from 'date-fns';
import { genererDatesSeances, addMinutes } from '../../src/utils/horaires.js';

// Marge de sécurité avant l'échéance réelle : le job sélectionne les
// contrats à durée indéterminée dont date_fin tombe dans les N prochains
// jours (pas seulement ceux déjà à échéance), pour ne jamais dépendre d'une
// exécution au jour près (jour férié, incident, cron en retard...).
export const MARGE_RENOUVELLEMENT_JOURS = 5;

export type Periodicite = 'semaine' | 'deux_semaines' | 'trois_semaines';

// Ordre chronologique de la semaine (lundi → dimanche), utilisé pour faire
// correspondre jours_fixe[i] à durees_seances[i].
const ORDRE_JOURS_SEMAINE: Record<string, number> = {
  lun: 0, mar: 1, mer: 2, jeu: 3, ven: 4, sam: 5, dim: 6,
};

export interface ContratEligible {
  id: string;
  participant_id: string;
  praticien_id: string | null;
  date_debut: string;
  date_fin: string;
  periodicite: string | null;
  jours_fixe: string[] | null;
  nb_seances_semaine: number;
  durees_seances: number[] | null;
  heure_debut: string | null;
}

export interface NouvelleSeance {
  participant_id: string;
  praticien_id: string | null;
  contrat_id: string;
  date: string;
  heure_debut: string;
  heure_fin: string;
  duree_minutes: number;
  type: 'seance';
  statut: 'planifiee';
  adresse: string | null;
  coordonnees: { lat: number; lng: number } | null;
}

export type ResultatRenouvellement =
  | {
      contratId: string;
      ancienneDateFin: string;
      nouvelleDateFin: string;
      seancesCreees: number;
    }
  | { contratId: string; anomalie: 'jours_fixe_manquant' }
  | { contratId: string; erreur: string };

// Nouvelle échéance : +1 an, jour et mois identiques (cohérent avec la
// génération initiale du formulaire — voir ContratNouveauPage.tsx).
export function calculerNouvelleDateFin(dateFinActuelle: string): string {
  return format(addYears(new Date(dateFinActuelle), 1), 'yyyy-MM-dd');
}

// Point de départ de la génération pour la nouvelle période : le lendemain
// de l'ancienne date_fin, sans jamais remonter avant aujourd'hui — un
// contrat déjà expiré depuis longtemps (remédiation) ne doit générer aucune
// séance dans le passé, seulement à partir de maintenant. Même principe que
// creerDatesRecurrentes (PlanningGrilleView.tsx) : `dateDebut > today ?
// dateDebut : today`.
export function calculerDebutGeneration(ancienneDateFin: string, aujourdhuiStr: string): string {
  const lendemain = format(addDays(new Date(ancienneDateFin), 1), 'yyyy-MM-dd');
  return lendemain > aujourdhuiStr ? lendemain : aujourdhuiStr;
}

// Fonction pure : calcule les séances à créer pour prolonger un contrat, à
// partir UNIQUEMENT du motif déclaré (jours/durées/heure), sans aucun accès
// réseau — testable directement (voir renouvellementContrats.test.ts).
export function calculerSeancesARenouveler(params: {
  datesCouvertes: Set<string> | string[];
  debutGeneration: string;
  finGeneration: string;
  dateAncrage: string;
  periodicite: Periodicite;
  joursFixe: string[];
  dureesSeances: number[];
  heureDebut: string;
  participantId: string;
  praticienId: string | null;
  contratId: string;
  adresse: string | null;
  coordonnees: { lat: number; lng: number } | null;
}): NouvelleSeance[] {
  const {
    datesCouvertes, debutGeneration, finGeneration, dateAncrage, periodicite,
    joursFixe, dureesSeances, heureDebut, participantId, praticienId, contratId,
    adresse, coordonnees,
  } = params;
  if (debutGeneration > finGeneration) return [];

  const couvertes = datesCouvertes instanceof Set ? datesCouvertes : new Set(datesCouvertes);

  // jours_fixe[i] correspond à durees_seances[i] dans l'ordre chronologique
  // de la semaine, quel que soit l'ordre de saisie (voir ORDRE_JOURS_SEMAINE).
  const joursOrdonnes = [...new Set(joursFixe)].sort(
    (a, b) => (ORDRE_JOURS_SEMAINE[a] ?? 99) - (ORDRE_JOURS_SEMAINE[b] ?? 99)
  );

  const nouvelles: NouvelleSeance[] = [];
  joursOrdonnes.forEach((jour, index) => {
    const duree = dureesSeances[index] ?? dureesSeances[0] ?? 45;
    const heureFin = addMinutes(heureDebut, duree);
    const dates = genererDatesSeances(debutGeneration, finGeneration, jour, periodicite, dateAncrage);
    for (const date of dates) {
      if (couvertes.has(date)) continue;
      nouvelles.push({
        participant_id: participantId,
        praticien_id: praticienId,
        contrat_id: contratId,
        date,
        heure_debut: heureDebut,
        heure_fin: heureFin,
        duree_minutes: duree,
        type: 'seance',
        statut: 'planifiee',
        adresse,
        coordonnees,
      });
    }
  });
  return nouvelles;
}

// Contrats candidats : durée indéterminée, actifs, dont date_fin tombe à ou
// avant seuilDateFin (le cron passe aujourd'hui+marge, le script de
// remédiation passe hier — voir les deux appelants).
export async function chargerContratsEligibles(supabase: SupabaseClient, seuilDateFin: string): Promise<ContratEligible[]> {
  const { data, error } = await supabase
    .from('contrats')
    .select('id, participant_id, praticien_id, date_debut, date_fin, periodicite, jours_fixe, nb_seances_semaine, durees_seances, heure_debut')
    .eq('duree_indeterminee', true)
    .eq('statut', 'actif')
    .lte('date_fin', seuilDateFin);

  if (error || !data) return [];
  return data as ContratEligible[];
}

interface AdresseParticipant {
  adresse: string | null;
  coordonnees: { lat: number; lng: number } | null;
}

async function chargerAdresseParticipant(supabase: SupabaseClient, participantId: string): Promise<AdresseParticipant> {
  const { data } = await supabase
    .from('participants')
    .select('adresse_rue, adresse_code_postal, adresse_ville, coordonnees_lat, coordonnees_lng')
    .eq('id', participantId);

  const row = data?.[0] as {
    adresse_rue: string | null;
    adresse_code_postal: string | null;
    adresse_ville: string | null;
    coordonnees_lat: number | null;
    coordonnees_lng: number | null;
  } | undefined;

  if (!row) return { adresse: null, coordonnees: null };

  const adresse = [row.adresse_rue, row.adresse_code_postal, row.adresse_ville].filter(Boolean).join(', ') || null;
  const coordonnees = row.coordonnees_lat != null && row.coordonnees_lng != null
    ? { lat: row.coordonnees_lat, lng: row.coordonnees_lng }
    : null;

  return { adresse, coordonnees };
}

// Renouvelle un seul contrat : insère d'abord les nouvelles séances (étape
// idempotente, sans effet si rejouée), puis prolonge date_fin — dans cet
// ordre précis pour qu'un échec entre les deux étapes laisse le contrat
// resélectionnable au prochain passage plutôt que "renouvelé" sans aucune
// séance pour la nouvelle période. Si jours_fixe est vide, ne touche rien
// (ni séances ni date_fin) et renvoie l'anomalie.
export async function renouvelerUnContrat(
  supabase: SupabaseClient,
  contrat: ContratEligible,
  aujourdhuiStr: string,
): Promise<ResultatRenouvellement> {
  const joursFixe = (contrat.jours_fixe ?? []).filter((j): j is string => !!j);
  if (joursFixe.length === 0) {
    return { contratId: contrat.id, anomalie: 'jours_fixe_manquant' };
  }

  const nouvelleDateFin = calculerNouvelleDateFin(contrat.date_fin);
  const debutGeneration = calculerDebutGeneration(contrat.date_fin, aujourdhuiStr);

  const [seancesResult, adresseParticipant] = await Promise.all([
    supabase.from('seances').select('date').eq('contrat_id', contrat.id).neq('statut', 'annulee'),
    chargerAdresseParticipant(supabase, contrat.participant_id),
  ]);

  if (seancesResult.error) return { contratId: contrat.id, erreur: seancesResult.error.message };

  const datesCouvertes = new Set((seancesResult.data ?? []).map((r: { date: string }) => r.date));

  const dureesSeances = contrat.durees_seances && contrat.durees_seances.length > 0
    ? contrat.durees_seances
    : [45];

  const nouvellesSeances = calculerSeancesARenouveler({
    datesCouvertes,
    debutGeneration,
    finGeneration: nouvelleDateFin,
    dateAncrage: contrat.date_debut,
    periodicite: (contrat.periodicite as Periodicite) ?? 'semaine',
    joursFixe,
    dureesSeances,
    heureDebut: contrat.heure_debut ?? '08:00',
    participantId: contrat.participant_id,
    praticienId: contrat.praticien_id,
    contratId: contrat.id,
    adresse: adresseParticipant.adresse,
    coordonnees: adresseParticipant.coordonnees,
  });

  if (nouvellesSeances.length > 0) {
    const { error: insertError } = await supabase.from('seances').insert(nouvellesSeances);
    if (insertError) return { contratId: contrat.id, erreur: insertError.message };
  }

  const { error: updateError } = await supabase
    .from('contrats')
    .update({ date_fin: nouvelleDateFin })
    .eq('id', contrat.id);
  if (updateError) return { contratId: contrat.id, erreur: updateError.message };

  return {
    contratId: contrat.id,
    ancienneDateFin: contrat.date_fin,
    nouvelleDateFin,
    seancesCreees: nouvellesSeances.length,
  };
}

// Orchestrateur commun au cron et au script de remédiation : charge les
// contrats éligibles pour le seuil donné et les renouvelle un par un.
// Séquentiel plutôt qu'en parallèle : plus simple à raisonner pour
// l'idempotence, et le volume de contrats à durée indéterminée n'a aucune
// raison d'être assez grand pour que ça pose un problème de latence.
export async function renouvelerContratsEligibles(
  supabase: SupabaseClient,
  seuilDateFin: string,
  aujourdhuiStr: string = format(new Date(), 'yyyy-MM-dd'),
): Promise<ResultatRenouvellement[]> {
  const contrats = await chargerContratsEligibles(supabase, seuilDateFin);
  const resultats: ResultatRenouvellement[] = [];
  for (const contrat of contrats) {
    try {
      resultats.push(await renouvelerUnContrat(supabase, contrat, aujourdhuiStr));
    } catch (err) {
      resultats.push({ contratId: contrat.id, erreur: err instanceof Error ? err.message : String(err) });
    }
  }
  return resultats;
}
