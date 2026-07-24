import { useState } from 'react';
import { toast } from 'sonner';
import type { Bilan, TestKey, ProfilHandicap, Tm6Variante } from '../../../types';
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

// ── Badge résultat unifié ─────────────────────────────────────────────────────
type BadgeCouleur = 'vert' | 'orange' | 'rouge';
interface BadgeInfo { couleur: BadgeCouleur; label: string }

function BadgeResultat({ couleur, label }: BadgeInfo) {
  const styles: Record<BadgeCouleur, string> = {
    vert:   'bg-green-50 text-green-700 border-green-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    rouge:  'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <span role="status" aria-label={label}
      className={`text-xs font-semibold px-2.5 py-1 rounded-full border flex-shrink-0 ${styles[couleur]}`}>
      {label}
    </span>
  );
}

function CardHeader({ title, subtitle, badge, children }: {
  title: string; subtitle: string; badge?: BadgeInfo | null; children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div className="min-w-0">
        <h3 className="text-[15px] font-medium text-dark">{title}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
        {badge && <BadgeResultat {...badge} />}
        {children}
      </div>
    </div>
  );
}

// ── Modale de création d'une variante TM6 ───────────────────────────────────

const TYPE_MESURE_LABELS: Record<Tm6Variante['typeMesure'], string> = {
  distance: 'Distance (mètres)',
  pas: 'Nombre de pas',
  tours: 'Nombre de tours',
};

interface ModalNouvelleVarianteProps {
  onCreated: (id: string) => void;
  onClose: () => void;
}

