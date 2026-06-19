import type { TinettiData, TinettiEquilibre, TinettiMarche } from '../types';

// ── Définition des items — barème Tinetti POMA validé ─────────────────────
// (items "Tentatives de lever" et "Longueur/hauteur du pas" cotés 0/1/2,
// conformément à l'échelle officielle, pour des totaux /16, /12 et /28 exacts)

export interface TinettiOption { v: 0 | 1 | 2; label: string }
export interface TinettiItem<K extends string> { key: K; label: string; options: TinettiOption[] }

export const EQUILIBRE_ITEMS: TinettiItem<keyof TinettiEquilibre>[] = [
  { key: 'assis', label: '1. Équilibre assis', options: [
    { v: 0, label: 'Penche ou glisse dans le siège' },
    { v: 1, label: 'Stable, sécurisé' },
  ] },
  { key: 'leverChaise', label: '2. Lever de la chaise', options: [
    { v: 0, label: 'Impossible sans aide' },
    { v: 1, label: 'Possible avec aide des bras' },
    { v: 2, label: 'Possible sans aide des bras' },
  ] },
  { key: 'tentativesLever', label: '3. Tentatives de lever', options: [
    { v: 0, label: 'Impossible sans aide' },
    { v: 1, label: 'Possible, nécessite plus d’une tentative' },
    { v: 2, label: 'Possible en une seule tentative' },
  ] },
  { key: 'deboutImmediat', label: '4. Équilibre debout immédiat (5 premières secondes)', options: [
    { v: 0, label: 'Instable' },
    { v: 1, label: 'Stable avec aide ou appui' },
    { v: 2, label: 'Stable sans aide' },
  ] },
  { key: 'deboutStable', label: '5. Équilibre debout', options: [
    { v: 0, label: 'Instable' },
    { v: 1, label: 'Stable mais base large ou aide' },
    { v: 2, label: 'Stable, pieds joints, sans aide' },
  ] },
  { key: 'pousseeSternale', label: '6. Poussée sternale (3 poussées légères)', options: [
    { v: 0, label: 'Tombe' },
    { v: 1, label: 'Chancelle, s’agrippe' },
    { v: 2, label: 'Stable' },
  ] },
  { key: 'yeuxFermes', label: '7. Yeux fermés (même position)', options: [
    { v: 0, label: 'Instable' },
    { v: 1, label: 'Stable' },
  ] },
  { key: 'pivotContinuite', label: '8a. Pivot 360° — continuité des pas', options: [
    { v: 0, label: 'Pas discontinus' },
    { v: 1, label: 'Pas continus' },
  ] },
  { key: 'pivotStabilite', label: '8b. Pivot 360° — stabilité', options: [
    { v: 0, label: 'Instable' },
    { v: 1, label: 'Stable' },
  ] },
  { key: 'sasseoir', label: '9. S’asseoir', options: [
    { v: 0, label: 'Non sécurisé, tombe dans le siège' },
    { v: 1, label: 'Utilise les bras, mouvement brusque' },
    { v: 2, label: 'Sécurisé, mouvement fluide' },
  ] },
];

