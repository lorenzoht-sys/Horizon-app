// api/_lib/planningIcs.ts
//
// Logique du flux iCalendar (webcal) d'abonnement au planning d'un
// praticien — export à sens unique, lecture seule, pas de synchronisation
// temps réel. Extraite de api/planning/ics.ts pour être testable
// unitairement (vitest), même séparation que api/_lib/rappels.ts.
//
// Confidentialité : le flux ne doit jamais exposer notes, motif_annulation,
// motif_annulation_detail (données internes au praticien, voir
// supabase/migrations/20260708_motif_annulation_seances.sql) ni le nom
// complet du bénéficiaire (seulement "Prénom I."). Le DESCRIPTION du VEVENT
// ne contient que code_portail / personne_contact (voir
// supabase/migrations/20260820_add_infos_complementaires_participants.sql),
// jamais ces autres champs.

import type { SupabaseClient } from '@supabase/supabase-js';
import ical from 'ical-generator';
import { addMonths, subMonths, format } from 'date-fns';
import { dateHeureParisVersUTC } from './rappels.js';

// Fenêtre glissante du flux : large côté passé pour que le praticien
// retrouve l'historique de ses séances (suivi patient, litiges, export
// comptable), plus courte côté futur car au-delà la planification réelle
// n'existe généralement pas encore. Ajustables ici sans relire la logique
// de la requête ci-dessous.
const FENETRE_MOIS_PASSE = 24;
const FENETRE_MOIS_FUTUR = 12;

// Calcule les bornes (inclusives, format YYYY-MM-DD) de la fenêtre glissante
// à partir d'un instant donné. Fonction pure (pas d'accès à Date.now()
// directement) pour rester testable sans mock de date globale.
export function calculerBornesFenetreIcs(maintenant: Date): { debut: string; fin: string } {
  return {
    debut: format(subMonths(maintenant, FENETRE_MOIS_PASSE), 'yyyy-MM-dd'),
    fin: format(addMonths(maintenant, FENETRE_MOIS_FUTUR), 'yyyy-MM-dd'),
  };
}

export interface PraticienIcsInfo {
  praticienId: string;
  prenom: string;
}

// Valide le token contre praticiens.token_planning_ics. Calqué sur
// validateStructureToken (api/_lib/structureAuth.ts).
export async function validatePraticienIcsToken(supabase: SupabaseClient, token: string): Promise<PraticienIcsInfo | null> {
  const { data, error } = await supabase
    .from('praticiens')
    .select('id, prenom')
    .eq('token_planning_ics', token)
    .single();

  if (error || !data) return null;

  return { praticienId: data.id, prenom: data.prenom ?? '' };
}

export interface SeancePourIcs {
  id: string;
  date: string;       // YYYY-MM-DD
  heureDebut: string;  // HH:MM
  heureFin: string;    // HH:MM
  type: 'seance' | 'bilan' | 'bilan_initial';
  adresse: string | null;
  participantPrenom: string;
  participantNom: string;
  codePortail: string | null;
  personneContact: string | null;
}

// Charge les séances passées et futures (fenêtre glissante, voir
// FENETRE_MOIS_PASSE / FENETRE_MOIS_FUTUR) d'un praticien, avec leur statut
// réel (planifiee/realisee/reportee) ; séances annulées exclues qu'elles
// soient passées ou futures. Colonnes explicites (jamais select('*'), jamais
// notes/motif_annulation*).
export async function chargerSeancesPourIcs(supabase: SupabaseClient, praticienId: string): Promise<SeancePourIcs[]> {
  const { debut, fin } = calculerBornesFenetreIcs(new Date());

  const { data, error } = await supabase
    .from('seances')
    .select('id, date, heure_debut, heure_fin, type, adresse, statut, participants(prenom, nom, code_portail, personne_contact)')
    .eq('praticien_id', praticienId)
    .neq('statut', 'annulee')
    .gte('date', debut)
    .lte('date', fin)
    .order('date', { ascending: true });

  if (error || !data) return [];

  interface RowSeanceIcs {
    id: string;
    date: string;
    heure_debut: string;
    heure_fin: string;
    type: SeancePourIcs['type'];
    adresse: string | null;
    participants: RowParticipantIcs | RowParticipantIcs[] | null;
  }

  interface RowParticipantIcs {
    prenom: string;
    nom: string;
    code_portail: string | null;
    personne_contact: string | null;
  }

  return (data as RowSeanceIcs[]).map((row): SeancePourIcs => {
    const participant = Array.isArray(row.participants) ? row.participants[0] : row.participants;
    return {
      id: row.id,
      date: row.date,
      heureDebut: row.heure_debut,
      heureFin: row.heure_fin,
      type: row.type,
      adresse: row.adresse || null,
      participantPrenom: participant?.prenom ?? '',
      participantNom: participant?.nom ?? '',
      codePortail: participant?.code_portail || null,
      personneContact: participant?.personne_contact || null,
    };
  });
}

