import { Link } from 'react-router-dom';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Download } from 'lucide-react';
import { toast } from 'sonner';
import PageWrapper from '../components/layout/PageWrapper';
import ModalCreerAvoir from '../components/factures/ModalCreerAvoir';
import { telechargerPdfFacture, useFacturesValidees } from '../hooks/useFacturesAValider';
import { aRembourser, type Choix } from '../lib/avoirs';
import { MOYENS_PAIEMENT, avoirsDe, dateCivileParis, emailPlausible, formaterDate, formaterEuro, libellePeriode, peutCreerAvoir, peutEnvoyer, peutMarquerPayee, type FactureValidee } from '../lib/facturesAValider';

// Factures validées (numérotées, verrouillées) : liste volontairement minimale (facturation,
// étape 3). Elle sert de destination à « Les retrouver » après une validation. Étape 5 : le PDF se
// télécharge ici ; l'envoi par e-mail vient ensuite. PR 7 : « Marquer payée » (un paiement du reste dû,
// marquer_facture_payee) ; « En retard » est posé par la base le lendemain de l'échéance. PR 8 :
// « Envoyer » / « Renvoyer » par e-mail (Edge Function facturation-envoi) ; sans adresse connue, une saisie
// s'ouvre, avec « Enregistrer cette adresse dans la fiche » décochée par défaut (décision du 2026-10-22).
// PR 9 : « Créer un avoir » (fenêtre ModalCreerAvoir, validé immédiatement), avoirs listés sous leur facture,
// « À rembourser » si la facture était déjà encaissée, « Refaire la facture du mois » après une annulation.

const STATUTS: Record<string, { libelle: string; classe: string }> = {
  validee: { libelle: 'Validée', classe: 'bg-emerald-50 text-emerald-700' },
  envoyee: { libelle: 'Envoyée', classe: 'bg-blue-50 text-blue-700' },
  payee: { libelle: 'Payée', classe: 'bg-green-100 text-green-800' },
  en_retard: { libelle: 'En retard', classe: 'bg-red-50 text-red-700' },
  annulee: { libelle: 'Annulée', classe: 'bg-gray-100 text-gray-600' },
};

