// Rattachement d'une séance à un contrat.
//
// Pourquoi (incident du 14/11/2026, retour de Pierre : « des patients ont des séances mais pas de
// facture ») : la facture du mois ne reprend que les séances dont `contrat_id` est celui du contrat
// (generer_brouillon_facture, 20261022100000). Le glisser-déposer rattachait bien la série au contrat
// actif, mais le bouton « Nouvelle séance » (ModalCreerSeanceManuelle) n'écrivait jamais de contrat :
// la séance, même réalisée, restait hors facture, et le suivi des séances demandait de la rattacher
// sans qu'aucun écran ne le permette. Ces fonctions servent aux deux modales (création et
// modification) pour proposer le bon contrat.

import type { Contrat } from '../types';

// Ordre de préférence quand plusieurs contrats couvrent la date (renouvellement, chevauchement).
const PRIORITE_STATUT: Record<Contrat['statut'], number> = { actif: 0, suspendu: 1, termine: 2, a_venir: 3 };

/** Vrai si la date (AAAA-MM-JJ) tombe dans la période du contrat. */
export function contratCouvreDate(contrat: Contrat, date: string): boolean {
  if (contrat.dateDebut > date) return false;
  return Boolean(contrat.dureeIndeterminee) || !contrat.dateFin || contrat.dateFin >= date;
}

/** Contrats du bénéficiaire, le plus récent d'abord : la liste proposée dans les modales. */
export function contratsDuBeneficiaire(contrats: Contrat[], participantId: string): Contrat[] {
  return contrats
    .filter(c => c.participantId === participantId)
    .sort((a, b) => (a.dateDebut < b.dateDebut ? 1 : a.dateDebut > b.dateDebut ? -1 : 0));
}

/**
 * Contrat proposé par défaut pour une séance du bénéficiaire à cette date : celui qui couvre la date
 * (de préférence actif), sinon le contrat actif (séance posée juste avant le début ou après une fin
 * non encore renouvelée), sinon aucun (prospect sans contrat : bilan initial).
 */
export function contratSuggere(contrats: Contrat[], participantId: string, date: string): Contrat | undefined {
  const siens = contratsDuBeneficiaire(contrats, participantId);
  const couvrants = siens
    .filter(c => contratCouvreDate(c, date))
    .sort((a, b) => PRIORITE_STATUT[a.statut] - PRIORITE_STATUT[b.statut]);
  return couvrants[0] ?? siens.find(c => c.statut === 'actif');
}

function jjmmaaaa(date: string): string {
  const [a, m, j] = date.split('-');
  return `${j}/${m}/${a}`;
}

const LIBELLE_STATUT: Record<Contrat['statut'], string> = {
  actif: 'actif', suspendu: 'suspendu', termine: 'terminé', a_venir: 'à venir',
};

/** « Contrat du 01/09/2026 au 31/12/2026 (actif) » pour les listes déroulantes. */
export function libelleContrat(contrat: Contrat): string {
  const periode = contrat.dureeIndeterminee || !contrat.dateFin
    ? `depuis le ${jjmmaaaa(contrat.dateDebut)}`
    : `du ${jjmmaaaa(contrat.dateDebut)} au ${jjmmaaaa(contrat.dateFin)}`;
  return `Contrat ${periode} (${LIBELLE_STATUT[contrat.statut]})`;
}
