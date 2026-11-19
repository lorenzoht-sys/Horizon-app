import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import PageWrapper from '../components/layout/PageWrapper';
import { useSuiviSeances } from '../hooks/useSuiviSeances';
import { ajouterMois, libelleMois, moisCourantParis } from '../lib/chiffreAffaires';
import { LIBELLES_ETAT, LIBELLES_MOTIF, dateCourte, regrouper, type EtatSeance } from '../lib/suiviSeances';
import { estContratIncomplet, messageContratIncomplet, syntheseControle } from '../lib/controleFacturation';

// Contrôle de la facturation du mois (/factures/seances). Au départ (plan facturation PR 6) : le suivi des
// séances réalisées. Depuis le 2026-11-19 (factures d'octobre manquantes sans aucun signal) : un tableau de
// contrôle par bénéficiaire (prêt, à vérifier, bloqué), les séances passées restées « planifiées » à
// confirmer d'un clic, et les contrats dont le tarif ne couvre pas le début, avec un lien vers la correction.
// Responsive d'emblée (une colonne, aucune barre fixe en bas), voir routesMobile.ts.

const COULEUR: Record<EtatSeance, string> = {
  a_facturer: 'bg-amber-50 text-amber-900 border-amber-200',
  en_preparation: 'bg-sky-50 text-sky-900 border-sky-200',
  facturee: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  creditee: 'bg-purple-50 text-purple-900 border-purple-200',
  non_facturable: 'bg-gray-50 text-gray-700 border-gray-200',
};

const lienContrats = (participantId: string) => `/participant/${participantId}?onglet=contrats`;

function jjmm(iso: string): string {
  const [, m, j] = iso.split('-');
  return `${j}/${m}`;
}