export default function FacturesPage() {
  const { factures, chargement, erreur, marquerPayee, envoyer, creerAvoir, refaireFacture } = useFacturesValidees();
  const [avoirOuvert, setAvoirOuvert] = useState<FactureValidee | null>(null);
  const [refaireEnCours, setRefaireEnCours] = useState<string | null>(null);

  async function confirmerAvoir(f: FactureValidee, lignes: Choix[], geste: number, motif: string, total: number): Promise<boolean> {
    const r = await creerAvoir(f.id, lignes, geste, motif, total);
    if ('erreur' in r) { toast.error(r.erreur); return false; }
    toast.success([
      `Avoir n° ${r.numero} créé (${formaterEuro(r.total)})`,
      r.origineAnnulee ? `facture n° ${f.numero} annulée` : '',
      r.aRembourser > 0 ? `à rembourser : ${formaterEuro(r.aRembourser)}` : '',
    ].filter(Boolean).join(' · '));
    return true;
  }

  async function refaire(f: FactureValidee) {
    setRefaireEnCours(f.id);
    const r = await refaireFacture(f.contratId, f.periode);
    setRefaireEnCours(null);
    if ('erreur' in r) { toast.error(r.erreur); return; }
    if (r.cree) toast.success(`Brouillon de ${libellePeriode(f.periode)} recréé : à valider dans « Factures à valider »`);
    else toast.info('Aucune séance à facturer pour ce mois');
  }

  const [envoiEnCours, setEnvoiEnCours] = useState<string | null>(null);
  // Saisie d'adresse ouverte sur une facture (adresse manquante ou invalide, ou autre adresse voulue).
  const [saisie, setSaisie] = useState<{ id: string; email: string; enregistrer: boolean; message?: string } | null>(null);

  async function lancerEnvoi(id: string, email?: string, enregistrer = false) {
    setEnvoiEnCours(id);
    const r = await envoyer(id, crypto.randomUUID(), email, enregistrer);
    setEnvoiEnCours(null);
    if ('ok' in r) {
      setSaisie(null);
      toast.success(r.enregistree ? `Envoyée à ${r.destinataire} · adresse enregistrée dans la fiche` : `Envoyée à ${r.destinataire}`);
      return;
    }
    if (r.code === 'email_manquant' || r.code === 'email_invalide') {
      setSaisie({ id, email: email ?? '', enregistrer, message: r.erreur });
      return;
    }
    toast.error(r.erreur);
  }
  const [telechargement, setTelechargement] = useState<string | null>(null);
  const aujourdhui = dateCivileParis();
  // Formulaire « Marquer payée » ouvert sur une seule facture à la fois.
  const [paiement, setPaiement] = useState<{ id: string; date: string; moyen: string } | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);

  async function confirmerPaiement() {
    if (!paiement) return;
    setEnregistrement(true);
    const r = await marquerPayee(paiement.id, paiement.date, paiement.moyen);
    setEnregistrement(false);
    if ('erreur' in r) { toast.error(r.erreur); return; }
    setPaiement(null);
    toast.success('Facture marquée payée');
  }

  async function telecharger(id: string, pdfPath: string, numero: string) {
    setTelechargement(id);
    const r = await telechargerPdfFacture(pdfPath, numero);
    setTelechargement(null);
    if ('erreur' in r) toast.error(r.erreur);
  }

  return (
    <PageWrapper>
      <div className="mb-5">
        <Link to="/factures/a-valider" className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-700 text-sm font-medium mb-2">
          <ArrowLeft size={16} /> Factures à valider
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold text-gray-900">Factures validées</h1>
          <Link
            to="/factures/ca"
            data-testid="lien-chiffre-affaires"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary border border-primary/30 hover:bg-primary/5 px-3 py-2 rounded-xl"
          >
            Chiffre d'affaires <ArrowRight size={14} />
          </Link>
        </div>
        <p className="text-sm text-gray-500 mt-0.5">
          {chargement ? 'Chargement…' : `${factures.length} facture${factures.length > 1 ? 's' : ''}`}

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
            const avoirs = f.type === 'facture' ? avoirsDe(f.id, factures) : [];
            const origine = f.type === 'avoir' ? factures.find(o => o.id === f.factureOrigineId) : undefined;
            const rembourser = avoirs.length > 0 ? aRembourser(f.paye, f.total, avoirs.reduce((t, a) => t + a.total, 0)) : 0;
            // Refaire : facture annulée dont le mois n'a pas déjà une autre facture émise dans la liste.
            const peutRefaire = f.type === 'facture' && f.statut === 'annulee'
              && !factures.some(o => o.type === 'facture' && o.statut !== 'annulee' && o.contratId === f.contratId && o.periode === f.periode);
            return (
              <li key={f.id} data-testid="facture-validee" className="flex items-start justify-between gap-3 p-4 text-sm">
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900" data-testid="numero-facture">
                    {f.type === 'avoir' && <span className="mr-1.5 text-xs font-medium text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">Avoir</span>}
                    {f.numero}
                  </div>
                  <div className="text-gray-700">{`${f.beneficiaire.prenom} ${f.beneficiaire.nom}`.trim()}</div>
                  <div className="text-xs text-gray-400">{libellePeriode(f.periode)} · émise le {formaterDate(f.dateEmission)}</div>
                  {f.type === 'avoir' && (
                    <div className="text-xs text-gray-500" data-testid="avoir-origine">
                      {origine ? `Sur la facture n° ${origine.numero}` : 'Avoir'}{f.motif ? ` · ${f.motif}` : ''}
                    </div>
                  )}
                  {avoirs.map(a => (
                    <div key={a.id} className="text-xs text-purple-700" data-testid="avoir-de-facture">Avoir n° {a.numero} : −{formaterEuro(a.total)}</div>
                  ))}
                  {rembourser > 0 && <div className="text-xs font-medium text-amber-800" data-testid="a-rembourser">À rembourser : {formaterEuro(rembourser)}</div>}
                  {f.statut === 'payee' && f.datePaiement
                    ? <div className="text-xs text-green-700" data-testid="date-paiement">Payée le {formaterDate(f.datePaiement)}</div>
                    : f.type === 'facture' && f.echeance && f.statut !== 'annulee' &&
                      <div className={`text-xs ${f.statut === 'en_retard' ? 'text-red-600' : 'text-gray-400'}`} data-testid="echeance">Échéance le {formaterDate(f.echeance)}</div>}
                  {saisie?.id === f.id && (
                    <div className="mt-2 space-y-1.5" data-testid="saisie-email">
                      {saisie.message && <p className="text-xs text-amber-700">{saisie.message} : saisissez l'adresse du destinataire.</p>}
                      <div className="flex flex-wrap items-center gap-2">
                        <input type="email" value={saisie.email} placeholder="adresse@exemple.fr" data-testid="email-envoi"
                          onChange={e => setSaisie({ ...saisie, email: e.target.value.trim() })}
                          className="border border-gray-200 rounded-lg px-2 py-1 text-sm min-w-0 flex-1" />
                        <button type="button" data-testid="confirmer-envoi" disabled={!emailPlausible(saisie.email) || envoiEnCours === f.id}
                          onClick={() => void lancerEnvoi(f.id, saisie.email, saisie.enregistrer)}
                          className="text-xs font-semibold text-white bg-primary rounded-lg px-3 py-1.5 disabled:opacity-50">
                          {envoiEnCours === f.id ? 'Envoi…' : 'Envoyer'}
                        </button>
                        <button type="button" onClick={() => setSaisie(null)} className="text-xs text-gray-500 px-2 py-1.5">Annuler</button>
                      </div>
                      {/* inline-flex : seuls la case et son texte sont cliquables. En pleine largeur, un clic à
                          droite du texte cochait la case sans qu'on le voie (recette staging du 2026-10-22). */}
                      <label className="inline-flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                        <input type="checkbox" checked={saisie.enregistrer} data-testid="enregistrer-email"
                          onChange={e => setSaisie({ ...saisie, enregistrer: e.target.checked })} />
                        Enregistrer cette adresse dans la fiche
                      </label>
                    </div>
                  )}
                  {paiement?.id === f.id && (
                    <div className="mt-2 flex flex-wrap items-end gap-2" data-testid="formulaire-paiement">
                      <label className="text-xs text-gray-500">Payée le
                        <input type="date" value={paiement.date} min={f.dateEmission} max={aujourdhui} data-testid="paiement-date"
                          onChange={e => setPaiement({ ...paiement, date: e.target.value })}
                          className="block mt-0.5 border border-gray-200 rounded-lg px-2 py-1 text-sm" />
                      </label>
                      <label className="text-xs text-gray-500">Moyen
                        <select value={paiement.moyen} data-testid="paiement-moyen" onChange={e => setPaiement({ ...paiement, moyen: e.target.value })}
                          className="block mt-0.5 border border-gray-200 rounded-lg px-2 py-1 text-sm bg-white">
                          {MOYENS_PAIEMENT.map(m => <option key={m.valeur} value={m.valeur}>{m.libelle}</option>)}
                        </select>
                      </label>
                      <button type="button" data-testid="confirmer-paiement" disabled={enregistrement} onClick={() => void confirmerPaiement()}
                        className="text-xs font-semibold text-white bg-primary rounded-lg px-3 py-1.5 disabled:opacity-50">
                        {enregistrement ? 'Enregistrement…' : 'Confirmer'}
                      </button>
                      <button type="button" onClick={() => setPaiement(null)} className="text-xs text-gray-500 px-2 py-1.5">Annuler</button>
                    </div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-semibold text-gray-900 tabular-nums">{formaterEuro(f.total)}</div>
                  <span className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${statut.classe}`}>{statut.libelle}</span>
                  <div className="mt-2">
                    {f.pdfPath ? (
                      <button
                        type="button"
                        data-testid="telecharger-pdf"
                        onClick={() => void telecharger(f.id, f.pdfPath as string, f.numero)}
                        disabled={telechargement === f.id}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 disabled:opacity-50"
                      >
                        <Download size={14} /> {telechargement === f.id ? 'Téléchargement…' : 'PDF'}
                      </button>
                    ) : (
                      <span data-testid="pdf-en-preparation" className="text-xs text-gray-400">PDF en préparation</span>
                    )}
                  </div>
                  {f.dernierEnvoi && (
                    <div className="text-xs text-blue-700 mt-1" data-testid="dernier-envoi">Envoyée le {formaterDate(f.dernierEnvoi.date.slice(0, 10))}</div>
                  )}
                  {peutEnvoyer(f) && f.pdfPath && saisie?.id !== f.id && (
                    <button type="button" data-testid="envoyer-facture" disabled={envoiEnCours === f.id}
                      onClick={() => void lancerEnvoi(f.id)}
                      className="mt-1 block ml-auto text-xs font-medium text-blue-700 hover:text-blue-900 disabled:opacity-50">
                      {envoiEnCours === f.id ? 'Envoi…' : f.dernierEnvoi ? 'Renvoyer' : 'Envoyer par e-mail'}
                    </button>
                  )}
                  {peutCreerAvoir(f) && (
                    <button type="button" data-testid="creer-avoir" onClick={() => setAvoirOuvert(f)}
                      className="mt-1 block ml-auto text-xs font-medium text-purple-700 hover:text-purple-900">
                      Créer un avoir
                    </button>
                  )}
                  {peutRefaire && (
                    <button type="button" data-testid="refaire-facture" disabled={refaireEnCours === f.id} onClick={() => void refaire(f)}
                      className="mt-1 block ml-auto text-xs font-medium text-primary hover:underline disabled:opacity-50">
                      {refaireEnCours === f.id ? 'Recalcul…' : 'Refaire la facture du mois'}
                    </button>
                  )}
                  {peutMarquerPayee(f) && paiement?.id !== f.id && (
                    <button type="button" data-testid="marquer-payee"
                      onClick={() => setPaiement({ id: f.id, date: aujourdhui, moyen: 'virement' })}
                      className="mt-1 text-xs font-medium text-green-700 hover:text-green-900">
                      Marquer payée
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {avoirOuvert && (
        <ModalCreerAvoir
          facture={avoirOuvert}
          avoirs={avoirsDe(avoirOuvert.id, factures)}
          onClose={() => setAvoirOuvert(null)}
          onCreer={(lignes, geste, motif, total) => confirmerAvoir(avoirOuvert, lignes, geste, motif, total)}
        />
      )}
    </PageWrapper>
  );
}
