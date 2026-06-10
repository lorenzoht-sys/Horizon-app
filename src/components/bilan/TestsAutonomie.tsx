// Tests d'auto-évaluation liés à l'autonomie : Ricci & Gagnon (sédentarité) et FSS (fatigue)

import type { SedentariteReponses } from '../../types';

// ─── Sédentarité (Ricci & Gagnon) — types & helpers ──────────────────────────

export const EMPTY_SED: SedentariteReponses = {
  a_sedentarite: null, b_pratique: null, b_freq: null, b_duree: null, b_effort: null,
  c_intensite: null, c_travaux: null, c_marche: null, c_etages: null,
};

export function computeSedScore(r: SedentariteReponses) {
  const scoreA = r.a_sedentarite ?? 0;
  const scoreB =
    r.b_pratique === 'non' ? 1
    : r.b_pratique === 'oui' ? 5 + (r.b_freq ?? 0) + (r.b_duree ?? 0) + (r.b_effort ?? 0)
    : 0;
  const scoreC = (r.c_intensite ?? 0) + (r.c_travaux ?? 0) + (r.c_marche ?? 0) + (r.c_etages ?? 0);
  const total = scoreA + scoreB + scoreC;
  if (total === 0) return null;
  return { scoreA, scoreB, scoreC, total };
}

export function getSedProfil(score: number) {
  if (score < 18) return {
    profil: 'inactif' as const,
    label: 'Inactif',
    color: '#E24B4A',
    bg: '#FCEBEB',
    description: "Niveau d'activité insuffisant — priorité à la mise en mouvement progressive",
  };
  if (score <= 35) return {
    profil: 'actif' as const,
    label: 'Actif',
    color: '#BA7517',
    bg: '#FAEEDA',
    description: "Niveau d'activité modéré — maintenir et progresser",
  };
  return {
    profil: 'tres_actif' as const,
    label: 'Très actif',
    color: '#0F6E56',
    bg: '#E1F5EE',
    description: "Excellent niveau d'activité — adapter l'intensité au profil pathologique",
  };
}

export function getFSSProfil(score: number) {
  if (score < 36) return {
    profil: 'pas_de_fatigue' as const,
    label: 'Pas de fatigue significative',
    color: '#0F6E56',
    bg: '#E1F5EE',
    description: "Score FSS < 36 — la fatigue n'est probablement pas un facteur limitant majeur",
  };
  return {
    profil: 'fatigue_probable' as const,
    label: 'Fatigue probable',
    color: '#A32D2D',
    bg: '#FCEBEB',
    description: "Score FSS ≥ 36 — adapter l'intensité des séances, surveiller la récupération. Informer le médecin.",
  };
}

// ─── RadioScore ───────────────────────────────────────────────────────────────