function Carte({ valeur, libelle, ton, testid }: { valeur: number; libelle: string; ton: string; testid: string }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${ton}`} data-testid={testid}>
      <div className="text-lg font-semibold">{valeur}</div>
      <div className="text-xs">{libelle}</div>
    </div>
  );
}

export default function SuiviSeancesPage() {
  const courant = useMemo(() => moisCourantParis(), []);
  const [params] = useSearchParams();
  const demande = params.get('mois');
  const [mois, setMois] = useState(demande && /^\d{4}-\d{2}-01$/.test(demande) && demande <= courant ? demande : courant);
  const { lignes, aConfirmer, contrats, noms, chargement, erreur, confirmerSeance } = useSuiviSeances(mois);
  const groupes = useMemo(() => regrouper(lignes), [lignes]);
  const synthese = useMemo(() => syntheseControle(lignes, aConfirmer, contrats), [lignes, aConfirmer, contrats]);
  const incomplets = useMemo(() => contrats.filter(estContratIncomplet), [contrats]);
  const [enCours, setEnCours] = useState<string | null>(null);
  const nom = (id: string | null) => (id && noms[id]) || 'Bénéficiaire';

  async function confirmer(seanceId: string, statut: 'realisee' | 'annulee') {
    setEnCours(seanceId);
    const err = await confirmerSeance(seanceId, statut);
    setEnCours(null);
    if (err) toast.error(`Séance non modifiée : ${err}`);
    else toast.success(statut === 'realisee' ? 'Séance réalisée : ajoutée à la facture du mois' : 'Séance annulée');
  }

  const toutEstPret = synthese.dossiers.length > 0 && synthese.bloques === 0 && synthese.aVerifier === 0 && incomplets.length === 0;

  return (
    <PageWrapper>
      <div className="max-w-2xl">
        <Link to="/factures/a-valider" className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-700 text-sm font-medium mb-2">
          <ArrowLeft size={16} /> Factures à valider
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">Contrôle de la facturation</h1>
        <p className="text-sm text-gray-500 mt-0.5">Avant de valider les factures du mois : ce qui est prêt, à vérifier ou bloqué.</p>

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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4" data-testid="controle-synthese">
              <Carte valeur={synthese.dossiers.length} libelle="Dossiers du mois" ton="bg-white text-gray-800 border-gray-200" testid="controle-dossiers" />
              <Carte valeur={synthese.prets} libelle="Prêts à facturer" ton="bg-emerald-50 text-emerald-900 border-emerald-200" testid="controle-prets" />
              <Carte valeur={synthese.aVerifier} libelle="À vérifier" ton="bg-sky-50 text-sky-900 border-sky-200" testid="controle-a-verifier" />
              <Carte valeur={synthese.bloques} libelle="Bloqués" ton="bg-amber-50 text-amber-900 border-amber-200" testid="controle-bloques" />
              <Carte valeur={synthese.factures} libelle="Factures préparées ou émises" ton="bg-white text-gray-800 border-gray-200" testid="controle-factures" />
              <Carte valeur={synthese.seancesAConfirmer} libelle="Séances à confirmer" ton="bg-white text-gray-800 border-gray-200" testid="controle-a-confirmer" />
              <Carte valeur={incomplets.length} libelle="Contrats sans tarif complet" ton="bg-white text-gray-800 border-gray-200" testid="controle-contrats-incomplets" />
            </div>

            {toutEstPret && (
              <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" data-testid="controle-tout-pret">
                Tout est prêt : chaque séance réalisée du mois est dans une facture.
              </p>
            )}

            {aConfirmer.length > 0 && (
              <section className="mt-5" data-testid="groupe-a-confirmer">
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Séances passées à confirmer ({aConfirmer.length})</h2>
                <p className="text-xs text-gray-500 mb-2">Ni réalisées ni annulées : elles ne sont pas facturées tant que vous ne les confirmez pas.</p>
                <ul className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
                  {aConfirmer.map(s => (
                    <li key={s.seanceId} className="px-4 py-2.5 text-sm flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <Link to={`/participant/${s.participantId}`} className="font-medium text-gray-800 hover:text-primary">{nom(s.participantId)}</Link>
                        <span className="text-gray-500"> · séance du {jjmm(s.date)}{s.heure ? ` à ${s.heure}` : ''}</span>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" disabled={enCours === s.seanceId} onClick={() => confirmer(s.seanceId, 'realisee')}
                          data-testid="confirmer-realisee"
                          className="inline-flex items-center gap-1 text-xs font-medium text-white bg-primary hover:opacity-90 disabled:opacity-50 px-2.5 py-1.5 rounded-lg">
                          <Check size={12} /> Réalisée
                        </button>
                        <button type="button" disabled={enCours === s.seanceId} onClick={() => confirmer(s.seanceId, 'annulee')}
                          data-testid="confirmer-annulee"
                          className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 px-2.5 py-1.5 rounded-lg">
                          <X size={12} /> Annulée
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {incomplets.length > 0 && (
              <section className="mt-5" data-testid="groupe-contrats-incomplets">
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Contrats sans tarif complet ({incomplets.length})</h2>
                <ul className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
                  {incomplets.map(c => (
                    <li key={c.contratId} className="px-4 py-2.5 text-sm flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <div className="min-w-0">
                        <span className="font-medium text-gray-800">{nom(c.participantId)}</span>
                        <div className="text-xs text-amber-800 mt-0.5">{messageContratIncomplet(c)}</div>
                      </div>
                      <Link to={lienContrats(c.participantId)} className="text-xs font-medium text-primary hover:underline">Corriger le tarif</Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {lignes.length === 0 && aConfirmer.length === 0 && <p className="mt-6 text-sm text-gray-500">Aucune séance ce mois-ci.</p>}

            <div className="space-y-5 mt-5 pb-6">
              {groupes.filter(g => g.lignes.length > 0).map(g => (
                <section key={g.etat} data-testid={`groupe-${g.etat}`}>
                  <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">{LIBELLES_ETAT[g.etat]} ({g.lignes.length})</h2>
                  <ul className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
                    {g.lignes.map(l => (
                      <li key={l.seanceId} className={`px-4 py-2.5 text-sm flex flex-wrap items-baseline justify-between gap-x-3 ${g.etat === 'a_facturer' ? COULEUR.a_facturer.split(' ')[0] : ''}`}>
                        <div className="min-w-0">
                          {l.participantId
                            ? <Link to={`/participant/${l.participantId}`} className="font-medium text-gray-800 hover:text-primary">{nom(l.participantId)}</Link>
                            : <span className="font-medium text-gray-800">Bénéficiaire</span>}
                          <span className="text-gray-500"> · {l.type === 'seance' ? 'séance' : 'bilan'} du {dateCourte(l)}</span>
                          {l.motif && <div className="text-xs text-gray-500 mt-0.5">{LIBELLES_MOTIF[l.motif]}</div>}
                          {l.avantDebutContrat && <div className="text-xs text-amber-700 mt-0.5" data-testid="avant-debut-contrat">Avant le début du contrat</div>}
                        </div>
                        {l.etat === 'a_facturer' && l.participantId && (
                          <Link to={lienContrats(l.participantId)} className="text-xs font-medium text-primary hover:underline" data-testid="corriger">Corriger</Link>
                        )}
                        {l.numero && (
                          <span className="text-xs text-gray-500">
                            Facture {l.numero}
                            {l.numeroAvoir && <span className="text-purple-700" data-testid="numero-avoir"> · avoir {l.numeroAvoir}</span>}
                          </span>
                        )}
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
