import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Loader, XCircle } from 'lucide-react';
import PageWrapper from '../components/layout/PageWrapper';
import { useProfilFacturation } from '../hooks/useProfilFacturation';
import {
  champsManquantsPourValider,
  siretAAlerter,
  validerFormulaire,
  type ChampFormulaire,
  type ErreursFormulaire,
  type FormulaireFacturation,
  type IdentiteProfil,
} from '../lib/profilFacturation';

// Profil de facturation du praticien (facturation, étape 4) : les informations sans lesquelles
// valider_facture refuse une facture (« Profil de facturation incomplet : … »), enfin modifiables
// depuis l'application. Atteint depuis Paramètres (/settings), pas depuis la barre principale.
//
// Lecture et écriture directes sous la RLS de `praticiens` (hook useProfilFacturation), aucune
// route /api. L'identité (SIRET, nom, n° SAP, n° TVA, adresse professionnelle) reste éditée dans
// Paramètres : elle est rappelée ici en lecture, avec ce qui manque, pour ne pas avoir deux
// endroits qui écrivent les mêmes colonnes.
//
// Responsive (une colonne, pas de barre fixe en bas : la barre de navigation mobile y serait en
// recouvrement), servi aussi sous 768 px, voir routesMobile.ts.

const ORDRE_CHAMPS: ChampFormulaire[] = [
  'regimeTva', 'tauxTva', 'dateDeclarationSap', 'modeIntervention', 'adresseIntervention',
  'facturationRue', 'facturationCodePostal', 'facturationVille', 'iban', 'delaiPaiementJours', 'penalitesRetard',
];

const classeChamp = (erreur?: string) =>
  `w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 transition-colors ${
    erreur ? 'border-red-300 bg-red-50/40 focus:border-red-400 focus:ring-red-100'
           : 'border-gray-200 bg-white focus:border-primary focus:ring-primary/10'
  }`;

