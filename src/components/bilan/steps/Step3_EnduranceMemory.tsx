import { useState } from 'react';
import type { Bilan, TestKey, ProfilHandicap } from '../../../types';
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

          {/* Échelle de Borg — boutons */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">
              Ressenti d'effort — Échelle de Borg
              <span className="font-normal text-gray-400 ml-1">(6 = aucun effort · 20 = effort maximal)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[6,7,8,9,10,11,12,13,14,15,16,17,18,19,20].map(v => {
                const color = v <= 9 ? '#3B6D11' : v <= 12 ? '#F59E0B' : v <= 16 ? '#EF8C00' : '#EF4444';
                const active = tm6.ressentiBorg === v;
                return (
                  <button key={v} type="button"
                    onClick={() => setTm6({ ressentiBorg: v })}
                    style={{ borderColor: active ? color : undefined, background: active ? color : undefined }}
                    className={`w-9 h-9 rounded-lg text-xs font-bold border transition-colors ${
                      active ? 'text-white' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}>
                    {v}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>Aucun effort</span>
              <span>Effort maximal</span>
            </div>
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
