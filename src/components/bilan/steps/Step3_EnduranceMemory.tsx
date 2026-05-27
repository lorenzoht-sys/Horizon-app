import { useState } from 'react';
import type { Bilan, TestKey, ProfilHandicap } from '../../../types';

const BORG_RPE_LEVELS = [
  { v: 6,  label: 'Aucun effort' },
  { v: 7,  label: 'Extrêmement léger' },
  { v: 8,  label: '' },
  { v: 9,  label: 'Très léger' },
  { v: 10, label: '' },
  { v: 11, label: 'Léger' },
  { v: 12, label: '' },
  { v: 13, label: 'Quelque peu difficile' },
  { v: 14, label: '' },
  { v: 15, label: 'Difficile' },
  { v: 16, label: '' },
  { v: 17, label: 'Très difficile' },
  { v: 18, label: '' },
  { v: 19, label: 'Extrêmement difficile' },
  { v: 20, label: 'Effort maximal' },
] as const;
import DeltaIndicator from '../DeltaIndicator';
import { useBilanDelta } from '../../../hooks/useBilanDelta';
import { TEST_LABELS } from '../../../data/profiles';
import { Plus } from 'lucide-react';
import DuboisMISWidget from '../DuboisMISWidget';
import ChronoWidget from '../ChronoWidget';

type BilanForm = Omit<Bilan, 'id'>;

interface Props {
  form: BilanForm;
  update: (patch: Partial<BilanForm>) => void;
  previous: Bilan | null;
  testsActifs?: TestKey[];
  profilHandicap?: ProfilHandicap;
}

function Num({ label, value, onChange, unit, min, max, step = 1 }: {
  label: string; value: number | null; onChange: (v: number | null) => void;
  unit?: string; min?: number; max?: number; step?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input type="number" value={value ?? ''} min={min} max={max} step={step}
          onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
          placeholder="—" />
        {unit && <span className="text-xs text-gray-400 w-12 flex-shrink-0">{unit}</span>}
      </div>
    </div>
  );
}

const ENDO_TESTS: TestKey[] = ['tm6', 'memoire'];

