// « Tout confirmer » : marquer d'un coup comme réalisées les séances passées restées « planifiées »
// (retour de Pierre du 2026-11-24 : 80 anciennes séances à confirmer une par une).
//
// Confirmer une séance la fait entrer dans la facture de son mois (trigger de facturation
// progressive, 20261011100000). D'où trois précautions, calculées ici avant toute écriture :
//   - une séance d'un mois dont la facture du contrat est DÉJÀ émise n'est pas confirmée en groupe :
//     la facture est verrouillée, la séance passerait « réalisée » sans jamais être facturée
//     (generer_brouillon_facture renvoie la facture émise telle quelle) ; elle se traite à part ;
//   - une séance où le bénéficiaire a signalé son absence n'est pas confirmée en groupe : elle a
//     probablement été manquée, le praticien tranche une par une ;
//   - le dialogue annonce le nombre de séances par mois et le montant ajouté aux factures, au tarif
//     du contrat (même calcul que le brouillon : séance + déplacement).

import type { Seance, TarifContrat } from '../types';
import { valeurSeances } from './statistiques';

type FactureVerrou = { contratId: string; periode: string; type: string; statut: string };

export interface MoisConfirmation {
  /** « AAAA-MM » */
  mois: string;
  nombre: number;
  montant: number;
}

export interface PlanConfirmation {
  aConfirmer: Seance[];
  /** Mois déjà facturé pour leur contrat : laissées de côté, à traiter une par une. */
  moisFactures: Seance[];
  /** Absence signalée par le bénéficiaire : laissées de côté. */
  absences: Seance[];
  parMois: MoisConfirmation[];
  montant: number;
  /** Séances confirmées sans tarif applicable (montant non compté). */
  sansTarif: number;
}

export function planConfirmationGroupee(
  seances: readonly Seance[],
  factures: readonly FactureVerrou[],
  tarifs: Readonly<Record<string, TarifContrat[]>>,
): PlanConfirmation {
  const verrous = new Set(
    factures
      .filter(f => f.type === 'facture' && f.statut !== 'brouillon' && f.statut !== 'annulee')
      .map(f => `${f.contratId}|${f.periode.slice(0, 7)}`),
  );
  const aConfirmer: Seance[] = [];
  const moisFactures: Seance[] = [];
  const absences: Seance[] = [];
  for (const s of seances) {
    if (s.statut !== 'planifiee') continue;
    if (s.contratId && verrous.has(`${s.contratId}|${s.date.slice(0, 7)}`)) moisFactures.push(s);
    else if (s.absenceSignaleeLe) absences.push(s);
    else aConfirmer.push(s);
  }
  const mois = [...new Set(aConfirmer.map(s => s.date.slice(0, 7)))].sort().reverse();
  const parMois = mois.map(m => {
    const duMois = aConfirmer.filter(s => s.date.startsWith(m));
    return { mois: m, nombre: duMois.length, montant: valeurSeances(duMois, tarifs).montant };
  });
  const total = valeurSeances(aConfirmer, tarifs);
  return { aConfirmer, moisFactures, absences, parMois, montant: total.montant, sansTarif: total.sansTarif };
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « novembre 2026 » */
export function libelleMois(cle: string): string {
  return `${MOIS[Number(cle.slice(5, 7)) - 1]} ${cle.slice(0, 4)}`;
}
