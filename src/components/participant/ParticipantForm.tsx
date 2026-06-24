import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { toast } from 'sonner';
import type { Participant, TagPatient, TestKey, RgpdConsent, TraitementPatient, AntecedentMedical, TypeAntecedent, AnamneseData, ChutesData, ChuteDetail, ActivitePrecedente, NiveauActivite, CreneauHoraire, SedentariteReponses, MomentPrise } from '../../types';
import { TYPES_ANTECEDENT_LABELS, TYPES_BLESSURE_CHUTE, MOMENTS_PRISE_LABELS } from '../../types';
import { useStructures } from '../../hooks/useStructures';
import { getBrouillonParticipant, sauvegarderBrouillonParticipant } from '../../hooks/useBrouillonParticipant';
import { Save, X } from 'lucide-react';
import GIRWidget from '../bilan/GIRWidget';
import { EMPTY_SED, computeSedScore, getSedProfil, getFSSProfil, SectionSedentarite, SectionFatigue } from '../bilan/TestsAutonomie';

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

const CLS_CELL = 'border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-primary w-full';

const FREQUENCES_TRAITEMENT = ['1x/jour', '2x/jour', '3x/jour', 'À la demande', 'Autre'];
const MOMENTS_PRISE: MomentPrise[] = ['matin', 'midi', 'soir', 'nuit', 'avant_repas', 'apres_repas'];

