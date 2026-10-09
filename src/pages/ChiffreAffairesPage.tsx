import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, Check, X } from 'lucide-react';
import PageWrapper from '../components/layout/PageWrapper';
import { useChiffreAffaires } from '../hooks/useChiffreAffaires';
import { formaterEuro } from '../lib/facturesAValider';
import {
  LIBELLE_EXTERNE_PAR_DEFAUT,
  LIBELLE_MAX,
  ajouterMois,
  detailDuMois,
  historique,
  libelleMois,
  moisCourantParis,
  validerSaisie,
  type ErreursSaisie,
  type SaisieExterne,
} from '../lib/chiffreAffaires';

// Suivi du chiffre d'affaires mensuel (/factures/ca). Montants en HT, CA = facturé (factures validées,
// avoirs déduits) au mois de la prestation, plus les saisies manuelles de CA externe (SAP...) rattachées à
// un bénéficiaire. Les saisies ne sont pas des pièces comptables : modifiables et supprimables à tout
// moment. Aucune charge, aucun résultat, aucun bilan : un total et son détail.
//
// Responsive d'emblée (une colonne, aucune barre fixe en bas : la barre de navigation mobile y serait en
// recouvrement), voir routesMobile.ts.

interface Brouillon { participantId: string; libelle: string; montant: string }
const VIDE: Brouillon = { participantId: '', libelle: LIBELLE_EXTERNE_PAR_DEFAUT, montant: '' };