export const MARCHE_ITEMS: TinettiItem<keyof TinettiMarche>[] = [
  { key: 'initiation', label: '1. Initiation de la marche', options: [
    { v: 0, label: 'Hésitation, plusieurs tentatives' },
    { v: 1, label: 'Sans hésitation' },
  ] },
  { key: 'pasDroit', label: '2. Longueur et hauteur du pas droit', options: [
    { v: 0, label: 'Le pied ne se lève pas complètement et ne dépasse pas le pied opposé' },
    { v: 1, label: 'Un seul des deux critères présent' },
    { v: 2, label: 'Le pied se lève complètement et dépasse le pied opposé' },
  ] },
  { key: 'pasGauche', label: '3. Longueur et hauteur du pas gauche', options: [
    { v: 0, label: 'Le pied ne se lève pas complètement et ne dépasse pas le pied opposé' },
    { v: 1, label: 'Un seul des deux critères présent' },
    { v: 2, label: 'Le pied se lève complètement et dépasse le pied opposé' },
  ] },
  { key: 'symetrie', label: '4. Symétrie du pas', options: [
    { v: 0, label: 'Asymétrique' },
    { v: 1, label: 'Symétrique' },
  ] },
  { key: 'continuite', label: '5. Continuité du pas', options: [
    { v: 0, label: 'Arrêts ou discontinuité' },
    { v: 1, label: 'Continu' },
  ] },
  { key: 'trajectoire', label: '6. Trajectoire (sur 3 m, sans aide)', options: [
    { v: 0, label: 'Déviation marquée' },
    { v: 1, label: 'Légère déviation ou utilise une aide' },
    { v: 2, label: 'Droite, sans aide' },
  ] },
  { key: 'tronc', label: '7. Tronc', options: [
    { v: 0, label: 'Balancement marqué ou utilise une aide' },
    { v: 1, label: 'Pas de balancement mais fléchit genoux/dos ou écarte les bras' },
    { v: 2, label: 'Pas de balancement, sans aide' },
  ] },
  { key: 'baseMarche', label: '8. Base de marche (distance entre les pieds)', options: [
    { v: 0, label: 'Talons écartés' },
    { v: 1, label: 'Talons presque joints' },
  ] },
];

export const TINETTI_EQUILIBRE_MAX = 16;
export const TINETTI_MARCHE_MAX = 12;
export const TINETTI_TOTAL_MAX = 28;
export const TINETTI_ITEMS_COUNT = EQUILIBRE_ITEMS.length + MARCHE_ITEMS.length;

export function emptyTinettiData(): TinettiData {
  return {
    equilibre: {
      assis: null, leverChaise: null, tentativesLever: null, deboutImmediat: null,
      deboutStable: null, pousseeSternale: null, yeuxFermes: null,
      pivotContinuite: null, pivotStabilite: null, sasseoir: null,
    },
    marche: {
      initiation: null, pasDroit: null, pasGauche: null, symetrie: null,
      continuite: null, trajectoire: null, tronc: null, baseMarche: null,
    },
    notes: '',
  };
}

export interface TinettiScores {
  scoreEquilibre: number;
  scoreMarche: number;
  scoreTotal: number;
  itemsRenseignes: number;
  complet: boolean;
}

export function computeTinettiScores(t: TinettiData | undefined | null): TinettiScores | null {
  if (!t) return null;
  const eVals = Object.values(t.equilibre);
  const mVals = Object.values(t.marche);
  const eFilled = eVals.filter((v): v is number => v !== null && v !== undefined);
  const mFilled = mVals.filter((v): v is number => v !== null && v !== undefined);
  if (eFilled.length === 0 && mFilled.length === 0) return null;
  const itemsRenseignes = eFilled.length + mFilled.length;
  return {
    scoreEquilibre: eFilled.reduce((a, b) => a + b, 0),
    scoreMarche: mFilled.reduce((a, b) => a + b, 0),
    scoreTotal: eFilled.reduce((a, b) => a + b, 0) + mFilled.reduce((a, b) => a + b, 0),
    itemsRenseignes,
    complet: itemsRenseignes === TINETTI_ITEMS_COUNT,
  };
}

export interface TinettiRisque { label: string; color: string; bg: string }

export function tinettiRisque(scoreTotal: number): TinettiRisque {
  if (scoreTotal >= 24) return { label: 'Risque de chute faible', color: '#065F46', bg: '#D1FAE5' };
  if (scoreTotal >= 19) return { label: 'Risque de chute modéré — surveillance recommandée', color: '#92400E', bg: '#FEF3C7' };
  return { label: 'Risque de chute élevé — intervention prioritaire', color: '#991B1B', bg: '#FEE2E2' };
}
