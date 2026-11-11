import { calculerNote, NORMES_SCORING } from '../../data/norms';
import { computeTinettiScores, tinettiRisque } from '../../data/tinetti';
import { getSedProfil, getFSSProfil } from '../../components/bilan/TestsAutonomie';
import { etatSedentarite, etatFatigue, SED_TOTAL_MAX, FSS_TOTAL_MAX, type EtatQuestionnaire } from '../../lib/scoresAutonomie';
import type { Bilan, Participant } from '../../types';
import { getTestsAutonomie } from '../../lib/anamnese';
import { distanceTm6, resultatTm6 } from '../../lib/tm6';
import { SectionLabel } from './communs';

// ── Constants ─────────────────────────────────────────────────────────────────

export function tm6Extra(b: Bilan): string | null {
  const parts: string[] = [];
  const r = resultatTm6(b.tm6);
  if (r.type !== 'distance' && r.valeur != null) parts.push(`${r.modeLabel} : ${r.texte}`);
  if (b.tm6.nbPauses) parts.push(`${b.tm6.nbPauses} pause(s), ${b.tm6.dureePausesSecondes ?? 0}s d'arrêt`);
  const duree = b.tm6.dureeReelleSecondes;
  if (duree != null && duree !== 360) parts.push(`test ${Math.round(duree / 6) / 10} min`);
  return parts.length ? parts.join(' · ') : null;
}

export function tinettiVal(b: Bilan): number | null {
  const s = computeTinettiScores(b.tinetti);
  return s?.complet ? s.scoreTotal : null;
}

export function tinettiExtra(b: Bilan): string | null {
  const val = tinettiVal(b);
  return val !== null ? tinettiRisque(val).label : null;
}

export const TESTS_TABLEAU: {
  label: string; normeKey: string; unite: string; lower: boolean;
  getVal: (b: Bilan) => number | null; getExtra?: (b: Bilan) => string | null;
}[] = [
  { label: 'Équilibre D', normeKey: 'equilibreUnipodal', unite: 's',     lower: false, getVal: (b: Bilan) => b.equilibre.droite },
  { label: 'Chair Stand', normeKey: 'chairStand30',      unite: ' rép.', lower: false, getVal: (b: Bilan) => b.chairStand30 },
  { label: 'HandGrip D',  normeKey: 'handGrip',          unite: ' kg',   lower: false, getVal: (b: Bilan) => b.handGrip.droite },
  { label: 'TUG 3m',      normeKey: 'tug3m',             unite: 's',     lower: true,  getVal: (b: Bilan) => b.tug3m },
  { label: 'TM6',         normeKey: 'tm6Distance',        unite: ' m',    lower: false, getVal: (b: Bilan) => distanceTm6(b.tm6), getExtra: tm6Extra },
  { label: 'Souplesse',   normeKey: 'souplesse',          unite: ' cm',   lower: false, getVal: (b: Bilan) => b.souplesse.valeur },
  { label: 'Mémoire',     normeKey: 'memoire',            unite: '/5',    lower: false, getVal: (b: Bilan) => b.memoire.scoreImmediat },
  { label: 'Apley Scratch', normeKey: 'apley',           unite: '/4',    lower: false, getVal: (b: Bilan) => b.apley?.score ?? null },
  { label: 'Tinetti POMA', normeKey: 'tinetti',          unite: '/28',   lower: false, getVal: tinettiVal, getExtra: tinettiExtra },
];

export const NORMES_LABEL: Record<string, string> = {
  equilibreUnipodal: '≥ 40s',
  chairStand30:      '≥ 14 rép.',
  handGrip:          '≥ 32 kg',
  tug3m:             '≤ 8s',
  souplesse:         '≥ 10 cm',
  tm6Distance:       '≥ 500 m',
  memoire:           '4-5/5',
  apley:             '≥ 3.5/4',
  tinetti:           '≥ 24/28',
};

