import type { ContactSante } from '../../../types';
import { CLS_CELL, CLS_LABEL } from './communs';

// ─── CONTACTS SANTÉ (médecin traitant, kiné...) — Aide à domicile ──────────────

export const OPTIONS_PROFESSION_SANTE = ['Médecin traitant', 'Kinésithérapeute', 'Infirmier(e)', 'Autre'];

export function ContactsSanteForm({
  value,
  onChange,
}: {
  value: ContactSante[];
  onChange: (v: ContactSante[]) => void;
}) {
  const items = value ?? [];

  const upd = (idx: number, patch: Partial<ContactSante>) =>
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const removeAt = (idx: number) => onChange(items.filter((_, i) => i !== idx));

  const add = () => onChange([...items, { profession: '', nom: '' }]);

  return (
    <div>
      <label className={CLS_LABEL}>Professionnels de santé à contacter</label>
      {items.map((item, idx) => (
        <div key={idx} className="border border-gray-100 rounded-xl p-3.5 mb-2 bg-gray-50">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="flex flex-wrap gap-1.5">
              {OPTIONS_PROFESSION_SANTE.map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => upd(idx, { profession: opt === 'Autre' ? '' : opt })}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    item.profession === opt || (opt === 'Autre' && item.profession && !OPTIONS_PROFESSION_SANTE.includes(item.profession))
                      ? 'bg-primary text-white border-primary'
                      : 'border-gray-200 text-gray-600 hover:border-primary/50 hover:bg-gray-50'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => removeAt(idx)} aria-label="Supprimer"
              className="text-gray-400 hover:text-red-500 p-1 text-base leading-none flex-shrink-0">✕</button>
          </div>
          {!OPTIONS_PROFESSION_SANTE.includes(item.profession) && (
            <input
              type="text"
              value={item.profession}
              onChange={e => upd(idx, { profession: e.target.value })}
              placeholder="Profession..."
              className={`w-full mb-2 ${CLS_CELL}`}
            />
          )}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input
              type="text"
              value={item.prenom ?? ''}
              onChange={e => upd(idx, { prenom: e.target.value })}
              placeholder="Prénom"
              className={`w-full ${CLS_CELL}`}
            />
            <input
              type="text"
              value={item.nom}
              onChange={e => upd(idx, { nom: e.target.value })}
              placeholder="Nom"
              className={`w-full ${CLS_CELL}`}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input
              type="tel"
              value={item.telephone ?? ''}
              onChange={e => upd(idx, { telephone: e.target.value })}
              placeholder="Téléphone"
              className={`w-full ${CLS_CELL}`}
            />
            <input
              type="email"
              value={item.email ?? ''}
              onChange={e => upd(idx, { email: e.target.value })}
              placeholder="Email"
              className={`w-full ${CLS_CELL}`}
            />
          </div>
          <textarea
            value={item.notes ?? ''}
            onChange={e => upd(idx, { notes: e.target.value })}
            placeholder="Notes (optionnel)"
            rows={2}
            className={`w-full ${CLS_CELL} resize-none`}
          />
        </div>
      ))}
      <button type="button" onClick={add}
        className="flex items-center gap-1.5 text-primary text-sm font-medium border border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 px-3 py-1.5 rounded-xl transition-colors">
        + Ajouter un contact
      </button>
    </div>
  );
}
