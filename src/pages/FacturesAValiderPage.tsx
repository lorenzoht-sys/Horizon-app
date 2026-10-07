import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, Check, Loader } from 'lucide-react';
import PageWrapper from '../components/layout/PageWrapper';
import { useFacturesAValider } from '../hooks/useFacturesAValider';
import {
  adresseBeneficiaireManquante,
  formaterEuro,
  libellePeriode,
  libelleTva,
  profilFacturationManquant,
  type BilanValidation,
  type FactureBrouillon,
} from '../lib/facturesAValider';

// Écran « Factures à valider » (facturation, étape 3).
//
// Liste les brouillons du praticien connecté, avec leurs lignes et leurs totaux, et permet de les
// valider une par une ou toutes d'un coup. Valider = supabase.rpc('valider_facture') : le serveur
// attribue le numéro, fige l'émetteur et le destinataire et verrouille la facture. Irréversible :
// d'où la confirmation avant chaque validation. Aucun PDF ni e-mail à cette étape.
//
// Responsive d'emblée (une colonne, aucune barre fixe en bas : la barre de navigation mobile y
// serait en recouvrement) pour être servi tel quel sous 768 px, voir routesMobile.ts.

interface Confirmation { ids: string[]; titre: string }
interface Resultat { bilan: BilanValidation; noms: Record<string, string> }

const nomComplet = (f: FactureBrouillon) => `${f.beneficiaire.prenom} ${f.beneficiaire.nom}`.trim() || 'Bénéficiaire';

