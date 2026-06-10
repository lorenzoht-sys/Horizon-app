// Composant d'évaluation GIR (Grille AGGIR)

import type { GIRData } from '../../types';

// ─── Variables AGGIR ──────────────────────────────────────────────────────────

const VARS_DISCRIMINANTES = [
  { id: 'coherence',       label: 'Cohérence',                    desc: 'Communiquer et se comporter de façon sensée' },
  { id: 'orientation',     label: 'Orientation',                  desc: 'Se repérer dans le temps et dans les lieux' },
  { id: 'toiletteHaut',    label: 'Toilette du haut du corps',    desc: 'Visage, tronc, bras, mains' },
  { id: 'toiletteBas',     label: 'Toilette du bas du corps',     desc: 'Parties génitales, jambes, pieds' },
  { id: 'habillageHaut',   label: 'Habillage haut',               desc: 'Dessus, dessous, prothèses' },
  { id: 'habillageMoyen',  label: 'Habillage moyen',              desc: 'Ceinture, boutonnage, fermetures' },
  { id: 'habillageBas',    label: 'Habillage bas',                desc: 'Chaussures, chaussettes' },
  { id: 'alimentation',    label: 'Alimentation',                 desc: 'Se servir et manger' },
  { id: 'elimination',     label: 'Élimination',                  desc: 'Assurer l\'hygiène urinaire et fécale' },
  { id: 'transferts',      label: 'Transferts',                   desc: 'Se lever, se coucher, s\'asseoir' },
  { id: 'deplacementsInt', label: 'Déplacements à l\'intérieur', desc: 'Avec ou sans canne ou déambulateur' },
  { id: 'deplacementsExt', label: 'Déplacements à l\'extérieur', desc: 'En dehors du domicile' },
];

const VARS_ILLUSTRATIVES = [
  { id: 'communication',  label: 'Communication à distance', desc: 'Téléphone, sonnette' },
  { id: 'gestion',        label: 'Gestion',                  desc: 'Finances, papiers administratifs' },
  { id: 'cuisine',        label: 'Cuisine',                  desc: 'Préparer les repas' },
  { id: 'menage',         label: 'Ménage',                   desc: 'Entretien du logement' },
  { id: 'transports',     label: 'Transports',               desc: 'Utiliser des moyens de transport' },
];

// ─── Couleurs et descriptions GIR ────────────────────────────────────────────

const GIR_COLOR: Record<number, string> = {
  1: '#E85050', 2: '#E85050',
  3: '#F59E0B', 4: '#F59E0B',
  5: '#1D9E75', 6: '#1D9E75',
};

const GIR_DESC: Record<number, string> = {
  1: 'Perte totale d\'autonomie mentale et corporelle. Présence permanente indispensable.',
  2: 'Perte quasi-totale de l\'autonomie mentale ou corporelle. Soins continus.',
  3: 'Aide importante pour la toilette et l\'habillage. Autonomie mentale préservée.',
  4: 'Aide partielle pour la toilette ou l\'habillage. Autonomie cognitive ou locomotrice.',
  5: 'Aide ponctuelle pour la toilette, le ménage ou la préparation des repas.',
  6: 'Autonomie totale pour les actes discriminants de la vie quotidienne.',
};

// ─── Algorithme AGGIR simplifié ──────────────────────────────────────────────

function scoreVar(v: 'A' | 'B' | 'C' | undefined): number {
  return v === 'A' ? 0 : v === 'B' ? 1 : v === 'C' ? 2 : 0;
}

