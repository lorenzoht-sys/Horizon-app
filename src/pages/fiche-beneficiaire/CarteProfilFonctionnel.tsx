import { calculerNote, NORMES_SCORING } from '../../data/norms';
import { computeTinettiScores, tinettiRisque } from '../../data/tinetti';
import { getSedProfil, getFSSProfil } from '../../components/bilan/TestsAutonomie';
import { etatSedentarite, etatFatigue, SED_TOTAL_MAX, FSS_TOTAL_MAX, type EtatQuestionnaire } from '../../lib/scoresAutonomie';
import type { Bilan, Participant } from '../../types';
import { getTestsAutonomie } from '../../lib/anamnese';
import { distanceTm6, resultatTm6 } from '../../lib/tm6';
import { SectionLabel } from './communs';

// ── Constants ─────────────────────────────────────────────────────────────────

function tm6Extra(b: Bilan): string | null {
  const parts: string[] = [];
  const r = resultatTm6(b.tm6);
  if (r.type !== 'distance' && r.valeur != null) parts.push(`${r.modeLabel} : ${r.texte}`);
  if (b.tm6.nbPauses) parts.push(`${b.tm6.nbPauses} pause(s), ${b.tm6.dureePausesSecondes ?? 0}s d'arrêt`);
  const duree = b.tm6.dureeReelleSecondes;
  if (duree != null && duree !== 360) parts.push(`test ${Math.round(duree / 6) / 10} min`);
  return parts.length ? parts.join(' · ') : null;
}

function tinettiVal(b: Bilan): number | null {
  const s = computeTinettiScores(b.tinetti);
  return s?.complet ? s.scoreTotal : null;
}

function tinettiExtra(b: Bilan): string | null {
  const val = tinettiVal(b);
  return val !== null ? tinettiRisque(val).label : null;
}

const TESTS_TABLEAU: {
  label: string; normeKey: string; unite: string; lower: boolean;
  getVal: (b: Bilan) => number | null; getExtra?: (b: Bilan) => string | null;
}[] = [
  { label: 'Équilibre D', normeKey: 'equilibreUnipodal', unite: 's',     lower: false, getVal: (b: Bilan) => b.equilibre.droite },
  { label: 'Chair Stand', normeKey: 'chairStand30',      unite: ' rép.', lower: false, getVal: (b: Bilan) => b.chairStand30 },
  { label: 'HandGrip D',  normeKey: 'handGrip',          unite: ' kg',   lower: false, getVal: (b: Bilan) => b.handGrip.droite },
  { label: 'TUG 3m',      normeKey: 'tug3m',             unite: 's',     lower: true,  getVal: (b: Bilan) => b.tug3m },
  { label: 'TM6',         normeKey: 'tm6Distance',        unite: ' m',    lower: false, getVal: (b: Bilan) => distanceTm6(b.tm6), getExtra: tm6Extra },
  // Libellés courts (colonne de 82 px) ; les noms complets sont dans TEST_LABELS (profiles.ts).
  { label: 'Doigts-sol',  normeKey: 'souplesse',          unite: ' cm',   lower: false, getVal: (b: Bilan) => b.souplesse.valeur },
  { label: 'Mémoire',     normeKey: 'memoire',            unite: '/5',    lower: false, getVal: (b: Bilan) => b.memoire.scoreImmediat },
  { label: 'Épaules',     normeKey: 'apley',             unite: '/4',    lower: false, getVal: (b: Bilan) => b.apley?.score ?? null },
  // Scratch Test en cm (23/11/2026) : pas de norme validée, donc pas de point de couleur.
  { label: 'Épaules D dessus', normeKey: 'apleyCm',      unite: ' cm',   lower: false, getVal: (b: Bilan) => b.apley?.cmDroiteDessus ?? null },
  { label: 'Épaules G dessus', normeKey: 'apleyCm',      unite: ' cm',   lower: false, getVal: (b: Bilan) => b.apley?.cmGaucheDessus ?? null },
  { label: 'Tinetti POMA', normeKey: 'tinetti',          unite: '/28',   lower: false, getVal: tinettiVal, getExtra: tinettiExtra },
];