export default function FacturesAValiderPage() {
  const { brouillons, profil, chargement, erreur, enCours, validerPlusieurs } = useFacturesAValider();
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [validationEnCours, setValidationEnCours] = useState(false);
  const [resultat, setResultat] = useState<Resultat | null>(null);

  const profilManquant = useMemo(() => (chargement ? [] : profilFacturationManquant(profil)), [chargement, profil]);
  const parMois = useMemo(() => {
    const groupes = new Map<string, FactureBrouillon[]>();
    for (const f of brouillons) groupes.set(f.periode, [...(groupes.get(f.periode) ?? []), f]);
    return [...groupes.entries()];
  }, [brouillons]);

  function demander(ids: string[], titre: string) {
    setResultat(null);
    setConfirmation({ ids, titre });
  }

  async function confirmer() {
    if (!confirmation) return;
    const { ids } = confirmation;
    const noms = Object.fromEntries(brouillons.map(f => [f.id, nomComplet(f)]));
    setConfirmation(null);
    setValidationEnCours(true);
    const bilan = await validerPlusieurs(ids);
    setValidationEnCours(false);
    setResultat({ bilan, noms });
    if (bilan.validees.length > 0) {
      toast.success(bilan.validees.length === 1
        ? `Facture ${bilan.validees[0].numero} validée`
        : `${bilan.validees.length} factures validées`);
    }
    if (bilan.erreurs.length > 0) toast.error('Certaines factures n\'ont pas pu être validées');
  }

  return (
    <PageWrapper>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Factures à valider</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {chargement
              ? 'Chargement…'
              : brouillons.length === 0
                ? 'Aucun brouillon en attente'
                : `${brouillons.length} brouillon${brouillons.length > 1 ? 's' : ''} généré${brouillons.length > 1 ? 's' : ''} automatiquement, à relire puis à valider`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/factures"
            data-testid="lien-factures-validees"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary border border-primary/30 hover:bg-primary/5 px-3 py-2 rounded-xl"
          >
            Factures validées <ArrowRight size={14} />
          </Link>
          {brouillons.length > 1 && (
            <button
              type="button"
              data-testid="tout-valider"
              disabled={validationEnCours}
              onClick={() => demander(brouillons.map(f => f.id), `Valider les ${brouillons.length} factures`)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-primary hover:opacity-90 disabled:opacity-50 px-3 py-2 rounded-xl"
            >
              <Check size={14} /> Tout valider ({brouillons.length})
            </button>
          )}
        </div>
      </div>

      {profilManquant.length > 0 && brouillons.length > 0 && (
        <div role="alert" data-testid="bandeau-profil" className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 mb-4 text-sm text-amber-900">
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Profil de facturation incomplet : {profilManquant.join(', ')}</div>
            <p className="mt-0.5">
              La validation sera refusée tant que ces éléments ne sont pas renseignés.
            </p>
            <Link to="/settings/facturation" data-testid="lien-profil-facturation" className="inline-flex items-center gap-1 mt-1 font-medium underline">
              Compléter mon profil de facturation <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      )}

      {resultat && <BandeauResultat resultat={resultat} />}

      {erreur && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 mb-4 text-sm text-red-800">
          Impossible de charger les factures : {erreur}
        </div>
      )}

      {!chargement && !erreur && brouillons.length === 0 && (
        <div data-testid="aucun-brouillon" className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-500">
          Aucune facture à valider. Les brouillons du mois écoulé sont générés automatiquement le 1<sup>er</sup> de chaque mois.
          <div className="mt-3">
            <Link to="/factures" className="font-medium text-primary hover:underline">Voir les factures validées →</Link>
          </div>
        </div>
      )}

      {parMois.map(([periode, factures]) => (
        <section key={periode} className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2 first-letter:uppercase">
            {libellePeriode(periode)} · {factures.length} facture{factures.length > 1 ? 's' : ''} ·{' '}
            {formaterEuro(factures.reduce((s, f) => s + f.total, 0))} TTC
          </h2>
          {factures.map(f => {
            const adresse = adresseBeneficiaireManquante(f.beneficiaire);
            return (
              <article key={f.id} data-testid="facture-brouillon" className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5 mb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-gray-900">{nomComplet(f)}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Période : {libellePeriode(f.periode)}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Brouillon</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary" data-testid="circuit">
                      Circuit : {f.circuit}
                    </span>
                  </div>
                </div>

                {adresse.length > 0 && (
                  <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                    Adresse du bénéficiaire incomplète ({adresse.join(', ')}) : mention obligatoire, la validation sera refusée.
                  </p>
                )}

                <ul className="mt-3 divide-y divide-gray-50">
                  {f.lignes.map(l => (
                    <li key={l.id} className="flex items-start justify-between gap-3 py-2 text-sm" data-testid="ligne-facture">
                      <div className="min-w-0">
                        <div className="text-gray-800">{l.libelle}</div>
                        <div className="text-xs text-gray-400">{String(l.quantite).replace('.', ',')} × {formaterEuro(l.prixUnitaire)} HT</div>
                      </div>
                      <div className="font-medium text-gray-900 tabular-nums whitespace-nowrap">{formaterEuro(l.montant)}</div>
                    </li>
                  ))}
                </ul>

                <dl className="mt-3 pt-3 border-t border-gray-100 text-sm space-y-1 sm:ml-auto sm:w-72">
                  <div className="flex justify-between"><dt className="text-gray-500">Total HT</dt><dd className="tabular-nums" data-testid="total-ht">{formaterEuro(f.totalHt)}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-500">{libelleTva(profil, f.montantTva)}</dt><dd className="tabular-nums" data-testid="total-tva">{formaterEuro(f.montantTva)}</dd></div>
                  <div className="flex justify-between font-semibold text-gray-900"><dt>Total TTC</dt><dd className="tabular-nums" data-testid="total-ttc">{formaterEuro(f.total)}</dd></div>
                </dl>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    data-testid="valider-facture"
                    disabled={validationEnCours || enCours.has(f.id)}
                    onClick={() => demander([f.id], `Valider la facture de ${nomComplet(f)}`)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary border border-primary/40 hover:bg-primary/5 disabled:opacity-50 px-3 py-2 rounded-xl"
                  >
                    {enCours.has(f.id) ? <Loader size={14} className="animate-spin" /> : <Check size={14} />} Valider cette facture
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      ))}

      {confirmation && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4" style={{ zIndex: 1100 }} role="dialog" aria-modal="true" aria-label="Confirmer la validation">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="text-base font-bold text-gray-900 mb-2">{confirmation.titre} ?</div>
            <p className="text-sm text-gray-600 mb-5">
              {confirmation.ids.length > 1
                ? 'Elles seront numérotées et ne pourront plus être modifiées'
                : 'Elle sera numérotée et ne pourra plus être modifiée'}{' '}
              : seul un avoir permet ensuite de corriger.
            </p>
            <div className="flex gap-3">
              <button type="button" data-testid="confirmer-validation" onClick={() => void confirmer()}
                className="flex-1 bg-primary text-white rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90">
                <Check size={14} /> Valider
              </button>
              <button type="button" onClick={() => setConfirmation(null)} className="px-4 border border-gray-200 rounded-xl text-gray-600 text-sm">Annuler</button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}

function BandeauResultat({ resultat }: { resultat: Resultat }) {
  const { bilan, noms } = resultat;
  return (
    <div className="mb-4 space-y-2" data-testid="resultat-validation">
      {bilan.validees.length > 0 && (
        <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <div className="font-semibold">
            {bilan.validees.length === 1 ? '1 facture validée' : `${bilan.validees.length} factures validées`} :{' '}
            <span data-testid="numeros-valides">{bilan.validees.map(v => v.numero).join(', ')}</span>
          </div>
          <Link to="/factures" className="inline-flex items-center gap-1 mt-1 font-medium underline">
            Les retrouver dans « Factures validées » <ArrowRight size={13} />
          </Link>
        </div>
      )}
      {bilan.erreurs.length > 0 && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <div className="font-semibold">
            {bilan.erreurs.length === 1 ? '1 facture n\'a pas pu être validée' : `${bilan.erreurs.length} factures n'ont pas pu être validées`}
          </div>
          <ul className="mt-1 list-disc pl-5">
            {bilan.erreurs.map(e => <li key={e.id}>{noms[e.id] ?? 'Facture'} : {e.message}</li>)}
          </ul>
          {bilan.interrompue && bilan.nonTraitees.length > 0 && (
            <p className="mt-1">
              Cette erreur concerne toutes les factures : {bilan.nonTraitees.length > 1
                ? `les ${bilan.nonTraitees.length} suivantes n'ont pas été tentées.`
                : 'la suivante n\'a pas été tentée.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
