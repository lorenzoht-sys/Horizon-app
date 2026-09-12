// src/utils/repriseContrat.ts
//
// Reprise d'un contrat mis en pause (statut 'suspendu' → 'actif') et
// régénération des séances de la période restante.
//
// Logique PURE : aucun accès réseau, aucun état React — testable directement
// (voir repriseContrat.test.ts). ContratsTab.tsx se contente d'appeler
// evaluerReprise() puis, selon la décision, calculerSeancesReprise().
//
// Deux invariants portent tout ce module :
//
//   1. JAMAIS DE SÉANCE DANS LE PASSÉ. La régénération démarre à
//      calculerDebutReprise() (utils/horaires.ts) : aujourd'hui, ou la date
//      de reprise prévue si elle est encore future. Une pause longue ne doit
//      pas recréer les séances qu'on a précisément supprimées en la posant.
//
//   2. LE MOTIF VIENT DU CONTRAT, JAMAIS DES SÉANCES. jours_fixe /
//      durees_seances / heure_debut / periodicite sont la seule source du
//      rythme — même règle que le renouvellement automatique
//      (api/_lib/renouvellementContrats.ts). Une séance déplacée à la main
//      avant la pause ne doit pas déformer la reprise.

import type { Contrat, Seance, Participant } from '../types';
import { addMinutes, genererDatesSeances, calculerDebutReprise } from './horaires';

// jours_fixe[i] correspond à durees_seances[i] dans l'ordre chronologique de
// la semaine, quel que soit l'ordre de saisie. Même table que
// ORDRE_JOURS_SEMAINE dans api/_lib/renouvellementContrats.ts : les deux
// chemins (reprise manuelle ici, renouvellement automatique côté cron)
// doivent produire exactement le même appariement jour/durée.
const ORDRE_JOURS_SEMAINE: Record<string, number> = {
  lun: 0, mar: 1, mer: 2, jeu: 3, ven: 4, sam: 5, dim: 6,
};

/** Prolongation appliquée à un contrat à durée indéterminée expiré pendant
 * la pause — un an, comme calculerNouvelleDateFin() du cron. */
export function prolongerDateFinUnAn(dateFinActuelle: string): string {
  const d = new Date(dateFinActuelle + 'T12:00');
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split('T')[0];
}

export type DecisionReprise =
  /** Cas normal : le contrat n'est pas expiré, on reprend tel quel. */
  | { type: 'reprend'; debutGeneration: string; finGeneration: string }
  /** Durée indéterminée expirée pendant la pause : prolongée silencieusement,
   *  sans rien demander au praticien (il n'a jamais choisi cette échéance). */
  | { type: 'prolonge'; debutGeneration: string; finGeneration: string; nouvelleDateFin: string }
  /** Durée fixe expirée pendant la pause : reprise refusée. Une date de fin
   *  prescrite ne se réécrit jamais toute seule — c'est au praticien de
   *  trancher, via « Corriger la date de fin ». */
  | { type: 'bloque'; dateFinExpiree: string };

/**
 * Décide ce qui doit se passer au clic sur « Reprendre ».
 *
 * `aujourdhuiStr` est la date RÉELLE du clic, et c'est elle seule qui décide
 * du blocage — jamais contrat.dateReprisePrevue, qui n'est qu'un pense-bête
 * saisi au moment de la pause et qui peut être largement dépassé. Un contrat
 * dont la reprise était prévue le 27/11 mais sur lequel on clique le 08/12
 * est traité comme une reprise du 08/12.
 *
 * L'expiration est stricte (`dateFin < aujourd'hui`) : le dernier jour du
 * contrat reste un jour valide pour reprendre.
 */
export function evaluerReprise(contrat: Contrat, aujourdhuiStr: string): DecisionReprise {
  const expire = contrat.dateFin < aujourdhuiStr;
  const debutGeneration = calculerDebutReprise(aujourdhuiStr, contrat.dateReprisePrevue);

  if (!expire) {
    return { type: 'reprend', debutGeneration, finGeneration: contrat.dateFin };
  }

  if (contrat.dureeIndeterminee) {
    const nouvelleDateFin = prolongerDateFinUnAn(contrat.dateFin);
    return { type: 'prolonge', debutGeneration, finGeneration: nouvelleDateFin, nouvelleDateFin };
  }

  return { type: 'bloque', dateFinExpiree: contrat.dateFin };
}

/**
 * Séances à créer pour la période restante, d'après le seul motif déclaré
 * sur le contrat.
 *
 * `datesDejaCouvertes` : dates ayant déjà une séance non annulée pour ce
 * bénéficiaire et ce contrat. Filtrées ici, AVANT tout insert, plutôt que de
 * laisser la contrainte d'unicité (seances_no_double_contrat_idx) rejeter
 * l'opération — même précaution que PlanningGrilleView.
 *
 * L'ancrage du cycle bimensuel/trimestriel reste contrat.dateDebut : une
 * pause ne redémarre pas le cycle, sinon un contrat « une semaine sur deux »
 * changerait de semaines à chaque reprise.
 */
export function calculerSeancesReprise(params: {
  contrat: Contrat;
  participant: Participant | undefined;
  debutGeneration: string;
  finGeneration: string;
  datesDejaCouvertes: string[] | Set<string>;
}): Omit<Seance, 'id'>[] {
  const { contrat, participant, debutGeneration, finGeneration, datesDejaCouvertes } = params;

  if (debutGeneration > finGeneration) return [];
  if (!contrat.joursFixe || contrat.joursFixe.length === 0) return [];

  const couvertes = datesDejaCouvertes instanceof Set ? datesDejaCouvertes : new Set(datesDejaCouvertes);

  const adresse = participant
    ? [participant.adresseRue, participant.adresseCodePostal, participant.adresseVille].filter(Boolean).join(', ')
    : '';
  const coordonnees = participant?.coordonnees
    ? { lat: participant.coordonnees.lat, lng: participant.coordonnees.lng }
    : undefined;

  const joursOrdonnes = [...new Set(contrat.joursFixe)].sort(
    (a, b) => (ORDRE_JOURS_SEMAINE[a] ?? 99) - (ORDRE_JOURS_SEMAINE[b] ?? 99)
  );

  const nouvelles: Omit<Seance, 'id'>[] = [];
  joursOrdonnes.forEach((jour, index) => {
    const duree = contrat.dureesSeances?.[index] ?? contrat.dureesSeances?.[0] ?? contrat.dureeMinutes;
    const heureFin = addMinutes(contrat.heureDebut, duree);
    const dates = genererDatesSeances(
      debutGeneration,
      finGeneration,
      jour,
      contrat.periodicite ?? 'semaine',
      contrat.dateDebut,
    );
    for (const date of dates) {
      if (couvertes.has(date)) continue;
      nouvelles.push({
        participantId: contrat.participantId,
        contratId: contrat.id,
        date,
        heureDebut: contrat.heureDebut,
        heureFin,
        dureeMinutes: duree,
        type: 'seance',
        statut: 'planifiee',
        adresse,
        coordonnees,
      });
    }
  });

  // Tri chronologique : les jours sont générés jour par jour (tous les
  // vendredis, puis tous les mardis...), l'insert et les messages doivent
  // refléter l'ordre réel du calendrier.
  return nouvelles.sort((a, b) => a.date.localeCompare(b.date));
}
