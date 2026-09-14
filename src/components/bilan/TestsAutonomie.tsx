// Tests d'auto-évaluation liés à l'autonomie : Ricci & Gagnon (sédentarité) et FSS (fatigue)
//
// Rendu seulement. Le calcul, la pondération et la complétude vivent dans
// src/lib/scoresAutonomie.ts, où ils sont testés (vitest n'inclut que src/lib
// et src/utils, en environnement `node`). Les ré-exports ci-dessous gardent
// valides les points d'import existants — ParticipantForm et
// ParticipantProfile importent depuis ce fichier.

import type { SedentariteReponses } from '../../types';
import {
  EMPTY_SED,
  FSS_QUESTIONS,
  FSS_TOTAL_MAX,
  SED_ASSIS,
  SED_DUREE,
  SED_EFFORT,
  SED_ETAGES,
  SED_FREQ,
  SED_INTENSITE,
  SED_MARCHE,
  SED_TOTAL_MAX,
  SED_TRAVAUX,
  computeFSSScore,
  computeSedScore,
  etatFatigue,
  etatSedentarite,
  getFSSProfil,
  getSedProfil,
} from '../../lib/scoresAutonomie';

export { EMPTY_SED, computeSedScore, computeFSSScore, getSedProfil, getFSSProfil };

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

// ─── CarteAReguler ────────────────────────────────────────────────────────────

/**
 * Remplace le score quand le questionnaire est entamé mais incomplet.
 *
 * Un chiffre calculé sur des réponses manquantes est indistinguable d'un
 * chiffre juste : c'est ce qui a laissé le défaut passer inaperçu jusqu'au
 * signalement de Pierre. On affiche donc ce qui manque, nommément, À LA PLACE
 * du score — et non un score assorti d'un avertissement.
 */
function CarteAReguler({ manquants }: { manquants: string[] }) {
  return (
    <div style={{ background: '#FAEEDA', border: '1px solid #BA751740', borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ color: '#BA7517', fontWeight: 700, fontSize: 16 }}>Réponses manquantes</span>
        <span style={{
          marginLeft: 'auto', background: '#BA7517', color: 'white',
          borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600,
        }}>À régulariser</span>
      </div>
      <p style={{ color: '#374151', fontSize: 12, lineHeight: 1.5, margin: '0 0 6px' }}>
        Aucun score n'est calculé tant que le questionnaire est incomplet : un total partiel
        serait comparé à des seuils prévus pour un questionnaire entier.
      </p>
      <ul style={{ color: '#374151', fontSize: 12, lineHeight: 1.6, margin: 0, paddingLeft: 18 }}>
        {manquants.map(m => <li key={m}>{m}</li>)}
      </ul>
    </div>
  );
}

// ─── SectionSedentarite ───────────────────────────────────────────────────────

export function SectionSedentarite({ value, onChange }: { value: SedentariteReponses; onChange: (v: SedentariteReponses) => void }) {
  const etat = etatSedentarite(value);
  const profil = etat.etat === 'complet' ? getSedProfil(etat.score) : null;

  function set(patch: Partial<SedentariteReponses>) {
    onChange({ ...value, ...patch });
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
      <div className="bg-gradient-to-r from-slate-50 to-blue-50 px-5 py-3.5 border-b border-gray-100">
        <h3 className="font-heading font-semibold text-dark text-[15px]">📊 Niveau d'activité physique</h3>
        <p className="text-xs text-gray-400 mt-0.5">Test d'auto-évaluation (d'après Ricci &amp; Gagnon)</p>
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
            <RadioScore label="Minutes par jour de marche ?" options={SED_MARCHE} value={value.c_marche} onChange={v => set({ c_marche: v })} />
            <RadioScore label="Étages montés à pied par jour ?" options={SED_ETAGES} value={value.c_etages} onChange={v => set({ c_etages: v })} />
          </div>
        </div>

        {etat.etat === 'complet' && profil && (
          <ScoreCard score={etat.score} max={SED_TOTAL_MAX} label={profil.label} color={profil.color} bg={profil.bg} description={profil.description} />
        )}
        {etat.etat === 'a_regulariser' && <CarteAReguler manquants={etat.manquants} />}
      </div>
    </div>
  );
}

// ─── SectionFatigue ───────────────────────────────────────────────────────────

export function SectionFatigue({ value, onChange }: { value: (number | null)[]; onChange: (v: (number | null)[]) => void }) {
  const reponses: (number | null)[] = value.length === 9 ? value : Array(9).fill(null);

  function setReponse(index: number, val: number) {
    const next = [...reponses];
    next[index] = val;
    onChange(next);
  }

  const etat = etatFatigue(reponses);
  const profil = etat.etat === 'complet' ? getFSSProfil(etat.score) : null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
      <div className="bg-gradient-to-r from-slate-50 to-blue-50 px-5 py-3.5 border-b border-gray-100">
        <h3 className="font-heading font-semibold text-dark text-[15px]">😴 Fatigue perçue</h3>
        <p className="text-xs text-gray-400 mt-0.5">Échelle de sévérité de la fatigue (FSS)</p>
      </div>
      <div className="p-5 flex flex-col gap-4">
        <p className="text-xs text-gray-500 leading-relaxed">
          Pour chaque affirmation, indiquez votre accord sur une échelle de 1 (pas du tout d'accord)
          à 7 (tout à fait d'accord) — sur la semaine passée. Les neuf affirmations sont nécessaires :
          le seuil d'interprétation les suppose toutes renseignées.
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

        {etat.etat === 'complet' && profil && (
          <ScoreCard score={etat.score} max={FSS_TOTAL_MAX} label={profil.label} color={profil.color} bg={profil.bg} description={profil.description} />
        )}
        {etat.etat === 'a_regulariser' && <CarteAReguler manquants={etat.manquants} />}
      </div>
    </div>
  );
}