// ── Autres occupations de l'agenda : cours collectifs et événements d'agenda ──
//
// Bug 17 (2026-10-25) : le flux ne lisait que `seances`. Les cours collectifs (cours_collectifs) et
// les événements d'agenda (evenements_agenda : première rencontre, réunion, indisponibilité ponctuelle…)
// n'apparaissaient donc jamais dans Google Agenda. Règle désormais : tout ce qui occupe un créneau
// dans l'agenda Horizon part dans le flux. Les événements sont lus SANS filtre sur leur type : un
// type ajouté demain est exporté sans autre correction.
//
// Sûreté du flux :
//   - UID préfixés (`cours-…`, `evenement-…`) : aucune collision possible avec l'UID d'une séance, et
//     les UID des séances déjà synchronisées restent EXACTEMENT les mêmes (sinon Google les recréerait
//     en doublon).
//   - Une source en échec, ou une ligne mal formée, est ignorée : elle ne doit jamais vider le flux
//     des séances, qui marchait déjà.
//   - Confidentialité : comme pour les séances, jamais de notes ni de téléphone ; colonnes explicites.
//     Une première rencontre n'affiche que « Prénom N. ».

export interface EvenementPourIcs {
  uid: string;
  date: string;        // YYYY-MM-DD
  heureDebut: string;  // HH:MM
  heureFin: string;    // HH:MM
  summary: string;
  location: string | null;
}

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// « 14:00:00 » → « 14:00 » : une heure stockée avec les secondes ne doit pas faire disparaître
// l'événement du flux.
export function normaliserHeure(heure: string | null | undefined): string {
  const h = (heure ?? '').trim();
  return /^\d{2}:\d{2}(:\d{2})?$/.test(h) ? h.slice(0, 5) : h;
}

function creneauValide(date: string, heureDebut: string, heureFin: string): boolean {
  return DATE.test(date) && HEURE.test(heureDebut) && HEURE.test(heureFin) && heureFin > heureDebut;
}