export const DOT_COLORS = {
  vert:   '#4CAF50',
  orange: '#E8951A',
  rouge:  '#E24B4A',
};


export function noteToDot(note: 1|2|3|4|5): string {
  if (note >= 4) return DOT_COLORS.vert;
  if (note === 3) return DOT_COLORS.orange;
  return DOT_COLORS.rouge;
}

export function noteToLabel(note: 1|2|3|4|5): string {
  if (note >= 4) return 'Dans les normes';
  if (note === 3) return 'À surveiller';
  return 'En difficulté';
}

// ── CarteProfilFonctionnel ────────────────────────────────────────────────────

export function CarteProfilFonctionnel({ participant, bilans }: {
  participant: Participant;
  bilans: Bilan[];
}) {
  const sorted = [...bilans].sort((a, b) => a.date.localeCompare(b.date));
  const initial = sorted[0] ?? null;
  const current = sorted[sorted.length - 1] ?? null;
  if (!current) return null;

  const { sedentarite, fatigue } = getTestsAutonomie(participant, initial);

  // ── Score affiché, ou état « à régulariser » ────────────────────────────
  //
  // L'état est dérivé des RÉPONSES stockées, pas du score stocké : jusqu'au
  // 2026-09-14, un questionnaire incomplet produisait quand même un total
  // (absences comptées comme des zéros côté Ricci & Gagnon, items ignorés
  // côté FSS). Les scores déjà en base héritent de ce défaut.
  //
  // Ils ne sont PAS recalculés en silence : Pierre a pu communiquer un score
  // à un bénéficiaire ou le reprendre dans un compte rendu. On affiche donc
  // ce qu'on peut affirmer — « à régulariser » — et la reprise du
  // questionnaire recalcule proprement.
  //
  // Réponses absentes mais score présent : la complétude n'est pas
  // vérifiable, et le score vient de l'ancien calcul. Même traitement.
  function affichage(
    etat: EtatQuestionnaire,
    scoreStocke: number | null,
    max: number,
    prefixe: string,
    profil: { label: string; color: string } | null,
  ): { texte: string; color: string; detail: string } | null {
    if (etat.etat === 'complet' && profil) {
      return {
        texte: `${profil.label} (${prefixe}${etat.score}/${max})`,
        color: profil.color,
        detail: '',
      };
    }
    if (etat.etat === 'a_regulariser') {
      return {
        texte: 'À régulariser',
        color: '#BA7517',
        detail: `Questionnaire incomplet — aucun score fiable. Réponses manquantes : ${etat.manquants.join(', ')}.`,
      };
    }
    if (scoreStocke !== null) {
      return {
        texte: 'À régulariser',
        color: '#BA7517',
        detail: 'Réponses détaillées absentes : la complétude du questionnaire ne peut pas être vérifiée.',
      };
    }
    return null;
  }

  const etatSed = etatSedentarite(sedentarite.reponses);
  const etatFss = etatFatigue(fatigue.reponses);
  const affSed = affichage(
    etatSed, sedentarite.score, SED_TOTAL_MAX, '',
    etatSed.etat === 'complet' ? getSedProfil(etatSed.score) : null,
  );
  const affFss = affichage(
    etatFss, fatigue.score, FSS_TOTAL_MAX, 'FSS ',
    etatFss.etat === 'complet' ? getFSSProfil(etatFss.score) : null,
  );

  const testsAvecValeur = TESTS_TABLEAU.map(test => {
    const val = test.getVal(current);
    const extra = test.getExtra?.(current) ?? null;
    if (val === null || val === undefined) {
      // TM6 en pas/tours : pas de valeur en mètres à noter (jamais comparer pas <-> distance,
      // cf. tm6.ts), mais pas invisible pour autant — `extra` porte le résultat réel (ex.
      // « Stepper : 650 pas ») quand il existe, sans note ni delta (unités non comparables).
      if (extra) return { test, val: null, note: null, progression: null, extra };
      return null;
    }
    const valInit = initial ? test.getVal(initial) : null;
    const norme = NORMES_SCORING[test.normeKey];
    const note = norme ? calculerNote(val, norme) : null;
    const delta = valInit !== null && valInit !== undefined ? val - valInit : null;
    const progression = delta !== null ? (test.lower ? -delta : delta) : null;
    return { test, val, note, progression, extra };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  // Pair tests into 2 columns
  const leftTests = testsAvecValeur.filter((_, i) => i % 2 === 0);
  const rightTests = testsAvecValeur.filter((_, i) => i % 2 === 1);

  function TestRow({ test, val, note, progression, extra }: typeof testsAvecValeur[0]) {
    const dotColor = note !== null ? noteToDot(note) : null;
    const dotLabel = note !== null ? noteToLabel(note) : '';
    const normeText = NORMES_LABEL[test.normeKey];
    // val === null : résultat non comparable (TM6 en pas/tours) — extra porte alors seul le
    // résultat réel, à la place de la valeur en mètres qui n'existe pas pour ce bilan.
    const valDisplay = val !== null
      ? `${test.label === 'Souplesse' && val > 0 ? '+' : ''}${val}${test.unite}`
      : null;
    return (
      <div className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0">
        <span className="text-[12px] text-gray-400 w-[82px] flex-shrink-0 truncate">{test.label}</span>
        <div className="flex-1 min-w-0">
          {valDisplay && <span className="text-[13px] font-semibold text-gray-800">{valDisplay}</span>}
          {extra && (
            <div
              className={valDisplay
                ? 'text-[10px] text-orange-600 leading-none mt-0.5 truncate'
                : 'text-[13px] font-semibold text-gray-800 truncate'}
              title={extra}
            >
              {extra}
            </div>
          )}
          {normeText && val !== null && (
            <div className="text-[10px] text-gray-400 leading-none mt-0.5">{normeText}</div>
          )}
        </div>
        {dotColor && (
          <span
            title={dotLabel}
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: dotColor }}
          />
        )}
        {progression !== null && (
          <span className={`text-[11px] font-bold flex-shrink-0 ${progression > 0 ? 'text-green-600' : progression < 0 ? 'text-red-500' : 'text-gray-400'}`}>
            {progression > 0 ? '↑' : progression < 0 ? '↓' : '='}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Profil fonctionnel</SectionLabel>
        {initial !== current && (
          <span className="text-[12px] text-gray-400">
            Initial → {new Date(current.date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          </span>
        )}
      </div>

      {/* Test grid 2 colonnes */}
      {/* Une colonne sur téléphone : à deux, libellé et valeur se chevauchaient. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
        <div className="sm:pr-4 sm:border-r border-gray-100">
          {leftTests.map((item, i) => <TestRow key={i} {...item} />)}
        </div>
        <div className="sm:pl-4">
          {rightTests.map((item, i) => <TestRow key={i} {...item} />)}
        </div>
      </div>

      {/* Légende */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t border-gray-100">
        {([
          { color: DOT_COLORS.vert,   label: 'Dans les normes' },
          { color: DOT_COLORS.orange, label: 'À surveiller' },
          { color: DOT_COLORS.rouge,  label: 'En difficulté' },
        ] as const).map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5 text-[11px] text-gray-400">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>

      {/* Activité physique & Fatigue du bilan initial */}
      {(affSed || affFss) && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-1.5">
          {affSed && (
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-gray-500">Activité physique</span>
              <span style={{ color: affSed.color, fontWeight: 600 }} title={affSed.detail}>
                {affSed.texte}
              </span>
            </div>
          )}
          {affFss && (
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-gray-500">Fatigue perçue</span>
              <span style={{ color: affFss.color, fontWeight: 600 }} title={affFss.detail}>
                {affFss.texte}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
