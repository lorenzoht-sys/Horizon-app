import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useSuiviSeances } from '../../hooks/useSuiviSeances';
import { libelleMois } from '../../lib/chiffreAffaires';
import { estContratIncomplet, syntheseControle } from '../../lib/controleFacturation';

/**
 * Alerte en tête de « Factures à valider » (2026-11-19) : ce qui empêche la facturation du mois, sans
 * avoir à le chercher. Rien n'est affiché quand tout est en ordre.
 */
export default function BandeauControleMois({ mois }: { mois: string }) {
  const { lignes, aConfirmer, contrats, chargement, erreur } = useSuiviSeances(mois);
  const s = useMemo(() => syntheseControle(lignes, aConfirmer, contrats), [lignes, aConfirmer, contrats]);
  const incomplets = contrats.filter(estContratIncomplet).length;
  if (chargement || erreur || (s.bloques === 0 && s.seancesAConfirmer === 0 && incomplets === 0)) return null;

  const morceaux = [
    s.bloques > 0 ? `${s.bloques} dossier${s.bloques > 1 ? 's' : ''} bloqué${s.bloques > 1 ? 's' : ''}` : null,
    s.seancesAConfirmer > 0 ? `${s.seancesAConfirmer} séance${s.seancesAConfirmer > 1 ? 's' : ''} passée${s.seancesAConfirmer > 1 ? 's' : ''} à confirmer` : null,
    incomplets > 0 ? `${incomplets} contrat${incomplets > 1 ? 's' : ''} sans tarif complet` : null,
  ].filter(Boolean);

  return (
    <div role="status" data-testid={`bandeau-controle-${mois.slice(0, 7)}`}
      className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <span className="inline-flex items-center gap-2">
        <AlertTriangle size={16} className="shrink-0" />
        <span><strong>{libelleMois(mois)}</strong> : {morceaux.join(' · ')}.</span>
      </span>
      <Link to={`/factures/seances?mois=${mois}`} className="font-medium underline">Voir le contrôle du mois</Link>
    </div>
  );
}
