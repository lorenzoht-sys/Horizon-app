import { ChevronDown, ChevronUp } from 'lucide-react';
import { deplacer, sansEmoji } from '../../../lib/formulaireBeneficiaire';

// Classement par petites flèches plutôt que glisser-déposer (compte rendu de
// Pierre, 25/11/2026) : utilisable au doigt sur tablette, au clavier, et sans
// dépendance supplémentaire. L'ordre de la liste EST le classement : rien
// d'autre n'est enregistré.

export function ListeOrdonnee({
  titre,
  aide,
  value,
  onChange,
  etiquettePremier,
  etiquetteSuivants,
}: {
  titre: string;
  aide?: string;
  value: string[];
  onChange: (v: string[]) => void;
  /** Mention à côté du premier élément (ex. « principale »). */
  etiquettePremier?: string;
  /** Mention des suivants (ex. « ponctuelle »). */
  etiquetteSuivants?: string;
}) {
  const items = value.filter(v => v.trim() !== '');
  if (items.length < 2) return null;

  return (
    <div className="rounded-xl p-3" style={{ background: '#F6FAFA', border: '1px solid #E2EEEE' }}>
      <div className="text-xs font-semibold mb-0.5" style={{ color: 'var(--color-ink)' }}>{titre}</div>
      {aide && <p className="text-xs mb-2" style={{ color: 'var(--color-ink-2)' }}>{aide}</p>}
      <ol className="space-y-1.5">
        {items.map((item, i) => (
          <li key={`${item}-${i}`} className="flex items-center gap-2 bg-white rounded-lg px-2.5 py-1.5" style={{ border: '1px solid #E2EEEE' }}>
            <span className="w-5 text-xs font-bold text-center" style={{ color: 'var(--color-ink-2)' }}>{i + 1}</span>
            <span className="flex-1 text-sm" style={{ color: 'var(--color-ink)' }}>
              {sansEmoji(item)}
              {i === 0 && etiquettePremier && <span className="ml-2 text-xs" style={{ color: '#147A64' }}>{etiquettePremier}</span>}
              {i > 0 && etiquetteSuivants && <span className="ml-2 text-xs" style={{ color: 'var(--color-ink-2)' }}>{etiquetteSuivants}</span>}
            </span>
            <button type="button" aria-label={`Monter ${sansEmoji(item)}`} disabled={i === 0}
              onClick={() => onChange(deplacer(items, i, -1))}
              className="p-1 rounded text-gray-500 hover:text-primary hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent">
              <ChevronUp size={16} />
            </button>
            <button type="button" aria-label={`Descendre ${sansEmoji(item)}`} disabled={i === items.length - 1}
              onClick={() => onChange(deplacer(items, i, 1))}
              className="p-1 rounded text-gray-500 hover:text-primary hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent">
              <ChevronDown size={16} />
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
