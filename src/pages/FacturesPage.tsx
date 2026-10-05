import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import PageWrapper from '../components/layout/PageWrapper';
import { useFacturesValidees } from '../hooks/useFacturesAValider';
import { formaterDate, formaterEuro, libellePeriode } from '../lib/facturesAValider';

// Factures validées (numérotées, verrouillées) : liste volontairement minimale (facturation,
// étape 3). Elle sert de destination à « Les retrouver » après une validation. Le détail d'une
// facture, le PDF et l'envoi par e-mail viennent à l'étape suivante.

const STATUTS: Record<string, { libelle: string; classe: string }> = {
  validee: { libelle: 'Validée', classe: 'bg-emerald-50 text-emerald-700' },
  envoyee: { libelle: 'Envoyée', classe: 'bg-blue-50 text-blue-700' },
  payee: { libelle: 'Payée', classe: 'bg-green-100 text-green-800' },
  en_retard: { libelle: 'En retard', classe: 'bg-red-50 text-red-700' },
  annulee: { libelle: 'Annulée', classe: 'bg-gray-100 text-gray-600' },
};

export default function FacturesPage() {
  const { factures, chargement, erreur } = useFacturesValidees();

  return (
    <PageWrapper>
      <div className="mb-5">
        <Link to="/factures/a-valider" className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-700 text-sm font-medium mb-2">
          <ArrowLeft size={16} /> Factures à valider
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">Factures validées</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {chargement ? 'Chargement…' : `${factures.length} facture${factures.length > 1 ? 's' : ''}`}
          {' '}· le PDF et l'envoi par e-mail arrivent à l'étape suivante
        </p>
      </div>

      {erreur && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 mb-4 text-sm text-red-800">
          Impossible de charger les factures : {erreur}
        </div>
      )}

      {!chargement && !erreur && factures.length === 0 && (
        <div data-testid="aucune-facture-validee" className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-500">
          Aucune facture validée pour l'instant.
        </div>
      )}

      {factures.length > 0 && (
        <ul className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          {factures.map(f => {
            const statut = STATUTS[f.statut] ?? { libelle: f.statut, classe: 'bg-gray-100 text-gray-600' };
            return (
              <li key={f.id} data-testid="facture-validee" className="flex items-start justify-between gap-3 p-4 text-sm">
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900" data-testid="numero-facture">{f.numero}</div>
                  <div className="text-gray-700">{`${f.beneficiaire.prenom} ${f.beneficiaire.nom}`.trim()}</div>
                  <div className="text-xs text-gray-400">{libellePeriode(f.periode)} · émise le {formaterDate(f.dateEmission)}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-semibold text-gray-900 tabular-nums">{formaterEuro(f.total)}</div>
                  <span className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${statut.classe}`}>{statut.libelle}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PageWrapper>
  );
}
