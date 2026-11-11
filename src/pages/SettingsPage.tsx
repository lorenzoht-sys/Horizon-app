import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Save, Upload, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import PageWrapper from '../components/layout/PageWrapper';
import { SectionApplication } from '../components/pwa/PWAComponents';
import { supabase } from '../lib/supabase';
import { lirePraticien } from '../lib/acces/praticien';
import { utilisateurCourant } from '../lib/session';
import { type SettingsPraticien, DEFAULTS_SETTINGS as DEFAULTS, rowToSettings, enregistrerSettingsPraticien } from '../lib/settingsPraticien';
import { validerSiret, normaliserSiret } from '../lib/siret';
import { SectionAlertesPraticien } from './parametres/SectionAlertesPraticien';
import { SectionDonnees } from './parametres/SectionDonnees';
import { SectionExportPlanning } from './parametres/SectionExportPlanning';
import { SectionIndisponibilites } from './parametres/SectionIndisponibilites';
import { SectionRappelsGlobal } from './parametres/SectionRappelsGlobal';
import { Field, SectionTitle, inputClass } from './parametres/communs';

// Ordre d'apparition des champs a l'ecran. Sert a designer le PREMIER champ
// en erreur, pas n'importe lequel : `Object.keys` suit l'ordre d'insertion
// dans `validate()`, qui n'est pas l'ordre du formulaire.
const ORDRE_CHAMPS: (keyof SettingsPraticien)[] = [
  'prenom', 'nom', 'titre', 'email', 'telephone', 'societe',
  'adresseRue', 'adresseCodePostal', 'adresseVille',
  'siret', 'numeroSAP', 'numeroTVA',
];

/** Attribut `name` du champ, seul lien entre la validation et le DOM. */
function nomChamp(champ: keyof SettingsPraticien): string {
  return `settings-${champ}`;
}

/**
 * Amene le premier champ en erreur sous les yeux, et lui donne le focus.
 *
 * Le toast rouge seul ne suffisait pas : ce formulaire fait plusieurs
 * ecrans de haut, et l'erreur pouvait se trouver tres au-dessus ou tres en
 * dessous de la zone visible. On voyait « Veuillez corriger les erreurs »
 * sans jamais voir quoi corriger — au point de croire que l'enregistrement
 * avait fonctionne. C'est ce malentendu qui a lance l'audit d'identite.
 */