export default function ChiffreAffairesPage() {
  const courant = useMemo(() => moisCourantParis(), []);
  const [mois, setMois] = useState(courant);
  const { lignes, saisies, beneficiaires, noms, chargement, erreur, ajouter, modifier, supprimer } = useChiffreAffaires(mois);

  const detail = useMemo(() => detailDuMois(lignes, mois, noms), [lignes, mois, noms]);
  const serie = useMemo(() => historique(lignes, mois, 12), [lignes, mois]);

  const [formulaire, setFormulaire] = useState<Brouillon>(VIDE);
  const [erreurs, setErreurs] = useState<ErreursSaisie>({});
  const [enregistrement, setEnregistrement] = useState(false);
  const [edition, setEdition] = useState<{ id: string } & Brouillon | null>(null);
  const [erreursEdition, setErreursEdition] = useState<ErreursSaisie>({});

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    const { erreurs: errs, valeurs } = validerSaisie(formulaire);
    setErreurs(errs);
    if (!valeurs) return;
    setEnregistrement(true);
    const r = await ajouter(valeurs);
    setEnregistrement(false);
    if (r.erreur) { toast.error(`Saisie non enregistrée : ${r.erreur}`); return; }
    toast.success('CA externe ajouté');
    setFormulaire({ ...VIDE, participantId: formulaire.participantId });
  }

  function commencerEdition(s: SaisieExterne) {
    setErreursEdition({});
    setEdition({ id: s.id, participantId: s.participantId, libelle: s.libelle, montant: String(s.montant).replace('.', ',') });
  }

  async function enregistrerEdition() {
    if (!edition) return;
    const { erreurs: errs, valeurs } = validerSaisie(edition);
    setErreursEdition(errs);
    if (!valeurs) return;
    const r = await modifier(edition.id, valeurs);
    if (r.erreur) { toast.error(`Modification non enregistrée : ${r.erreur}`); return; }
    setEdition(null);
    toast.success('Saisie modifiée');
  }

  async function retirer(s: SaisieExterne) {
    if (!window.confirm(`Supprimer « ${s.libelle} » (${formaterEuro(s.montant)}) ?`)) return;
    const r = await supprimer(s.id);
    if (r.erreur) toast.error(`Suppression impossible : ${r.erreur}`);
    else toast.success('Saisie supprimée');
  }

  const champ = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary bg-white';

  return (
    <PageWrapper>
      <div className="mb-5">
        <Link to="/factures" className="inline-flex items-center gap-1.5 text-gray-400 hover:text-gray-700 text-sm font-medium mb-2">
          <ArrowLeft size={16} /> Factures validées
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">Chiffre d'affaires</h1>
        <p className="text-sm text-gray-500 mt-0.5">En HT : factures validées au mois de la prestation, avoirs déduits, plus le CA externe que vous saisissez.</p>
      </div>

      {/* Navigation entre les mois */}
      <div className="flex items-center justify-between gap-2 bg-white rounded-2xl border border-gray-100 shadow-sm px-3 py-2 mb-4">
        <button type="button" data-testid="mois-precedent" onClick={() => setMois(ajouterMois(mois, -1))}
          className="p-2 rounded-xl text-gray-500 hover:bg-gray-50" aria-label="Mois précédent"><ChevronLeft size={18} /></button>
        <div className="text-center">
          <div data-testid="mois-affiche" className="text-base font-semibold text-gray-900 first-letter:uppercase">{libelleMois(mois)}</div>
          {mois !== courant && (
            <button type="button" onClick={() => setMois(courant)} className="text-xs text-primary hover:underline">Revenir au mois en cours</button>
          )}
        </div>
        <button type="button" data-testid="mois-suivant" disabled={mois >= courant} onClick={() => setMois(ajouterMois(mois, 1))}
          className="p-2 rounded-xl text-gray-500 hover:bg-gray-50 disabled:opacity-30" aria-label="Mois suivant"><ChevronRight size={18} /></button>
      </div>

      {erreur && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 mb-4 text-sm text-red-800">
          Impossible de charger le chiffre d'affaires : {erreur}
        </div>
      )}

      {/* Totaux du mois */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="text-xs font-medium text-gray-500">CA total HT</div>
          <div data-testid="ca-total" className="text-2xl font-semibold text-gray-900 tabular-nums mt-1">{chargement ? '…' : formaterEuro(detail.total)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="text-xs font-medium text-gray-500">Via Horizon (factures validées)</div>
          <div data-testid="ca-horizon" className="text-lg font-semibold text-gray-800 tabular-nums mt-1">{chargement ? '…' : formaterEuro(detail.horizon)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="text-xs font-medium text-gray-500">CA externe saisi</div>
          <div data-testid="ca-externe" className="text-lg font-semibold text-gray-800 tabular-nums mt-1">{chargement ? '…' : formaterEuro(detail.externe)}</div>
        </div>
      </div>

      {/* Détail par bénéficiaire */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Détail par bénéficiaire</h2>
        {!chargement && detail.beneficiaires.length === 0 ? (
          <div data-testid="aucun-ca" className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-sm text-gray-500">
            Aucun chiffre d'affaires pour ce mois.
          </div>
        ) : (
          <ul className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
            {detail.beneficiaires.map(b => (
              <li key={b.participantId} data-testid="ca-beneficiaire" className="flex items-start justify-between gap-3 p-4 text-sm">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900">{b.nom}</div>
                  <div className="text-xs text-gray-400">Horizon {formaterEuro(b.horizon)} · externe {formaterEuro(b.externe)}</div>
                </div>
                <div className="font-semibold text-gray-900 tabular-nums">{formaterEuro(b.total)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* CA externe du mois : saisie libre */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">CA externe de {libelleMois(mois)}</h2>
        <p className="text-xs text-gray-500 mb-2">
          Ce ne sont pas des pièces comptables : vous les modifiez et les supprimez quand vous voulez. Elles s'ajoutent au total ci-dessus, rien d'autre.
        </p>

        {saisies.length > 0 && (
          <ul className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50 mb-3">
            {saisies.map(s => (
              <li key={s.id} data-testid="saisie-externe" className="p-4 text-sm">
                {edition?.id === s.id ? (
                  <div className="space-y-2">
                    <select aria-label="Bénéficiaire" className={champ} value={edition.participantId}
                      onChange={e => setEdition({ ...edition, participantId: e.target.value })}>
                      {beneficiaires.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
                    </select>
                    <input aria-label="Libellé" className={champ} value={edition.libelle} maxLength={LIBELLE_MAX + 20}
                      onChange={e => setEdition({ ...edition, libelle: e.target.value })} />
                    <input aria-label="Montant HT" inputMode="decimal" className={champ} value={edition.montant}
                      onChange={e => setEdition({ ...edition, montant: e.target.value })} />
                    {Object.values(erreursEdition).map(m => <p key={m} role="alert" className="text-xs text-red-700">{m}</p>)}
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={() => setEdition(null)} className="inline-flex items-center gap-1 text-sm text-gray-600 border border-gray-200 rounded-xl px-3 py-1.5"><X size={14} /> Annuler</button>
                      <button type="button" data-testid="enregistrer-saisie" onClick={() => void enregistrerEdition()} className="inline-flex items-center gap-1 text-sm font-semibold text-white bg-primary rounded-xl px-3 py-1.5"><Check size={14} /> Enregistrer</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900">{s.libelle}</div>
                      <div className="text-xs text-gray-500">{noms[s.participantId] ?? 'Bénéficiaire'}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-semibold text-gray-900 tabular-nums">{formaterEuro(s.montant)}</span>
                      <button type="button" aria-label="Modifier la saisie" data-testid="modifier-saisie" onClick={() => commencerEdition(s)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-50"><Pencil size={15} /></button>
                      <button type="button" aria-label="Supprimer la saisie" data-testid="supprimer-saisie" onClick={() => void retirer(s)} className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"><Trash2 size={15} /></button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={soumettre} data-testid="formulaire-saisie" className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2" noValidate>
          <div className="text-sm font-medium text-gray-800">Ajouter du CA externe</div>
          <select aria-label="Bénéficiaire" className={champ} value={formulaire.participantId}
            onChange={e => setFormulaire({ ...formulaire, participantId: e.target.value })}>
            <option value="">Choisir un bénéficiaire…</option>
            {beneficiaires.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
          </select>
          {erreurs.participantId && <p role="alert" className="text-xs text-red-700">{erreurs.participantId}</p>}
          <input aria-label="Libellé" className={champ} placeholder="Libellé" value={formulaire.libelle}
            onChange={e => setFormulaire({ ...formulaire, libelle: e.target.value })} />
          {erreurs.libelle && <p role="alert" className="text-xs text-red-700">{erreurs.libelle}</p>}
          <input aria-label="Montant HT" inputMode="decimal" className={champ} placeholder="Montant HT en €" value={formulaire.montant}
            onChange={e => setFormulaire({ ...formulaire, montant: e.target.value })} />
          {erreurs.montant && <p role="alert" className="text-xs text-red-700">{erreurs.montant}</p>}
          <div className="flex justify-end">
            <button type="submit" disabled={enregistrement}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-primary hover:opacity-90 disabled:opacity-50 px-3 py-2 rounded-xl">
              <Plus size={14} /> Ajouter
            </button>
          </div>
        </form>
      </section>

      {/* Historique des 12 derniers mois */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">12 derniers mois</h2>
        <ul className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          {serie.map(m => (
            <li key={m.mois}>
              <button type="button" data-testid="mois-historique" onClick={() => setMois(m.mois)}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-sm text-left hover:bg-gray-50 ${m.mois === mois ? 'bg-primary/5' : ''}`}>
                <span className="first-letter:uppercase text-gray-800">{libelleMois(m.mois)}</span>
                <span className="font-medium tabular-nums text-gray-900">{formaterEuro(m.total)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </PageWrapper>
  );
}
