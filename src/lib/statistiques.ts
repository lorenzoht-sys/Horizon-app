// Calculs de la page « Mes stats » (StatsPage), sortis de la page le 2026-11-24 pour être testés.
// Avant, la page comptait les séances à venir du mois comme des annulations (taux de présence
// à 20 % le 3 du mois), calculait des progressions en % sur des mesures qui peuvent être
// négatives (souplesse) et affichait un kilométrage et une projection inventés.
//
// Toutes les dates sont des chaînes civiles « AAAA-MM-JJ » : pas d'objet Date local, pour ne
// pas décaler d'un jour selon le fuseau.

import type { Bilan, Participant, Seance } from '../types';
import { distanceTm6 } from './tm6';
import { calculerAge } from './age';

type SeanceStat = Pick<Seance, 'participantId' | 'date' | 'statut'>;

function versUtc(jour: string): number {
  const [a, m, j] = jour.slice(0, 10).split('-').map(Number);
  return Date.UTC(a, m - 1, j);
}

function depuisUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function ajouterJours(jour: string, n: number): string {
  return depuisUtc(versUtc(jour) + n * 86400000);
}

/** Lundi de la semaine du jour donné. */
export function lundiDe(jour: string): string {
  const dow = new Date(versUtc(jour)).getUTCDay(); // 0 = dimanche
  return ajouterJours(jour, -((dow + 6) % 7));
}

/** Taux de présence : réalisées / (réalisées + annulées). Null s'il n'y a rien à compter. */
export function taux(realisees: number, annulees: number): number | null {
  const total = realisees + annulees;
  return total > 0 ? Math.round((realisees / total) * 100) : null;
}

export interface Presence {
  realisees: number;
  annulees: number;
  /** Séances passées restées « planifiées » : ni réalisées ni annulées, donc non comptées. */
  nonPointees: number;
  taux: number | null;
}

/**
 * Présence sur les `jours` derniers jours, aujourd'hui exclu : seules les séances passées
 * comptent. Les reportées ne comptent pas (la séance a lieu à une autre date).
 */
export function presenceRecente(seances: readonly SeanceStat[], aujourdhui: string, jours = 30): Presence {
  const debut = ajouterJours(aujourdhui, -jours);
  const passees = seances.filter(s => s.date >= debut && s.date < aujourdhui);
  const realisees = passees.filter(s => s.statut === 'realisee').length;
  const annulees = passees.filter(s => s.statut === 'annulee').length;
  const nonPointees = passees.filter(s => s.statut === 'planifiee').length;
  return { realisees, annulees, nonPointees, taux: taux(realisees, annulees) };
}

/**
 * Séances réalisées du mois en cours jusqu'à aujourd'hui, et celles du mois précédent jusqu'au
 * même quantième (borné à la fin du mois précédent) : une comparaison à date égale, pas un mois
 * entamé contre un mois complet.
 */
export function seancesMoisADate(seances: readonly SeanceStat[], aujourdhui: string): { mois: number; moisPrecedent: number } {
  const [a, m, j] = aujourdhui.split('-').map(Number);
  const debutMois = `${aujourdhui.slice(0, 8)}01`;
  const precA = m === 1 ? a - 1 : a;
  const precM = m === 1 ? 12 : m - 1;
  const dernierJourPrec = new Date(Date.UTC(precA, precM, 0)).getUTCDate();
  const prefixePrec = `${precA}-${String(precM).padStart(2, '0')}-`;
  const debutPrec = `${prefixePrec}01`;
  const finPrec = `${prefixePrec}${String(Math.min(j, dernierJourPrec)).padStart(2, '0')}`;
  const realisees = seances.filter(s => s.statut === 'realisee');
  return {
    mois: realisees.filter(s => s.date >= debutMois && s.date <= aujourdhui).length,
    moisPrecedent: realisees.filter(s => s.date >= debutPrec && s.date <= finPrec).length,
  };
}

