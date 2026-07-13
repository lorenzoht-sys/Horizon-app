// Bouton réutilisable "Suggérer une version plus motivante" — voir
// src/utils/reformulerMessageBeneficiaire.ts. Toujours une suggestion : ne
// s'applique jamais sans clic explicite, et propose un retour immédiat au
// texte d'origine si le praticien préfère sa version.

import { useState } from 'react';
import { Sparkles, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { suggererReformulation } from '../../utils/reformulerMessageBeneficiaire';

interface Props {
  /** Texte actuel du champ — jamais lu au montage, seulement au clic. */
  texte: string;
  /** Appelée uniquement sur clic explicite (suggestion ou annulation) —
   *  jamais automatiquement. */
  onReformule: (nouveauTexte: string) => void;
  disabled?: boolean;
  className?: string;
}

export default function BoutonReformulation({ texte, onReformule, disabled, className }: Props) {
  const [loading, setLoading] = useState(false);
  const [texteOriginal, setTexteOriginal] = useState<string | null>(null);

  async function handleSuggerer() {
    setLoading(true);
    try {
      const suggestion = await suggererReformulation(texte);
      setTexteOriginal(texte);
      onReformule(suggestion);
    } catch {
      // Le texte original reste inchangé dans le champ — aucun blocage de
      // la sauvegarde à cause d'un service externe en panne.
      toast.error('Impossible de générer une suggestion, réessayez.');
    } finally {
      setLoading(false);
    }
  }

  function handleAnnuler() {
    if (texteOriginal !== null) onReformule(texteOriginal);
    setTexteOriginal(null);
  }

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className ?? ''}`}>
      <button
        type="button"
        onClick={handleSuggerer}
        disabled={disabled || loading || !texte.trim()}
        className="flex items-center gap-1.5 text-xs bg-secondary/10 text-secondary hover:bg-secondary/20 px-3 py-1.5 rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Sparkles size={13} />
        {loading ? 'Génération…' : 'Suggérer une version plus motivante'}
      </button>
      {texteOriginal !== null && (
        <button
          type="button"
          onClick={handleAnnuler}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5"
        >
          <Undo2 size={12} /> Revenir au texte original
        </button>
      )}
    </div>
  );
}
