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

// Génère le flux VCALENDAR complet à partir de séances déjà filtrées
// (annulées exclues en amont, par la requête SQL). Fonction pure, sans I/O
// — testable directement en parsant sa sortie (voir planningIcs.test.ts).
export function genererCalendrierPlanning(seances: SeancePourIcs[]): string {
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

  return calendar.toString();
}