function RadioScore({
  label, options, value, onChange,
}: {
  label: string;
  options: { label: string; score: number }[];
  value: number | null;
  onChange: (score: number) => void;
}) {
  return (
    <div>
      <p className="text-sm text-gray-700 mb-2">{label}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map(opt => (
          <button
            key={opt.score}
            type="button"
            onClick={() => onChange(opt.score)}
            style={{
              padding: '6px 10px', borderRadius: 10, border: '1.5px solid',
              borderColor: value === opt.score ? '#2BBFBF' : '#D1D5DB',
              background: value === opt.score ? '#2BBFBF' : '#FFFFFF',
              color: value === opt.score ? '#FFFFFF' : '#374151',
              fontWeight: value === opt.score ? 600 : 400,
              fontSize: 12, cursor: 'pointer',
              transition: 'all 0.15s ease', flexShrink: 0, whiteSpace: 'nowrap',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── ScoreCard ────────────────────────────────────────────────────────────────

function ScoreCard({ score, max, label, color, bg, description }: {
  score: number; max: number; label: string; color: string; bg: string; description: string;
}) {
  return (
    <div style={{ background: bg, border: `1px solid ${color}40`, borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ color, fontWeight: 700, fontSize: 16 }}>Score : {score} / {max}</span>
        <span style={{
          marginLeft: 'auto', background: color, color: 'white',
          borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600,
        }}>{label}</span>
      </div>
      <p style={{ color: '#374151', fontSize: 12, lineHeight: 1.5, margin: 0 }}>{description}</p>
    </div>
  );
}

// ─── SectionSedentarite ───────────────────────────────────────────────────────

const SED_ASSIS    = [{ label: '+ de 5h', score: 1 }, { label: '4 à 5h', score: 2 }, { label: '3 à 4h', score: 3 }, { label: '2 à 3h', score: 4 }, { label: 'Moins de 2h', score: 5 }];
const SED_FREQ     = [{ label: '1-2x/mois', score: 1 }, { label: '1x/sem', score: 2 }, { label: '2x/sem', score: 3 }, { label: '3x/sem', score: 4 }, { label: '4x/sem+', score: 5 }];
const SED_DUREE    = [{ label: '< 15 min', score: 1 }, { label: '16-30 min', score: 2 }, { label: '31-45 min', score: 3 }, { label: '46-60 min', score: 4 }, { label: '+ 60 min', score: 5 }];
const SED_EFFORT   = [{ label: 'Très facile', score: 1 }, { label: 'Facile', score: 2 }, { label: 'Modéré', score: 3 }, { label: 'Difficile', score: 4 }, { label: 'Très difficile', score: 5 }];
const SED_INTENSITE = [{ label: 'Légère', score: 1 }, { label: 'Modérée', score: 2 }, { label: 'Moyenne', score: 3 }, { label: 'Intense', score: 4 }, { label: 'Très intense', score: 5 }];
const SED_TRAVAUX  = [{ label: '< 2h', score: 1 }, { label: '3-4h', score: 2 }, { label: '5-6h', score: 3 }, { label: '7-9h', score: 4 }, { label: '10h+', score: 5 }];
const SED_ETAGES   = [{ label: '< 2', score: 1 }, { label: '3-5', score: 2 }, { label: '6-10', score: 3 }, { label: '11-15', score: 4 }, { label: '16+', score: 5 }];

export function SectionSedentarite({ value, onChange }: { value: SedentariteReponses; onChange: (v: SedentariteReponses) => void }) {
  const sc = computeSedScore(value);
  const profil = sc ? getSedProfil(sc.total) : null;

  function set(patch: Partial<SedentariteReponses>) {
    onChange({ ...value, ...patch });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
      <div className="bg-gradient-to-r from-slate-50 to-blue-50 px-5 py-3.5 border-b border-gray-100">
        <h3 className="font-heading font-semibold text-dark text-[15px]">📊 Niveau d'activité physique</h3>
        <p className="text-xs text-gray-400 mt-0.5">Test d'auto-évaluation (d'après Ricci & Gagnon)</p>
      </div>
      <div className="p-5 flex flex-col gap-5">

        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Comportements sédentaires</p>
          <RadioScore label="Combien de temps passez-vous en position assise par jour ?" options={SED_ASSIS} value={value.a_sedentarite} onChange={v => set({ a_sedentarite: v })} />
        </div>

        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Activités physiques de loisir</p>
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm text-gray-700 mb-2">Pratiquez-vous régulièrement une activité physique ?</p>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['non', 'oui'] as const).map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => set({ b_pratique: v })}
                    style={{
                      padding: '6px 20px', borderRadius: 10, border: '1.5px solid',
                      borderColor: value.b_pratique === v ? '#2BBFBF' : '#D1D5DB',
                      background: value.b_pratique === v ? '#2BBFBF' : '#FFFFFF',
                      color: value.b_pratique === v ? '#FFFFFF' : '#374151',
                      fontWeight: value.b_pratique === v ? 600 : 400,
                      fontSize: 13, cursor: 'pointer', transition: 'all 0.15s ease',
                    }}
                  >
                    {v === 'non' ? 'Non · 1' : 'Oui · 5'}
                  </button>
                ))}
              </div>
            </div>
            {value.b_pratique === 'oui' && (
              <>
                <RadioScore label="À quelle fréquence pratiquez-vous ces activités ?" options={SED_FREQ} value={value.b_freq} onChange={v => set({ b_freq: v })} />
                <RadioScore label="Durée moyenne de chaque séance ?" options={SED_DUREE} value={value.b_duree} onChange={v => set({ b_duree: v })} />
                <RadioScore label="Comment percevez-vous votre effort ?" options={SED_EFFORT} value={value.b_effort} onChange={v => set({ b_effort: v })} />
              </>
            )}
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Activités physiques quotidiennes</p>
          <div className="flex flex-col gap-4">
            <RadioScore label="Intensité physique de votre travail ?" options={SED_INTENSITE} value={value.c_intensite} onChange={v => set({ c_intensite: v })} />
            <RadioScore label="Heures par semaine pour travaux légers (jardinage, ménage...) ?" options={SED_TRAVAUX} value={value.c_travaux} onChange={v => set({ c_travaux: v })} />
            <RadioScore label="Minutes par jour de marche ?" options={SED_DUREE} value={value.c_marche} onChange={v => set({ c_marche: v })} />
            <RadioScore label="Étages montés à pied par jour ?" options={SED_ETAGES} value={value.c_etages} onChange={v => set({ c_etages: v })} />
          </div>
        </div>

        {sc && profil && (
          <ScoreCard score={sc.total} max={55} label={profil.label} color={profil.color} bg={profil.bg} description={profil.description} />
        )}
      </div>
    </div>
  );
}

// ─── SectionFatigue ───────────────────────────────────────────────────────────

const FSS_QUESTIONS = [
  "Je suis moins motivé(e) quand je suis fatigué(e)",
  "L'exercice physique me rend fatigué(e)",
  "Je suis facilement fatigué(e)",
  "La fatigue gêne mon fonctionnement physique",
  "La fatigue me cause fréquemment des problèmes",
  "La fatigue m'empêche d'avoir une activité physique soutenue",
  "La fatigue m'empêche d'accomplir mes responsabilités",
  "La fatigue est parmi mes 3 symptômes les plus invalidants",
  "La fatigue interfère avec ma vie professionnelle/familiale/sociale",
];

export function SectionFatigue({ value, onChange }: { value: (number | null)[]; onChange: (v: (number | null)[]) => void }) {
  const reponses: (number | null)[] = value.length === 9 ? value : Array(9).fill(null);

  function setReponse(index: number, val: number) {
    const next = [...reponses];
    next[index] = val;
    onChange(next);
  }

  const answered = reponses.filter(v => v !== null);
  const score = answered.length > 0 ? answered.reduce((sum, v) => sum + (v ?? 0), 0) : null;
  const profil = score !== null ? getFSSProfil(score) : null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
      <div className="bg-gradient-to-r from-slate-50 to-blue-50 px-5 py-3.5 border-b border-gray-100">
        <h3 className="font-heading font-semibold text-dark text-[15px]">😴 Fatigue perçue</h3>
        <p className="text-xs text-gray-400 mt-0.5">Échelle de sévérité de la fatigue (FSS)</p>
      </div>
      <div className="p-5 flex flex-col gap-4">
        <p className="text-xs text-gray-500 leading-relaxed">
          Pour chaque affirmation, indiquez votre accord sur une échelle de 1 (pas du tout d'accord)
          à 7 (tout à fait d'accord) — sur la semaine passée.
        </p>

        {FSS_QUESTIONS.map((question, idx) => {
          const val = reponses[idx];
          return (
            <div key={idx}>
              <p className="text-sm text-gray-700 mb-2">{question}</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[1, 2, 3, 4, 5, 6, 7].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setReponse(idx, n)}
                    style={{
                      width: 36, height: 36, borderRadius: 8, border: '1.5px solid',
                      borderColor: val === n ? '#2BBFBF' : '#D1D5DB',
                      background: val === n ? '#2BBFBF' : '#FFFFFF',
                      color: val === n ? '#FFFFFF' : '#374151',
                      fontWeight: val === n ? 600 : 400,
                      cursor: 'pointer', fontSize: 14,
                      transition: 'all 0.15s ease', flexShrink: 0,
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {idx === FSS_QUESTIONS.length - 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>Pas du tout d'accord</span>
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>Tout à fait d'accord</span>
                </div>
              )}
            </div>
          );
        })}

        {score !== null && profil && (
          <ScoreCard score={score} max={63} label={profil.label} color={profil.color} bg={profil.bg} description={profil.description} />
        )}
      </div>
    </div>
  );
}
