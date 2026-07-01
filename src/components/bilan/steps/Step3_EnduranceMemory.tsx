import { useState } from 'react';
import type { Bilan, TestKey, ProfilHandicap } from '../../../types';
import { useTm6Variantes } from '../../../hooks/useTm6Variantes';

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
import Tm6ChronoWidget from '../Tm6ChronoWidget';
import { TM6_DUREES_FIXES } from '../../../data/norms';

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
  const { variantes } = useTm6Variantes();
  const tm6 = form.tm6;
  const setTm6 = (patch: Partial<typeof tm6>) => update({ tm6: { ...tm6, ...patch } });
  const dureeModeEff: 'fixe' | 'libre' = tm6.dureeMode ?? 'fixe';
  const dureeEffectiveSecondes = tm6.dureeReelleSecondes ?? (dureeModeEff === 'fixe' ? (tm6.dureeCibleSecondes ?? 360) : null);
  const mem = form.memoire;
  const setMem = (patch: Partial<typeof mem>) => update({ memoire: { ...mem, ...patch } });

  const active = testsActifs
    ? [...new Set(['memoire' as TestKey, ...testsActifs.filter(k => ENDO_TESTS.includes(k)), ...extras])]
    : ENDO_TESTS;

  // memoire est toujours obligatoire, ne pas proposer de l'ajouter
  const addable = ENDO_TESTS.filter(k => !active.includes(k) && k !== 'memoire');
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
            <DeltaIndicator delta={d.tm6Distance} unit={(tm6.mode ?? 'standard') === 'marche_sur_place' ? 'pas' : 'm'} />
          </div>

          {/* Sélecteur mode */}
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-600 mb-2">Mode du test</p>
            <div className="flex gap-2">
              {([
                ['standard',         '🚶 Marche 6 minutes'],
                ['marche_sur_place', '🚶 Marche sur place (6 min)'],
              ] as const).map(([val, label]) => (
                <button key={val} type="button"
                  onClick={() => setTm6({ mode: val })}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-medium border transition-colors text-left ${
                    (tm6.mode ?? 'standard') === val
                      ? 'bg-primary text-white border-primary'
                      : 'border-gray-200 text-gray-600 hover:border-primary/50 hover:bg-gray-50'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Variante du test */}
          {variantes.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-600 mb-2">Variante du test</p>
              <select
                value={tm6.varianteId ?? ''}
                onChange={e => setTm6({ varianteId: e.target.value || null })}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
              >
                <option value="">Standard (marche 6 min)</option>
                {variantes.map(v => (
                  <option key={v.id} value={v.id}>{v.nom}</option>
                ))}
              </select>
            </div>
          )}

          {/* Durée du test */}
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-600 mb-2">Durée du test</p>
            <div className="flex gap-2 mb-2">
              {([
                ['fixe', 'Durée fixe'],
                ['libre', 'Durée libre'],
              ] as const).map(([val, label]) => (
                <button key={val} type="button"
                  onClick={() => setTm6({ dureeMode: val, dureeCibleSecondes: val === 'fixe' ? (tm6.dureeCibleSecondes ?? 360) : tm6.dureeCibleSecondes })}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-medium border transition-colors ${
                    dureeModeEff === val
                      ? 'bg-primary text-white border-primary'
                      : 'border-gray-200 text-gray-600 hover:border-primary/50 hover:bg-gray-50'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            {dureeModeEff === 'fixe' && (
              <select value={tm6.dureeCibleSecondes ?? 360}
                onChange={e => setTm6({ dureeCibleSecondes: Number(e.target.value) })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10">
                {TM6_DUREES_FIXES.map(s => (
                  <option key={s} value={s}>{s / 60} min{s === 360 ? ' (standard)' : ''}</option>
                ))}
              </select>
            )}
          </div>

          {/* Mention test non standard */}
          {dureeEffectiveSecondes != null && dureeEffectiveSecondes !== 360 && (
            <p className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 mb-4">
              Test non standard ({Math.round(dureeEffectiveSecondes / 6) / 10} min) — comparaison aux normes indicative uniquement.
            </p>
          )}

          {/* Chrono */}
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-600 mb-2">Chronomètre</p>
            <Tm6ChronoWidget
              dureeMode={dureeModeEff}
              dureeCibleSecondes={tm6.dureeCibleSecondes ?? 360}
              onTerminer={result => setTm6({
                dureeReelleSecondes: result.dureeReelleSecondes,
                nbPauses: result.nbPauses,
                dureePausesSecondes: result.dureePausesSecondes,
                pausesDetail: result.pausesDetail,
              })}
            />
          </div>

          {/* Distance ou Pas */}
          <div className="mb-4">
            {(tm6.mode ?? 'standard') === 'marche_sur_place' ? (
              <Num label="Nombre de pas" value={tm6.repetitions ?? null} unit="pas" min={0} max={2000}
                onChange={v => setTm6({ repetitions: v })} />
            ) : (
              <Num label="Distance parcourue" value={tm6.distanceMetres} unit="m" min={0} max={1000}
                onChange={v => setTm6({ distanceMetres: v })} />
            )}
          </div>

          {/* Pauses pendant le test */}
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-600 mb-2">
              Pauses pendant le test {tm6.pausesDetail && tm6.pausesDetail.length > 0 && (
                <span className="text-gray-400">(saisi automatiquement par le chrono, modifiable)</span>
              )}
            </p>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <Num label="Nombre de pauses" value={tm6.nbPauses} min={0} max={20}
                onChange={v => setTm6({ nbPauses: v })} />
              <Num label="Durée totale des pauses" value={tm6.dureePausesSecondes} unit="s" min={0} max={3600}
                onChange={v => setTm6({ dureePausesSecondes: v })} />
            </div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes pauses</label>
            <input type="text" value={tm6.notesPauses ?? ''}
              onChange={e => setTm6({ notesPauses: e.target.value })}
              placeholder="ex : arrêt à 3min30 pour dyspnée"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
          </div>

          {/* Mesures par minute pendant le test */}
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-600 mb-2">Mesures pendant le test (par minute)</p>
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="grid grid-cols-3 gap-0 bg-gray-50 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                <div className="px-3 py-2">Min</div>
                <div className="px-3 py-2 text-center border-l border-gray-200">FC (bpm)</div>
                <div className="px-3 py-2 text-center border-l border-gray-200">SpO₂ (%)</div>
              </div>
              {Array.from({ length: 6 }, (_, i) => {
                const mesures = tm6.mesuresParMinute ?? Array(6).fill({ bpm: null, spo2: null });
                const m = mesures[i] ?? { bpm: null, spo2: null };
                return (
                  <div key={i} className={`grid grid-cols-3 gap-0 ${i % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'} border-b border-gray-100 last:border-b-0`}>
                    <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 flex items-center">Min {i + 1}</div>
                    <div className="px-2 py-1.5 border-l border-gray-100">
                      <input type="number" min={40} max={220} value={m.bpm ?? ''}
                        onChange={e => {
                          const next = [...(tm6.mesuresParMinute ?? Array(6).fill({ bpm: null, spo2: null }))];
                          next[i] = { ...next[i], bpm: e.target.value === '' ? null : Number(e.target.value) };
                          setTm6({ mesuresParMinute: next });
                        }}
                        className="w-full text-xs border-0 focus:outline-none bg-transparent text-center placeholder-gray-300"
                        placeholder="—" />
                    </div>
                    <div className="px-2 py-1.5 border-l border-gray-100">
                      <input type="number" min={70} max={100} value={m.spo2 ?? ''}
                        onChange={e => {
                          const next = [...(tm6.mesuresParMinute ?? Array(6).fill({ bpm: null, spo2: null }))];
                          next[i] = { ...next[i], spo2: e.target.value === '' ? null : Number(e.target.value) };
                          setTm6({ mesuresParMinute: next });
                        }}
                        className="w-full text-xs border-0 focus:outline-none bg-transparent text-center placeholder-gray-300"
                        placeholder="—" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Comptage variantes : pas (stepper) et tours (pédalier) */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Num label="Nombre de pas (stepper)" value={tm6.nbPas ?? null} unit="pas" min={0} max={10000}
              onChange={v => setTm6({ nbPas: v })} />
            <Num label="Nombre de tours (pédalier)" value={tm6.nbTours ?? null} unit="tours" min={0} max={5000}
              onChange={v => setTm6({ nbTours: v })} />
          </div>

          {/* Grille 4 colonnes AVANT / JUSTE APRÈS / 1 MIN APRÈS / 2 MIN APRÈS */}
          <div className="grid grid-cols-4 gap-2 mb-3">
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
              <div className="text-xs font-bold text-orange-600 text-center mb-2 pb-1 border-b border-orange-100">1 MIN APRÈS</div>
              <div className="space-y-2">
                <Num label="FC (bpm)" value={tm6.fc1min ?? null} min={40} max={200}
                  onChange={v => setTm6({ fc1min: v })} />
                <Num label="SpO₂ (%)" value={tm6.spo21min ?? null} min={70} max={100}
                  onChange={v => setTm6({ spo21min: v })} />
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
            💡 Les mesures à 1 min et 2 min après permettent d'évaluer la récupération cardiaque du patient.
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

      {/* Mémoire — toujours obligatoire */}
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
