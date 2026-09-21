// Logique du TMC (test de marche 6 min) : tableau de mesures unique et type de résultat.
//
// Tableau : avant, minutes du test, récupération — une seule liste, extensible. Les
// anciens TMC stockaient les minutes dans `mesuresParMinute` (6 entrées sans `kind`)
// et le reste dans des colonnes séparées (fcAvant, fcApres, fc1min, fc2min, spo2…).
// `lireMesures` reconstruit le tableau unique à partir de l'un ou l'autre format, sans
// perte ; `ecrireMesures` enregistre le tableau ET recopie les colonnes historiques,
// pour que fiches PDF, exports et graphiques existants continuent de fonctionner.
//
// Résultat : distance (marche) ou nombre de pas (stepper, marche sur place). Une
// distance nulle n'est jamais un résultat pour un test en pas.

import type { Bilan } from '../types';

type Tm6 = Bilan['tm6'];
export type Tm6Mesure = NonNullable<Tm6['mesuresParMinute']>[number];
export type Tm6MesureKind = NonNullable<Tm6Mesure['kind']>;
export type Tm6Mode = 'standard' | 'stepper' | 'marche_sur_place';

const vide = (): { bpm: number | null; spo2: number | null } => ({ bpm: null, spo2: null });
const aDonnee = (m: { bpm: number | null; spo2: number | null }) => m.bpm != null || m.spo2 != null;

/** Les 9 lignes du protocole standard. */
export function mesuresParDefaut(nbMinutes = 6): Tm6Mesure[] {
  return [
    { kind: 'avant', label: 'Avant le test', ...vide() },
    ...Array.from({ length: nbMinutes }, (_, i): Tm6Mesure => ({ kind: 'minute', label: `Minute ${i + 1}`, ...vide() })),
    { kind: 'rec1', label: 'Récupération 1 min', ...vide() },
    { kind: 'rec2', label: 'Récupération 2 min', ...vide() },
  ];
}

/** Vrai si le tableau est au nouveau format (chaque ligne porte un `kind`). */
function estNouveauFormat(m: Tm6["mesuresParMinute"]): boolean {
  return Array.isArray(m) && m.length > 0 && m.every(l => l && l.kind != null);
}

/**
 * Tableau unique pour un TMC, quel que soit son format d'enregistrement.
 * Ancien format : Avant + Minute 1..N + (« Juste après » si renseigné) + Récup 1 min + Récup 2 min.
 */
export function lireMesures(tm6: Tm6): Tm6Mesure[] {
  if (estNouveauFormat(tm6.mesuresParMinute)) return (tm6.mesuresParMinute ?? []).map(l => ({ ...l }));

  const minutes = Array.isArray(tm6.mesuresParMinute) ? tm6.mesuresParMinute : [];
  const lignes = mesuresParDefaut(Math.max(6, minutes.length));
  const avant = lignes.find(l => l.kind === 'avant')!;
  avant.bpm = tm6.fcAvant ?? null;
  avant.spo2 = tm6.spo2Avant ?? null;
  minutes.forEach((m, i) => {
    const l = lignes.find(x => x.kind === 'minute' && x.label === `Minute ${i + 1}`);
    if (l && m) { l.bpm = m.bpm ?? null; l.spo2 = m.spo2 ?? null; }
  });
  const rec1 = lignes.find(l => l.kind === 'rec1')!;
  rec1.bpm = tm6.fc1min ?? null;
  rec1.spo2 = tm6.spo21min ?? null;
  const rec2 = lignes.find(l => l.kind === 'rec2')!;
  rec2.bpm = tm6.fc2min ?? null;
  rec2.spo2 = tm6.spo22min ?? null;

  // « Juste après » n'existe pas dans le protocole à 9 lignes : ligne ajoutée seulement
  // si l'ancien TMC contient une valeur, pour ne rien perdre.
  if (tm6.fcApres != null || tm6.spo2Apres != null) {
    const idx = lignes.findIndex(l => l.kind === 'rec1');
    lignes.splice(idx, 0, { kind: 'apres', label: 'Juste après', bpm: tm6.fcApres ?? null, spo2: tm6.spo2Apres ?? null });
  }
  return lignes;
}

/**
 * Patch à appliquer à `tm6` pour enregistrer le tableau : la liste elle-même et les
 * colonnes historiques dérivées (fcApres = « Juste après », à défaut la dernière minute
 * renseignée, ce qui est la mesure d'arrêt de l'effort).
 */
export function ecrireMesures(mesures: Tm6Mesure[]): Partial<Tm6> {
  const premier = (k: Tm6MesureKind) => mesures.find(m => m.kind === k);
  const avant = premier('avant');
  const rec1 = premier('rec1');
  const rec2 = premier('rec2');
  const apres = premier('apres')
    ?? [...mesures].reverse().find(m => m.kind === 'minute' && aDonnee(m));
  return {
    mesuresParMinute: mesures,
    fcAvant: avant?.bpm ?? null,
    spo2Avant: avant?.spo2 ?? null,
    fcApres: apres?.bpm ?? null,
    spo2Apres: apres?.spo2 ?? null,
    fc1min: rec1?.bpm ?? null,
    spo21min: rec1?.spo2 ?? null,
    fc2min: rec2?.bpm ?? null,
    spo22min: rec2?.spo2 ?? null,
  };
}

// ── Type de résultat ─────────────────────────────────────────────────────────

export type Tm6TypeResultat = 'distance' | 'pas' | 'tours';

export interface Tm6Resultat {
  type: Tm6TypeResultat;
  /** null = pas de résultat saisi. */
  valeur: number | null;
  unite: 'm' | 'pas' | 'tours';
  /** « Marche », « Stepper » ou « Marche sur place ». */
  modeLabel: string;
  /** « 420 m », « 650 pas » ou « — ». */
  texte: string;
}

export const TM6_MODE_LABELS: Record<Tm6Mode, string> = {
  standard: 'Marche',
  stepper: 'Stepper',
  marche_sur_place: 'Marche sur place',
};

export function tm6EnPas(tm6: Tm6): boolean {
  return tm6.mode === 'stepper' || tm6.mode === 'marche_sur_place';
}

/**
 * Résultat principal du TMC avec la bonne unité. Le mode prime ; sans mode en pas,
 * on suit les données (variantes personnalisées : pas / tours saisis, distance absente).
 */
export function resultatTm6(tm6: Tm6 | null | undefined): Tm6Resultat {
  const mode: Tm6Mode = tm6?.mode ?? 'standard';
  const modeLabel = TM6_MODE_LABELS[mode] ?? 'Marche';
  const pas = tm6?.repetitions ?? tm6?.nbPas ?? null;
  const tours = tm6?.nbTours ?? null;
  const dist = tm6?.distanceMetres ?? null;

  let type: Tm6TypeResultat = 'distance';
  if (tm6 && tm6EnPas(tm6)) type = 'pas';
  else if (!(dist != null && dist > 0)) {
    if (pas != null && pas > 0) type = 'pas';
    else if (tours != null && tours > 0) type = 'tours';
  }

  const valeur = type === 'pas' ? pas : type === 'tours' ? tours : dist;
  const unite = type === 'pas' ? 'pas' : type === 'tours' ? 'tours' : 'm';
  return { type, valeur, unite, modeLabel, texte: valeur == null ? '—' : `${valeur} ${unite}` };
}

/** Distance en mètres, ou null si le TMC est mesuré en pas / tours (normes, radar, deltas). */
export function distanceTm6(tm6: Tm6 | null | undefined): number | null {
  const r = resultatTm6(tm6);
  return r.type === 'distance' ? r.valeur : null;
}