function focaliserPremierChampEnErreur(
  erreurs: Partial<Record<keyof SettingsPraticien, string>>,
): void {
  const champ = ORDRE_CHAMPS.find(c => erreurs[c]);
  if (!champ) return;
  const el = document.querySelector<HTMLInputElement>(`[name="${nomChamp(champ)}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // `preventScroll` : sans lui, le focus saute instantanement a la position
  // finale et annule le defilement doux qu'on vient de lancer.
  el.focus({ preventScroll: true });
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [form, setForm]     = useState<SettingsPraticien>(DEFAULTS);
  const [errors, setErrors] = useState<Partial<Record<keyof SettingsPraticien, string>>>({});
  const [loading, setLoading] = useState(true);
  const logoPraticienRef = useRef<HTMLInputElement>(null);
  // Le SIRET tel qu'il etait en base a l'ouverture de la page. Sert a
  // distinguer un numero HERITE d'un numero SAISI ici — voir `validate()`.
  const siretInitial = useRef('');

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    void (async () => {
      const user = await utilisateurCourant();
      if (!user) { setLoading(false); return; }
      const { data } = await lirePraticien(user.id, '*');
      if (data) {
        const charge = rowToSettings(data);
        setForm(charge);
        siretInitial.current = charge.siret;
        // Erreur affichee des l'ouverture, sans attendre une tentative
        // d'enregistrement : un SIRET herite invalide doit se voir, meme
        // s'il n'empeche plus de sauvegarder le reste.
        const controle = validerSiret(charge.siret);
        if (charge.siret.trim() && !controle.valide) {
          setErrors({ siret: controle.message });
        }
      }
      setLoading(false);
    })();
  }, []);

  function set(field: keyof SettingsPraticien, value: string) {
    setForm(f => ({ ...f, [field]: value }));
    if (errors[field]) setErrors(e => ({ ...e, [field]: undefined }));
  }

  function handleLogoPraticienChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 600_000) { toast.error('Image trop lourde (max 600 Ko)'); return; }
    const reader = new FileReader();
    reader.onload = ev => set('logoPraticien', ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  /**
   * Valide le formulaire.
   *
   * Renseigne `errors` avec TOUT ce qui est fautif — c'est l'affichage — et
   * rend seulement ce qui INTERDIT d'enregistrer. Les deux ensembles ne
   * coincident pas, a cause du SIRET : voir plus bas.
   *
   * Rend les erreurs plutot qu'un booleen parce que l'appelant a besoin de
   * savoir QUEL champ a echoue pour l'amener a l'ecran.
   */
  function validate(): Partial<Record<keyof SettingsPraticien, string>> {
    const required: (keyof SettingsPraticien)[] = [
      'prenom', 'nom', 'titre', 'email',
      'adresseRue', 'adresseCodePostal', 'adresseVille',
    ];
    // `next` : ce qui s'affiche. `bloquants` : ce qui refuse l'enregistrement.
    const next: Partial<Record<keyof SettingsPraticien, string>> = {};
    const bloquants: Partial<Record<keyof SettingsPraticien, string>> = {};

    for (const f of required) {
      if (!form[f].trim()) { next[f] = 'Champ obligatoire'; bloquants[f] = next[f]; }
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      next.email = 'Email invalide';
      bloquants.email = next.email;
    }
    // ── SIRET : affiche toujours, bloquant seulement s'il vient d'ici ────
    // Le SIRET reste facultatif dans ce formulaire — un salarie de structure
    // n'en a pas — et c'est la generation du contrat qui exige sa validite.
    // La contrainte mord la ou l'exigence legale s'applique, pas sur un ecran
    // qui sert a dix autres choses. C'est deja ce qui avait decide de placer
    // le blocage au contrat plutot qu'a l'onboarding.
    //
    // D'ou la distinction. Un numero SAISI ICI et faux bloque : on ne laisse
    // pas quelqu'un enregistrer une faute de frappe qu'il vient de commettre.
    // Un numero HERITE et faux — entre par l'onboarding ou l'ecran mobile, a
    // l'epoque ou aucun des deux ne validait quoi que ce soit — s'affiche en
    // erreur mais n'interdit rien d'autre. Bloquer la totalite du formulaire
    // sur une valeur qu'un autre ecran a laissee passer dresserait un mur au
    // premier enregistrement d'un praticien invite, pour un champ sans
    // rapport avec ce qu'il essaie de modifier.
    const controleSiret = validerSiret(form.siret);
    const siretHerite = normaliserSiret(form.siret) === normaliserSiret(siretInitial.current);
    if (form.siret.trim() && !controleSiret.valide) {
      next.siret = controleSiret.message;
      if (!siretHerite) bloquants.siret = next.siret;
    }

    setErrors(next);
    return bloquants;
  }

  async function handleSave() {
    const erreurs = validate();
    if (Object.keys(erreurs).length > 0) {
      toast.error('Veuillez corriger les erreurs');
      focaliserPremierChampEnErreur(erreurs);
      return;
    }
    const toSave = { ...form, siret: validerSiret(form.siret).siret };

    let userId = '';
    if (supabase) {
      const user = await utilisateurCourant();
      if (!user) { toast.error('Utilisateur non connecté'); return; }
      userId = user.id;
    }

    // La construction de la ligne et l'ordre base-puis-cache vivent dans
    // `settingsPraticien` : cet ecran et l'ecran mobile en avaient chacun
    // leur copie, avec des jeux de colonnes differents.
    try {
      await enregistrerSettingsPraticien(toSave, userId);
    } catch (err) {
      toast.error(`Erreur : ${err instanceof Error ? err.message : 'enregistrement impossible'}`);
      return;
    }
    toast.success('Paramètres enregistrés');
  }

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center h-64">
          <div className="text-sm text-gray-400">Chargement des paramètres…</div>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className="max-w-2xl">

        {/* Retour — la Sidebar (desktop) fait déjà office de navigation,
            mais rien n'y remplace ce lien sous 768px : ce chantier fusionne
            EcranSettings (mobile) vers cet écran, sans Sidebar ni barre de
            navigation mobile (avecBarre=false, AppMobile.tsx — un choix
            volontaire pour un écran de formulaire, pas touché ici). Même
            patron que ArchivesPage.tsx et BilanDetail.tsx. */}
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary mb-4 transition-colors">
          <ArrowLeft size={14} /> Tableau de bord
        </Link>

        {/* En-tête */}
        <div className="mb-8">
          <h1 className="font-heading font-bold text-2xl text-dark">Paramètres</h1>
          <p className="text-sm text-gray-500 mt-1">
            Ces informations apparaissent sur tous vos documents générés (PDFs, attestations, comptes-rendus).
          </p>
        </div>

        <div className="space-y-10">

          {/* ── Profil professionnel ── */}
          <section>
            <SectionTitle title="Mon profil professionnel" />
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Prénom" required error={errors.prenom}>
                  <input name={nomChamp('prenom')} value={form.prenom} onChange={e => set('prenom', e.target.value)}
                    placeholder="Marie" className={inputClass(errors.prenom)} />
                </Field>
                <Field label="Nom" required error={errors.nom}>
                  <input name={nomChamp('nom')} value={form.nom} onChange={e => set('nom', e.target.value)}
                    placeholder="Durand" className={inputClass(errors.nom)} />
                </Field>
              </div>
              <Field label="Titre professionnel" required error={errors.titre}>
                <input name={nomChamp('titre')} value={form.titre} onChange={e => set('titre', e.target.value)}
                  placeholder="Enseignant en Activité Physique Adaptée" className={inputClass(errors.titre)} />
              </Field>
              <Field label="Email professionnel" required error={errors.email}>
                <input type="email" name={nomChamp('email')} value={form.email} onChange={e => set('email', e.target.value)}
                  placeholder="marie.durand@exemple.fr" className={inputClass(errors.email)} />
              </Field>
              <Field label="Téléphone" error={errors.telephone}>
                <input name={nomChamp('telephone')} value={form.telephone} onChange={e => set('telephone', e.target.value)}
                  placeholder="06 12 34 56 78" className={inputClass(errors.telephone)} />
              </Field>
              <Field label="Nom de la société" error={errors.societe}>
                <input name={nomChamp('societe')} value={form.societe} onChange={e => set('societe', e.target.value)}
                  placeholder="Horizon APA" className={inputClass(errors.societe)} />
                <p className="text-xs text-gray-400 mt-1">Optionnel — affiché dans l'en-tête de vos PDFs</p>
              </Field>
            </div>
          </section>

          {/* ── Adresse professionnelle ── */}
          <section>
            <SectionTitle title="Mon adresse professionnelle" />
            <div className="space-y-4">
              <Field label="Adresse (rue)" required error={errors.adresseRue}>
                <input name={nomChamp('adresseRue')} value={form.adresseRue} onChange={e => set('adresseRue', e.target.value)}
                  placeholder="12 rue des Lilas" className={inputClass(errors.adresseRue)} />
              </Field>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Code postal" required error={errors.adresseCodePostal}>
                  <input name={nomChamp('adresseCodePostal')} value={form.adresseCodePostal} onChange={e => set('adresseCodePostal', e.target.value)}
                    placeholder="75013" className={inputClass(errors.adresseCodePostal)} />
                </Field>
                <div className="col-span-2">
                  <Field label="Ville" required error={errors.adresseVille}>
                    <input name={nomChamp('adresseVille')} value={form.adresseVille} onChange={e => set('adresseVille', e.target.value)}
                      placeholder="Paris" className={inputClass(errors.adresseVille)} />
                  </Field>
                </div>
              </div>
            </div>
          </section>

          {/* ── Informations légales ── */}
          <section>
            <SectionTitle title="Mes informations légales" />
            <div className="space-y-4">
              {/* PAS `required` : la validation ne l'a jamais impose, et
                  l'asterisque mentait. Un salarie de structure n'a pas de
                  SIRET personnel et doit pouvoir enregistrer ses reglages.
                  La contrainte vit la ou elle mord : la generation de contrat
                  est bloquee sans SIRET (ModalGenerationContrat). */}
              <Field label="Numéro SIRET" error={errors.siret}>
                <input name={nomChamp('siret')} value={form.siret} onChange={e => set('siret', e.target.value)}
                  placeholder="XXX XXX XXX XXXXX" className={inputClass(errors.siret)} />
                {form.siret.trim()
                  ? <p className="text-xs text-gray-400 mt-1">14 chiffres (espaces autorisés)</p>
                  : <p className="text-xs text-amber-600 mt-1">
                      Sans SIRET, vous ne pourrez pas générer de contrat de prestation.
                    </p>}
              </Field>
              {/* Meme correction : `required` n'etait pas non plus dans la
                  liste de validation. */}
              <Field label="Numéro de déclaration SAP" error={errors.numeroSAP}>
                <input name={nomChamp('numeroSAP')} value={form.numeroSAP} onChange={e => set('numeroSAP', e.target.value)}
                  placeholder="SAP XXXXXXXXX" className={inputClass(errors.numeroSAP)} />
              </Field>
              <Field label="Numéro TVA intracommunautaire" error={errors.numeroTVA}>
                <input name={nomChamp('numeroTVA')} value={form.numeroTVA} onChange={e => set('numeroTVA', e.target.value)}
                  placeholder="FR XX XXXXXXXXX" className={inputClass(errors.numeroTVA)} />
                <p className="text-xs text-gray-400 mt-1">Optionnel — uniquement si assujetti à la TVA</p>
              </Field>
            </div>
          </section>

          {/* ── Logo de ma société ── */}
          <section>
            <SectionTitle title="Logo de ma société (PDFs)" />
            <p className="text-xs text-gray-400 mb-4">
              Affiché dans l'en-tête de tous vos PDFs à la place du logo Horizon. Laissez vide pour garder le logo Horizon.
              Sur les factures, il est figé à la validation : le changer ne modifie pas les factures déjà validées.
            </p>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                {form.logoPraticien ? (
                  <img src={form.logoPraticien} alt="Logo société" className="w-full h-full object-contain p-1" />
                ) : (
                  <span className="text-xs text-gray-300 text-center leading-tight">Aucun logo</span>
                )}
              </div>
              <div>
                <input
                  ref={logoPraticienRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={handleLogoPraticienChange}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => logoPraticienRef.current?.click()}
                    className="flex items-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                  >
                    <Upload size={15} />
                    {form.logoPraticien ? 'Changer le logo' : 'Ajouter un logo'}
                  </button>
                  {form.logoPraticien && (
                    <button
                      onClick={() => set('logoPraticien', '')}
                      className="flex items-center gap-2 border border-red-200 text-red-500 hover:bg-red-light px-3 py-2 rounded-xl text-sm transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1.5">PNG ou JPG, max 600 Ko</p>
              </div>
            </div>
          </section>

          {/* ── Ville de signature ── */}
          <section>
            <SectionTitle title="Ville de signature des documents" />
            <Field label="Ville" required error={errors.villeSignature}>
              <input value={form.villeSignature} onChange={e => set('villeSignature', e.target.value)}
                placeholder="Paris" className={`${inputClass(errors.villeSignature)} max-w-xs`} />
            </Field>
            <p className="text-xs text-gray-400 mt-2">
              Utilisée dans : <span className="italic">«&nbsp;Fait à {form.villeSignature || 'Paris'}, le JJ/MM/AAAA&nbsp;»</span>
            </p>
          </section>

          {/* ── Tarification ── */}
          <section>
            <SectionTitle title="Tarification" />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Tarif horaire (€)" error={errors.tarifHoraire}>
                <input type="number" min={0} step={0.5} value={form.tarifHoraire}
                  onChange={e => set('tarifHoraire', e.target.value)}
                  placeholder="45" className={inputClass(errors.tarifHoraire)} />
                <p className="text-xs text-gray-400 mt-1">Pré-rempli dans les contrats PDF</p>
              </Field>
              <Field label="Frais km par défaut (€/km)" error={errors.fraisKmDefaut}>
                <input type="number" min={0} step={0.01} value={form.fraisKmDefaut}
                  onChange={e => set('fraisKmDefaut', e.target.value)}
                  placeholder="0.50" className={inputClass(errors.fraisKmDefaut)} />
              </Field>
            </div>
          </section>

          {/* ── Facturation (étape 4) : les informations sans lesquelles une facture ne peut pas
              être validée (régime de TVA, agrément, IBAN…) vivent sur leur propre écran. Le lien
              est ici, pas dans la barre principale. ── */}
          <section>
            <SectionTitle title="Facturation" />
            <Link to="/settings/facturation" data-testid="lien-profil-facturation"
              className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 text-sm hover:border-primary/40 hover:bg-primary/5 transition-colors no-underline">
              <span>
                <span className="block font-semibold text-dark">Profil de facturation</span>
                <span className="block text-xs text-gray-500 mt-0.5">Régime de TVA, agrément SAP, adresse de facturation, IBAN, conditions de paiement</span>
              </span>
              <ArrowRight size={16} className="text-gray-400 flex-shrink-0" />
            </Link>
          </section>

          {/* ── Application (PWA) ── */}
          <section>
            <SectionTitle title="📱 Application" />
            <SectionApplication />
          </section>

          {/* ── Alertes praticien (notifications push) ── */}
          <SectionAlertesPraticien />

          {/* ── Export du planning (iCalendar) ── */}
          <SectionExportPlanning />

          {/* ── Rappels automatiques ── */}
          <SectionRappelsGlobal />

          {/* ── Indisponibilités ── */}
          <SectionIndisponibilites />

          {/* ── Import / Export données ── */}
          <SectionDonnees />

        </div>

        {/* Bouton sauvegarde */}
        <div className="mt-10 pt-6 border-t border-gray-100">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-dark transition-colors"
          >
            <Save size={16} />
            Enregistrer les paramètres
          </button>
        </div>

      </div>
    </PageWrapper>
  );
}