// Fin d'un cours (début + durée), plafonnée à 23:59 : un cours ne déborde jamais sur le lendemain.
export function heureFinDepuisDuree(heureDebut: string, dureeMinutes: number): string {
  const [h, m] = heureDebut.split(':').map(Number);
  const total = Math.min(h * 60 + m + Math.max(0, Math.round(dureeMinutes)), 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export interface RowCoursIcs {
  id: string;
  titre: string | null;
  date: string;
  heure_debut: string;
  duree_minutes: number | null;
}

export function coursVersIcs(rows: RowCoursIcs[]): EvenementPourIcs[] {
  const out: EvenementPourIcs[] = [];
  for (const r of rows) {
    const heureDebut = normaliserHeure(r.heure_debut);
    if (!r.duree_minutes || !HEURE.test(heureDebut)) continue;
    const heureFin = heureFinDepuisDuree(heureDebut, r.duree_minutes);
    if (!creneauValide(r.date, heureDebut, heureFin)) continue;
    const titre = (r.titre ?? '').trim();
    out.push({
      uid: `cours-${r.id}`,
      date: r.date,
      heureDebut,
      heureFin,
      summary: titre ? `Cours collectif — ${titre}` : 'Cours collectif',
      location: null,
    });
  }
  return out;
}

export interface RowEvenementIcs {
  id: string;
  type: string;
  titre: string | null;
  date: string;
  heure_debut: string;
  heure_fin: string;
  nom: string | null;
  prenom: string | null;
  adresse: string | null;
}

// 'prospect' (proposé à la création, libellé « Première rencontre ») et 'premier_contact_prospect'
// (type historique, encore présent en base).
const TYPES_PREMIERE_RENCONTRE = new Set(['prospect', 'premier_contact_prospect']);

export function evenementsVersIcs(rows: RowEvenementIcs[]): EvenementPourIcs[] {
  const out: EvenementPourIcs[] = [];
  for (const r of rows) {
    const heureDebut = normaliserHeure(r.heure_debut);
    const heureFin = normaliserHeure(r.heure_fin);
    if (!creneauValide(r.date, heureDebut, heureFin)) continue;
    const titre = (r.titre ?? '').trim();
    let summary = titre || 'Événement';
    if (TYPES_PREMIERE_RENCONTRE.has(r.type)) {
      // Nom abrégé « Prénom N. », comme pour un bénéficiaire. Jamais le titre : texte libre, il
      // contient souvent le nom complet (« Mme Dupont (prospect) »).
      const prenom = (r.prenom ?? '').trim();
      const initiale = (r.nom ?? '').trim() ? `${(r.nom ?? '').trim().charAt(0).toUpperCase()}.` : '';
      const personne = `${prenom} ${initiale}`.trim();
      summary = personne ? `Première rencontre — ${personne}` : 'Première rencontre';
    }
    out.push({
      uid: `evenement-${r.id}`,
      date: r.date,
      heureDebut,
      heureFin,
      summary,
      location: (r.adresse ?? '').trim() || null,
    });
  }
  return out;
}

// Cours collectifs (hors annulés) et événements d'agenda de la même fenêtre glissante que les séances.
// Chaque source est indépendante : son échec est journalisé et n'empêche ni l'autre ni les séances.
export async function chargerAutresEvenementsPourIcs(supabase: SupabaseClient, praticienId: string): Promise<EvenementPourIcs[]> {
  const { debut, fin } = calculerBornesFenetreIcs(new Date());
  const resultat: EvenementPourIcs[] = [];

  try {
    const { data, error } = await supabase
      .from('cours_collectifs')
      .select('id, titre, date, heure_debut, duree_minutes')
      .eq('praticien_id', praticienId)
      .neq('statut', 'annule')
      .gte('date', debut)
      .lte('date', fin);
    if (error) console.error('[planning ics] cours collectifs non chargés :', error.message);
    else resultat.push(...coursVersIcs((data ?? []) as RowCoursIcs[]));
  } catch (e) {
    console.error('[planning ics] cours collectifs non chargés :', (e as Error).message);
  }

  try {
    const { data, error } = await supabase
      .from('evenements_agenda')
      .select('id, type, titre, date, heure_debut, heure_fin, nom, prenom, adresse')
      .eq('praticien_id', praticienId)
      .gte('date', debut)
      .lte('date', fin);
    if (error) console.error('[planning ics] événements non chargés :', error.message);
    else resultat.push(...evenementsVersIcs((data ?? []) as RowEvenementIcs[]));
  } catch (e) {
    console.error('[planning ics] événements non chargés :', (e as Error).message);
  }

  return resultat;
}

// Génère le flux VCALENDAR complet à partir de séances déjà filtrées
// (annulées exclues en amont, par la requête SQL) et des autres occupations
// de l'agenda (cours collectifs, événements). Fonction pure, sans I/O
// — testable directement en parsant sa sortie (voir planningIcs.test.ts).
export function genererCalendrierPlanning(seances: SeancePourIcs[], autres: EvenementPourIcs[] = []): string {
  const calendar = ical({ name: 'Planning MouvTrack' });

  for (const seance of seances) {
    const initiale = seance.participantNom ? `${seance.participantNom.charAt(0).toUpperCase()}.` : '';
    const summary = `${seance.participantPrenom} ${initiale}`.trim();

    const lignesDescription: string[] = [];
    if (seance.codePortail) lignesDescription.push(`Code portail : ${seance.codePortail}`);
    if (seance.personneContact) lignesDescription.push(`Personne à contacter : ${seance.personneContact}`);

    calendar.createEvent({
      id: seance.id,
      start: dateHeureParisVersUTC(seance.date, seance.heureDebut),
      end: dateHeureParisVersUTC(seance.date, seance.heureFin),
      summary,
      location: seance.adresse || undefined,
      description: lignesDescription.length > 0 ? lignesDescription.join('\n') : undefined,
    });
  }

  for (const e of autres) {
    calendar.createEvent({
      id: e.uid,
      start: dateHeureParisVersUTC(e.date, e.heureDebut),
      end: dateHeureParisVersUTC(e.date, e.heureFin),
      summary: e.summary,
      location: e.location || undefined,
    });
  }

  return calendar.toString();
}