function ListeTraitementsForm({
  value,
  onChange,
}: {
  value: TraitementPatient[];
  onChange: (v: TraitementPatient[]) => void;
}) {
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [stopDate, setStopDate] = useState('');
  const [showArretes, setShowArretes] = useState(false);

  const items = value ?? [];
  const actifs = items.filter(i => !i.date_fin);
  const arretes = items.filter(i => i.date_fin);

  const add = () => onChange([...items, { id: genId(), nom: '' }]);
  const remove = (id: string) => onChange(items.filter(i => i.id !== id));
  const upd = (id: string, patch: Partial<TraitementPatient>) =>
    onChange(items.map(i => (i.id === id ? { ...i, ...patch } : i)));

  const confirmerArret = (id: string) => {
    const date = stopDate || new Date().toISOString().split('T')[0];
    upd(id, { date_fin: date });
    setStoppingId(null);
    setStopDate('');
  };

  const reactiver = (id: string) => upd(id, { date_fin: undefined });

  return (
    <div>
      {/* Traitements en cours */}
      {actifs.length > 0 && (
        <div className="mb-2">
          <div className="grid gap-1.5 mb-1" style={{ gridTemplateColumns: '1fr 1fr 1fr auto' }}>
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-1">Médicament</span>
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-1">Dose</span>
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-1">Effet secondaire notable</span>
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-1">Statut</span>
          </div>
          {actifs.map(item => (
            <div key={item.id} className="mb-2">
              {stoppingId === item.id ? (
                <div className="flex gap-2 items-center bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <span className="text-sm text-amber-700 font-medium flex-1">Date d'arrêt :</span>
                  <input type="date" value={stopDate} onChange={e => setStopDate(e.target.value)}
                    className="border border-amber-300 rounded px-2 py-1 text-sm" />
                  <button type="button" onClick={() => confirmerArret(item.id)}
                    className="text-white text-sm font-semibold px-3 py-1 rounded-lg"
                    style={{ backgroundColor: '#E24B4A', border: 'none' }}>
                    Confirmer
                  </button>
                  <button type="button" onClick={() => { setStoppingId(null); setStopDate(''); }}
                    className="text-gray-500 hover:text-gray-700 text-sm px-2">Annuler</button>
                </div>
              ) : (
                <div className="border border-gray-100 rounded-lg p-2 bg-white">
                  <div className="grid gap-1.5 items-center" style={{ gridTemplateColumns: '1fr 1fr 1fr auto' }}>
                    <input type="text" value={item.nom} onChange={e => upd(item.id, { nom: e.target.value })}
                      placeholder="Metformine" className={CLS_CELL} />
                    <input type="text" value={item.dose ?? ''} onChange={e => upd(item.id, { dose: e.target.value })}
                      placeholder="500mg × 2/j" className={CLS_CELL} />
                    <input type="text" value={item.effetSecondaire ?? ''} onChange={e => upd(item.id, { effetSecondaire: e.target.value })}
                      placeholder="Troubles digestifs" className={CLS_CELL} />
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-semibold text-green-600 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">En cours ✅</span>
                      <button type="button" onClick={() => setStoppingId(item.id)}
                        title="Marquer comme arrêté"
                        className="text-gray-400 hover:text-amber-500 px-1 text-sm flex-shrink-0">⏹</button>
                      <button type="button" onClick={() => remove(item.id)}
                        className="text-red-400 hover:text-red-600 px-1 flex-shrink-0">✕</button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-2 pt-2 border-t border-gray-100">
                    <select value={item.frequence ?? ''} onChange={e => upd(item.id, { frequence: e.target.value || undefined })}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-primary">
                      <option value="">Fréquence...</option>
                      {FREQUENCES_TRAITEMENT.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {MOMENTS_PRISE.map(m => {
                        const checked = (item.moments ?? []).includes(m);
                        return (
                          <label key={m} className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                            <input type="checkbox" checked={checked} className="accent-primary" onChange={() => {
                              const moments = item.moments ?? [];
                              upd(item.id, { moments: checked ? moments.filter(x => x !== m) : [...moments, m] });
                            }} />
                            {MOMENTS_PRISE_LABELS[m]}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Traitements arrêtés */}
      {arretes.length > 0 && (
        <div className="mb-2">
          <button type="button" onClick={() => setShowArretes(!showArretes)}
            className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-gray-600 font-medium mb-1.5">
            {showArretes ? '▼' : '▶'} Traitements arrêtés ({arretes.length})
          </button>
          {showArretes && (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              {arretes.map(item => (
                <div key={item.id} className="grid gap-1.5 items-center px-3 py-2 bg-gray-50 border-b border-gray-100 last:border-0" style={{ gridTemplateColumns: '1fr 1fr 1fr auto' }}>
                  <span className="text-sm text-gray-400">{item.nom || '—'}</span>
                  <span className="text-sm text-gray-400">{item.dose || '—'}</span>
                  <span className="text-[10px] text-gray-400 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                    Arrêté le {new Date(item.date_fin + 'T12:00').toLocaleDateString('fr-FR')} ⬜
                  </span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => reactiver(item.id)}
                      title="Réactiver" className="text-[11px] text-primary hover:underline px-1">↩ Réactiver</button>
                    <button type="button" onClick={() => remove(item.id)}
                      className="text-red-400 hover:text-red-600 px-1">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button type="button" onClick={add}
        className="w-full flex items-center justify-center gap-2 text-primary border border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 px-4 py-2 rounded-xl text-sm font-medium transition-colors">
        + Ajouter un traitement
      </button>
    </div>
  );
}

const TYPES_ANTECEDENT: TypeAntecedent[] = [
  'pathologie_chronique', 'chirurgie', 'fracture', 'prothese', 'hospitalisation', 'accident', 'autre',
];

function ListeAntecedentsForm({
  value,
  onChange,
}: {
  value: AntecedentMedical[];
  onChange: (v: AntecedentMedical[]) => void;
}) {
  const items = value ?? [];
  const add = () => onChange([...items, { id: genId(), type: 'autre' }]);
  const remove = (id: string) => onChange(items.filter(i => i.id !== id));
  const upd = (id: string, patch: Partial<AntecedentMedical>) =>
    onChange(items.map(i => (i.id === id ? { ...i, ...patch } : i)));

  return (
    <div>
      {items.map((item, i) => {
        const showLocalisation = item.type === 'fracture' || item.type === 'prothese';
        const notesPlaceholder = item.type === 'pathologie_chronique'
          ? 'Stade, depuis quand... (ex : stade 2, depuis 2018)'
          : 'Détails, séquelles...';
        // Compat anciennes données : le champ s'appelait "notes_evolution"
        const notesValue = item.notes ?? (item as unknown as { notes_evolution?: string }).notes_evolution ?? '';

        return (
          <div key={item.id} className="border border-gray-100 rounded-xl p-3.5 mb-3 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-400">Antécédent {i + 1}</span>
              <button type="button" onClick={() => remove(item.id)}
                className="text-xs text-red-400 hover:text-red-600">🗑️ Supprimer</button>
            </div>

            <div className="mb-2.5">
              <label className="text-[11px] font-medium text-gray-500 mb-1 block">Titre de l'antécédent *</label>
              <input type="text" value={item.titre ?? ''} onChange={e => upd(item.id, { titre: e.target.value })}
                placeholder="Ex: Opération genou droit, Fracture col fémur, Prothèse hanche..." className={`w-full ${CLS_CELL}`} />
            </div>

            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {TYPES_ANTECEDENT.map(t => (
                <button key={t} type="button" onClick={() => upd(item.id, { type: t })}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    item.type === t
                      ? 'bg-primary text-white border-primary'
                      : 'border-gray-200 text-gray-600 hover:border-primary/50 hover:bg-white'
                  }`}>
                  {TYPES_ANTECEDENT_LABELS[t]}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="text-[11px] font-medium text-gray-500 mb-1 block">Date / Année</label>
                <input type="text" value={item.date ?? ''} onChange={e => upd(item.id, { date: e.target.value })}
                  placeholder="2019" className={`w-full ${CLS_CELL}`} />
              </div>
              {showLocalisation && (
                <div>
                  <label className="text-[11px] font-medium text-gray-500 mb-1 block">Localisation</label>
                  <input type="text" value={item.localisation ?? ''} onChange={e => upd(item.id, { localisation: e.target.value })}
                    placeholder="Genou droit, hanche gauche..." className={`w-full ${CLS_CELL}`} />
                </div>
              )}
            </div>

            <div className="mb-2">
              <label className="text-[11px] font-medium text-gray-500 mb-1 block">Conséquences / séquelles</label>
              <input type="text" value={item.consequence ?? ''} onChange={e => upd(item.id, { consequence: e.target.value })}
                placeholder="Douleur résiduelle, mobilité réduite..." className={`w-full ${CLS_CELL}`} />
            </div>

            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-medium text-gray-500">Douleur liée</span>
              {(['oui', 'non'] as const).map(v => {
                const isActive = item.douleur === v;
                return (
                  <button key={v} type="button" onClick={() => upd(item.id, { douleur: item.douleur === v ? undefined : v })}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      border: '1.5px solid',
                      borderColor: isActive ? '#2BBFBF' : '#D1D5DB',
                      background: isActive ? '#2BBFBF' : '#FFFFFF',
                      color: isActive ? '#FFFFFF' : '#374151',
                      fontWeight: isActive ? '600' : '400',
                      fontSize: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}>
                    {v === 'oui' ? 'Oui' : 'Non'}
                  </button>
                );
              })}
            </div>

            <input
              type="text"
              value={notesValue}
              onChange={e => upd(item.id, { notes: e.target.value })}
              placeholder={notesPlaceholder}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[12px] text-gray-500 focus:outline-none focus:border-primary"
            />
          </div>
        );
      })}
      <button type="button" onClick={add}
        className="w-full flex items-center justify-center gap-2 text-primary border border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 px-4 py-2 rounded-xl text-sm font-medium transition-colors">
        + Ajouter un antécédent
      </button>
    </div>
  );
}

// ─── ÉCHELLE 0-10 (douleur / fatigue) ──────────────────────────────────────────

function Echelle10({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number) => void;
}) {
  const v = value ?? null;
  const getColor = (n: number) =>
    n === 0 ? '#3B6D11' : n <= 3 ? '#F59E0B' : n <= 6 ? '#EF8C00' : n <= 8 ? '#EF4444' : '#991B1B';
  const getLibelle = (n: number) =>
    n === 0 ? '😊 Aucune' : n <= 2 ? '🙂 Légère' : n <= 4 ? '😐 Modérée'
    : n <= 6 ? '😟 Importante' : n <= 8 ? '😣 Sévère' : '😭 Insupportable';

  return (
    <div>
      <label className={CLS_LABEL}>{label}</label>
      <div className="flex gap-1">
        {[0,1,2,3,4,5,6,7,8,9,10].map(n => {
          const active = v === n;
          const color = getColor(n);
          return (
            <button key={n} type="button"
              onClick={() => onChange(n)}
              style={{ borderColor: active ? color : undefined, background: active ? color : undefined }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold border transition-all ${
                active ? 'text-white shadow-sm' : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}>
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-1.5">
        <span>0 — Aucune</span>
        <span>5 — Modérée</span>
        <span>10 — Insupportable</span>
      </div>
      {v !== null && (
        <p className="text-xs font-semibold mt-1" style={{ color: getColor(v) }}>
          {getLibelle(v)}
        </p>
      )}
    </div>
  );
}

// ─── TOGGLE OUI/NON ─────────────────────────────────────────────────────────────

function ToggleOuiNon({
  value,
  onChange,
}: {
  value: 'oui' | 'non' | null | undefined;
  onChange: (v: 'oui' | 'non') => void;
}) {
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      {(['oui', 'non'] as const).map(v => {
        const isActive = value === v;
        return (
          <button key={v} type="button" onClick={() => onChange(v)}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1.5px solid',
              borderColor: isActive ? '#2BBFBF' : '#D1D5DB',
              background: isActive ? '#2BBFBF' : '#FFFFFF',
              color: isActive ? '#FFFFFF' : '#374151',
              fontWeight: isActive ? '600' : '400',
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}>
            {v === 'oui' ? 'Oui' : 'Non'}
          </button>
        );
      })}
    </div>
  );
}

// ─── ÉCHELLE 1-5 ──────────────────────────────────────────────────────────────

function Echelle5({
  label,
  aide,
  value,
  onChange,
}: {
  label: string;
  aide?: string;
  value: number | null | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className={CLS_LABEL}>{label}</label>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map(n => {
          const active = value === n;
          return (
            <button key={n} type="button" onClick={() => onChange(n)}
              className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors ${
                active ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}>
              {n}
            </button>
          );
        })}
      </div>
      {aide && <p className="text-xs text-gray-400 mt-1">{aide}</p>}
    </div>
  );
}

// ─── ANTÉCÉDENTS DE CHUTES (MOD3) ───────────────────────────────────────────────

function ChuteCard({
  item,
  index,
  onChange,
  onRemove,
}: {
  item: ChuteDetail;
  index: number;
  onChange: (patch: Partial<ChuteDetail>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border border-gray-100 rounded-xl p-3.5 mb-3 bg-gray-50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-gray-400">Chute {index + 1}</span>
        <button type="button" onClick={onRemove}
          className="text-xs text-red-400 hover:text-red-600">🗑️ Supprimer</button>
      </div>

      <div className="mb-2.5">
        <label className="text-[11px] font-medium text-gray-500 mb-1 block">Date approximative (MM/AAAA)</label>
        <input type="text" value={item.dateApprox ?? ''} onChange={e => onChange({ dateApprox: e.target.value })}
          placeholder="03/2025" className={`w-full ${CLS_CELL}`} />
      </div>

      <div className="mb-2.5">
        <label className="text-[11px] font-medium text-gray-500 mb-1 block">Circonstances</label>
        <input type="text" value={item.circonstances ?? ''} onChange={e => onChange({ circonstances: e.target.value })}
          placeholder="Bain, escaliers, sol glissant, vertige, nuit..." className={`w-full ${CLS_CELL}`} />
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-2.5">
        <span className="text-[11px] font-medium text-gray-500">Blessure occasionnée ?</span>
        <ToggleOuiNon value={item.blessure} onChange={v => onChange({ blessure: v })} />
      </div>

      {item.blessure === 'oui' && (
        <div className="mb-2.5 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {TYPES_BLESSURE_CHUTE.map(t => (
              <button key={t} type="button" onClick={() => onChange({ typeBlessure: item.typeBlessure === t ? null : t })}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  item.typeBlessure === t
                    ? 'bg-primary text-white border-primary'
                    : 'border-gray-200 text-gray-600 hover:border-primary/50 hover:bg-white'
                }`}>
                {t}
              </button>
            ))}
          </div>
          <input type="text" value={item.detailBlessure ?? ''} onChange={e => onChange({ detailBlessure: e.target.value })}
            placeholder="Détails..." className={`w-full ${CLS_CELL}`} />
        </div>
      )}

      <Echelle5
        label="Confiance depuis cette chute (1-5)"
        value={item.confiance}
        onChange={n => onChange({ confiance: n })}
      />
    </div>
  );
}

function ChutesForm({
  value,
  onChange,
}: {
  value: ChutesData;
  onChange: (v: ChutesData) => void;
}) {
  const items = value.chutesDetail ?? [];
  const add = () => onChange({ ...value, chutesDetail: [...items, { id: genId() }] });
  const remove = (id: string) => onChange({ ...value, chutesDetail: items.filter(i => i.id !== id) });
  const upd = (id: string, patch: Partial<ChuteDetail>) =>
    onChange({ ...value, chutesDetail: items.map(i => (i.id === id ? { ...i, ...patch } : i)) });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-gray-700">A-t-il déjà fait des chutes ?</span>
        <ToggleOuiNon value={value.aChutes} onChange={v => onChange({ ...value, aChutes: v })} />
      </div>

      {value.aChutes === 'oui' && (
        <div className="border-t border-gray-100 pt-3">
          {items.map((item, i) => (
            <ChuteCard
              key={item.id}
              item={item}
              index={i}
              onChange={patch => upd(item.id, patch)}
              onRemove={() => remove(item.id)}
            />
          ))}
          <button type="button" onClick={add}
            className="w-full flex items-center justify-center gap-2 text-primary border border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 px-4 py-2 rounded-xl text-sm font-medium transition-colors">
            + Ajouter une chute
          </button>
        </div>
      )}
    </div>
  );
}

// ─── CHOIX UNIQUE (sélection simple, re-cliquer pour désélectionner) ───────────

function ChoixUnique({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string | null | undefined;
  onChange: (v: string | null) => void;
}) {
  return (
    <div>
      <label className={CLS_LABEL}>{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(value === opt ? null : opt)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
              value === opt
                ? 'bg-primary text-white border-primary'
                : 'border-gray-200 text-gray-600 hover:border-primary/50 hover:bg-gray-50'
            }`}
          >
            {opt}
            {value === opt && <span className="text-white/80 text-xs leading-none">✕</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── CHOIX UNIQUE OU TEXTE LIBRE (bulles de suggestion + champ texte) ──────────

function ChoixOuTexte({
  label,
  options,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  options: string[];
  value: string | null | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className={CLS_LABEL}>{label}</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(value === opt ? '' : opt)}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
              value === opt
                ? 'bg-primary text-white border-primary'
                : 'border-gray-200 text-gray-600 hover:border-primary/50 hover:bg-gray-50'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? 'Ou précisez...'}
        className={CLS_INPUT}
      />
    </div>
  );
}

// ─── CHOIX MULTIPLE (bulles + champ libre) ─────────────────────────────────────

function ChoixMultiple({
  label,
  options,
  value,
  onChange,
  avecChampLibre,
  placeholderCustom,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  avecChampLibre?: boolean;
  placeholderCustom?: string;
}) {
  const selected = value ?? [];
  const predefined = selected.filter(s => options.includes(s));
  const customs = selected.filter(s => !options.includes(s));

  const toggle = (opt: string) =>
    onChange(
      predefined.includes(opt)
        ? [...predefined.filter(s => s !== opt), ...customs]
        : [...predefined, opt, ...customs]
    );

  const updateCustom = (idx: number, text: string) => {
    const next = customs.map((c, i) => (i === idx ? text : c));
    onChange([...predefined, ...next]);
  };

  const removeCustom = (idx: number) => {
    onChange([...predefined, ...customs.filter((_, i) => i !== idx)]);
  };

  const addCustom = () => {
    onChange([...predefined, ...customs, '']);
  };

  return (
    <div>
      <label className={CLS_LABEL}>{label}</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
              predefined.includes(opt)
                ? 'bg-primary text-white border-primary'
                : 'border-gray-200 text-gray-600 hover:border-primary/50 hover:bg-gray-50'
            }`}
          >
            {opt}
            {predefined.includes(opt) && <span className="text-white/80 text-xs leading-none">✕</span>}
          </button>
        ))}
      </div>

      {avecChampLibre && (
        <div className="mt-1">
          {customs.map((custom, idx) => (
            <div key={idx} className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={custom}
                onChange={e => updateCustom(idx, e.target.value)}
                placeholder={placeholderCustom ?? 'Activité personnalisée...'}
                className={`flex-1 ${CLS_INPUT}`}
              />
              <button
                type="button"
                onClick={() => removeCustom(idx)}
                aria-label="Supprimer"
                className="text-gray-400 hover:text-red-500 p-1 text-base leading-none flex-shrink-0"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addCustom}
            className="flex items-center gap-1.5 text-primary text-sm font-medium border border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 px-3 py-1.5 rounded-xl transition-colors"
          >
            + Autre
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ACTIVITÉS PRÉCÉDENTES (bulles + détails par activité) ─────────────────────

function ActivitesPrecedentesForm({
  value,
  onChange,
}: {
  value: ActivitePrecedente[];
  onChange: (v: ActivitePrecedente[]) => void;
}) {
  const items = value ?? [];

  const toggleOption = (opt: string) => {
    const exists = items.some(i => i.nom === opt);
    onChange(exists ? items.filter(i => i.nom !== opt) : [...items, { nom: opt }]);
  };

  const upd = (idx: number, patch: Partial<ActivitePrecedente>) =>
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const removeAt = (idx: number) => onChange(items.filter((_, i) => i !== idx));

  const addCustom = () => onChange([...items, { nom: '' }]);

  return (
    <div>
      <label className={CLS_LABEL}>Activités pratiquées avant</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {OPTIONS_ACTIVITES.map(opt => {
          const selected = items.some(i => i.nom === opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggleOption(opt)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
                selected
                  ? 'bg-primary text-white border-primary'
                  : 'border-gray-200 text-gray-600 hover:border-primary/50 hover:bg-gray-50'
              }`}
            >
              {opt}
              {selected && <span className="text-white/80 text-xs leading-none">✕</span>}
            </button>
          );
        })}
      </div>

      {items.map((item, idx) => {
        const isPredefined = OPTIONS_ACTIVITES.includes(item.nom);
        return (
          <div key={idx} className="border border-gray-100 rounded-xl p-3.5 mb-2 bg-gray-50">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              {isPredefined ? (
                <span className="text-xs font-bold text-gray-500">{item.nom}</span>
              ) : (
                <input
                  type="text"
                  value={item.nom}
                  onChange={e => upd(idx, { nom: e.target.value })}
                  placeholder="Activité personnalisée..."
                  className={`flex-1 ${CLS_CELL}`}
                />
              )}
              <button type="button" onClick={() => removeAt(idx)} aria-label="Supprimer"
                className="text-gray-400 hover:text-red-500 p-1 text-base leading-none flex-shrink-0">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={item.periode ?? ''}
                onChange={e => upd(idx, { periode: e.target.value })}
                placeholder="Période (ex : jusqu'à 45 ans)"
                className={`w-full ${CLS_CELL}`}
              />
              <div className="flex gap-1.5">
                {NIVEAUX_ACTIVITE.map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => upd(idx, { niveau: item.niveau === n ? null : n })}
                    className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      item.niveau === n ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      <button type="button" onClick={addCustom}
        className="flex items-center gap-1.5 text-primary text-sm font-medium border border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 px-3 py-1.5 rounded-xl transition-colors">
        + Autre
      </button>
    </div>
  );
}

// ─── ORGANISATION : CRÉNEAUX HORAIRES PAR JOUR ──────────────────────────────────

function CreneauxParJourForm({
  jours,
  value,
  onChange,
}: {
  jours: string[];
  value: Record<string, CreneauHoraire[]>;
  onChange: (v: Record<string, CreneauHoraire[]>) => void;
}) {
  const addCreneau = (jour: string) => {
    const creneaux = value[jour] ?? [];
    onChange({ ...value, [jour]: [...creneaux, { debut: '07:00', fin: '12:00' }] });
  };
  const updCreneau = (jour: string, idx: number, patch: Partial<CreneauHoraire>) => {
    const creneaux = (value[jour] ?? []).map((c, i) => (i === idx ? { ...c, ...patch } : c));
    onChange({ ...value, [jour]: creneaux });
  };
  const removeCreneau = (jour: string, idx: number) => {
    const creneaux = (value[jour] ?? []).filter((_, i) => i !== idx);
    onChange({ ...value, [jour]: creneaux });
  };

  if (jours.length === 0) {
    return <p className="text-xs text-gray-400">Sélectionnez d'abord un ou plusieurs jours disponibles.</p>;
  }

  return (
    <div className="space-y-3">
      {jours.map(jour => {
        const creneaux = value[jour] ?? [];
        return (
          <div key={jour}>
            <label className={CLS_LABEL}>{JOURS_LABELS_COMPLET[jour] ?? jour}</label>
            {creneaux.map((c, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <span className="text-sm text-gray-500">De</span>
                <select
                  value={c.debut}
                  onChange={e => updCreneau(jour, i, { debut: e.target.value })}
                  className="border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-primary"
                >
                  {OPTIONS_HEURES.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <span className="text-sm text-gray-500">à</span>
                <select
                  value={c.fin}
                  onChange={e => updCreneau(jour, i, { fin: e.target.value })}
                  className="border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-primary"
                >
                  {OPTIONS_HEURES.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <button type="button" onClick={() => removeCreneau(jour, i)} aria-label="Supprimer"
                  className="text-gray-400 hover:text-red-500 p-1 text-base leading-none">✕</button>
              </div>
            ))}
            <button type="button" onClick={() => addCreneau(jour)}
              className="flex items-center gap-1.5 text-primary text-sm font-medium border border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 px-3 py-1.5 rounded-xl transition-colors">
              + Ajouter un créneau
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Options des champs autonomie / habitudes de vie / activité physique ──────

const OPTIONS_SITUATION_VIE = ['Seul(e)', 'En famille', 'EHPAD / résidence', 'Autre'];
const OPTIONS_TYPE_AIDE_DOMICILE = ['Aide ménagère', 'Auxiliaire de vie', 'Infirmier(e)', 'Portage de repas', 'Aide-soignant(e)', 'Autre'];
const OPTIONS_FREQUENCE_AIDE = ['Quotidienne', 'Plusieurs fois / semaine', 'Hebdomadaire', 'Ponctuelle'];
const OPTIONS_AIDE_MARCHE = ['Aucune', 'Canne', 'Déambulateur', 'Autre'];
const OPTIONS_REPAS = ['1', '2', '3', 'Plus de 3'];
const OPTIONS_HYDRATATION = ['< 1L', '1 à 1,5L', '> 1,5L'];
const OPTIONS_ACTIVITES = [
  '🚶 Marche / Randonnée',
  '🚴 Cyclisme (vélo, vélo électrique)',
  '🏊 Natation / Aquagym',
  '🎾 Raquettes (tennis, badminton, ping-pong)',
  '⚽ Jeux de ballon (basket, foot, volley)',
  '🎯 Précision (pétanque, golf, sarbacane, tir à l\'arc, fléchettes)',
  '🤸 Gym douce / Stretching / Yoga',
  '💃 Danse / Activités rythmiques',
  '🏋️ Renforcement musculaire',
  '🧠 Activités cognitives (mémoire, jeux de société)',
];

const NUM_INPUT_CLS = 'w-36 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary';

const NIVEAUX_ACTIVITE: NiveauActivite[] = ['Loisir', 'Compétition', 'Professionnel'];

// ─── Objectifs, cognition, organisation des séances ───────────────────────────

const OPTIONS_OBJECTIFS_PATIENT = [
  '💪 Renforcement musculaire',
  '⚖️ Améliorer l\'équilibre',
  '🦵 Améliorer la mobilité',
  '🫀 Endurance à l\'effort',
  '🛡️ Prévention des chutes',
  '🏠 Maintien de l\'autonomie',
  '😌 Réduire les douleurs',
  '🎯 Améliorer la coordination',
  '🧘 Travailler la souplesse',
  '🔄 Reprendre une activité physique',
  '💙 Regagner confiance en ses capacités',
];

const OPTIONS_ORIGINE_DEMARCHE = [
  '💪 De sa propre initiative',
  '👨‍⚕️ Recommandation médicale',
  '👨‍👩‍👦 Poussé par un proche',
  '✏️ Autre',
];

// ─── Cognition & humeur : plaintes mémoire / suivi psychologique ──────────────

const OPTIONS_DEPUIS_QUAND = ['< 6 mois', '6-12 mois', '> 1 an'];
const OPTIONS_SIGNALE_PAR = ['Le patient lui-même', "L'entourage", 'Les deux'];
const OPTIONS_SUIVI_PSY_QUI = ['Psychologue', 'Psychiatre', 'Psychothérapeute', 'Autre'];
const OPTIONS_SUIVI_PSY_FREQUENCE = ['Hebdomadaire', 'Mensuel', 'Occasionnel', 'En pause'];

const OPTIONS_JOURS_DISPONIBLES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const JOURS_LABELS_COMPLET: Record<string, string> = {
  Lun: 'Lundi', Mar: 'Mardi', Mer: 'Mercredi', Jeu: 'Jeudi', Ven: 'Vendredi', Sam: 'Samedi',
};
const OPTIONS_DUREE_SEANCE = ['30 min', '45 min', '60 min', '90 min', '120 min'];
const FREQUENCES_SEANCES = [1, 2, 3, 4] as const;
const OPTIONS_DUREE_SEANCE_MIN = [30, 45, 60, 90, 120];
const OPTIONS_HEURES = (() => {
  const heures: string[] = [];
  for (let m = 7 * 60; m <= 20 * 60; m += 30) {
    heures.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return heures;
})();

// ─── IBAN ─────────────────────────────────────────────────────────────────────

function validerIBAN(iban: string): boolean {
  const clean = iban.replace(/\s/g, '').toUpperCase();
  if (clean.length < 14 || clean.length > 34) return false;
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(clean)) return false;
  const rearranged = clean.slice(4) + clean.slice(0, 4);
  const numeric = rearranged.split('').map(c =>
    isNaN(Number(c)) ? (c.charCodeAt(0) - 55).toString() : c
  ).join('');
  let rem = 0;
  for (const d of numeric) rem = (rem * 10 + parseInt(d)) % 97;
  return rem === 1;
}

function formatIBAN(raw: string): string {
  return raw.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
}

// ─── IMC ──────────────────────────────────────────────────────────────────────

function getCategorieIMC(imc: number): { label: string; couleur: string } {
  if (imc < 18.5) return { label: 'Insuffisance pondérale', couleur: '#F59E0B' };
  if (imc < 25)   return { label: 'Poids normal',           couleur: '#3B6D11' };
  if (imc < 30)   return { label: 'Surpoids',               couleur: '#F59E0B' };
  if (imc < 35)   return { label: 'Obésité modérée',        couleur: '#EF8C00' };
  if (imc < 40)   return { label: 'Obésité sévère',         couleur: '#EF4444' };
  return           { label: 'Obésité morbide',              couleur: '#991B1B' };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  onSubmit: (data: Omit<Participant, 'id' | 'token' | 'bilans'>) => void;
  onCancel: () => void;
  initial?: Partial<Participant>;
  /** Étape affichée (1 à 5). Si non fourni, le formulaire complet est affiché (usage modale). */
  step?: 1 | 2 | 3 | 4 | 5;
  /** Clé de brouillon localStorage (ex : "nouveau" ou l'id du participant). */
  draftKey?: string;
  /** Appelé à chaque changement, avec le nombre de champs remplis / total. */
  onCompletionChange?: (filled: number, total: number) => void;
}

export interface ParticipantFormHandle {
  /**
   * Tente la soumission. Retourne true si réussie, ou { step, message } si une
   * validation a échoué (prénom/nom manquant → étape 1, organisation des
   * séances incomplète → étape 4) — à l'appelant de naviguer vers cette étape
   * et d'afficher le message.
   */
  submit: () => true | { step: 1 | 2 | 3 | 4 | 5; message: string };
}

const CLS_INPUT = 'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10';
const CLS_LABEL = 'block text-sm font-medium text-gray-700 mb-1.5';

function computeCompletion(
  form: Record<string, string>,
  anamnese: AnamneseData,
  traitements: TraitementPatient[],
  antecedents: AntecedentMedical[],
  rgpd: RgpdConsent,
  profilActivite: { modeDeplacementHabituel?: Participant['modeDeplacementHabituel']; objectifsPatient: string[]; activitesSouhaitees: string[] },
): { filled: number; total: number } {
  const champsTexte = [
    form.prenom, form.nom, form.dateNaissance, form.dateCreation,
    form.email, form.telephone,
    form.nomNaissance, form.villeNaissance, form.codePostalNaissance,
    form.adresseRue, form.adresseCodePostal, form.adresseVille,
    form.taille, form.poids,
    form.iban, form.bic, form.allergies,
  ];
  let filled = champsTexte.filter(v => v !== '' && v != null).length;
  let total = champsTexte.length;

  total += 6;
  if (anamnese.douleurQuotidienne != null) filled++;
  if (anamnese.fatigueQuotidienne != null) filled++;
  if (anamnese.contreIndications != null) filled++;
  if (anamnese.chutes?.aChutes != null) filled++;
  if (traitements.length > 0) filled++;
  if (antecedents.length > 0) filled++;

  total += 15;
  if (anamnese.autonomie?.situationVie != null) filled++;
  if (anamnese.autonomie?.aideADomicile != null) filled++;
  if (anamnese.autonomie?.aideMarche != null) filled++;
  if (anamnese.autonomie?.gir?.niveau != null) filled++;
  if (anamnese.habitudesVie?.nombreRepas != null) filled++;
  if (anamnese.habitudesVie?.hydratation != null) filled++;
  if (anamnese.habitudesVie?.qualiteSommeil != null) filled++;
  if (anamnese.habitudesVie?.heuresSommeil != null) filled++;
  if (anamnese.habitudesVie?.niveauAppetit != null) filled++;
  if (anamnese.habitudesVie?.variationPoids != null) filled++;
  if (anamnese.habitudesVie?.tabagisme != null) filled++;
  if ((anamnese.activitePhysique?.activitesActuelles?.length ?? 0) > 0) filled++;
  if ((anamnese.activitePhysique?.activitesPrecedentes?.length ?? 0) > 0) filled++;
  if (anamnese.sedentariteScore != null) filled++;
  if (anamnese.fatigueScore != null) filled++;

  total += 1;
  if (profilActivite.objectifsPatient.length > 0) filled++;

  total += 3;
  if (anamnese.cognition?.plaintesMemoire != null) filled++;
  if (anamnese.cognition?.suiviPsy != null) filled++;
  if (anamnese.cognition?.origineDemarche != null) filled++;

  total += 2;
  if ((anamnese.organisation?.joursDisponibles?.length ?? 0) > 0) filled++;
  if (Object.keys(anamnese.organisation?.creneauxParJour ?? {}).length > 0) filled++;

  total += 1;
  if (rgpd.consentementObtenu) filled++;

  return { filled, total };
}

const ParticipantForm = forwardRef<ParticipantFormHandle, Props>(function ParticipantForm(
  { onSubmit, onCancel, initial, step, draftKey, onCompletionChange }, ref
) {
  const { structures } = useStructures();

  // ── Brouillon localStorage (page Nouveau participant / Modifier) ─
  const brouillon = draftKey ? getBrouillonParticipant(draftKey) : null;
  const seed: Partial<Participant> = brouillon?.data ? { ...initial, ...brouillon.data } : (initial ?? {});

  // ── Rattachement structure ──────────────────────────────────────
  const [structureId, setStructureId] = useState<string | undefined>(seed.structureId);

  // ── Traitements & antécédents structurés ───────────────────────
  const [traitements, setTraitements] = useState<TraitementPatient[]>(seed.traitements ?? []);
  const [antecedents, setAntecedents] = useState<AntecedentMedical[]>(seed.antecedentsMedicauxStructures ?? []);

  // ── Anamnèse (état de santé général) ────────────────────────────
  const [anamnese, setAnamnese] = useState<AnamneseData>({
    douleurQuotidienne: seed.anamnese?.douleurQuotidienne ?? null,
    fatigueQuotidienne: seed.anamnese?.fatigueQuotidienne ?? null,
    chutes: seed.anamnese?.chutes ?? {},
    contreIndications: seed.anamnese?.contreIndications ?? null,
    contreIndicationsDetail: seed.anamnese?.contreIndicationsDetail ?? '',
    autonomie: seed.anamnese?.autonomie ?? {},
    habitudesVie: seed.anamnese?.habitudesVie ?? {},
    activitePhysique: seed.anamnese?.activitePhysique ?? {},
    sedentariteReponses: seed.anamnese?.sedentariteReponses ?? EMPTY_SED,
    sedentariteScore: seed.anamnese?.sedentariteScore ?? null,
    sedentariteProfil: seed.anamnese?.sedentariteProfil ?? null,
    fatigueReponses: seed.anamnese?.fatigueReponses ?? Array(9).fill(null),
    fatigueScore: seed.anamnese?.fatigueScore ?? null,
    fatigueProfil: seed.anamnese?.fatigueProfil ?? null,
    cognition: seed.anamnese?.cognition ?? {},
    organisation: seed.anamnese?.organisation ?? {},
  });

  // ── Mode de déplacement, objectifs & activités souhaitées ────────
  const [profilActivite, setProfilActivite] = useState<{
    modeDeplacementHabituel: Participant['modeDeplacementHabituel'];
    modeDeplacementDetail: string;
    objectifsPatient: string[];
    activitesSouhaitees: string[];
  }>({
    modeDeplacementHabituel: seed.modeDeplacementHabituel,
    modeDeplacementDetail:   seed.modeDeplacementDetail ?? '',
    objectifsPatient:    Array.isArray(seed.objectifsPatient) ? seed.objectifsPatient : (seed.objectifsPatient ? [seed.objectifsPatient] : []),
    activitesSouhaitees: seed.activitesSouhaitees ?? [],
  });

  // ── Tags / tests ────────────────────────────────────────────────
  const [tags] = useState<TagPatient[]>(seed.tags ?? []);
  const [testsActifs] = useState<TestKey[]>(seed.testsActifs ?? []);

  // ── RGPD + droit à l'image ──────────────────────────────────────
  const [rgpd, setRgpd] = useState<RgpdConsent>({
    consentementObtenu:  seed.rgpd?.consentementObtenu  ?? false,
    droitAcces:          seed.rgpd?.droitAcces          ?? false,
    droitRectification:  seed.rgpd?.droitRectification  ?? false,
    droitEffacement:     seed.rgpd?.droitEffacement     ?? false,
    methodeConsentement: seed.rgpd?.methodeConsentement ?? 'oral_note',
    consentementDate:    seed.rgpd?.consentementDate    ?? new Date().toISOString().slice(0, 10),
  });
  const [droitImage, setDroitImage] = useState<boolean>(seed.droitImage ?? false);

  // ── Champs texte ────────────────────────────────────────────────
  const [form, setForm] = useState({
    nom:               seed.nom               ?? '',
    prenom:            seed.prenom            ?? '',
    dateNaissance:     seed.dateNaissance     ?? '',
    dateCreation:      seed.dateCreation      ?? new Date().toISOString().slice(0, 10),
    email:             seed.email             ?? '',
    telephone:         seed.telephone         ?? '',
    contexteClinic:    seed.contexteClinic    ?? '',
    adresseRue:        seed.adresseRue        ?? '',
    adresseCodePostal: seed.adresseCodePostal ?? '',
    adresseVille:      seed.adresseVille      ?? '',
    taille:               seed.taille?.toString() ?? '',
    poids:                seed.poids?.toString()  ?? '',
    nomNaissance:         seed.nomNaissance         ?? '',
    villeNaissance:       seed.villeNaissance       ?? '',
    codePostalNaissance:  seed.codePostalNaissance  ?? '',
    iban:                 seed.iban              ?? '',
    bic:                  seed.bic               ?? '',
    allergies:            seed.allergies         ?? '',
  });

  // ── Organisation des séances : nb séances/semaine + durées obligatoires ──
  const [erreurOrganisation, setErreurOrganisation] = useState<string | null>(null);

  function validerOrganisation(): string | null {
    const n = anamnese.organisation?.nbSeancesSemaine;
    if (!n || n <= 0) return 'Veuillez indiquer le nombre de séances par semaine.';
    const durees = anamnese.organisation?.dureesSeances ?? [];
    if (durees.length !== n || durees.some(d => !d || d <= 0)) {
      return 'Veuillez indiquer la durée de chaque séance.';
    }
    return null;
  }

  // ── Handlers ────────────────────────────────────────────────────

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  function setSedData(reponses: SedentariteReponses) {
    const sc = computeSedScore(reponses);
    setAnamnese(a => ({
      ...a,
      sedentariteReponses: reponses,
      sedentariteScore: sc?.total ?? null,
      sedentariteProfil: sc ? getSedProfil(sc.total).profil : null,
    }));
  }

  function setFSSData(reponses: (number | null)[]) {
    const answered = reponses.filter(v => v !== null);
    const score = answered.length > 0 ? answered.reduce((sum, v) => sum + (v ?? 0), 0) : null;
    setAnamnese(a => ({
      ...a,
      fatigueReponses: reponses,
      fatigueScore: score,
      fatigueProfil: score !== null ? getFSSProfil(score).profil : null,
    }));
  }

  function buildPayload(): Omit<Participant, 'id' | 'token' | 'bilans'> {
    return {
      ...form,
      taille: form.taille ? Number(form.taille) : undefined,
      poids:  form.poids  ? Number(form.poids)  : undefined,
      // Préserver les données cliniques existantes (issues du bilan initial)
      pathologie:              initial?.pathologie,
      antecedentsMedicaux:     initial?.antecedentsMedicaux,
      antecedentsChirurgicaux: initial?.antecedentsChirurgicaux,
      modeDeplacementHabituel: profilActivite.modeDeplacementHabituel,
      modeDeplacementDetail:   profilActivite.modeDeplacementDetail || undefined,
      activitesSouhaitees:     profilActivite.activitesSouhaitees.length > 0 ? profilActivite.activitesSouhaitees : undefined,
      objectifsPatient:        profilActivite.objectifsPatient.length > 0 ? profilActivite.objectifsPatient : undefined,
      disponibilites:          initial?.disponibilites,
      droitImage,
      tags, testsActifs, rgpd,
      traitements: traitements.length > 0 ? traitements : undefined,
      antecedentsMedicauxStructures: antecedents.length > 0 ? antecedents : undefined,
      anamnese,
      structureId: structureId || undefined,
      profil:         initial?.profil,
      coordonnees:    initial?.coordonnees,
      geocodeFailed:  initial?.geocodeFailed,
      programmes:     initial?.programmes,
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const erreur = validerOrganisation();
    if (erreur) {
      setErreurOrganisation(erreur);
      toast.error(erreur);
      return;
    }
    setErreurOrganisation(null);
    onSubmit(buildPayload());
  }

  useImperativeHandle(ref, () => ({
    submit: () => {
      if (!form.prenom.trim() || !form.nom.trim()) {
        return { step: 1, message: 'Le prénom et le nom sont obligatoires.' };
      }
      const erreur = validerOrganisation();
      if (erreur) {
        setErreurOrganisation(erreur);
        return { step: 4, message: erreur };
      }
      setErreurOrganisation(null);
      onSubmit(buildPayload());
      return true;
    },
  }));

  // ── Brouillon : sauvegarde auto (debounce 800ms) ─────────────────
  useEffect(() => {
    if (!draftKey) return;
    const t = setTimeout(() => {
      sauvegarderBrouillonParticipant(draftKey, step ?? 0, {
        ...form,
        taille: form.taille ? Number(form.taille) : undefined,
        poids:  form.poids  ? Number(form.poids)  : undefined,
        anamnese, traitements, antecedentsMedicauxStructures: antecedents,
        rgpd, droitImage, structureId,
        modeDeplacementHabituel: profilActivite.modeDeplacementHabituel,
        modeDeplacementDetail:   profilActivite.modeDeplacementDetail || undefined,
        activitesSouhaitees:     profilActivite.activitesSouhaitees,
        objectifsPatient:        profilActivite.objectifsPatient,
      });
    }, 800);
    return () => clearTimeout(t);
  }, [draftKey, step, form, anamnese, traitements, antecedents, rgpd, droitImage, structureId, profilActivite]);

  // ── Indicateur de complétion ─────────────────────────────────────
  useEffect(() => {
    if (!onCompletionChange) return;
    const { filled, total } = computeCompletion(form, anamnese, traitements, antecedents, rgpd, profilActivite);
    onCompletionChange(filled, total);
  }, [form, anamnese, traitements, antecedents, rgpd, profilActivite, onCompletionChange]);

  // ── Calcul IMC ──────────────────────────────────────────────────
  const t = Number(form.taille), p = Number(form.poids);
  const imc = t > 0 && p > 0 ? Math.round((p / ((t / 100) ** 2)) * 10) / 10 : null;
  const imcCat = imc ? getCategorieIMC(imc) : null;

  // ── IBAN validation ──────────────────────────────────────────────
  const ibanClean = form.iban.replace(/\s/g, '');
  const ibanValide = ibanClean.length === 0 || validerIBAN(ibanClean);

  const emailPraticien = (() => {
    try { return JSON.parse(localStorage.getItem('settings_praticien') || '{}').email || 'votre email professionnel'; }
    catch { return 'votre email professionnel'; }
  })();

  const showAll = step === undefined;
  const Wrapper = showAll ? 'form' : 'div';
  const wrapperProps = showAll ? { onSubmit: handleSubmit } : {};

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <Wrapper {...wrapperProps} className="space-y-6">

      {(showAll || step === 1) && <>
      {/* ── IDENTITÉ ── */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={CLS_LABEL}>Prénom *</label>
          <input name="prenom" value={form.prenom} onChange={handleChange} required placeholder="Jean" className={CLS_INPUT} />
        </div>
        <div>
          <label className={CLS_LABEL}>Nom *</label>
          <input name="nom" value={form.nom} onChange={handleChange} required placeholder="Dupont" className={CLS_INPUT} />
        </div>
      </div>
      <div>
        <label className={CLS_LABEL}>Nom de naissance <span className="text-gray-400 font-normal">(jeune fille, optionnel)</span></label>
        <input name="nomNaissance" value={form.nomNaissance} onChange={handleChange}
          placeholder="Martin" className={CLS_INPUT} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={CLS_LABEL}>Date de naissance *</label>
          <input type="date" name="dateNaissance" value={form.dateNaissance} onChange={handleChange} required className={CLS_INPUT} />
        </div>
        <div>
          <label className={CLS_LABEL}>Date d'entrée *</label>
          <input type="date" name="dateCreation" value={form.dateCreation} onChange={handleChange} required className={CLS_INPUT} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={CLS_LABEL}>Ville de naissance <span className="text-gray-400 font-normal">(optionnel)</span></label>
          <input name="villeNaissance" value={form.villeNaissance} onChange={handleChange}
            placeholder="Nantes" className={CLS_INPUT} />
        </div>
        <div>
          <label className={CLS_LABEL}>Code postal de naissance <span className="text-gray-400 font-normal">(optionnel)</span></label>
          <input name="codePostalNaissance" value={form.codePostalNaissance} onChange={handleChange}
            placeholder="44000" className={CLS_INPUT} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={CLS_LABEL}>Email</label>
          <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="jean@email.com" className={CLS_INPUT} />
        </div>
        <div>
          <label className={CLS_LABEL}>Téléphone</label>
          <input name="telephone" value={form.telephone} onChange={handleChange} placeholder="06 12 34 56 78" className={CLS_INPUT} />
        </div>
      </div>

      {/* ── MORPHOLOGIE + IMC ── */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={CLS_LABEL}>Taille (cm)</label>
          <input type="number" name="taille" value={form.taille} onChange={handleChange}
            placeholder="165" min={100} max={220} className={CLS_INPUT} />
        </div>
        <div>
          <label className={CLS_LABEL}>Poids (kg)</label>
          <input type="number" name="poids" value={form.poids} onChange={handleChange}
            placeholder="70" min={30} max={250} className={CLS_INPUT} />
        </div>
      </div>
      {imc !== null && imcCat && (
        <div className="flex items-center gap-2.5 -mt-2">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
            style={{ background: `${imcCat.couleur}18`, color: imcCat.couleur, border: `1px solid ${imcCat.couleur}30` }}
          >
            IMC {imc} — {imcCat.label}
          </span>
        </div>
      )}

      {/* ── ADRESSE ── */}
      <div>
        <label className={CLS_LABEL}>Adresse domicile <span className="text-gray-400 font-normal">(pour la carte patients)</span></label>
        <input name="adresseRue" value={form.adresseRue} onChange={handleChange}
          placeholder="12 rue des Lilas" className={`${CLS_INPUT} mb-2`} />
        <div className="grid grid-cols-3 gap-2">
          <input name="adresseCodePostal" value={form.adresseCodePostal} onChange={handleChange}
            placeholder="75013"
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary" />
          <input name="adresseVille" value={form.adresseVille} onChange={handleChange}
            placeholder="Paris"
            className="col-span-2 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary" />
        </div>
      </div>
      </>}

      {(showAll || step === 4) && <>
      {/* ── SAP — COORDONNÉES BANCAIRES ── */}
      <div className="border border-yellow-200 rounded-2xl overflow-hidden">
        <div className="bg-yellow-50 px-4 py-3 flex items-center gap-2.5">
          <span className="text-lg">🏦</span>
          <div>
            <div className="font-semibold text-dark text-sm">Coordonnées bancaires — Service à la Personne</div>
            <div className="text-xs text-gray-500">Pour les attestations fiscales SAP</div>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
            ⚠️ Ces informations sont nécessaires pour établir les attestations fiscales SAP. Elles sont stockées uniquement sur votre appareil.
          </div>

          <div>
            <label className={CLS_LABEL}>IBAN</label>
            <input
              name="iban"
              value={formatIBAN(form.iban)}
              onChange={e => setForm(f => ({ ...f, iban: e.target.value.replace(/\s/g, '').toUpperCase() }))}
              placeholder="FR76 3000 6000 0112 3456 7890 189"
              maxLength={42}
              className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 font-mono tracking-wide ${
                ibanClean && !ibanValide
                  ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                  : 'border-gray-200 focus:border-primary focus:ring-primary/10'
              }`}
            />
            {ibanClean && !ibanValide && (
              <p className="text-xs text-red-500 mt-1">Format IBAN invalide</p>
            )}
            {ibanClean && ibanValide && (
              <p className="text-xs text-green-600 mt-1">✓ IBAN valide</p>
            )}
          </div>

          <div>
            <label className={CLS_LABEL}>BIC / SWIFT</label>
            <input
              name="bic"
              value={form.bic}
              onChange={e => setForm(f => ({ ...f, bic: e.target.value.toUpperCase() }))}
              placeholder="BNPAFRPPXXX"
              maxLength={11}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 font-mono tracking-wide"
            />
          </div>
        </div>
      </div>

      {/* ── RATTACHEMENT STRUCTURE ── */}
      {structures.length > 0 && (
        <div className="border border-gray-100 rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-slate-50 to-blue-50 px-4 py-3 flex items-center gap-2.5 border-b border-gray-100">
            <span className="text-lg">🏢</span>
            <div>
              <div className="font-semibold text-dark text-sm">Rattachement</div>
              <div className="text-xs text-gray-500">Patient indépendant ou rattaché à une structure</div>
            </div>
          </div>
          <div className="p-4">
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="rattachement" checked={!structureId} onChange={() => setStructureId(undefined)} className="accent-primary" />
                <span className="text-sm text-gray-700">Patient indépendant</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="rattachement" checked={!!structureId} onChange={() => setStructureId(structures[0]?.id)} className="accent-primary" />
                <span className="text-sm text-gray-700">Rattaché à une structure</span>
              </label>
              {structureId && (
                <select
                  value={structureId}
                  onChange={e => setStructureId(e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
                >
                  {structures.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
                </select>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── OBJECTIFS ── */}
      <div className="border border-gray-100 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-teal-50 to-cyan-50 px-4 py-3 flex items-center gap-2.5 border-b border-gray-100">
          <span className="text-lg">🎯</span>
          <div>
            <div className="font-semibold text-dark text-sm">Objectifs</div>
            <div className="text-xs text-gray-500">Ce que le patient souhaite atteindre</div>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <ChoixMultiple
            label="Objectifs du patient"
            options={OPTIONS_OBJECTIFS_PATIENT}
            value={profilActivite.objectifsPatient}
            onChange={v => setProfilActivite(p => ({ ...p, objectifsPatient: v }))}
            avecChampLibre
          />
        </div>
      </div>

      {/* ── ORGANISATION DES SÉANCES ── */}
      <div className="border border-gray-100 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-fuchsia-50 to-pink-50 px-4 py-3 flex items-center gap-2.5 border-b border-gray-100">
          <span className="text-lg">📅</span>
          <div>
            <div className="font-semibold text-dark text-sm">Organisation des séances</div>
            <div className="text-xs text-gray-500">Disponibilités et préférences pour planifier les séances</div>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <ChoixMultiple
            label="Jour(s) disponible(s)"
            options={OPTIONS_JOURS_DISPONIBLES}
            value={anamnese.organisation?.joursDisponibles ?? []}
            onChange={v => setAnamnese(a => ({ ...a, organisation: { ...a.organisation, joursDisponibles: v } }))}
          />
          <div>
            <label className={CLS_LABEL}>Créneaux horaires par jour</label>
            <CreneauxParJourForm
              jours={anamnese.organisation?.joursDisponibles ?? []}
              value={anamnese.organisation?.creneauxParJour ?? {}}
              onChange={v => setAnamnese(a => ({ ...a, organisation: { ...a.organisation, creneauxParJour: v } }))}
            />
          </div>
          <ChoixUnique
            label="Durée habituelle"
            options={OPTIONS_DUREE_SEANCE}
            value={anamnese.organisation?.dureeSeance}
            onChange={v => setAnamnese(a => ({ ...a, organisation: { ...a.organisation, dureeSeance: v } }))}
          />
          <div>
            <label className={CLS_LABEL}>Contraintes particulières</label>
            <textarea
              value={anamnese.organisation?.contraintes ?? ''}
              onChange={e => setAnamnese(a => ({ ...a, organisation: { ...a.organisation, contraintes: e.target.value } }))}
              placeholder="Jamais avant 9h, accompagné le lundi..."
              rows={2}
              className={CLS_INPUT}
            />
          </div>
          <div>
            <label className={CLS_LABEL}>Nombre de séances par semaine *</label>
            <div className="flex gap-2 flex-wrap">
              {FREQUENCES_SEANCES.map(n => {
                const selected = anamnese.organisation?.nbSeancesSemaine === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setErreurOrganisation(null);
                      setAnamnese(a => {
                        const prevDurees = a.organisation?.dureesSeances ?? [];
                        const dureesSeances = Array.from({ length: n }, (_, i) => prevDurees[i] ?? 45);
                        return { ...a, organisation: { ...a.organisation, nbSeancesSemaine: n, dureesSeances } };
                      });
                    }}
                    className="px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors"
                    style={{
                      borderColor: selected ? '#1A5F9E' : '#E2EEF9',
                      background: selected ? '#1A5F9E' : 'white',
                      color: selected ? 'white' : '#4A6080',
                    }}
                  >
                    {n}×
                  </button>
                );
              })}
            </div>
            {erreurOrganisation && (
              <p className="text-xs text-red-500 mt-1.5">{erreurOrganisation}</p>
            )}
          </div>
          {!!anamnese.organisation?.nbSeancesSemaine && (
            <div>
              <label className={CLS_LABEL}>Durée souhaitée par séance</label>
              <div className="grid grid-cols-2 gap-4">
                {(anamnese.organisation?.dureesSeances ?? []).map((duree, i) => (
                  <div key={i}>
                    <label className="block text-xs text-gray-500 mb-1.5">Séance {i + 1}</label>
                    <select
                      value={duree}
                      onChange={e => setAnamnese(a => ({
                        ...a,
                        organisation: {
                          ...a.organisation,
                          dureesSeances: (a.organisation?.dureesSeances ?? []).map((d, j) => j === i ? Number(e.target.value) : d),
                        },
                      }))}
                      className={CLS_INPUT}
                    >
                      {OPTIONS_DUREE_SEANCE_MIN.map(d => (
                        <option key={d} value={d}>{d} min</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      </>}

      {(showAll || step === 2) && <>
      {/* ── ÉTAT DE SANTÉ GÉNÉRAL ── */}
      <div className="border border-gray-100 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-rose-50 to-orange-50 px-4 py-3 flex items-center gap-2.5 border-b border-gray-100">
          <span className="text-lg">🩺</span>
          <div>
            <div className="font-semibold text-dark text-sm">État de santé général</div>
            <div className="text-xs text-gray-500">Ressenti au quotidien du patient</div>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <Echelle10
            label="Douleur quotidienne (0-10)"
            value={anamnese.douleurQuotidienne}
            onChange={n => setAnamnese(a => ({ ...a, douleurQuotidienne: n }))}
          />
          <Echelle10
            label="Fatigue quotidienne (0-10)"
            value={anamnese.fatigueQuotidienne}
            onChange={n => setAnamnese(a => ({ ...a, fatigueQuotidienne: n }))}
          />
          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-700">Contre-indications à l'effort physique ?</span>
              <ToggleOuiNon
                value={anamnese.contreIndications}
                onChange={v => setAnamnese(a => ({ ...a, contreIndications: v }))}
              />
            </div>
            {anamnese.contreIndications === 'oui' && (
              <textarea
                value={anamnese.contreIndicationsDetail ?? ''}
                onChange={e => setAnamnese(a => ({ ...a, contreIndicationsDetail: e.target.value }))}
                placeholder="FC max 130 bpm, éviter les impacts, pas de port de charges > 5 kg..."
                rows={2}
                className={`mt-2 ${CLS_INPUT}`}
              />
            )}
            <p className="text-xs text-gray-400 mt-1.5">Ces contre-indications seront affichées en alerte dans la fiche patient et tous les PDFs.</p>
          </div>
        </div>
      </div>

      {/* ── COGNITION & HUMEUR ── */}
      <div className="border border-gray-100 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-violet-50 to-indigo-50 px-4 py-3 flex items-center gap-2.5 border-b border-gray-100">
          <span className="text-lg">🧠</span>
          <div>
            <div className="font-semibold text-dark text-sm">Cognition & humeur</div>
            <div className="text-xs text-gray-500">Mémoire, suivi psychologique, motivation</div>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-700">Plaintes mémoire ?</span>
              <ToggleOuiNon
                value={anamnese.cognition?.plaintesMemoire}
                onChange={v => setAnamnese(a => ({ ...a, cognition: { ...a.cognition, plaintesMemoire: v } }))}
              />
            </div>
            {anamnese.cognition?.plaintesMemoire === 'oui' && (
              <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
                <ChoixOuTexte
                  label="Depuis quand ?"
                  options={OPTIONS_DEPUIS_QUAND}
                  value={anamnese.cognition?.plaintesMemoireDepuisQuand}
                  onChange={v => setAnamnese(a => ({ ...a, cognition: { ...a.cognition, plaintesMemoireDepuisQuand: v } }))}
                />
                <div>
                  <label className={CLS_LABEL}>Dans quel contexte ?</label>
                  <input
                    type="text"
                    value={anamnese.cognition?.plaintesMemoireContexte ?? ''}
                    onChange={e => setAnamnese(a => ({ ...a, cognition: { ...a.cognition, plaintesMemoireContexte: e.target.value } }))}
                    placeholder="Stress, fatigue, post-opératoire..."
                    className={CLS_INPUT}
                  />
                </div>
                <ChoixUnique
                  label="Plaintes signalées par"
                  options={OPTIONS_SIGNALE_PAR}
                  value={anamnese.cognition?.plaintesMemoireSignalePar}
                  onChange={v => setAnamnese(a => ({ ...a, cognition: { ...a.cognition, plaintesMemoireSignalePar: v } }))}
                />
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-700">Suivi psychologique ?</span>
              <ToggleOuiNon
                value={anamnese.cognition?.suiviPsy}
                onChange={v => setAnamnese(a => ({ ...a, cognition: { ...a.cognition, suiviPsy: v } }))}
              />
            </div>
            {anamnese.cognition?.suiviPsy === 'oui' && (
              <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
                <ChoixUnique
                  label="Par qui ?"
                  options={OPTIONS_SUIVI_PSY_QUI}
                  value={anamnese.cognition?.suiviPsyQui}
                  onChange={v => setAnamnese(a => ({ ...a, cognition: { ...a.cognition, suiviPsyQui: v } }))}
                />
                <div>
                  <label className={CLS_LABEL}>Où ?</label>
                  <input
                    type="text"
                    value={anamnese.cognition?.suiviPsyOu ?? ''}
                    onChange={e => setAnamnese(a => ({ ...a, cognition: { ...a.cognition, suiviPsyOu: e.target.value } }))}
                    placeholder="Cabinet, hôpital, téléconsultation..."
                    className={CLS_INPUT}
                  />
                </div>
                <div>
                  <label className={CLS_LABEL}>Pourquoi ?</label>
                  <input
                    type="text"
                    value={anamnese.cognition?.suiviPsyPourquoi ?? ''}
                    onChange={e => setAnamnese(a => ({ ...a, cognition: { ...a.cognition, suiviPsyPourquoi: e.target.value } }))}
                    placeholder="Anxiété, dépression, deuil, trauma, autre..."
                    className={CLS_INPUT}
                  />
                </div>
                <ChoixOuTexte
                  label="Depuis quand ?"
                  options={OPTIONS_DEPUIS_QUAND}
                  value={anamnese.cognition?.suiviPsyDepuisQuand}
                  onChange={v => setAnamnese(a => ({ ...a, cognition: { ...a.cognition, suiviPsyDepuisQuand: v } }))}
                />
                <ChoixUnique
                  label="Fréquence"
                  options={OPTIONS_SUIVI_PSY_FREQUENCE}
                  value={anamnese.cognition?.suiviPsyFrequence}
                  onChange={v => setAnamnese(a => ({ ...a, cognition: { ...a.cognition, suiviPsyFrequence: v } }))}
                />
              </div>
            )}
          </div>

          <ChoixUnique
            label="Pourquoi le patient est-il là aujourd'hui ?"
            options={OPTIONS_ORIGINE_DEMARCHE}
            value={anamnese.cognition?.origineDemarche}
            onChange={v => setAnamnese(a => ({ ...a, cognition: { ...a.cognition, origineDemarche: v } }))}
          />
          <p className="text-xs text-gray-400 -mt-2">La motivation intrinsèque influence l'implication dans le suivi</p>
        </div>
      </div>

      {/* ── TRAITEMENTS ── */}
      <div className="border border-gray-100 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-amber-50 to-yellow-50 px-4 py-3 flex items-center gap-2.5 border-b border-gray-100">
          <span className="text-lg">💊</span>
          <div>
            <div className="font-semibold text-dark text-sm">Traitements médicamenteux</div>
            <div className="text-xs text-gray-500">Nom · Dose · Effet secondaire notable</div>
          </div>
        </div>
        <div className="p-4">
          <ListeTraitementsForm value={traitements} onChange={setTraitements} />
        </div>
      </div>

      {/* ── ANTÉCÉDENTS MÉDICAUX ── */}
      <div className="border border-gray-100 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-blue-50 to-slate-50 px-4 py-3 flex items-center gap-2.5 border-b border-gray-100">
          <span className="text-lg">🏥</span>
          <div>
            <div className="font-semibold text-dark text-sm">Antécédents médicaux</div>
            <div className="text-xs text-gray-500">Pathologies, chirurgies, fractures, prothèses, hospitalisations, accidents...</div>
          </div>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className={CLS_LABEL}>Allergies connues</label>
            <input name="allergies" value={form.allergies} onChange={handleChange}
              placeholder="Aspirine, latex..." className={CLS_INPUT} />
          </div>
          <ListeAntecedentsForm value={antecedents} onChange={setAntecedents} />
        </div>
      </div>

      {/* ── ANTÉCÉDENTS DE CHUTES ── */}
      <div className="border border-gray-100 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-red-50 to-orange-50 px-4 py-3 flex items-center gap-2.5 border-b border-gray-100">
          <span className="text-lg">⚠️</span>
          <div>
            <div className="font-semibold text-dark text-sm">Antécédents de chutes</div>
            <div className="text-xs text-gray-500">Nombre, période, circonstances...</div>
          </div>
        </div>
        <div className="p-4">
          <ChutesForm
            value={anamnese.chutes ?? {}}
            onChange={chutes => setAnamnese(a => ({ ...a, chutes }))}
          />
        </div>
      </div>
      </>}

      {(showAll || step === 3) && <>
      {/* ── AUTONOMIE & MODE DE VIE ── */}
      <div className="border border-gray-100 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-slate-50 to-blue-50 px-4 py-3 flex items-center gap-2.5 border-b border-gray-100">
          <span className="text-lg">🏠</span>
          <div>
            <div className="font-semibold text-dark text-sm">Autonomie & mode de vie</div>
            <div className="text-xs text-gray-500">Situation, aides, évaluation GIR</div>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <ChoixUnique
            label="Situation de vie"
            options={OPTIONS_SITUATION_VIE}
            value={anamnese.autonomie?.situationVie}
            onChange={v => setAnamnese(a => ({ ...a, autonomie: { ...a.autonomie, situationVie: v } }))}
          />
          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-700">Aide à domicile ?</span>
              <ToggleOuiNon
                value={anamnese.autonomie?.aideADomicile}
                onChange={v => setAnamnese(a => ({ ...a, autonomie: { ...a.autonomie, aideADomicile: v } }))}
              />
            </div>
            {anamnese.autonomie?.aideADomicile === 'oui' && (
              <div className="mt-2 space-y-3">
                <ChoixMultiple
                  label="Type d'aide"
                  options={OPTIONS_TYPE_AIDE_DOMICILE}
                  value={anamnese.autonomie?.aideADomicileTypes ?? []}
                  onChange={v => setAnamnese(a => ({ ...a, autonomie: { ...a.autonomie, aideADomicileTypes: v } }))}
                  avecChampLibre
                  placeholderCustom="Type d'aide personnalisé..."
                />
                <ChoixUnique
                  label="Fréquence"
                  options={OPTIONS_FREQUENCE_AIDE}
                  value={anamnese.autonomie?.aideADomicileFrequence}
                  onChange={v => setAnamnese(a => ({ ...a, autonomie: { ...a.autonomie, aideADomicileFrequence: v } }))}
                />
                <div>
                  <label className={CLS_LABEL}>Nombre d'heures / semaine</label>
                  <input
                    type="number"
                    value={anamnese.autonomie?.aideADomicileHeures ?? ''}
                    onChange={e => setAnamnese(a => ({ ...a, autonomie: { ...a.autonomie, aideADomicileHeures: e.target.value === '' ? null : Number(e.target.value) } }))}
                    className={NUM_INPUT_CLS}
                  />
                </div>
              </div>
            )}
          </div>
          <ChoixUnique
            label="Aide à la marche"
            options={OPTIONS_AIDE_MARCHE}
            value={anamnese.autonomie?.aideMarche}
            onChange={v => setAnamnese(a => ({ ...a, autonomie: { ...a.autonomie, aideMarche: v } }))}
          />
          <div className="border-t border-gray-100 pt-3">
            <label className={CLS_LABEL}>Évaluation GIR (Grille AGGIR)</label>
            <GIRWidget
              value={anamnese.autonomie?.gir ?? null}
              onChange={gir => setAnamnese(a => ({ ...a, autonomie: { ...a.autonomie, gir } }))}
            />
          </div>
        </div>
      </div>

      {/* ── HABITUDES DE VIE ── */}
      <div className="border border-gray-100 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-3 flex items-center gap-2.5 border-b border-gray-100">
          <span className="text-lg">🍽️</span>
          <div>
            <div className="font-semibold text-dark text-sm">Habitudes de vie</div>
            <div className="text-xs text-gray-500">Alimentation, sommeil, énergie</div>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <ChoixUnique
              label="Nombre de repas par jour"
              options={OPTIONS_REPAS}
              value={anamnese.habitudesVie?.nombreRepas}
              onChange={v => setAnamnese(a => ({ ...a, habitudesVie: { ...a.habitudesVie, nombreRepas: v } }))}
            />
            <ChoixUnique
              label="Hydratation estimée"
              options={OPTIONS_HYDRATATION}
              value={anamnese.habitudesVie?.hydratation}
              onChange={v => setAnamnese(a => ({ ...a, habitudesVie: { ...a.habitudesVie, hydratation: v } }))}
            />
          </div>
          <Echelle5
            label="Qualité du sommeil (1-5)"
            value={anamnese.habitudesVie?.qualiteSommeil}
            onChange={n => setAnamnese(a => ({ ...a, habitudesVie: { ...a.habitudesVie, qualiteSommeil: n } }))}
          />
          <div>
            <label className={CLS_LABEL}>Heures de sommeil / nuit</label>
            <input
              type="number"
              value={anamnese.habitudesVie?.heuresSommeil ?? ''}
              onChange={e => setAnamnese(a => ({ ...a, habitudesVie: { ...a.habitudesVie, heuresSommeil: e.target.value === '' ? null : Number(e.target.value) } }))}
              className={NUM_INPUT_CLS}
            />
          </div>
          <Echelle5
            label="Niveau d'appétit (1-5)"
            value={anamnese.habitudesVie?.niveauAppetit}
            onChange={n => setAnamnese(a => ({ ...a, habitudesVie: { ...a.habitudesVie, niveauAppetit: n } }))}
          />
          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-700">Variation de poids involontaire ?</span>
              <ToggleOuiNon
                value={anamnese.habitudesVie?.variationPoids}
                onChange={v => setAnamnese(a => ({ ...a, habitudesVie: { ...a.habitudesVie, variationPoids: v } }))}
              />
            </div>
            {anamnese.habitudesVie?.variationPoids === 'oui' && (
              <div className="mt-2">
                <label className={CLS_LABEL}>Combien de kg ?</label>
                <input
                  type="number"
                  value={anamnese.habitudesVie?.variationPoidsKg ?? ''}
                  onChange={e => setAnamnese(a => ({ ...a, habitudesVie: { ...a.habitudesVie, variationPoidsKg: e.target.value === '' ? null : Number(e.target.value) } }))}
                  className={NUM_INPUT_CLS}
                />
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-700">Tabagisme ?</span>
              <ToggleOuiNon
                value={anamnese.habitudesVie?.tabagisme}
                onChange={v => setAnamnese(a => ({ ...a, habitudesVie: { ...a.habitudesVie, tabagisme: v } }))}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1.5">Aide à comprendre l'essoufflement à l'effort</p>
          </div>
        </div>
      </div>

      {/* ── ACTIVITÉ PHYSIQUE ACTUELLE ── */}
      <div className="border border-gray-100 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-cyan-50 to-sky-50 px-4 py-3 flex items-center gap-2.5 border-b border-gray-100">
          <span className="text-lg">🏃</span>
          <div>
            <div className="font-semibold text-dark text-sm">Activité physique actuelle</div>
            <div className="text-xs text-gray-500">Habitudes sportives passées et présentes</div>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <ChoixMultiple
            label="Activités pratiquées actuellement"
            options={OPTIONS_ACTIVITES}
            value={anamnese.activitePhysique?.activitesActuelles ?? []}
            onChange={v => setAnamnese(a => ({ ...a, activitePhysique: { ...a.activitePhysique, activitesActuelles: v } }))}
            avecChampLibre
          />
          <ActivitesPrecedentesForm
            value={anamnese.activitePhysique?.activitesPrecedentes ?? []}
            onChange={v => setAnamnese(a => ({ ...a, activitePhysique: { ...a.activitePhysique, activitesPrecedentes: v } }))}
          />
        </div>
      </div>

      <SectionSedentarite
        value={anamnese.sedentariteReponses ?? EMPTY_SED}
        onChange={setSedData}
      />
      <SectionFatigue
        value={anamnese.fatigueReponses ?? Array(9).fill(null)}
        onChange={setFSSData}
      />
      </>}

      {(showAll || step === 5) && <>
      {!showAll && (
        <div className="border border-gray-100 rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-teal-50 to-cyan-50 px-4 py-3 flex items-center gap-2.5 border-b border-gray-100">
            <span className="text-lg">📋</span>
            <div>
              <div className="font-semibold text-dark text-sm">Récapitulatif</div>
              <div className="text-xs text-gray-500">Vérifiez les informations avant de créer la fiche</div>
            </div>
          </div>
          <div className="p-4 space-y-3 text-sm text-gray-600">
            <p><span className="font-medium text-gray-700">Identité :</span> {form.prenom || '—'} {form.nom || '—'}{form.dateNaissance ? ` · né(e) le ${new Date(form.dateNaissance).toLocaleDateString('fr-FR')}` : ''}</p>
            {(form.email || form.telephone) && (
              <p><span className="font-medium text-gray-700">Contact :</span> {[form.email, form.telephone].filter(Boolean).join(' · ')}</p>
            )}
            {(form.adresseRue || form.adresseVille) && (
              <p><span className="font-medium text-gray-700">Adresse :</span> {[form.adresseRue, form.adresseCodePostal, form.adresseVille].filter(Boolean).join(' ')}</p>
            )}
            {imc !== null && imcCat && (
              <p><span className="font-medium text-gray-700">IMC :</span> {imc} — {imcCat.label}</p>
            )}
            <p><span className="font-medium text-gray-700">Traitements :</span> {traitements.length > 0 ? `${traitements.length} renseigné(s)` : 'aucun'}</p>
            <p><span className="font-medium text-gray-700">Antécédents médicaux :</span> {antecedents.length > 0 ? `${antecedents.length} renseigné(s)` : 'aucun'}</p>
            {anamnese.contreIndications === 'oui' && (
              <p className="text-red-600"><span className="font-medium">⚠️ Contre-indications :</span> {anamnese.contreIndicationsDetail || 'oui (détail non précisé)'}</p>
            )}
            {anamnese.chutes?.aChutes === 'oui' && (
              <p><span className="font-medium text-gray-700">Chutes :</span> oui — {anamnese.chutes.chutesDetail?.length ?? 0} chute(s)</p>
            )}
            {structureId && (
              <p><span className="font-medium text-gray-700">Structure :</span> {structures.find(s => s.id === structureId)?.nom ?? '—'}</p>
            )}
          </div>
        </div>
      )}

      {/* ── RGPD + DROIT À L'IMAGE ── */}
      <div className="border border-blue-100 rounded-2xl overflow-hidden">
        <div className="bg-blue-50 px-4 py-3 flex items-center gap-2.5">
          <span className="text-lg">🔒</span>
          <div>
            <div className="font-semibold text-dark text-sm">Consentement &amp; protection des données</div>
            <div className="text-xs text-gray-500">Conformément au RGPD</div>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-600 leading-relaxed">
            <div className="font-semibold text-gray-700 mb-1.5">📋 À lire au patient</div>
            <p>"Dans le cadre de votre suivi en APA, je collecte vos données personnelles et de santé. Utilisées uniquement pour votre suivi. Droits d'accès, rectification, effacement : <strong>{emailPraticien}</strong>"</p>
          </div>
          <div className="space-y-2.5">
            {([
              { key: 'consentementObtenu', label: 'Le patient a été informé et a consenti' },
              { key: 'droitAcces',         label: "Droit d'accès expliqué" },
              { key: 'droitRectification', label: 'Droit de rectification expliqué' },
              { key: 'droitEffacement',    label: "Droit à l'effacement expliqué" },
            ] as const).map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-700 select-none">
                <input type="checkbox" checked={rgpd[key]} className="w-4 h-4 accent-primary"
                  onChange={e => setRgpd(r => ({ ...r, [key]: e.target.checked }))} />
                {label}
              </label>
            ))}
            {/* Droit à l'image */}
            <label className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-700 select-none">
              <input type="checkbox" checked={droitImage} className="w-4 h-4 accent-primary"
                onChange={e => setDroitImage(e.target.checked)} />
              Droit à l'image accordé (photos/vidéos en séance)
            </label>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-600 mb-2">Mode de recueil</div>
            <div className="flex gap-2">
              {(['oral_note', 'ecrit', 'numerique'] as const).map(m => (
                <button key={m} type="button" onClick={() => setRgpd(r => ({ ...r, methodeConsentement: m }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    rgpd.methodeConsentement === m ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200'
                  }`}>
                  {m === 'oral_note' ? 'Oral noté' : m === 'ecrit' ? 'Écrit' : 'Numérique'}
                </button>
              ))}
            </div>
          </div>
          {!rgpd.consentementObtenu && (
            <p className="text-xs text-warning font-medium">⚠️ Sans consentement, les données de santé ne peuvent pas être collectées légalement.</p>
          )}
        </div>
      </div>

      </>}

      {showAll && (
        <div className="flex gap-3 pt-2">
          <button type="submit"
            className="flex-1 bg-primary text-white rounded-xl py-2.5 font-semibold flex items-center justify-center gap-2 hover:bg-dark transition-colors">
            <Save size={16} />
            Enregistrer
          </button>
          <button type="button" onClick={onCancel}
            className="px-5 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-2">
            <X size={16} />
            Annuler
          </button>
        </div>
      )}
    </Wrapper>
  );
});

export default ParticipantForm;