export interface Semaine {
  /** Lundi de la semaine. */
  debut: string;
  /** « 17/11 » */
  libelle: string;
  realisees: number;
  annulees: number;
}

/** Les `n` dernières semaines (lundi → dimanche), la semaine en cours comprise, de la plus ancienne à la plus récente. */
export function seancesParSemaine(seances: readonly SeanceStat[], aujourdhui: string, n = 12): Semaine[] {
  const lundi = lundiDe(aujourdhui);
  return Array.from({ length: n }, (_, i) => {
    const debut = ajouterJours(lundi, -7 * (n - 1 - i));
    const fin = ajouterJours(debut, 6);
    const dans = seances.filter(s => s.date >= debut && s.date <= fin);
    return {
      debut,
      libelle: `${debut.slice(8, 10)}/${debut.slice(5, 7)}`,
      realisees: dans.filter(s => s.statut === 'realisee').length,
      annulees: dans.filter(s => s.statut === 'annulee').length,
    };
  });
}

export interface Assiduite {
  participantId: string;
  realisees: number;
  annulees: number;
  taux: number;
}

/**
 * Assiduité par bénéficiaire sur les `jours` derniers jours (séances passées), des moins
 * assidus aux plus assidus. On ignore ceux qui ont moins de `minimum` séances comptées : un
 * taux sur une ou deux séances ne dit rien.
 */
export function assiduiteParBeneficiaire(
  seances: readonly SeanceStat[], aujourdhui: string, jours = 90, minimum = 3,
): Assiduite[] {
  const debut = ajouterJours(aujourdhui, -jours);
  const parPersonne = new Map<string, { realisees: number; annulees: number }>();
  for (const s of seances) {
    if (s.date < debut || s.date >= aujourdhui) continue;
    if (s.statut !== 'realisee' && s.statut !== 'annulee') continue;
    const c = parPersonne.get(s.participantId) ?? { realisees: 0, annulees: 0 };
    if (s.statut === 'realisee') c.realisees++; else c.annulees++;
    parPersonne.set(s.participantId, c);
  }
  return [...parPersonne.entries()]
    .filter(([, c]) => c.realisees + c.annulees >= minimum)
    .map(([participantId, c]) => ({ participantId, ...c, taux: taux(c.realisees, c.annulees) ?? 0 }))
    .sort((x, y) => x.taux - y.taux || y.annulees - x.annulees);
}

// ─── Résultats cliniques ─────────────────────────────────────────────────────

interface MesureTest {
  cle: string;
  libelle: string;
  lire: (b: Bilan) => number | null;
  plusPetitEstMieux: boolean;
  /** Écart en dessous duquel on parle de stabilité (unités du test, pas en %). */
  seuil: number;
}