export default function Step3_EnduranceMemory({ form, update, previous, testsActifs }: Props) {
  const d = useBilanDelta(form as Bilan, previous);
  const [extras, setExtras] = useState<TestKey[]>([]);
  const tm6 = form.tm6;
  const setTm6 = (patch: Partial<typeof tm6>) => update({ tm6: { ...tm6, ...patch } });
  const mem = form.memoire;
  const setMem = (patch: Partial<typeof mem>) => update({ memoire: { ...mem, ...patch } });

  const active = testsActifs
    ? [...new Set([...testsActifs.filter(k => ENDO_TESTS.includes(k)), ...extras])]
    : ENDO_TESTS;

  const addable = ENDO_TESTS.filter(k => !active.includes(k));
  const hasAny = active.length > 0;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-heading font-semibold text-dark">Endurance & Mémoire</h2>

      {!hasAny && (
        <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4">
          Aucun test d'endurance ou mémoire activé pour ce profil.
          Utilisez le bouton ci-dessous pour en ajouter ponctuellement.
        </p>
      )}

      {/* TM6 */}
      {active.includes('tm6') && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">TM6 — Test de Marche de 6 minutes</h3>
            <DeltaIndicator delta={d.tm6Distance} unit="m" />
          </div>

          {/* Chrono 6 minutes */}
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-600 mb-2">Chronomètre 6 minutes</p>
            <ChronoWidget mode="down-6min" />
          </div>

          {/* Distance */}
          <div className="mb-4">
            <Num label="Distance parcourue" value={tm6.distanceMetres} unit="m" min={0} max={1000}
              onChange={v => setTm6({ distanceMetres: v })} />
          </div>

          {/* Grille 3 colonnes AVANT / JUSTE APRÈS / 2 MIN APRÈS */}
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <div className="text-xs font-bold text-blue-700 text-center mb-2 pb-1 border-b border-blue-100">AVANT</div>
              <div className="space-y-2">
                <Num label="FC (bpm)" value={tm6.fcAvant} min={40} max={200}
                  onChange={v => setTm6({ fcAvant: v })} />
                <Num label="SpO₂ (%)" value={tm6.spo2Avant} min={70} max={100}
                  onChange={v => setTm6({ spo2Avant: v })} />
              </div>
            </div>
            <div>
              <div className="text-xs font-bold text-red-600 text-center mb-2 pb-1 border-b border-red-100">JUSTE APRÈS</div>
              <div className="space-y-2">
                <Num label="FC (bpm)" value={tm6.fcApres} min={40} max={220}
                  onChange={v => setTm6({ fcApres: v })} />
                <Num label="SpO₂ (%)" value={tm6.spo2Apres} min={70} max={100}
                  onChange={v => setTm6({ spo2Apres: v })} />
              </div>
            </div>
            <div>
              <div className="text-xs font-bold text-green-700 text-center mb-2 pb-1 border-b border-green-100">2 MIN APRÈS</div>
              <div className="space-y-2">
                <Num label="FC (bpm)" value={tm6.fc2min} min={40} max={200}
                  onChange={v => setTm6({ fc2min: v })} />
                <Num label="SpO₂ (%)" value={tm6.spo22min ?? null} min={70} max={100}
                  onChange={v => setTm6({ spo22min: v })} />
              </div>
            </div>
          </div>

          <p className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-4">
            💡 La mesure à 2 min après permet d'évaluer la récupération cardiaque du patient.
          </p>

          {/* Échelle de Borg RPE 6-20 */}
          <div>
            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">
              Ressenti d'effort — Échelle de Borg RPE 6-20
            </div>
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-4">
              <span className="text-base flex-shrink-0">💬</span>
              <p className="text-xs text-blue-700 leading-relaxed">
                Demander au patient :{' '}
                <strong>« Sur cette échelle de 6 à 20, comment estimez-vous votre effort pendant le test de marche ? »</strong>
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {BORG_RPE_LEVELS.map(({ v, label }) => {
                const color = v <= 12 ? '#1D9E75' : v <= 16 ? '#F59E0B' : '#E85050';
                const active = tm6.borgRPE === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setTm6({ borgRPE: active ? null : v })}
                    style={active
                      ? { background: color, borderColor: color }
                      : { borderColor: color + '55' }}
                    className={`rounded-xl border-2 px-3 py-2.5 text-left transition-all ${
                      active ? '' : 'bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="font-black text-base" style={{ color: active ? 'white' : color }}>
                      {v}
                    </div>
                    {label && (
                      <div className="text-[11px] leading-tight mt-0.5" style={{ color: active ? 'rgba(255,255,255,0.9)' : '#6B7280' }}>
                        {label}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {tm6.borgRPE != null && (() => {
              const v = tm6.borgRPE!;
              const color = v <= 12 ? '#1D9E75' : v <= 16 ? '#F59E0B' : '#E85050';
              const interp =
                v <= 11 ? "Effort faible — peut augmenter l'intensité" :
                v <= 14 ? 'Effort modéré — zone cible APA ✅' :
                v <= 17 ? 'Effort élevé — adapter le programme' :
                'Effort maximal ⚠️ — réduire l\'intensité';
              return (
                <div className="mt-3 rounded-xl border-2 px-4 py-2.5 flex items-center gap-3"
                  style={{ borderColor: color, background: color + '18' }}>
                  <span className="text-2xl font-black tabular-nums" style={{ color }}>{v}/20</span>
                  <span className="text-sm font-semibold" style={{ color }}>{interp}</span>
                </div>
              );
            })()}

            <p className="text-[11px] text-gray-400 italic mt-2">
              Borg G., 1982 · Échelle de perception de l'effort RPE 6-20
            </p>
          </div>
        </section>
      )}

      {/* Mémoire */}
      {active.includes('memoire') && (
        <section>
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Mémoire — Test Dubois MIS</h3>
            {mem.dubois?.scoreMIS != null && (
              <DeltaIndicator delta={d.memoireMIS} unit="/10" />
            )}
          </div>
          <DuboisMISWidget
            value={mem.dubois ?? null}
            onChange={dubois => {
              setMem({
                dubois,
                scoreImmediat: dubois.scoreImmediat,
                scoreDiffere: dubois.scoreDiffere,
              });
            }}
          />
        </section>
      )}

      {/* Bouton ajouter un test ponctuel */}
      {addable.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
          <span className="text-xs text-gray-400 self-center">Ajouter un test :</span>
          {addable.map(k => (
            <button key={k} type="button"
              onClick={() => setExtras(prev => [...prev, k])}
              className="flex items-center gap-1 text-xs text-primary border border-primary/30 hover:bg-primary/5 px-2.5 py-1 rounded-lg transition-colors">
              <Plus size={11} />{TEST_LABELS[k]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
