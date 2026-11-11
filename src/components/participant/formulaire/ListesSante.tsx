import { useState } from 'react';
import type { TraitementPatient, AntecedentMedical, TypeAntecedent, MomentPrise } from '../../../types';
import { TYPES_ANTECEDENT_LABELS, MOMENTS_PRISE_LABELS } from '../../../types';
import { CLS_CELL, genId } from './communs';

export const FREQUENCES_TRAITEMENT = ['1x/jour', '2x/jour', '3x/jour', 'À la demande', 'Autre'];
export const MOMENTS_PRISE: MomentPrise[] = ['matin', 'midi', 'soir', 'nuit', 'avant_repas', 'apres_repas'];

export function ListeTraitementsForm({
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

export const TYPES_ANTECEDENT: TypeAntecedent[] = [
  'pathologie_chronique', 'chirurgie', 'fracture', 'prothese', 'hospitalisation', 'accident', 'autre',
];

export function ListeAntecedentsForm({
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