function computeGIR(vars: Record<string, 'A' | 'B' | 'C'>): number | null {
  const filled = VARS_DISCRIMINANTES.every(v => vars[v.id] !== undefined);
  if (!filled) return null;

  const mental   = scoreVar(vars.coherence) + scoreVar(vars.orientation);            // 0-4
  const body     = scoreVar(vars.toiletteHaut) + scoreVar(vars.toiletteBas)
                 + scoreVar(vars.habillageHaut) + scoreVar(vars.habillageMoyen) + scoreVar(vars.habillageBas)
                 + scoreVar(vars.alimentation) + scoreVar(vars.elimination);          // 0-14
  const mobility = scoreVar(vars.transferts) + scoreVar(vars.deplacementsInt) + scoreVar(vars.deplacementsExt); // 0-6

  const total = mental * 2 + body + mobility; // max 24 (mental pondéré x2)

  if (total === 0)  return 6;
  if (total <= 3)   return 5;
  if (total <= 8)   return 4;
  if (total <= 14)  return 3;
  if (total <= 20)  return 2;
  return 1;
}

// ─── Sous-composant variable A/B/C ───────────────────────────────────────────

function VariableABC({
  num, label, desc, value, onChange, illustrative,
}: {
  num: number;
  label: string;
  desc: string;
  value: 'A' | 'B' | 'C' | undefined;
  onChange: (v: 'A' | 'B' | 'C') => void;
  illustrative?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-3 ${illustrative ? 'border-gray-100 bg-gray-50/50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <span className="text-xs text-gray-400 font-bold mr-1">{num}.</span>
          <span className="text-sm font-medium text-gray-800">{label}</span>
          <p className="text-xs text-gray-400 mt-0.5 leading-snug">{desc}</p>
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          {(['A', 'B', 'C'] as const).map(letter => (
            <button
              key={letter}
              type="button"
              onClick={() => onChange(letter)}
              className={`w-9 h-9 rounded-lg text-sm font-black border-2 transition-all ${
                value === letter
                  ? letter === 'A'
                    ? 'bg-green-500 border-green-500 text-white'
                    : letter === 'B'
                    ? 'bg-orange-400 border-orange-400 text-white'
                    : 'bg-red-500 border-red-500 text-white'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {letter}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

interface Props {
  value: GIRData | null;
  onChange: (v: GIRData | null) => void;
}

export default function GIRWidget({ value, onChange }: Props) {
  const mode = value?.mode ?? null;
  const vars = value?.variables ?? {};
  const filledDiscr = VARS_DISCRIMINANTES.filter(v => vars[v.id] !== undefined).length;

  function selectMode(m: 'direct' | 'calcule' | 'passe') {
    if (m === 'passe') {
      onChange(null);
      return;
    }
    onChange({
      mode: m,
      niveau: m === 'direct' ? (value?.niveau ?? null) : computeGIR(vars),
      methode: m,
      variables: vars,
    });
  }

  function setGIRDirect(n: number) {
    onChange({ mode: 'direct', niveau: n, methode: 'direct', variables: vars });
  }

  function setVariable(id: string, val: 'A' | 'B' | 'C') {
    const newVars = { ...vars, [id]: val };
    onChange({
      mode: 'calcule',
      niveau: computeGIR(newVars),
      methode: 'calcule',
      variables: newVars,
    });
  }

  const calculatedGIR = mode === 'calcule' ? computeGIR(vars) : null;

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-gray-700">
        Le GIR a-t-il déjà été évalué ?
      </label>

      {/* Sélection du mode */}
      <div className="flex flex-col sm:flex-row gap-2">
        {[
          { key: 'direct'  as const, label: '✅ Oui — je connais le GIR' },
          { key: 'calcule' as const, label: '📋 Non — évaluer maintenant' },
          { key: 'passe'   as const, label: '⏭ Passer cette étape' },
        ].map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => selectMode(key)}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
              mode === key
                ? 'border-primary bg-primary text-white shadow-sm'
                : key === 'passe'
                ? 'border-gray-100 text-gray-400 hover:border-gray-200 hover:bg-gray-50'
                : 'border-gray-200 text-gray-600 hover:border-primary/50 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* MODE DIRECT — sélecteur GIR 1-6 */}
      {mode === 'direct' && (
        <div className="space-y-3 pt-1">
          <div className="flex gap-2 flex-wrap">
            {[1, 2, 3, 4, 5, 6].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setGIRDirect(n)}
                style={{
                  borderColor: GIR_COLOR[n],
                  background: value?.niveau === n ? GIR_COLOR[n] : 'white',
                  color: value?.niveau === n ? 'white' : GIR_COLOR[n],
                }}
                className="px-5 py-2.5 rounded-xl text-sm font-black border-2 transition-all min-w-[76px] hover:opacity-80"
              >
                GIR {n}
              </button>
            ))}
          </div>

          {value?.niveau && (
            <div className="rounded-xl border px-4 py-3 flex items-start gap-3"
              style={{ borderColor: GIR_COLOR[value.niveau], background: `${GIR_COLOR[value.niveau]}12` }}>
              <span className="text-lg font-black flex-shrink-0" style={{ color: GIR_COLOR[value.niveau] }}>
                GIR {value.niveau}
              </span>
              <p className="text-sm text-gray-700 leading-relaxed">{GIR_DESC[value.niveau]}</p>
            </div>
          )}
        </div>
      )}

      {/* MODE CALCUL — grille AGGIR 17 variables */}
      {mode === 'calcule' && (
        <div className="space-y-5 pt-1">

          {/* Légende A/B/C */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 space-y-1">
            {[
              { l: 'A', c: 'text-green-700', t: 'Fait seul, spontanément, totalement, habituellement et correctement' },
              { l: 'B', c: 'text-orange-600', t: 'Fait partiellement, ou non spontanément, ou non habituellement, ou non correctement' },
              { l: 'C', c: 'text-red-600',    t: 'Ne fait pas' },
            ].map(({ l, c, t }) => (
              <div key={l} className="flex gap-2 text-xs">
                <span className={`font-black w-4 flex-shrink-0 ${c}`}>{l}</span>
                <span className="text-gray-600">{t}</span>
              </div>
            ))}
          </div>

          {/* Variables discriminantes */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Variables discriminantes — {filledDiscr}/{VARS_DISCRIMINANTES.length} renseignées
            </p>
            <div className="space-y-2">
              {VARS_DISCRIMINANTES.map((v, i) => (
                <VariableABC
                  key={v.id}
                  num={i + 1}
                  label={v.label}
                  desc={v.desc}
                  value={vars[v.id] as 'A' | 'B' | 'C' | undefined}
                  onChange={val => setVariable(v.id, val)}
                />
              ))}
            </div>
          </div>

          {/* Variables illustratives */}
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
              Variables illustratives — aide à la planification des soins
            </p>
            <div className="space-y-2">
              {VARS_ILLUSTRATIVES.map((v, i) => (
                <VariableABC
                  key={v.id}
                  num={i + 13}
                  label={v.label}
                  desc={v.desc}
                  value={vars[v.id] as 'A' | 'B' | 'C' | undefined}
                  onChange={val => setVariable(v.id, val)}
                  illustrative
                />
              ))}
            </div>
          </div>

          {/* Résultat calculé */}
          {calculatedGIR ? (
            <div className="rounded-xl border-2 p-4 space-y-2"
              style={{ borderColor: GIR_COLOR[calculatedGIR], background: `${GIR_COLOR[calculatedGIR]}10` }}>
              <div className="flex items-center gap-3 flex-wrap">
                <span
                  className="text-2xl font-black px-3 py-1 rounded-lg text-white"
                  style={{ background: GIR_COLOR[calculatedGIR] }}
                >
                  GIR {calculatedGIR}
                </span>
                <p className="text-sm text-gray-700 flex-1">{GIR_DESC[calculatedGIR]}</p>
              </div>
              <p className="text-xs text-gray-400 italic">
                GIR calculé automatiquement — à confirmer par un professionnel habilité
              </p>
            </div>
          ) : filledDiscr > 0 ? (
            <p className="text-xs text-gray-400 italic">
              Renseignez les {VARS_DISCRIMINANTES.length - filledDiscr} variable(s) discriminante(s) restante(s) pour calculer le GIR.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