function moyenneCotes(c: { droite: number | null; gauche: number | null } | undefined): number | null {
  const v = [c?.droite, c?.gauche].filter((x): x is number => typeof x === 'number');
  return v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function scoreMemoire(b: Bilan): number | null {
  const m = b.memoire;
  if (!m) return null;
  if (typeof m.dubois?.scoreMIS === 'number') return m.dubois.scoreMIS;
  if (typeof m.scoreImmediat === 'number' || typeof m.scoreDiffere === 'number') {
    return (m.scoreImmediat ?? 0) + (m.scoreDiffere ?? 0);
  }
  return null;
}

// Seuils en unités du test et non en % : la souplesse peut être négative ou nulle, et un
// pourcentage sur un TUG de 8 s ou sur 400 m de TM6 ne veut pas dire la même chose.
const MESURES: MesureTest[] = [
  { cle: 'tm6', libelle: 'Endurance (TM6)', lire: b => distanceTm6(b.tm6), plusPetitEstMieux: false, seuil: 30 },
  { cle: 'force', libelle: 'Lever de chaise 30 s', lire: b => b.chairStand30 ?? null, plusPetitEstMieux: false, seuil: 2 },
  { cle: 'tug', libelle: 'Timed Up and Go', lire: b => b.tug3m ?? null, plusPetitEstMieux: true, seuil: 1 },
  { cle: 'equilibre', libelle: 'Équilibre unipodal', lire: b => moyenneCotes(b.equilibre), plusPetitEstMieux: false, seuil: 2 },
  { cle: 'handGrip', libelle: 'Force de préhension', lire: b => moyenneCotes(b.handGrip), plusPetitEstMieux: false, seuil: 2 },
  { cle: 'souplesse', libelle: 'Souplesse', lire: b => b.souplesse?.valeur ?? null, plusPetitEstMieux: false, seuil: 2 },
  { cle: 'memoire', libelle: 'Mémoire', lire: scoreMemoire, plusPetitEstMieux: false, seuil: 1 },
];

export interface ResultatTest {
  cle: string;
  libelle: string;
  progressent: number;
  stables: number;
  reculent: number;
  total: number;
  /** Ce qu'on appelle « stable », pour l'info-bulle : « moins de 30 m d'écart ». */
  seuilTexte: string;
}

const UNITES: Record<string, string> = {
  tm6: ' m', force: ' levers', tug: ' s', equilibre: ' s', handGrip: ' kg', souplesse: ' cm', memoire: ' point',
};

/**
 * Pour chaque test : combien de bénéficiaires progressent, restent stables ou reculent entre
 * leur premier et leur dernier bilan où le test a été passé. Les tests sans aucun bénéficiaire
 * comparable sont omis.
 */
export function resultatsParTest(participants: readonly Pick<Participant, 'bilans'>[]): ResultatTest[] {
  return MESURES.map(m => {
    let progressent = 0, stables = 0, reculent = 0;
    for (const p of participants) {
      const valeurs = [...(p.bilans ?? [])]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(b => { try { return m.lire(b); } catch { return null; } })
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      if (valeurs.length < 2) continue;
      const ecart = valeurs[valeurs.length - 1] - valeurs[0];
      const gain = m.plusPetitEstMieux ? -ecart : ecart;
      if (gain >= m.seuil) progressent++;
      else if (gain <= -m.seuil) reculent++;
      else stables++;
    }
    return {
      cle: m.cle, libelle: m.libelle, progressent, stables, reculent,
      total: progressent + stables + reculent,
      seuilTexte: `moins de ${String(m.seuil).replace('.', ',')}${UNITES[m.cle]} d’écart`,
    };
  })
    .filter(r => r.total > 0)
    .sort((a, b) => b.total - a.total || b.progressent / b.total - a.progressent / a.total);
}

// ─── Répartition ─────────────────────────────────────────────────────────────

export type CategorieBeneficiaire = 'Sénior' | 'Post-op' | 'Chronique' | 'Adulte blessé' | 'Autre';
export const CATEGORIES: CategorieBeneficiaire[] = ['Sénior', 'Post-op', 'Chronique', 'Adulte blessé', 'Autre'];

/** Même règle que l'ancienne page : les étiquettes d'abord, puis le contexte clinique et l'âge. */
export function categorieBeneficiaire(p: Pick<Participant, 'tags' | 'dateNaissance' | 'contexteClinic'>): CategorieBeneficiaire {
  const tags = p.tags ?? [];
  if (tags.includes('post_op')) return 'Post-op';
  if (tags.includes('senior')) return 'Sénior';
  if (tags.includes('chronique')) return 'Chronique';
  if (tags.includes('adulte_blessure')) return 'Adulte blessé';
  const ctx = (p.contexteClinic ?? '').toLowerCase();
  if (ctx.includes('pth') || ctx.includes('opér') || ctx.includes('post-op')) return 'Post-op';
  const age = calculerAge(p.dateNaissance);
  if (age !== null && age >= 65) return 'Sénior';
  return 'Autre';
}
