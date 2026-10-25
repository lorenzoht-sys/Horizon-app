import { useState } from 'react';
import { X, Trash2, Plus } from 'lucide-react';
import type { CategorieSeance } from '../../types';
import { COULEUR_CATEGORIE_PAR_DEFAUT } from '../../hooks/useCategoriesSeance';

// Gestion des catégories de séance : propres à chaque praticien, aucune n'est imposée.
// Une catégorie « Bilan » (cochée) est celle que les bilans automatiques utilisent.

const PALETTE = ['#8B5CF6', '#3B82F6', '#22C55E', '#F97316', '#EF4444', '#EC4899', '#14B8A6', '#6B7280'];

function Pastilles({ valeur, onChange, etiquette }: { valeur: string; onChange: (c: string) => void; etiquette: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={etiquette}>
      {PALETTE.map(c => (
        <button key={c} type="button" onClick={() => onChange(c)} aria-label={`Couleur ${c}`} aria-pressed={valeur.toLowerCase() === c.toLowerCase()}
          className="w-7 h-7 rounded-full border-2" style={{ background: c, borderColor: valeur.toLowerCase() === c.toLowerCase() ? '#0D2B2B' : 'transparent' }} />
      ))}
      <input type="color" value={valeur} onChange={e => onChange(e.target.value.toUpperCase())} aria-label="Couleur personnalisée"
        className="w-7 h-7 p-0 border border-gray-200 rounded-full bg-transparent" />
    </div>
  );
}

export default function ModalCategoriesSeance({ categories, onCreer, onModifier, onSupprimer, onDefinirBilan, onClose }: {
  categories: CategorieSeance[];
  onCreer: (nom: string, couleur: string) => Promise<unknown>;
  onModifier: (id: string, patch: { nom?: string; couleur?: string }) => Promise<unknown>;
  onSupprimer: (id: string) => Promise<unknown>;
  onDefinirBilan: (id: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const [nom, setNom] = useState('');
  const [couleur, setCouleur] = useState(PALETTE[0]);
  const [enCours, setEnCours] = useState(false);
  const [aSupprimer, setASupprimer] = useState<CategorieSeance | null>(null);

  async function creer() {
    if (!nom.trim()) return;
    setEnCours(true);
    try { await onCreer(nom, couleur); setNom(''); } finally { setEnCours(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 1030 }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-dark">Catégories de séance</h3>
          <button onClick={onClose} aria-label="Fermer" className="text-gray-400 hover:text-gray-600 p-1"><X size={16} /></button>
        </div>

        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          <p className="text-xs text-gray-500">
            Vos catégories, vos couleurs : Horizon n'en impose aucune. La couleur s'applique aux séances de l'agenda.
          </p>

          {categories.length === 0 && <p className="text-sm text-gray-400 text-center py-2">Aucune catégorie pour l'instant.</p>}

          {categories.map(c => (
            <div key={c.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: c.couleur }} aria-hidden="true" />
                <input type="text" defaultValue={c.nom} maxLength={60} aria-label={`Nom de la catégorie ${c.nom}`}
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== c.nom) void onModifier(c.id, { nom: v }); else e.target.value = c.nom; }}
                  className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-primary" />
                <button onClick={() => setASupprimer(c)} aria-label={`Supprimer ${c.nom}`} className="text-red p-1.5 rounded-lg hover:bg-red-light">
                  <Trash2 size={15} />
                </button>
              </div>
              <Pastilles valeur={c.couleur} etiquette={`Couleur de ${c.nom}`} onChange={col => void onModifier(c.id, { couleur: col })} />
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={c.estBilan} disabled={c.estBilan} onChange={() => void onDefinirBilan(c.id)} />
                Catégorie des bilans (utilisée par les bilans automatiques)
              </label>
            </div>
          ))}

          <div className="border border-dashed border-gray-300 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nouvelle catégorie</p>
            <input type="text" value={nom} onChange={e => setNom(e.target.value)} maxLength={60} placeholder="Ex. Bilan trimestriel"
              aria-label="Nom de la nouvelle catégorie"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            <Pastilles valeur={couleur || COULEUR_CATEGORIE_PAR_DEFAUT} etiquette="Couleur de la nouvelle catégorie" onChange={setCouleur} />
            <button onClick={creer} disabled={!nom.trim() || enCours}
              className="w-full flex items-center justify-center gap-1.5 bg-primary text-white rounded-xl py-2 text-sm font-semibold disabled:opacity-50">
              <Plus size={14} /> Ajouter
            </button>
          </div>
        </div>
      </div>

      {aSupprimer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 1040 }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <p className="text-sm text-dark font-medium mb-1">Supprimer « {aSupprimer.nom} » ?</p>
            <p className="text-xs text-gray-500 mb-4">Les séances de cette catégorie sont conservées ; elles reprennent la couleur par défaut.</p>
            <div className="flex gap-3">
              <button onClick={() => setASupprimer(null)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600">Annuler</button>
              <button onClick={async () => { await onSupprimer(aSupprimer.id); setASupprimer(null); }}
                className="flex-1 py-2 rounded-xl text-sm font-semibold bg-red text-white">Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
