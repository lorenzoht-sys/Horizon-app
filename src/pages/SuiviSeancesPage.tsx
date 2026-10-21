import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import PageWrapper from '../components/layout/PageWrapper';
import { useSuiviSeances } from '../hooks/useSuiviSeances';
import { ajouterMois, libelleMois, moisCourantParis } from '../lib/chiffreAffaires';
import { LIBELLES_ETAT, LIBELLES_MOTIF, dateCourte, regrouper, type EtatSeance } from '../lib/suiviSeances';

// Suivi de la facturation des séances (/factures/seances, plan facturation PR 6) : pour un mois, chaque
// séance réalisée est facturée, en préparation, à corriger (avec le motif) ou non facturable (voulu).
// Lecture seule. Responsive d'emblée (une colonne, aucune barre fixe en bas), voir routesMobile.ts.

const COULEUR: Record<EtatSeance, string> = {
  a_facturer: 'bg-amber-50 text-amber-900 border-amber-200',
  en_preparation: 'bg-sky-50 text-sky-900 border-sky-200',
  facturee: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  non_facturable: 'bg-gray-50 text-gray-700 border-gray-200',
};

export default function SuiviSeancesPage() {
  const courant = useMemo(() => moisCourantParis(), []);
  const [mois, setMois] = useState(courant);
  const { lignes, noms, chargement, erreur } = useSuiviSeances(mois);
  const groupes = useMemo(() => regrouper(lignes), [lignes]);

  return (
    <PageWrapper>
      <div className="max-w-2xl">
        <Link to="/factures/a-valider" className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-700 text-sm font-medium mb-2">
          <ArrowLeft size={16} /> Factures à valider
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">Suivi des séances</h1>
        <p className="text-sm text-gray-500 mt-0.5">Les séances réalisées du mois et leur facturation.</p>

        <div className="flex items-center gap-2 mt-4">
          <button type="button" aria-label="Mois précédent" onClick={() => setMois(m => ajouterMois(m, -1))}
            className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50"><ChevronLeft size={16} /></button>
          <span className="text-sm font-semibold text-gray-800 min-w-[9rem] text-center" data-testid="suivi-mois">{libelleMois(mois)}</span>
          <button type="button" aria-label="Mois suivant" disabled={mois >= courant} onClick={() => setMois(m => ajouterMois(m, 1))}
            className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-40"><ChevronRight size={16} /></button>
        </div>

        {erreur && <div role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Lecture impossible : {erreur}</div>}
        {chargement && !erreur && <div className="mt-6 text-sm text-gray-400">Chargement…</div>}

        {!chargement && !erreur && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
              {groupes.map(g => (
                <div key={g.etat} className={`rounded-xl border px-3 py-2 ${COULEUR[g.etat]}`} data-testid={`compte-${g.etat}`}>
                  <div className="text-lg font-semibold">{g.lignes.length}</div>
                  <div className="text-xs">{LIBELLES_ETAT[g.etat]}</div>
                </div>
              ))}
            </div>

            {lignes.length === 0 && <p className="mt-6 text-sm text-gray-500">Aucune séance réalisée ce mois-ci.</p>}

            <div className="space-y-5 mt-5 pb-6">
              {groupes.filter(g => g.lignes.length > 0).map(g => (
                <section key={g.etat} data-testid={`groupe-${g.etat}`}>
                  <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">{LIBELLES_ETAT[g.etat]} ({g.lignes.length})</h2>
                  <ul className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
                    {g.lignes.map(l => (
                      <li key={l.seanceId} className="px-4 py-2.5 text-sm flex flex-wrap items-baseline justify-between gap-x-3">
                        <div className="min-w-0">
                          {l.participantId
                            ? <Link to={`/participant/${l.participantId}`} className="font-medium text-gray-800 hover:text-primary">{noms[l.participantId] ?? 'Bénéficiaire'}</Link>
                            : <span className="font-medium text-gray-800">Bénéficiaire</span>}
                          <span className="text-gray-500"> · {l.type === 'seance' ? 'séance' : 'bilan'} du {dateCourte(l)}</span>
                          {l.motif && <div className="text-xs text-gray-500 mt-0.5">{LIBELLES_MOTIF[l.motif]}</div>}
                          {l.avantDebutContrat && <div className="text-xs text-amber-700 mt-0.5" data-testid="avant-debut-contrat">Avant le début du contrat</div>}
                        </div>
                        {l.numero && <span className="text-xs text-gray-500">Facture {l.numero}</span>}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </PageWrapper>
  );
}
