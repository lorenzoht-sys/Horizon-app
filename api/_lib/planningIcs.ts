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
// complet du bénéficiaire (seulement "Prénom I.").

import type { SupabaseClient } from '@supabase/supabase-js';
import ical from 'ical-generator';
import { addMonths, format } from 'date-fns';
import { dateHeureParisVersUTC } from './rappels.js';

const FENETRE_MOIS = 6;

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
}

// Charge les séances futures (fenêtre glissante de 6 mois) d'un praticien,
// séances annulées exclues, colonnes explicites (jamais select('*'), jamais
// notes/motif_annulation*).
export async function chargerSeancesPourIcs(supabase: SupabaseClient, praticienId: string): Promise<SeancePourIcs[]> {
  const aujourdhui = format(new Date(), 'yyyy-MM-dd');
  const dansSixMois = format(addMonths(new Date(), FENETRE_MOIS), 'yyyy-MM-dd');

  const { data, error } = await supabase
    .from('seances')
    .select('id, date, heure_debut, heure_fin, type, adresse, statut, participants(prenom, nom)')
    .eq('praticien_id', praticienId)
    .neq('statut', 'annulee')
    .gte('date', aujourdhui)
    .lte('date', dansSixMois)
    .order('date', { ascending: true });

  if (error || !data) return [];

  interface RowSeanceIcs {
    id: string;
    date: string;
    heure_debut: string;
    heure_fin: string;
    type: SeancePourIcs['type'];
    adresse: string | null;
    participants: { prenom: string; nom: string } | { prenom: string; nom: string }[] | null;
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

    calendar.createEvent({
      id: seance.id,
      start: dateHeureParisVersUTC(seance.date, seance.heureDebut),
      end: dateHeureParisVersUTC(seance.date, seance.heureFin),
      summary,
      location: seance.adresse || undefined,
    });
  }

  return calendar.toString();
}
