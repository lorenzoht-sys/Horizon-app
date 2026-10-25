import type { CategorieSeance } from '../../types';

// Sélecteur « Type de séance » : les catégories du praticien, avec la pastille de leur couleur.
// Valeur vide = aucune catégorie (couleur par défaut de l'agenda). `onGerer` ouvre la gestion des
// catégories (créer / renommer / recolorer / supprimer) sans quitter le formulaire.
export default function SelecteurCategorie({ categories, valeur, onChange, onGerer }: {
  categories: CategorieSeance[];
  valeur: string;
  onChange: (categorieId: string) => void;
  onGerer?: () => void;
}) {
  const choisie = categories.find(c => c.id === valeur);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs text-gray-500">Type de séance</label>
        {onGerer && (
          <button type="button" onClick={onGerer} className="text-xs font-semibold text-primary hover:underline">
            {categories.length === 0 ? '+ Créer une catégorie' : 'Gérer'}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="w-4 h-4 rounded-full flex-shrink-0 border border-black/10"
          style={{ background: choisie?.couleur ?? 'transparent' }}
        />
        <select value={valeur} onChange={e => onChange(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary">
          <option value="">— Aucune catégorie —</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
      </div>
    </div>
  );
}
