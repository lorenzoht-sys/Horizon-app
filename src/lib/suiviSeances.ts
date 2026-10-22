// Suivi de la facturation des séances (plan facturation PR 6) : lecture et présentation du résultat de
// suivi_facturation_seances(mois) (migration 20261024100000). Logique pure, testée à côté.
//
// Cinq états : facturée, créditée (séance d'une facture émise, créditée par un avoir partiel : elle reste
// rattachée à sa facture et n'est pas refacturée, PR 9), en préparation (brouillon du mois), à facturer
// (anomalie à corriger, avec son motif) et non facturable (voulu : SAP, forfait, bilans non facturés). Les
// règles vivent en base ; ce fichier ne fait que les nommer et les regrouper.

export type EtatSeance = 'facturee' | 'creditee' | 'en_preparation' | 'a_facturer' | 'non_facturable';

export type MotifSeance =
  | 'beneficiaire_sap' | 'forfait' | 'bilan_initial' | 'bilan_non_facture'
  | 'sans_contrat' | 'contrat_a_venir' | 'hors_periode_contrat' | 'sans_tarif' | 'mois_deja_facture' | 'en_attente';

export interface LigneSuivi {
  seanceId: string;
  date: string;
  heure: string;
  type: string;
  participantId: string | null;
  contratId: string | null;
  etat: EtatSeance;
  motif: MotifSeance | null;
  factureId: string | null;
  numero: string | null;
  /** Séance datée avant le début de son contrat : facturée quand même si le contrat couvre le mois, signalée. */
  avantDebutContrat: boolean;
  /** Avoir émis qui crédite la séance (état « créditée »). */
  avoirId: string | null;
  numeroAvoir: string | null;
}

const ETATS: EtatSeance[] = ['a_facturer', 'en_preparation', 'facturee', 'creditee', 'non_facturable'];

export const LIBELLES_ETAT: Record<EtatSeance, string> = {
  a_facturer: 'À corriger',
  en_preparation: 'En préparation',
  facturee: 'Facturées',
  creditee: 'Créditées (avoir)',
  non_facturable: 'Non facturables',
};

/** Phrase affichée pour chaque motif, avec l'action quand il y en a une. */
export const LIBELLES_MOTIF: Record<MotifSeance, string> = {
  beneficiaire_sap: 'Bénéficiaire SAP : pas de facture automatique',
  forfait: 'Contrat au forfait : facturé au mois',
  bilan_initial: 'Bilan initial : non facturé',
  bilan_non_facture: 'Bilan : le contrat ne facture pas les bilans',
  sans_contrat: 'Séance sans contrat : rattachez-la à un contrat',
  contrat_a_venir: 'Contrat « à venir » : pas encore facturable',
  hors_periode_contrat: 'Le contrat ne couvre pas ce mois',
  sans_tarif: 'Aucun tarif à cette date : créez une version de tarif',
  mois_deja_facture: 'Réalisée après la validation de la facture du mois',
  en_attente: 'En attente : reprise au prochain calcul',
};

const texte = (v: unknown): string | null => (v == null || v === '' ? null : String(v));

export function lireLigneSuivi(row: Record<string, unknown>): LigneSuivi {
  const etat = ETATS.includes(row.etat as EtatSeance) ? (row.etat as EtatSeance) : 'a_facturer';
  const motif = texte(row.motif);
  return {
    seanceId: String(row.seance_id),
    date: String(row.date),
    heure: String(row.heure_debut ?? '').slice(0, 5),
    type: String(row.type ?? 'seance'),
    participantId: texte(row.participant_id),
    contratId: texte(row.contrat_id),
    etat,
    motif: motif && motif in LIBELLES_MOTIF ? (motif as MotifSeance) : null,
    factureId: texte(row.facture_id),
    numero: texte(row.numero),
    avantDebutContrat: row.avant_debut_contrat === true,
    avoirId: texte(row.avoir_id),
    numeroAvoir: texte(row.numero_avoir),
  };
}

/** Lignes regroupées par état, dans l'ordre d'affichage (à corriger d'abord), chacune par date. */
export function regrouper(lignes: LigneSuivi[]): { etat: EtatSeance; lignes: LigneSuivi[] }[] {
  return ETATS.map(etat => ({
    etat,
    lignes: lignes.filter(l => l.etat === etat).sort((a, b) => `${a.date}${a.heure}`.localeCompare(`${b.date}${b.heure}`)),
  }));
}

/** « 03/09 à 10:00 » */
export function dateCourte(l: LigneSuivi): string {
  const [, m, j] = l.date.split('-');
  return `${j}/${m}${l.heure ? ` à ${l.heure}` : ''}`;
}