function Section({ titre, aide, children }: { titre: string; aide?: ReactNode; children: ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{titre}</h2>
      {aide && <p className="text-xs text-gray-500 mt-1">{aide}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Champ({ etiquette, requis, erreur, aide, children }: {
  etiquette: string; requis?: boolean; erreur?: string; aide?: ReactNode; children: ReactNode;
}) {
  return (
    <div>
      <label className="flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
        {etiquette}
        {requis && <span className="normal-case tracking-normal font-medium text-[11px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">requis pour valider</span>}
      </label>
      {children}
      {aide && !erreur && <p className="text-xs text-gray-400 mt-1">{aide}</p>}
      {erreur && <p role="alert" className="text-red-500 text-xs mt-1">{erreur}</p>}
    </div>
  );
}

function LigneIdentite({ libelle, valeur, requis, alerte }: { libelle: string; valeur: string; requis?: boolean; alerte?: string | null }) {
  const manque = requis && !valeur.trim();
  return (
    <li className="flex items-start justify-between gap-3 py-2 text-sm" data-testid={`identite-${libelle}`}>
      <div className="min-w-0">
        <div className="text-xs text-gray-400">{libelle}{requis && ' · requis pour valider'}</div>
        <div className={manque ? 'text-amber-800 font-medium' : 'text-gray-800'}>{valeur.trim() || (manque ? 'À renseigner' : 'Non renseigné')}</div>
        {alerte && <div className="text-xs text-amber-700 mt-0.5">{alerte}</div>}
      </div>
      {requis && (manque || alerte
        ? <XCircle size={16} className="text-amber-600 flex-shrink-0 mt-1" aria-label="manquant" />
        : <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0 mt-1" aria-label="renseigné" />)}
    </li>
  );
}

function adresseTexte(i: IdentiteProfil): string {
  return [i.adresseRue, [i.adresseCodePostal, i.adresseVille].filter(s => s.trim()).join(' ')].filter(s => s.trim()).join(', ');
}

export default function ProfilFacturationPage() {
  const { identite, initial, chargement, erreur, enregistrer } = useProfilFacturation();
  if (chargement) {
    return <PageWrapper><div className="flex items-center justify-center h-64 text-sm text-gray-400">Chargement du profil de facturation…</div></PageWrapper>;
  }
  if (erreur || !identite || !initial) {
    return (
      <PageWrapper>
        <div role="alert" className="max-w-2xl rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Impossible de charger le profil de facturation : {erreur ?? 'profil introuvable'}
        </div>
      </PageWrapper>
    );
  }
  // Formulaire monté seulement une fois les valeurs lues : son état initial est la ligne en base.
  return <Formulaire identite={identite} initial={initial} enregistrer={enregistrer} />;
}

function Formulaire({ identite, initial, enregistrer }: {
  identite: IdentiteProfil;
  initial: FormulaireFacturation;
  enregistrer: ReturnType<typeof useProfilFacturation>['enregistrer'];
}) {
  const [f, setF] = useState<FormulaireFacturation>(initial);
  const [enregistre, setEnregistre] = useState<FormulaireFacturation>(initial);
  const [erreurs, setErreurs] = useState<ErreursFormulaire>({});
  const [enCours, setEnCours] = useState(false);

  const modifie = JSON.stringify(f) !== JSON.stringify(enregistre);
  const manquants = useMemo(() => champsManquantsPourValider(identite, f), [identite, f]);
  const alerteSiret = siretAAlerter(identite);

  function maj<K extends ChampFormulaire>(champ: K, valeur: FormulaireFacturation[K]) {
    setF(prev => {
      const suivant = { ...prev, [champ]: valeur };
      // Retirer l'agrément alors que 5,5 % est choisi : on ne devine pas le taux de remplacement
      // (10 % ou autre), on le remet à choisir. Le bandeau « il manque » le signale aussitôt.
      if (champ === 'agrementSap' && valeur === false && prev.tauxTva === '5.5') suivant.tauxTva = '';
      return suivant;
    });
    setErreurs(e => ({ ...e, [champ]: undefined, ...(champ === 'agrementSap' || champ === 'regimeTva' ? { tauxTva: undefined } : {}) }));
  }

  function focaliser(e: ErreursFormulaire) {
    const champ = ORDRE_CHAMPS.find(c => e[c]);
    const el = champ && document.querySelector<HTMLElement>(`[name="profil-${champ}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
  }

  async function sauver() {
    // Les erreurs de forme s'affichent AVANT tout appel : rien n'est envoyé à la base si elles existent.
    const avant = validerFormulaire(f);
    if (Object.keys(avant).length > 0) {
      setErreurs(avant);
      toast.error('Veuillez corriger les erreurs');
      focaliser(avant);
      return;
    }
    setEnCours(true);
    const r = await enregistrer(f);
    setEnCours(false);
    if (r.ok) {
      setErreurs({});
      setEnregistre(f);
      toast.success('Profil de facturation enregistré');
    } else {
      if (r.erreurs) { setErreurs(r.erreurs); focaliser(r.erreurs); }
      toast.error(r.message);
    }
  }

  const complet = manquants.length === 0;
  const assujetti = f.regimeTva === 'assujetti';

  return (
    <PageWrapper>
      <div className="max-w-2xl">
        <Link to="/settings" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary mb-4 transition-colors">
          <ArrowLeft size={14} /> Paramètres
        </Link>
        <h1 className="font-heading font-bold text-2xl text-dark">Profil de facturation</h1>
        <p className="text-sm text-gray-500 mt-1 mb-5">
          Ces informations figurent sur vos factures. Tant que les éléments « requis pour valider » manquent, la validation d'une facture est refusée.
        </p>

        {complet ? (
          <div role="status" data-testid="profil-complet" className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 mb-5 text-sm text-emerald-900">
            <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Profil complet : vous pouvez valider vos factures.</div>
              {modifie && <p className="mt-0.5">Enregistrez vos modifications pour qu'elles soient prises en compte.</p>}
            </div>
          </div>
        ) : (
          <div role="alert" data-testid="profil-manquants" className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 mb-5 text-sm text-amber-900">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Pour pouvoir valider une facture, il manque :</div>
              <ul className="list-disc pl-5 mt-1">
                {manquants.map(m => <li key={m.libelle} data-testid="manque">{m.libelle}</li>)}
              </ul>
            </div>
          </div>
        )}

        <div className="space-y-5">
          <Section titre="Identité (lecture)" aide={<>Modifiable dans <Link to="/settings" className="text-primary underline">Paramètres</Link>.</>}>
            <ul className="divide-y divide-gray-50 -mt-2">
              <LigneIdentite libelle="Nom" valeur={identite.nom} requis />
              <LigneIdentite libelle="SIRET" valeur={identite.siret} requis alerte={alerteSiret} />
              <LigneIdentite libelle="N° de déclaration SAP" valeur={identite.numeroSap} />
              <LigneIdentite libelle="N° de TVA intracommunautaire" valeur={identite.numeroTva} />
              <LigneIdentite libelle="Adresse professionnelle" valeur={adresseTexte(identite)} />
            </ul>
          </Section>

          <Section titre="TVA">
            <Champ etiquette="Régime de TVA" requis erreur={erreurs.regimeTva}>
              <select name="profil-regimeTva" data-testid="regime-tva" value={f.regimeTva}
                onChange={e => maj('regimeTva', e.target.value as FormulaireFacturation['regimeTva'])} className={classeChamp(erreurs.regimeTva)}>
                <option value="">— Choisir —</option>
                <option value="franchise_293B">Franchise en base de TVA (art. 293 B du CGI)</option>
                <option value="assujetti">Assujetti à la TVA</option>
              </select>
            </Champ>
            {f.regimeTva === 'franchise_293B' && (
              <p className="text-xs text-gray-500">Aucune TVA n'est facturée : la mention « TVA non applicable, art. 293 B du CGI » figure sur vos factures.</p>
            )}
            {assujetti && (
              <Champ etiquette="Taux de TVA" requis erreur={erreurs.tauxTva}
                aide="10 % ou 5,5 %. Le taux de 5,5 % n'est possible qu'avec l'agrément SAP (case ci-dessous).">
                <select name="profil-tauxTva" data-testid="taux-tva" value={f.tauxTva}
                  onChange={e => maj('tauxTva', e.target.value)} className={classeChamp(erreurs.tauxTva)}>
                  <option value="">— Choisir —</option>
                  <option value="10">10 %</option>
                  <option value="5.5" disabled={!f.agrementSap}>5,5 %{f.agrementSap ? '' : ' (agrément SAP requis)'}</option>
                </select>
              </Champ>
            )}
            <label className="flex items-start gap-2.5 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" data-testid="agrement-sap" checked={f.agrementSap}
                onChange={e => maj('agrementSap', e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300" />
              <span>J'ai un agrément « services à la personne » <span className="text-gray-400">(nécessaire pour appliquer 5,5 %)</span></span>
            </label>
          </Section>

          <Section titre="Mentions services à la personne" aide="Facultatif pour valider. À renseigner si vous avez un n° de déclaration SAP : ces mentions figurent sur les factures ouvrant droit au crédit d'impôt.">
            <Champ etiquette="Date de déclaration SAP" erreur={erreurs.dateDeclarationSap}>
              <input type="date" name="profil-dateDeclarationSap" value={f.dateDeclarationSap}
                onChange={e => maj('dateDeclarationSap', e.target.value)} className={classeChamp(erreurs.dateDeclarationSap)} />
            </Champ>
            <Champ etiquette="Mode d'intervention" erreur={erreurs.modeIntervention}>
              <select name="profil-modeIntervention" value={f.modeIntervention}
                onChange={e => maj('modeIntervention', e.target.value as FormulaireFacturation['modeIntervention'])} className={classeChamp(erreurs.modeIntervention)}>
                <option value="">— Non précisé —</option>
                <option value="prestataire">Prestataire</option>
                <option value="mandataire">Mandataire</option>
              </select>
            </Champ>
            <Champ etiquette="Adresse d'intervention" erreur={erreurs.adresseIntervention}>
              <input name="profil-adresseIntervention" value={f.adresseIntervention} onChange={e => maj('adresseIntervention', e.target.value)}
                placeholder="Lieu d'intervention habituel" className={classeChamp(erreurs.adresseIntervention)} />
            </Champ>
          </Section>

          <Section titre="Adresse de facturation" aide="Facultative si votre adresse professionnelle est renseignée dans Paramètres : c'est alors celle-ci qui figure sur les factures. Renseignez les trois champs, ou aucun.">
            <Champ etiquette="Rue" erreur={erreurs.facturationRue}>
              <input name="profil-facturationRue" value={f.facturationRue} onChange={e => maj('facturationRue', e.target.value)}
                placeholder={identite.adresseRue || '1 rue de la Paix'} className={classeChamp(erreurs.facturationRue)} />
            </Champ>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Champ etiquette="Code postal">
                <input name="profil-facturationCodePostal" value={f.facturationCodePostal} inputMode="numeric"
                  onChange={e => maj('facturationCodePostal', e.target.value)} placeholder={identite.adresseCodePostal || '75000'} className={classeChamp()} />
              </Champ>
              <div className="sm:col-span-2">
                <Champ etiquette="Ville">
                  <input name="profil-facturationVille" value={f.facturationVille}
                    onChange={e => maj('facturationVille', e.target.value)} placeholder={identite.adresseVille || 'Paris'} className={classeChamp()} />
                </Champ>
              </div>
            </div>
          </Section>

          <Section titre="Paiement">
            <Champ etiquette="IBAN" erreur={erreurs.iban} aide="Facultatif. Affiché sur la facture pour le règlement par virement.">
              <input name="profil-iban" data-testid="iban" value={f.iban} onChange={e => maj('iban', e.target.value)}
                placeholder="FR76 3000 6000 0112 3456 7890 189" autoComplete="off" spellCheck={false} className={classeChamp(erreurs.iban)} />
            </Champ>
            <Champ etiquette="Délai de paiement (jours)" erreur={erreurs.delaiPaiementJours} aide="De 0 à 60 jours après la date d'émission.">
              <input name="profil-delaiPaiementJours" data-testid="delai-paiement" value={f.delaiPaiementJours} inputMode="numeric"
                onChange={e => maj('delaiPaiementJours', e.target.value)} className={classeChamp(erreurs.delaiPaiementJours)} />
            </Champ>
            <Champ etiquette="Pénalités de retard" erreur={erreurs.penalitesRetard} aide="Facultatif. Mention libre figurant sur la facture (taux, indemnité forfaitaire de recouvrement).">
              <textarea name="profil-penalitesRetard" value={f.penalitesRetard} rows={3} onChange={e => maj('penalitesRetard', e.target.value)}
                className={classeChamp(erreurs.penalitesRetard)} />
            </Champ>
          </Section>

          <div className="flex flex-wrap items-center gap-3 pb-6">
            <button type="button" data-testid="enregistrer-profil" disabled={enCours || !modifie} onClick={() => void sauver()}
              className="inline-flex items-center gap-2 bg-primary text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              {enCours ? <Loader size={14} className="animate-spin" /> : <Check size={14} />} Enregistrer
            </button>
            {!modifie && <span className="text-xs text-gray-400">Aucune modification à enregistrer</span>}
            <Link to="/factures/a-valider" className="text-sm font-medium text-primary hover:underline ml-auto">Factures à valider →</Link>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
