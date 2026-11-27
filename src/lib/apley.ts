import type { Bilan } from '../types';

/**
 * Test de souplesse des épaules (Apley Scratch Test) : niveaux, score et résumé lisible.
 *
 * Historique : le résultat est enregistré dans `bilans.apley_data` depuis le 14/09/2026
 * (87293be) et sa carte se réaffiche à la réouverture depuis le 22/09 (c8416d3). Pierre le
 * signalait pourtant toujours « non sauvegardé » le 23/11 : le résultat n'apparaissait ni
 * dans les PDF, ni dans le tableau de comparaison, ni dans les graphiques d'évolution. Ce
 * module est la source unique des libellés, partagée par la saisie et ces restitutions.
 */

type ApleyResultat = NonNullable<Bilan['apley']>;
export type CoteApley = 'haut_d' | 'haut_g' | 'bas_d' | 'bas_g';

export interface NiveauApley { key: string; label: string; sub: string; score: number }

export const NIVEAUX_HAUT: NiveauApley[] = [
  { key: 'shoulder', label: "Touche l'épaule opposée",     sub: 'normal',            score: 4 },
  { key: 'neck',     label: 'Atteint la nuque',             sub: 'légèrement limité', score: 3 },
  { key: 'top',      label: 'Atteint le sommet de la tête', sub: 'modérément limité', score: 2 },
  { key: 'below',    label: 'Ne dépasse pas le sommet',     sub: 'très limité',       score: 1 },
];

export const NIVEAUX_BAS: NiveauApley[] = [
  { key: 'scapula',  label: "Atteint l'omoplate opposée",   sub: 'normal',            score: 4 },
  { key: 'mid_back', label: 'Atteint le milieu du dos',     sub: 'légèrement limité', score: 3 },
  { key: 'low_back', label: 'Atteint le bas du dos',        sub: 'modérément limité', score: 2 },
  { key: 'buttocks', label: 'Atteint seulement les fesses', sub: 'très limité',       score: 1 },
];

const LIBELLES_COTES: Record<CoteApley, string> = {
  haut_d: 'Haut, côté droit',
  haut_g: 'Haut, côté gauche',
  bas_d:  'Bas, côté droit',
  bas_g:  'Bas, côté gauche',
};

const COTES: CoteApley[] = ['haut_d', 'haut_g', 'bas_d', 'bas_g'];

function niveauxDuCote(cote: CoteApley): NiveauApley[] {
  return cote.startsWith('haut') ? NIVEAUX_HAUT : NIVEAUX_BAS;
}

/** Score 1 à 4 d'un niveau coché, `null` si rien n'est coché ou si la clé est inconnue. */
export function scoreNiveauApley(cote: CoteApley, cle: string | null): number | null {
  if (!cle) return null;
  return niveauxDuCote(cote).find(n => n.key === cle)?.score ?? null;
}

/** Moyenne des côtés renseignés, arrondie au dixième, `null` si aucun côté n'est coché. */
export function calculerScoreApley(a: Pick<ApleyResultat, CoteApley>): number | null {
  const scores = COTES
    .map(c => scoreNiveauApley(c, a[c]))
    .filter((s): s is number => s !== null);
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((x, y) => x + y, 0) / scores.length * 10) / 10;
}

/** Le test a-t-il un résultat (une mesure en cm, un côté coché ou une note) ? */
export function apleyRenseigne(a: ApleyResultat | null | undefined): a is ApleyResultat {
  return a != null && (a.cmDroiteDessus != null || a.cmGaucheDessus != null
    || COTES.some(c => a[c] != null) || a.score != null || !!a.notes?.trim());
}

// ── Mesure en centimètres (convention validée par Pierre le 23/11/2026) ─────────────────────

export const POSITIONS_APLEY = [
  { cle: 'cmDroiteDessus', libelle: 'Main droite au-dessus, gauche en dessous', court: 'Épaules, main D dessus' },
  { cle: 'cmGaucheDessus', libelle: 'Main gauche au-dessus, droite en dessous', court: 'Épaules, main G dessus' },
] as const;

export type CleCmApley = typeof POSITIONS_APLEY[number]['cle'];

/** « −12 cm », « 0 cm », « +4 cm » (signe moins typographique, virgule décimale). */
export function formaterCmApley(v: number): string {
  const texte = String(Math.abs(v)).replace('.', ',');
  return v > 0 ? `+${texte} cm` : v < 0 ? `−${texte} cm` : '0 cm';
}

/** Ce que veut dire la valeur, en mots : rappel de la convention à chaque lecture. */
export function sensCmApley(v: number): string {
  if (v < 0) return 'les doigts ne se touchent pas';
  if (v === 0) return 'les doigts se touchent';
  return 'les doigts se chevauchent';
}

/** Écart entre les deux positions (asymétrie), `null` si une des deux manque. */
export function ecartCmApley(a: ApleyResultat | null | undefined): number | null {
  if (a?.cmDroiteDessus == null || a.cmGaucheDessus == null) return null;
  return Math.round(Math.abs(a.cmDroiteDessus - a.cmGaucheDessus) * 10) / 10;
}

/** Un ancien bilan saisi en niveaux (avant la mesure en cm) ? */
export function apleyEnNiveaux(a: ApleyResultat | null | undefined): boolean {
  return a != null && COTES.some(c => a[c] != null);
}

/**
 * Lignes lisibles pour les PDF : « Haut, côté droit : Atteint la nuque (légèrement limité) ».
 * Les côtés non cochés sont omis plutôt qu'affichés vides.
 */
export function lignesApley(a: ApleyResultat | null | undefined): string[] {
  if (!a) return [];
  const cm = POSITIONS_APLEY.flatMap(p => {
    const v = a[p.cle];
    return v != null ? [`${p.libelle} : ${formaterCmApley(v)} (${sensCmApley(v)})`] : [];
  });
  const ecart = ecartCmApley(a);
  if (ecart != null && ecart > 0) cm.push(`Écart entre les deux positions : ${String(ecart).replace('.', ',')} cm`);
  return [...cm, ...COTES.flatMap(c => {
    const niveau = niveauxDuCote(c).find(n => n.key === a[c]);
    return niveau ? [`${LIBELLES_COTES[c]} : ${niveau.label} (${niveau.sub})`] : [];
  })];
}