function ModalNouvelleVariante({ onCreated, onClose }: ModalNouvelleVarianteProps) {
  const { creer } = useTm6Variantes();
  const [form, setForm] = useState<{ nom: string; typeMesure: Tm6Variante['typeMesure']; distanceRef: string }>({
    nom: '', typeMesure: 'distance', distanceRef: '',
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!form.nom.trim()) { toast.error('Nom requis'); return; }
    setSaving(true);
    const created = await creer(form.nom.trim(), form.typeMesure, form.distanceRef ? Number(form.distanceRef) : null);
    setSaving(false);
    toast.success('Variante ajoutée');
    onCreated(created?.id ?? '');
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <h3 className="font-heading font-bold text-dark text-lg">Nouvelle variante TM6</h3>

        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Nom</label>
          <input type="text" value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
            placeholder="ex : Stepper Tunturi, Pédalier couché, Couloir 30m"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Mesure</label>
          <select value={form.typeMesure} onChange={e => setForm(f => ({ ...f, typeMesure: e.target.value as Tm6Variante['typeMesure'] }))}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary">
            {(Object.entries(TYPE_MESURE_LABELS) as [Tm6Variante['typeMesure'], string][]).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Distance référence (m) — optionnel</label>
          <input type="number" min={0} value={form.distanceRef} onChange={e => setForm(f => ({ ...f, distanceRef: e.target.value }))}
            placeholder="ex : 400"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary" />
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-primary text-white rounded-xl py-2.5 font-semibold text-sm hover:bg-dark transition-colors disabled:opacity-60"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button onClick={onClose}
            className="px-5 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors text-sm">
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

type BilanForm = Omit<Bilan, 'id'>;

interface Props {
  form: BilanForm;
  update: (patch: Partial<BilanForm>) => void;
  previous: Bilan | null;
  testsActifs?: TestKey[];
  profilHandicap?: ProfilHandicap;
}

function Num({ label, id, value, onChange, unit, min, max, step = 1 }: {
  label: string; id: string; value: number | null; onChange: (v: number | null) => void;
  unit?: string; min?: number; max?: number; step?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs text-gray-500 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input id={id} type="number" value={value ?? ''} min={min} max={max} step={step}
          onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          placeholder="—" />
        {unit && <span className="text-xs text-gray-400 w-12 flex-shrink-0">{unit}</span>}
      </div>
    </div>
  );
}

const ENDO_TESTS: TestKey[] = ['tm6', 'memoire', 'moca'];

export default function Step3_EnduranceMemory({ form, update, previous, testsActifs }: Props) {
  const d = useBilanDelta(form as Bilan, previous);
  const [extras, setExtras] = useState<TestKey[]>([]);
  const { variantes } = useTm6Variantes();
  const [showModalVariante, setShowModalVariante] = useState(false);
  const tm6 = form.tm6;
  const setTm6 = (patch: Partial<typeof tm6>) => update({ tm6: { ...tm6, ...patch } });
  const dureeModeEff: 'fixe' | 'libre' = tm6.dureeMode ?? 'fixe';
  const dureeEffectiveSecondes = tm6.dureeReelleSecondes ?? (dureeModeEff === 'fixe' ? (tm6.dureeCibleSecondes ?? 360) : null);
  const mem = form.memoire;
  const setMem = (patch: Partial<typeof mem>) => update({ memoire: { ...mem, ...patch } });

  const active = testsActifs
    ? [...new Set(['memoire' as TestKey, ...testsActifs.filter(k => ENDO_TESTS.includes(k)), ...extras])]
    : ENDO_TESTS;

  const addable = ENDO_TESTS.filter(k => !active.includes(k) && k !== 'memoire');
  const hasAny = active.length > 0;

  // Type de test : variante choisie prioritaire, sinon mode standard / sur place
  const varianteActive = tm6.varianteId ? variantes.find(v => v.id === tm6.varianteId) ?? null : null;
  const mesureType: 'distance' | 'pas' | 'tours' = varianteActive
    ? varianteActive.typeMesure
    : (tm6.mode ?? 'standard') === 'marche_sur_place' ? 'pas' : 'distance';

  // Badges
  const badgeTm6: BadgeInfo | null = mesureType === 'distance' && tm6.distanceMetres != null
    ? tm6.distanceMetres >= 400 ? { couleur: 'vert', label: 'Endurance normale' }
    : tm6.distanceMetres >= 300 ? { couleur: 'orange', label: 'Endurance réduite' }
    : { couleur: 'rouge', label: 'Endurance faible' }
    : null;

  const badgeMis: BadgeInfo | null = mem.dubois?.scoreMIS != null
    ? mem.dubois.scoreMIS >= 8 ? { couleur: 'vert', label: 'Mémoire normale' }
    : mem.dubois.scoreMIS >= 6 ? { couleur: 'orange', label: 'Mémoire réduite' }
    : { couleur: 'rouge', label: 'Atteinte mnésique' }
    : null;

  const badgeMoca: BadgeInfo | null = form.mocaScore != null
    ? form.mocaScore >= 26 ? { couleur: 'vert', label: 'Normal' }
    : form.mocaScore >= 22 ? { couleur: 'orange', label: 'Trouble léger à modéré' }
    : { couleur: 'rouge', label: 'Trouble sévère' }
    : null;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-heading font-semibold text-dark">Endurance &amp; Mémoire</h2>

      {!hasAny && (
        <p className="text-sm text-gray-400 bg-gray-50 rounded-xl p-4">
          Aucun test d'endurance ou mémoire activé pour ce profil.
          Utilisez le bouton ci-dessous pour en ajouter ponctuellement.
        </p>
      )}

      {/* TM6 */}
      {active.includes('tm6') && (
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <CardHeader
            title="TM6 — Test de marche 6 minutes"
            subtitle="Distance parcourue en 6 minutes — endurance cardiorespiratoire"
            badge={badgeTm6}>
            <DeltaIndicator delta={d.tm6Distance} unit={mesureType === 'distance' ? 'm' : mesureType} />
          </CardHeader>

          {/* Type de test */}
          <div className="mb-4">
            <label htmlFor="tm6-type-test" className="block text-xs text-gray-500 mb-2">Type de test</label>
            <select id="tm6-type-test"
              value={tm6.varianteId ?? ((tm6.mode ?? 'standard') === 'marche_sur_place' ? 'sur_place' : 'standard')}
              onChange={e => {
                const val = e.target.value;
                if (val === 'standard') setTm6({ mode: 'standard', varianteId: null });
                else if (val === 'sur_place') setTm6({ mode: 'marche_sur_place', varianteId: null });
                else setTm6({ mode: 'standard', varianteId: val });
              }}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 mb-2">
              <option value="standard">🚶 Marche 6 minutes (standard)</option>
              <option value="sur_place">🚶 Marche sur place</option>
              {variantes.map(v => (
                <option key={v.id} value={v.id}>{v.nom}</option>
              ))}
            </select>
            <button type="button" onClick={() => setShowModalVariante(true)}
              className="text-xs text-primary hover:underline focus:outline-none">
              ➕ Créer une nouvelle variante
            </button>
          </div>

          {showModalVariante && (
            <ModalNouvelleVariante
              onCreated={id => {
                if (id) setTm6({ varianteId: id });
                setShowModalVariante(false);
              }}
              onClose={() => setShowModalVariante(false)}
            />
          )}

          {/* Durée */}
          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-2">Durée du test</p>
            <div className="flex gap-2 mb-2">
              {([
                ['fixe', 'Durée fixe'],
                ['libre', 'Durée libre'],
              ] as const).map(([val, label]) => (
                <button key={val} type="button"
                  aria-pressed={dureeModeEff === val}
                  onClick={() => setTm6({ dureeMode: val, dureeCibleSecondes: val === 'fixe' ? (tm6.dureeCibleSecondes ?? 360) : tm6.dureeCibleSecondes })}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
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
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
                {TM6_DUREES_FIXES.map(s => (
                  <option key={s} value={s}>{s / 60} min{s === 360 ? ' (standard)' : ''}</option>
                ))}
              </select>
            )}
          </div>

          {dureeEffectiveSecondes != null && dureeEffectiveSecondes !== 360 && (
            <p className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 mb-4">
              Test non standard ({Math.round(dureeEffectiveSecondes / 6) / 10} min) — comparaison aux normes indicative uniquement.
            </p>
          )}

          {/* Chrono */}
          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-2">Chronomètre</p>
            <Tm6ChronoWidget
              dureeMode={dureeModeEff}
              dureeCibleSecondes={tm6.dureeCibleSecondes ?? 360}
              onTerminer={result => setTm6({
                dureeReelleSecondes: result.dureeReelleSecondes,
                nbPauses: result.nbPauses,
                dureePausesSecondes: result.dureePausesSecondes,
                pausesDetail: result.pausesDetail,
              })} />
          </div>

          {/* Mesure du résultat, selon le type de test choisi */}
          <div className="mb-4">
            {mesureType === 'pas' ? (
              <Num id="tm6-pas" label="Nombre de pas" value={tm6.repetitions ?? tm6.nbPas ?? null} unit="pas" min={0} max={2000}
                onChange={v => setTm6({ repetitions: v })} />
            ) : mesureType === 'tours' ? (
              <Num id="tm6-tours" label="Nombre de tours" value={tm6.nbTours ?? null} unit="tours" min={0} max={5000}
                onChange={v => setTm6({ nbTours: v })} />
            ) : (
              <Num id="tm6-distance" label="Distance parcourue" value={tm6.distanceMetres} unit="m" min={0} max={1000}
                onChange={v => setTm6({ distanceMetres: v })} />
            )}
          </div>

          {/* Pauses */}
          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-2">
              Pauses pendant le test{tm6.pausesDetail && tm6.pausesDetail.length > 0 && (
                <span className="text-gray-400"> (saisies auto par le chrono, modifiables)</span>
              )}
            </p>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <Num id="tm6-nb-pauses" label="Nombre de pauses" value={tm6.nbPauses} min={0} max={20}
                onChange={v => setTm6({ nbPauses: v })} />
              <Num id="tm6-duree-pauses" label="Durée totale des pauses" value={tm6.dureePausesSecondes} unit="s" min={0} max={3600}
                onChange={v => setTm6({ dureePausesSecondes: v })} />
            </div>
            <label htmlFor="tm6-notes-pauses" className="block text-xs text-gray-500 mb-1">Notes pauses</label>
            <input id="tm6-notes-pauses" type="text" value={tm6.notesPauses ?? ''}
              onChange={e => setTm6({ notesPauses: e.target.value })}
              placeholder="ex : arrêt à 3min30 pour dyspnée"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </div>

          {/* Mesures par minute */}
          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-2">Mesures pendant le test (par minute)</p>
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
                        aria-label={`FC minute ${i + 1}`}
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
                        aria-label={`SpO2 minute ${i + 1}`}
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

          {/* Grille AVANT / APRÈS */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            <div>
              <div className="text-xs font-bold text-blue-700 text-center mb-2 pb-1 border-b border-blue-100">AVANT</div>
              <div className="space-y-2">
                <Num id="tm6-fc-avant" label="FC (bpm)" value={tm6.fcAvant} min={40} max={200}
                  onChange={v => setTm6({ fcAvant: v })} />
                <Num id="tm6-spo2-avant" label="SpO₂ (%)" value={tm6.spo2Avant} min={70} max={100}
                  onChange={v => setTm6({ spo2Avant: v })} />
              </div>
            </div>
            <div>
              <div className="text-xs font-bold text-red-600 text-center mb-2 pb-1 border-b border-red-100">JUSTE APRÈS</div>
              <div className="space-y-2">
                <Num id="tm6-fc-apres" label="FC (bpm)" value={tm6.fcApres} min={40} max={220}
                  onChange={v => setTm6({ fcApres: v })} />
                <Num id="tm6-spo2-apres" label="SpO₂ (%)" value={tm6.spo2Apres} min={70} max={100}
                  onChange={v => setTm6({ spo2Apres: v })} />
              </div>
            </div>
            <div>
              <div className="text-xs font-bold text-orange-600 text-center mb-2 pb-1 border-b border-orange-100">1 MIN APRÈS</div>
              <div className="space-y-2">
                <Num id="tm6-fc-1min" label="FC (bpm)" value={tm6.fc1min ?? null} min={40} max={200}
                  onChange={v => setTm6({ fc1min: v })} />
                <Num id="tm6-spo2-1min" label="SpO₂ (%)" value={tm6.spo21min ?? null} min={70} max={100}
                  onChange={v => setTm6({ spo21min: v })} />
              </div>
            </div>
            <div>
              <div className="text-xs font-bold text-green-700 text-center mb-2 pb-1 border-b border-green-100">2 MIN APRÈS</div>
              <div className="space-y-2">
                <Num id="tm6-fc-2min" label="FC (bpm)" value={tm6.fc2min} min={40} max={200}
                  onChange={v => setTm6({ fc2min: v })} />
                <Num id="tm6-spo2-2min" label="SpO₂ (%)" value={tm6.spo22min ?? null} min={70} max={100}
                  onChange={v => setTm6({ spo22min: v })} />
              </div>
            </div>
          </div>

          <p className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-4">
            💡 Les mesures à 1 min et 2 min après permettent d'évaluer la récupération cardiaque.
          </p>

          {/* Borg RPE */}
          <div>
            <p className="text-xs text-gray-500 mb-2">Ressenti d'effort — Échelle de Borg RPE 6-20</p>
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-4">
              <span className="text-base flex-shrink-0">💬</span>
              <p className="text-xs text-blue-700 leading-relaxed">
                Demander au bénéficiaire :{' '}
                <strong>« Sur cette échelle de 6 à 20, comment estimez-vous votre effort pendant le test ? »</strong>
              </p>
            </div>
            <div role="group" aria-label="Échelle de Borg RPE" className="grid grid-cols-3 gap-2">
              {BORG_RPE_LEVELS.map(({ v, label }) => {
                const color = v <= 12 ? '#1D9E75' : v <= 16 ? '#F59E0B' : '#E85050';
                const active = tm6.borgRPE === v;
                return (
                  <button key={v} type="button"
                    aria-label={`Borg RPE ${v}${label ? ` — ${label}` : ''}`}
                    aria-pressed={active}
                    onClick={() => setTm6({ borgRPE: active ? null : v })}
                    style={active ? { background: color, borderColor: color } : { borderColor: color + '55' }}
                    className={`rounded-xl border-2 px-3 py-2.5 text-left transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 ${active ? '' : 'bg-white hover:bg-gray-50'}`}>
                    <div className="font-black text-base" style={{ color: active ? 'white' : color }}>{v}</div>
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
              const interp = v <= 11 ? "Effort faible — peut augmenter l'intensité"
                : v <= 14 ? 'Effort modéré — zone cible APA ✅'
                : v <= 17 ? 'Effort élevé — adapter le programme'
                : "Effort maximal ⚠️ — réduire l'intensité";
              return (
                <div className="mt-3 rounded-xl border-2 px-4 py-2.5 flex items-center gap-3"
                  style={{ borderColor: color, background: color + '18' }}>
                  <span className="text-2xl font-black tabular-nums" style={{ color }}>{v}/20</span>
                  <span className="text-sm font-semibold" style={{ color }}>{interp}</span>
                </div>
              );
            })()}
            <p className="text-[11px] text-gray-400 italic mt-2">Borg G., 1982 · Échelle de perception de l'effort RPE 6-20</p>
          </div>
        </section>
      )}

      {/* Mémoire — Dubois MIS */}
      {active.includes('memoire') && (
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <CardHeader
            title="Mémoire — Test Dubois MIS"
            subtitle="Mémoire à court terme — apprentissage indicé sur 10 mots"
            badge={badgeMis}>
            <DeltaIndicator delta={d.memoireMIS} unit="/10" />
          </CardHeader>
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

      {/* MoCA */}
      {active.includes('moca') && (
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <CardHeader
            title="MoCA — Évaluation cognitive"
            subtitle="Montreal Cognitive Assessment — dépistage troubles cognitifs (/30)"
            badge={badgeMoca}>
            <DeltaIndicator delta={d.mocaScore} unit="pts" />
          </CardHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <label htmlFor="moca-score" className="text-xs text-gray-500 flex-shrink-0">Score MoCA</label>
              <input id="moca-score"
                type="number" min={0} max={30} step={1}
                value={form.mocaScore ?? ''}
                onChange={e => update({ mocaScore: e.target.value === '' ? null : Math.min(30, Math.max(0, Number(e.target.value))) })}
                className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="—" />
              <span className="text-xs text-gray-400">/ 30</span>
            </div>
            <p className="text-xs text-gray-400">
              Seuil : ≥ 26 = normal · 22-25 = trouble léger à modéré · &lt; 22 = atteinte significative
            </p>
            {form.mocaScore !== null && form.mocaScore !== undefined && (
              <button type="button" onClick={() => update({ mocaScore: null })}
                className="text-xs text-gray-400 hover:text-gray-600 underline focus:outline-none focus:ring-2 focus:ring-primary/30 rounded">
                Effacer
              </button>
            )}
          </div>
        </section>
      )}

      {/* Ajouter un test ponctuel */}
      {addable.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
          <span className="text-xs text-gray-400 self-center">Ajouter un test :</span>
          {addable.map(k => (
            <button key={k} type="button"
              onClick={() => setExtras(prev => [...prev, k])}
              className="flex items-center gap-1 text-xs text-primary border border-primary/30 hover:bg-primary/5 px-2.5 py-1 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30">
              <Plus size={11} />{TEST_LABELS[k]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