const NORMES_LABEL: Record<string, string> = {
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

const DOT_COLORS = {
  vert:   '#4CAF50',
  orange: '#E8951A',
  rouge:  '#E24B4A',
};


function noteToDot(note: 1|2|3|4|5): string {
  if (note >= 4) return DOT_COLORS.vert;
  if (note === 3) return DOT_COLORS.orange;
  return DOT_COLORS.rouge;
}

function noteToLabel(note: 1|2|3|4|5): string {
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


  // Tuile d'un test (refonte du 23/11/2026) : valeur en grand, niveau en toutes lettres, et une
  // jauge en cinq crans (la note /5 de norms.ts), la norme commençant au 4e. On voit l'écart à la
  // norme sans lire de chiffre ; les seuils restent écrits dessous.
  function TestRow({ test, val, note, progression, extra }: typeof testsAvecValeur[0]) {
    const dotColor = note !== null ? noteToDot(note) : null;
    const dotLabel = note !== null ? noteToLabel(note) : '';
    const normeText = NORMES_LABEL[test.normeKey];
    // val === null : résultat non comparable (TM6 en pas/tours) — extra porte alors seul le
    // résultat réel, à la place de la valeur en mètres qui n'existe pas pour ce bilan.
    const valDisplay = val !== null
      ? `${(test.normeKey === 'souplesse' || test.normeKey === 'apleyCm') && val > 0 ? '+' : ''}${val}${test.unite}`
      : null;
    return (
      <div className="rounded-[14px] p-3.5" style={{ background: '#FAFCFD', border: '1px solid #EEF4F4' }}>
        <div className="flex items-start justify-between gap-2">
          <span className="text-[12px] font-bold text-gray-500 leading-tight">{test.label}</span>
          {note !== null && dotColor && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0"
              style={{ background: `${dotColor}1F`, color: note >= 4 ? '#147A64' : note === 3 ? '#8A5300' : '#B42318' }}>
              {dotLabel}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2 mt-1.5">
          {valDisplay && <span className="text-[20px] font-extrabold text-gray-900 leading-none">{valDisplay}</span>}
          {progression !== null && (
            <span className={`text-[12px] font-bold ${progression > 0 ? 'text-green-600' : progression < 0 ? 'text-red-500' : 'text-gray-400'}`}
              title={progression > 0 ? 'En progrès depuis le bilan initial' : progression < 0 ? 'En recul depuis le bilan initial' : 'Stable depuis le bilan initial'}>
              {progression > 0 ? '↑' : progression < 0 ? '↓' : '='}
            </span>
          )}
        </div>
        {extra && (
          <div
            className={valDisplay
              ? 'text-[11px] text-orange-700 leading-snug mt-1 truncate'
              : 'text-[15px] font-bold text-gray-800 truncate mt-1'}
            title={extra}
          >
            {extra}
          </div>
        )}
        {note !== null && dotColor && (
          <div className="relative flex gap-1 mt-2.5" role="img" aria-label={`Niveau ${note} sur 5 (${dotLabel}) ; la norme commence au niveau 4`}>
            {[1, 2, 3, 4, 5].map(cran => (
              <span key={cran} className="h-1.5 flex-1 rounded-full" style={{ background: cran <= note ? dotColor : '#E6EEF0' }} />
            ))}
            {/* Repère de la norme : un trait fin juste avant le 4e cran (relecture visuelle du
                23/11/2026 : le cran entouré se lisait comme un bouton). */}
            <span aria-hidden="true" className="absolute -top-1 -bottom-1 w-0.5 rounded-full" style={{ left: 'calc(60% - 1px)', background: '#1A2332' }} />
          </div>
        )}
        {normeText && val !== null && (
          <div className="text-[11px] text-gray-500 mt-1.5">Norme {normeText}</div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[18px] p-4 sm:p-5 shadow-sm" style={{ border: '1px solid #E2EEEE' }}>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Profil fonctionnel</SectionLabel>
        {initial !== current && (
          <span className="text-[12px] text-gray-400">
            Initial → {new Date(current.date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          </span>
        )}
      </div>

      {/* Tuiles : une colonne sur téléphone, deux ou trois au-delà. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
        {testsAvecValeur.map((item, i) => <TestRow key={i} {...item} />)}
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
