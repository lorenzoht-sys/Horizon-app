import { useState, useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { chargerSettingsPraticien } from '../../lib/settingsPraticien';
import { toast } from 'sonner';
import type { Participant, TagPatient, TestKey, RgpdConsent, TraitementPatient, AntecedentMedical, AnamneseData, SedentariteReponses } from '../../types';
import { useStructures } from '../../hooks/useStructures';
import { brouillonParticipantSupprimeDepuis, getBrouillonParticipant, sauvegarderBrouillonParticipant } from '../../hooks/useBrouillonParticipant';
import { avecConsentement, erreurConsentementCreation, normaliserRgpd } from '../../lib/consentementRgpd';
import { formaterDateNaissanceAffichage, masquerSaisieDateNaissance, messageErreurDateNaissance, parserDateNaissanceSaisie } from '../../utils/dateNaissance';
import { OPTIONS_FREQUENCE } from '../../lib/anamnese';
import { Save, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Carte } from '../ui/Carte';
import { aidesMobiliteDepuis, calculerIMC, categorieIMC, sansEmoji } from '../../lib/formulaireBeneficiaire';
import { AidesMobiliteForm } from './formulaire/AidesMobiliteForm';
import { ListeOrdonnee } from './formulaire/ListeOrdonnee';
import GIRWidget from '../bilan/GIRWidget';
import { EMPTY_SED, computeSedScore, computeFSSScore, getSedProfil, getFSSProfil, SectionSedentarite, SectionFatigue } from '../bilan/TestsAutonomie';
import { EtatPartageQuestionnaires } from '../bilan/EtatPartageBeneficiaire';
import { ActivitesPrecedentesForm } from './formulaire/ActivitesPrecedentesForm';
import { ChoixMultiple, ChoixOuTexte, ChoixUnique, Echelle10, Echelle5, ToggleOuiNon } from './formulaire/Champs';
import { ChutesForm } from './formulaire/ChutesForm';
import { ContactsSanteForm } from './formulaire/ContactsSanteForm';
import { CreneauxParJourForm } from './formulaire/CreneauxParJourForm';
import { ListeAntecedentsForm, ListeTraitementsForm } from './formulaire/ListesSante';
import { CLS_INPUT, CLS_LABEL, OPTIONS_ACTIVITES } from './formulaire/communs';

// ─── Options des champs autonomie / habitudes de vie / activité physique ──────

const OPTIONS_SITUATION_VIE = ['Seul(e)', 'En famille', 'EHPAD / résidence', 'Autre'];
const OPTIONS_TYPE_AIDE_DOMICILE = ['Aide ménagère', 'Auxiliaire de vie', 'Infirmier(e)', 'Portage de repas', 'Aide-soignant(e)', 'Autre'];
const OPTIONS_FREQUENCE_AIDE = ['Quotidienne', 'Plusieurs fois / semaine', 'Hebdomadaire', 'Ponctuelle'];
const OPTIONS_REPAS = ['1', '2', '3', 'Plus de 3'];
const OPTIONS_HYDRATATION = ['< 1L', '1 à 1,5L', '> 1,5L'];
const OPTIONS_MATERIEL = [
  'Tapis de sol', 'Poids / haltères', 'Élastique de résistance', 'Pédalier',
  'Step', 'Tapis de marche', 'Vélo d\'appartement', 'Kettlebell', 'Déambulateur', 'Autre',
];

const NUM_INPUT_CLS = 'w-36 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary';

// ─── Objectifs, cognition, organisation des séances ───────────────────────────

const OPTIONS_OBJECTIFS_PATIENT = [
  '💪 Renforcement musculaire',
  '⚖️ Améliorer l\'équilibre',
  '🦵 Améliorer la mobilité',
  '🫀 Endurance à l\'effort',
  '🛡️ Prévention des chutes',
  '🏠 Maintien de l\'autonomie',
  '😌 Réduire les douleurs',
  '🎯 Améliorer la coordination',
  '🧘 Travailler la souplesse',
  '🔄 Reprendre une activité physique',
  '💙 Regagner confiance en ses capacités',
];

const OPTIONS_ORIGINE_DEMARCHE = [
  '💪 De sa propre initiative',
  '👨‍⚕️ Recommandation médicale',
  '👨‍👩‍👦 Poussé par un proche',
  '✏️ Autre',
];
const OPTION_ORIGINE_AUTRE = '✏️ Autre';

// ─── Cognition & humeur : plaintes mémoire / suivi psychologique ──────────────

const OPTIONS_DEPUIS_QUAND = ['< 6 mois', '6-12 mois', '> 1 an'];
const OPTIONS_SIGNALE_PAR = ['Le bénéficiaire lui-même', "L'entourage", 'Les deux'];
const OPTIONS_SUIVI_PSY_QUI = ['Psychologue', 'Psychiatre', 'Psychothérapeute', 'Autre'];
const OPTIONS_SUIVI_PSY_FREQUENCE = ['Hebdomadaire', 'Mensuel', 'Occasionnel', 'En pause'];

const OPTIONS_JOURS_DISPONIBLES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const OPTIONS_DUREE_SEANCE_MIN = [30, 45, 60, 90, 120];

// ─── IBAN ─────────────────────────────────────────────────────────────────────

function validerIBAN(iban: string): boolean {
  const clean = iban.replace(/\s/g, '').toUpperCase();
  if (clean.length < 14 || clean.length > 34) return false;
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(clean)) return false;
  const rearranged = clean.slice(4) + clean.slice(0, 4);
  const numeric = rearranged.split('').map(c =>
    isNaN(Number(c)) ? (c.charCodeAt(0) - 55).toString() : c
  ).join('');
  let rem = 0;
  for (const d of numeric) rem = (rem * 10 + parseInt(d)) % 97;
  return rem === 1;
}

function formatIBAN(raw: string): string {
  return raw.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  onSubmit: (data: Omit<Participant, 'id' | 'token' | 'bilans'>) => void;
  onCancel: () => void;
  initial?: Partial<Participant>;
  /** Étape affichée (1 à 5). Si non fourni, le formulaire complet est affiché (usage modale). */
  step?: 1 | 2 | 3 | 4 | 5;
  /** Clé de brouillon localStorage (ex : "nouveau" ou l'id du participant). */
  draftKey?: string;
  /** Appelé à chaque changement, avec le nombre de champs remplis / total. */
  onCompletionChange?: (filled: number, total: number) => void;
}

export interface ParticipantFormHandle {
  /**
   * Tente la soumission. Retourne true si réussie, ou { step, message } si une
   * validation a échoué (prénom/nom manquant → étape 1, organisation des
   * séances incomplète → étape 4, consentement RGPD absent à la création →
   * étape 5) — à l'appelant de naviguer vers cette étape et d'afficher le
   * message.
   */
  submit: () => true | { step: 1 | 2 | 3 | 4 | 5; message: string };
}

function computeCompletion(
  form: Record<string, string>,
  anamnese: AnamneseData,
  traitements: TraitementPatient[],
  antecedents: AntecedentMedical[],
  rgpd: RgpdConsent,
  profilActivite: { modeDeplacementHabituel?: Participant['modeDeplacementHabituel']; objectifsPatient: string[]; activitesSouhaitees: string[] },
): { filled: number; total: number } {
  const champsTexte = [
    form.prenom, form.nom, form.dateNaissance, form.dateCreation,
    form.email, form.telephone,
    form.nomNaissance, form.villeNaissance, form.codePostalNaissance,
    form.adresseRue, form.adresseCodePostal, form.adresseVille,
    form.taille, form.poids,
    form.iban, form.bic, form.allergies,
  ];
  let filled = champsTexte.filter(v => v !== '' && v != null).length;
  let total = champsTexte.length;

  total += 6;
  if (anamnese.douleurQuotidienne != null) filled++;
  if (anamnese.fatigueQuotidienne != null) filled++;
  if (anamnese.contreIndications != null) filled++;
  if (anamnese.chutes?.aChutes != null) filled++;
  if (traitements.length > 0) filled++;
  if (antecedents.length > 0) filled++;

  total += 15;
  if (anamnese.autonomie?.situationVie != null) filled++;
  if (anamnese.autonomie?.aideADomicile != null) filled++;
  if (anamnese.autonomie?.aideMarche != null) filled++;
  if (anamnese.autonomie?.gir?.niveau != null) filled++;
  if (anamnese.habitudesVie?.nombreRepas != null) filled++;
  if (anamnese.habitudesVie?.hydratation != null) filled++;
  if (anamnese.habitudesVie?.qualiteSommeil != null) filled++;
  if (anamnese.habitudesVie?.heuresSommeil != null) filled++;
  if (anamnese.habitudesVie?.niveauAppetit != null) filled++;
  if (anamnese.habitudesVie?.variationPoids != null) filled++;
  if (anamnese.habitudesVie?.tabagisme != null) filled++;
  if ((anamnese.activitePhysique?.activitesActuelles?.length ?? 0) > 0) filled++;
  if ((anamnese.activitePhysique?.activitesPrecedentes?.length ?? 0) > 0) filled++;
  if (anamnese.sedentariteScore != null) filled++;
  if (anamnese.fatigueScore != null) filled++;

  total += 1;
  if (profilActivite.objectifsPatient.length > 0) filled++;

  total += 3;
  if (anamnese.cognition?.plaintesMemoire != null) filled++;
  if (anamnese.cognition?.suiviPsy != null) filled++;
  if (anamnese.cognition?.origineDemarche != null) filled++;

  total += 2;
  if ((anamnese.organisation?.joursDisponibles?.length ?? 0) > 0) filled++;
  if (Object.keys(anamnese.organisation?.creneauxParJour ?? {}).length > 0) filled++;

  total += 1;
  if (rgpd.consentementObtenu) filled++;

  return { filled, total };
}

const ParticipantForm = forwardRef<ParticipantFormHandle, Props>(function ParticipantForm(
  { onSubmit, onCancel, initial, step, draftKey, onCompletionChange }, ref
) {
  const { structures } = useStructures();

  // Modification d'une fiche existante (vs création) : déduit de la présence
  // d'un id sur `initial`, jamais le cas pour un nouveau patient. Utilisé pour
  // ne rendre le nb séances/semaine obligatoire qu'à la création — sur les
  // fiches déjà créées, ne jamais bloquer la sauvegarde pour ce champ.
  const enModification = Boolean(initial?.id);

  // ── Brouillon localStorage (page Nouveau participant / Modifier) ─
  const brouillon = draftKey ? getBrouillonParticipant(draftKey) : null;
  const seed: Partial<Participant> = brouillon?.data ? { ...initial, ...brouillon.data } : (initial ?? {});

  // ── Rattachement structure ──────────────────────────────────────
  const [structureId, setStructureId] = useState<string | undefined>(seed.structureId);

  // ── Traitements & antécédents structurés ───────────────────────
  const [traitements, setTraitements] = useState<TraitementPatient[]>(seed.traitements ?? []);
  const [antecedents, setAntecedents] = useState<AntecedentMedical[]>(seed.antecedentsMedicauxStructures ?? []);

  // ── Anamnèse (état de santé général) ────────────────────────────
  const [anamnese, setAnamnese] = useState<AnamneseData>({
    douleurQuotidienne: seed.anamnese?.douleurQuotidienne ?? null,
    fatigueQuotidienne: seed.anamnese?.fatigueQuotidienne ?? null,
    chutes: seed.anamnese?.chutes ?? {},
    contreIndications: seed.anamnese?.contreIndications ?? null,
    contreIndicationsDetail: seed.anamnese?.contreIndicationsDetail ?? '',
    autonomie: seed.anamnese?.autonomie ?? {},
    habitudesVie: seed.anamnese?.habitudesVie ?? {},
    activitePhysique: seed.anamnese?.activitePhysique ?? {},
    sedentariteReponses: seed.anamnese?.sedentariteReponses ?? EMPTY_SED,
    sedentariteScore: seed.anamnese?.sedentariteScore ?? null,
    sedentariteProfil: seed.anamnese?.sedentariteProfil ?? null,
    fatigueReponses: seed.anamnese?.fatigueReponses ?? Array(9).fill(null),
    fatigueScore: seed.anamnese?.fatigueScore ?? null,
    fatigueProfil: seed.anamnese?.fatigueProfil ?? null,
    cognition: seed.anamnese?.cognition ?? {},
    organisation: seed.anamnese?.organisation ?? {},
  });

  // ── Mode de déplacement, objectifs & activités souhaitées ────────
  const [profilActivite, setProfilActivite] = useState<{
    modeDeplacementHabituel: Participant['modeDeplacementHabituel'];
    modeDeplacementDetail: string;
    objectifsPatient: string[];
    activitesSouhaitees: string[];
  }>({
    modeDeplacementHabituel: seed.modeDeplacementHabituel,
    modeDeplacementDetail:   seed.modeDeplacementDetail ?? '',
    objectifsPatient:    Array.isArray(seed.objectifsPatient) ? seed.objectifsPatient : (seed.objectifsPatient ? [seed.objectifsPatient] : []),
    activitesSouhaitees: seed.activitesSouhaitees ?? [],
  });

  // ── Tags / tests ────────────────────────────────────────────────
  const [tags] = useState<TagPatient[]>(seed.tags ?? []);
  const [testsActifs] = useState<TestKey[]>(seed.testsActifs ?? []);

  // ── RGPD + droit à l'image ──────────────────────────────────────
  // L'ancien état initial posait `consentementDate` à la date du jour même
  // sans consentement : 7 fiches de production portaient ainsi une date de
  // recueil pour un consentement jamais recueilli. Voir src/lib/consentementRgpd.ts.
  const [rgpd, setRgpd] = useState<RgpdConsent>(() => normaliserRgpd(seed.rgpd));
  const [droitImage, setDroitImage] = useState<boolean>(seed.droitImage ?? false);
  const [beneficiaireSap, setBeneficiaireSap] = useState<boolean>(seed.beneficiaireSap ?? false);

  // Pathologie saisie ailleurs (bilan initial, ou formulaire mobile dont le
  // brouillon est partagé sous la même clé) : ce formulaire n'a pas de champ
  // pour elle, mais ne doit pas la perdre en reprenant le brouillon.
  const [pathologieBrouillon] = useState<string | undefined>(seed.pathologie);

  // ── Champs texte ────────────────────────────────────────────────
  const [form, setForm] = useState({
    nom:               seed.nom               ?? '',
    prenom:            seed.prenom            ?? '',
    dateNaissance:     seed.dateNaissance     ?? '',
    dateCreation:      seed.dateCreation      ?? new Date().toISOString().slice(0, 10),
    email:             seed.email             ?? '',
    telephone:         seed.telephone         ?? '',
    contexteClinic:    seed.contexteClinic    ?? '',
    adresseRue:        seed.adresseRue        ?? '',
    adresseCodePostal: seed.adresseCodePostal ?? '',
    adresseVille:      seed.adresseVille      ?? '',
    codePortail:       seed.codePortail       ?? '',
    personneContact:   seed.personneContact   ?? '',
    taille:               seed.taille?.toString() ?? '',
    poids:                seed.poids?.toString()  ?? '',
    nomNaissance:         seed.nomNaissance         ?? '',
    villeNaissance:       seed.villeNaissance       ?? '',
    codePostalNaissance:  seed.codePostalNaissance  ?? '',
    iban:                 seed.iban              ?? '',
    bic:                  seed.bic               ?? '',
    allergies:            seed.allergies         ?? '',
  });

  // ── Date de naissance : saisie au clavier JJ/MM/AAAA ──────────────
  // form.dateNaissance reste l'ISO stocké (AAAA-MM-JJ, inchangé) ; ce texte
  // séparé est ce que l'utilisateur voit et tape — les deux ne peuvent pas
  // être le même state, l'ordre des chiffres diffère entre les deux formats.
  // Voir src/utils/dateNaissance.ts.
  const [dateNaissanceSaisie, setDateNaissanceSaisie] = useState(
    formaterDateNaissanceAffichage(seed.dateNaissance ?? ''),
  );
  const [dateNaissanceErreur, setDateNaissanceErreur] = useState<string | null>(null);

  function handleChangeDateNaissance(e: React.ChangeEvent<HTMLInputElement>) {
    const masque = masquerSaisieDateNaissance(e.target.value);
    setDateNaissanceSaisie(masque);
    // Pas d'erreur affichée pendant la frappe, y compris sur une saisie
    // incomplète : seulement au blur (handleBlurDateNaissance) ou à la
    // soumission (validerDateNaissance). Une date valide ou incomplète
    // efface toujours une éventuelle erreur précédente.
    setDateNaissanceErreur(null);
    const resultat = parserDateNaissanceSaisie(masque);
    setForm(f => ({ ...f, dateNaissance: resultat.statut === 'valide' ? resultat.iso : '' }));
  }

  function handleBlurDateNaissance() {
    if (!dateNaissanceSaisie) return; // required s'en charge à la soumission
    setDateNaissanceErreur(messageErreurDateNaissance(parserDateNaissanceSaisie(dateNaissanceSaisie)));
  }

  // Revalidée à la soumission (pas seulement au blur) : un champ jamais
  // quitté après une saisie invalide ne doit pas passer inaperçu.
  function validerDateNaissance(): string | null {
    if (form.dateNaissance) return null;
    return dateNaissanceSaisie
      ? messageErreurDateNaissance(parserDateNaissanceSaisie(dateNaissanceSaisie))
      : 'La date de naissance est obligatoire.';
  }

  // ── Organisation des séances : nb séances/semaine + durées obligatoires ──
  const [erreurOrganisation, setErreurOrganisation] = useState<string | null>(null);

  // Obligatoire uniquement à la création — sur une fiche déjà existante, ce
  // champ peut avoir toujours été vide et ne doit jamais bloquer un
  // enregistrement sans rapport (téléphone, notes...). Voir le rappel
  // discret non bloquant affiché à côté du champ en modification.
  function validerOrganisation(): string | null {
    if (enModification) return null;
    const n = anamnese.organisation?.nbSeancesSemaine;
    if (!n || n <= 0) return 'Veuillez indiquer le nombre de séances par semaine.';
    const durees = anamnese.organisation?.dureesSeances ?? [];
    if (durees.length !== n || durees.some(d => !d || d <= 0)) {
      return 'Veuillez indiquer la durée de chaque séance.';
    }
    return null;
  }

  // ── Handlers ────────────────────────────────────────────────────

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  function setSedData(reponses: SedentariteReponses) {
    const sc = computeSedScore(reponses);
    setAnamnese(a => ({
      ...a,
      sedentariteReponses: reponses,
      sedentariteScore: sc?.total ?? null,
      sedentariteProfil: sc ? getSedProfil(sc.total).profil : null,
    }));
  }

  function setFSSData(reponses: (number | null)[]) {
    // Score seulement si les neuf affirmations sont répondues : la somme des
    // seuls items renseignés n'est pas comparable au seuil de 36, qui les
    // suppose toutes. Voir src/lib/scoresAutonomie.ts.
    const score = computeFSSScore(reponses);
    setAnamnese(a => ({
      ...a,
      fatigueReponses: reponses,
      fatigueScore: score,
      fatigueProfil: score !== null ? getFSSProfil(score).profil : null,
    }));
  }

  function buildPayload(): Omit<Participant, 'id' | 'token' | 'bilans'> {
    return {
      ...form,
      taille: form.taille ? Number(form.taille) : undefined,
      poids:  form.poids  ? Number(form.poids)  : undefined,
      // Préserver les données cliniques existantes (issues du bilan initial)
      pathologie:              pathologieBrouillon,
      antecedentsMedicaux:     initial?.antecedentsMedicaux,
      antecedentsChirurgicaux: initial?.antecedentsChirurgicaux,
      modeDeplacementHabituel: profilActivite.modeDeplacementHabituel,
      modeDeplacementDetail:   profilActivite.modeDeplacementDetail || undefined,
      activitesSouhaitees:     profilActivite.activitesSouhaitees.length > 0 ? profilActivite.activitesSouhaitees : undefined,
      objectifsPatient:        profilActivite.objectifsPatient.length > 0 ? profilActivite.objectifsPatient : undefined,
      disponibilites:          initial?.disponibilites,
      droitImage,
      beneficiaireSap,
      tags, testsActifs, rgpd,
      traitements: traitements.length > 0 ? traitements : undefined,
      antecedentsMedicauxStructures: antecedents.length > 0 ? antecedents : undefined,
      anamnese,
      structureId: structureId || undefined,
      profil:         initial?.profil,
      coordonnees:    initial?.coordonnees,
      geocodeFailed:  initial?.geocodeFailed,
      programmes:     initial?.programmes,
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const erreurDate = validerDateNaissance();
    if (erreurDate) {
      setDateNaissanceErreur(erreurDate);
      toast.error(erreurDate);
      return;
    }
    const erreur = validerOrganisation();
    if (erreur) {
      setErreurOrganisation(erreur);
      toast.error(erreur);
      return;
    }
    setErreurOrganisation(null);
    // Consentement RGPD : bloquant à la création, jamais en modification.
    const erreurRgpd = enModification ? null : erreurConsentementCreation(rgpd);
    if (erreurRgpd) {
      toast.error(erreurRgpd);
      return;
    }
    onSubmit(buildPayload());
  }

  useImperativeHandle(ref, () => ({
    submit: () => {
      if (!form.prenom.trim() || !form.nom.trim()) {
        return { step: 1, message: 'Le prénom et le nom sont obligatoires.' };
      }
      const erreurDate = validerDateNaissance();
      if (erreurDate) {
        setDateNaissanceErreur(erreurDate);
        return { step: 1, message: erreurDate };
      }
      const erreur = validerOrganisation();
      if (erreur) {
        setErreurOrganisation(erreur);
        return { step: 4, message: erreur };
      }
      setErreurOrganisation(null);
      // Consentement RGPD : bloquant à la création, jamais en modification.
      // Vaut aussi pour un brouillon repris d'un autre formulaire (mobile) :
      // son `rgpd` a été normalisé à l'initialisation, rien ne le contourne.
      const erreurRgpd = enModification ? null : erreurConsentementCreation(rgpd);
      if (erreurRgpd) return { step: 5, message: erreurRgpd };
      onSubmit(buildPayload());
      return true;
    },
  }));

  // ── Brouillon : sauvegarde auto (debounce 800ms) ─────────────────
  const donneesBrouillon = useMemo(() => ({
    ...form,
    taille: form.taille ? Number(form.taille) : undefined,
    poids:  form.poids  ? Number(form.poids)  : undefined,
    anamnese, traitements, antecedentsMedicauxStructures: antecedents,
    rgpd, droitImage, beneficiaireSap, structureId,
    pathologie: pathologieBrouillon,
    modeDeplacementHabituel: profilActivite.modeDeplacementHabituel,
    modeDeplacementDetail:   profilActivite.modeDeplacementDetail || undefined,
    activitesSouhaitees:     profilActivite.activitesSouhaitees,
    objectifsPatient:        profilActivite.objectifsPatient,
  }), [form, anamnese, traitements, antecedents, rgpd, droitImage, beneficiaireSap, structureId, profilActivite, pathologieBrouillon]);

  const enAttenteRef = useRef(false);
  const derniereEtapeRef = useRef(step ?? 0);
  const dernieresDonneesRef = useRef(donneesBrouillon);
  useEffect(() => {
    derniereEtapeRef.current = step ?? 0;
    dernieresDonneesRef.current = donneesBrouillon;
  }, [step, donneesBrouillon]);

  useEffect(() => {
    if (!draftKey) return;
    enAttenteRef.current = true;
    const t = setTimeout(() => {
      enAttenteRef.current = false;
      sauvegarderBrouillonParticipant(draftKey, step ?? 0, donneesBrouillon);
    }, 800);
    return () => clearTimeout(t);
  }, [draftKey, step, donneesBrouillon]);

  // Démontage sans fermeture de page — rotation du téléphone, qui remplace le
  // formulaire complet par le formulaire mobile (App.tsx). Le nettoyage du
  // debounce annulait la sauvegarde en attente. On l'écrit, sauf si le
  // brouillon a été supprimé volontairement depuis l'ouverture (fiche créée,
  // « Annuler »).
  useEffect(() => {
    if (!draftKey) return;
    const ouverture = Date.now();
    const enAttente = enAttenteRef;
    const etape = derniereEtapeRef;
    const donnees = dernieresDonneesRef;
    return () => {
      if (enAttente.current && !brouillonParticipantSupprimeDepuis(draftKey, ouverture)) {
        sauvegarderBrouillonParticipant(draftKey, etape.current, donnees.current);
      }
    };
  }, [draftKey]);

  // ── Indicateur de complétion ─────────────────────────────────────
  useEffect(() => {
    if (!onCompletionChange) return;
    const { filled, total } = computeCompletion(form, anamnese, traitements, antecedents, rgpd, profilActivite);
    onCompletionChange(filled, total);
  }, [form, anamnese, traitements, antecedents, rgpd, profilActivite, onCompletionChange]);

  // ── Calcul IMC ──────────────────────────────────────────────────
  // Compte rendu de Pierre (25/11/2026) : la classification s'affichait en
  // couleur dès la saisie, parfois « Obésité morbide », devant le
  // bénéficiaire. La valeur reste visible, l'interprétation est repliée.
  const imc = calculerIMC(Number(form.taille), Number(form.poids));
  const imcCat = imc ? categorieIMC(imc) : null;
  const [voirInterpretationIMC, setVoirInterpretationIMC] = useState(false);

  // ── IBAN validation ──────────────────────────────────────────────
  const ibanClean = form.iban.replace(/\s/g, '');
  const ibanValide = ibanClean.length === 0 || validerIBAN(ibanClean);

  const emailPraticien = chargerSettingsPraticien().email || 'votre email professionnel';

  const aidesMobilite = aidesMobiliteDepuis(anamnese.autonomie);
  const objectifs = profilActivite.objectifsPatient.filter(o => o.trim() !== '');
  const materiel = (anamnese.activitePhysique?.materielDisponible ?? []).filter(m => m.trim() !== '');
  const contactsSante = anamnese.autonomie?.contactsSante ?? [];

  const showAll = step === undefined;
  const Wrapper = showAll ? 'form' : 'div';
  const wrapperProps = showAll ? { onSubmit: handleSubmit } : {};

  // ──────────────────────────────────────────────────────────────────────────
  // Rubriques en `Carte` (charte du tableau de bord V1) depuis le 25/11/2026.
  // L'ordre des étapes ne change pas ; seuls les blocs SAP (étape 4 → 1),
  // contacts professionnels (3 → 1) et taille/poids (1 → 2) ont bougé. Les
  // données restent dans les mêmes colonnes.
  return (
    <Wrapper {...wrapperProps} className="space-y-4">

      {(showAll || step === 1) && <>
      {/* ── IDENTITÉ ── */}
      <Carte id="rubrique-identite" titre="Identité" aide="Les informations qui permettent d'identifier le bénéficiaire.">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={CLS_LABEL}>Prénom *</label>
            <input name="prenom" value={form.prenom} onChange={handleChange} required placeholder="Jean" className={CLS_INPUT} />
          </div>
          <div>
            <label className={CLS_LABEL}>Nom *</label>
            <input name="nom" value={form.nom} onChange={handleChange} required placeholder="Dupont" className={CLS_INPUT} />
          </div>
          <div>
            <label className={CLS_LABEL}>Date de naissance *</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="bday"
              name="dateNaissance"
              placeholder="JJ/MM/AAAA"
              maxLength={10}
              value={dateNaissanceSaisie}
              onChange={handleChangeDateNaissance}
              onBlur={handleBlurDateNaissance}
              required
              className={`${CLS_INPUT}${dateNaissanceErreur ? ' border-red-300 focus:border-red-400 focus:ring-red-100' : ''}`}
            />
            {dateNaissanceErreur && (
              <p className="text-xs text-red-500 mt-1">{dateNaissanceErreur}</p>
            )}
          </div>
          <div>
            <label className={CLS_LABEL}>Date d'entrée *</label>
            <input type="date" name="dateCreation" value={form.dateCreation} onChange={handleChange} required className={CLS_INPUT} />
          </div>
        </div>
      </Carte>

      {/* ── COORDONNÉES ── */}
      <Carte id="rubrique-coordonnees" titre="Coordonnées" aide="Pour joindre le bénéficiaire et se rendre à son domicile.">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={CLS_LABEL}>Téléphone</label>
            <input name="telephone" value={form.telephone} onChange={handleChange} placeholder="06 12 34 56 78" className={CLS_INPUT} />
          </div>
          <div>
            <label className={CLS_LABEL}>Email</label>
            <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="jean@email.com" className={CLS_INPUT} />
          </div>
        </div>
        <div>
          <label className={CLS_LABEL}>Adresse du domicile <span className="text-gray-400 font-normal">(pour la carte et les trajets)</span></label>
          <input name="adresseRue" value={form.adresseRue} onChange={handleChange}
            placeholder="12 rue des Lilas" className={`${CLS_INPUT} mb-2`} />
          <div className="grid grid-cols-3 gap-2">
            <input name="adresseCodePostal" value={form.adresseCodePostal} onChange={handleChange}
              placeholder="75013" aria-label="Code postal" className={CLS_INPUT} />
            <input name="adresseVille" value={form.adresseVille} onChange={handleChange}
              placeholder="Paris" aria-label="Ville" className={`col-span-2 ${CLS_INPUT}`} />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={CLS_LABEL}>Code portail / digicode <span className="text-gray-400 font-normal">(optionnel)</span></label>
            <input name="codePortail" value={form.codePortail} onChange={handleChange}
              placeholder="A1234" className={CLS_INPUT} />
          </div>
          <div>
            <label className={CLS_LABEL}>Proche à contacter <span className="text-gray-400 font-normal">(optionnel)</span></label>
            <input name="personneContact" value={form.personneContact} onChange={handleChange}
              placeholder="Marie Dupont (fille) — 06 12 34 56 78" className={CLS_INPUT} />
          </div>
        </div>
      </Carte>

      {/* ── PROFESSIONNELS CONTACTÉS ── (déplacé de « Mode de vie », 25/11/2026 ;
          toujours stocké dans anamnese.autonomie.contactsSante) */}
      <Carte id="rubrique-professionnels" titre="Professionnels de santé"
        aide="Médecin traitant, kinésithérapeute… : les personnes à qui adresser un compte rendu.">
        <ContactsSanteForm
          sansTitre
          value={contactsSante}
          onChange={v => setAnamnese(a => ({ ...a, autonomie: { ...a.autonomie, contactsSante: v } }))}
        />
      </Carte>

      {/* ── SERVICE À LA PERSONNE ── (regroupé le 25/11/2026 : les champs de
          naissance étaient à l'étape 1, le choix SAP et la banque à l'étape 4) */}
      <Carte id="rubrique-sap" titre="Informations relatives au service à la personne"
        aide="Tout ce qu'il faut pour inscrire le bénéficiaire au SAP et établir ses attestations fiscales.">
        {/* Décision 3 du 2026-10-20 : un bénéficiaire SAP n'a aucune facture générée automatiquement. */}
        <div>
          <div className={CLS_LABEL}>Facturation</div>
          <div className="flex gap-2" role="radiogroup" aria-label="Facturation Hors SAP ou SAP">
            {([[false, 'Hors SAP'], [true, 'SAP']] as const).map(([valeur, libelle]) => (
              <button key={libelle} type="button" role="radio" aria-checked={beneficiaireSap === valeur}
                data-testid={valeur ? 'beneficiaire-sap' : 'beneficiaire-hors-sap'}
                onClick={() => setBeneficiaireSap(valeur)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  beneficiaireSap === valeur ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-primary/40'
                }`}>
                {libelle}
              </button>
            ))}
          </div>
          {beneficiaireSap && (
            <p className="text-xs text-gray-500 mt-1.5">Aucune facture n'est générée automatiquement pour un bénéficiaire SAP (ses brouillons en cours sont retirés).</p>
          )}
        </div>

        <div className="pt-1">
          <div className="text-xs font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: 'var(--color-ink-2)' }}>Identité fiscale</div>
          <div className="space-y-4">
            <div>
              <label className={CLS_LABEL}>Nom de naissance <span className="text-gray-400 font-normal">(si différent, optionnel)</span></label>
              <input name="nomNaissance" value={form.nomNaissance} onChange={handleChange}
                placeholder="Martin" className={CLS_INPUT} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={CLS_LABEL}>Ville de naissance <span className="text-gray-400 font-normal">(optionnel)</span></label>
                <input name="villeNaissance" value={form.villeNaissance} onChange={handleChange}
                  placeholder="Nantes" className={CLS_INPUT} />
              </div>
              <div>
                <label className={CLS_LABEL}>Code postal de naissance <span className="text-gray-400 font-normal">(optionnel)</span></label>
                <input name="codePostalNaissance" value={form.codePostalNaissance} onChange={handleChange}
                  placeholder="44000" className={CLS_INPUT} />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl p-4 space-y-4" style={{ background: '#F6FAFA', border: '1px solid #E2EEEE' }}>
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--color-ink)' }}>Coordonnées bancaires</div>
            {/* Le texte précédent disait « stockées uniquement sur votre appareil » :
                c'était faux, IBAN et BIC sont en base (participants.iban/bic) et
                dans le PDF Dossier praticien. Corrigé le 25/11/2026. */}
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-ink-2)' }}>
              Utilisées pour le SAP. Enregistrées dans la fiche du bénéficiaire, visibles par vous seul.
            </p>
          </div>
          <div>
            <label className={CLS_LABEL}>IBAN</label>
            <input
              name="iban"
              value={formatIBAN(form.iban)}
              onChange={e => setForm(f => ({ ...f, iban: e.target.value.replace(/\s/g, '').toUpperCase() }))}
              placeholder="FR76 3000 6000 0112 3456 7890 189"
              maxLength={42}
              className={`w-full bg-white border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 font-mono tracking-wide ${
                ibanClean && !ibanValide
                  ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                  : 'border-gray-200 focus:border-primary focus:ring-primary/10'
              }`}
            />
            {ibanClean && !ibanValide && (
              <p className="text-xs text-red-500 mt-1">Format IBAN invalide</p>
            )}
            {ibanClean && ibanValide && (
              <p className="text-xs text-green-600 mt-1">✓ IBAN valide</p>
            )}
          </div>
          <div>
            <label className={CLS_LABEL}>BIC / SWIFT</label>
            <input
              name="bic"
              value={form.bic}
              onChange={e => setForm(f => ({ ...f, bic: e.target.value.toUpperCase() }))}
              placeholder="BNPAFRPPXXX"
              maxLength={11}
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 font-mono tracking-wide"
            />
          </div>
        </div>
      </Carte>
      </>}

      {(showAll || step === 4) && <>
      {/* ── RATTACHEMENT STRUCTURE ── (toujours visible depuis le 25/11/2026 :
          masqué sans structure, un nouvel utilisateur ne le découvrait jamais) */}
      <Carte id="rubrique-rattachement" titre="Suivi en structure ou en indépendant"
        aide="Rattachez le bénéficiaire à une structure (EHPAD, association, centre…) si vous intervenez pour elle : ses séances et sa facturation lui seront associées.">
        {structures.length > 0 ? (
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="rattachement" checked={!structureId} onChange={() => setStructureId(undefined)} className="accent-primary" />
              <span className="text-sm text-gray-700">Suivi en indépendant</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="rattachement" checked={!!structureId} onChange={() => setStructureId(structures[0]?.id)} className="accent-primary" />
              <span className="text-sm text-gray-700">Rattaché à une structure</span>
            </label>
            {structureId && (
              <select
                value={structureId}
                onChange={e => setStructureId(e.target.value)}
                aria-label="Structure"
                className={`mt-1 ${CLS_INPUT}`}
              >
                {structures.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
              </select>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-600">
            Suivi en indépendant. Aucune structure n'est encore enregistrée :{' '}
            <Link to="/structures" className="font-semibold text-primary hover:underline">ajouter une structure</Link>
            {' '}pour pouvoir y rattacher vos bénéficiaires.
          </p>
        )}
      </Carte>

      {/* ── OBJECTIFS ── */}
      <Carte id="rubrique-objectifs" titre="Objectifs" aide="Ce que le bénéficiaire souhaite atteindre. Le premier objectif est le plus prioritaire.">
        <ChoixMultiple
          label=""
          options={OPTIONS_OBJECTIFS_PATIENT}
          value={profilActivite.objectifsPatient}
          onChange={v => setProfilActivite(p => ({ ...p, objectifsPatient: v }))}
          avecChampLibre
          placeholderCustom="Objectif personnalisé..."
        />
        {/* Priorité (25/11/2026) : l'ordre de objectifs_patient (jsonb) est la
            priorité ; le PDF, l'assistant et le compte rendu structure lisent
            déjà la liste dans cet ordre. */}
        <ListeOrdonnee
          titre="Ordre de priorité"
          aide="Utilisez les flèches pour placer en premier les axes de travail principaux."
          value={profilActivite.objectifsPatient}
          onChange={v => setProfilActivite(p => ({ ...p, objectifsPatient: v }))}
        />
      </Carte>

      {/* ── ORGANISATION DES SÉANCES ── */}
      <Carte id="rubrique-organisation" titre="Organisation des séances" aide="Disponibilités et préférences pour planifier les séances.">
        <ChoixMultiple
          label="Jour(s) disponible(s)"
          options={OPTIONS_JOURS_DISPONIBLES}
          value={anamnese.organisation?.joursDisponibles ?? []}
          onChange={v => setAnamnese(a => ({ ...a, organisation: { ...a.organisation, joursDisponibles: v } }))}
        />
        <div>
          <label className={CLS_LABEL}>Créneaux horaires par jour</label>
          <CreneauxParJourForm
            jours={anamnese.organisation?.joursDisponibles ?? []}
            value={anamnese.organisation?.creneauxParJour ?? {}}
            onChange={v => setAnamnese(a => ({ ...a, organisation: { ...a.organisation, creneauxParJour: v } }))}
          />
        </div>
        <div>
          <label className={CLS_LABEL}>Contraintes particulières</label>
          <textarea
            value={anamnese.organisation?.contraintes ?? ''}
            onChange={e => setAnamnese(a => ({ ...a, organisation: { ...a.organisation, contraintes: e.target.value } }))}
            placeholder="Jamais avant 9h, accompagné le lundi..."
            rows={2}
            className={CLS_INPUT}
          />
        </div>
        <div>
          <label className={CLS_LABEL}>
            Fréquence des séances{!enModification && ' *'}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {OPTIONS_FREQUENCE.map(opt => {
              const selected = anamnese.organisation?.nbSeancesSemaine === opt.nbSeancesSemaine
                && (anamnese.organisation?.periodicite ?? 'semaine') === opt.periodicite;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setErreurOrganisation(null);
                    setAnamnese(a => {
                      const prevDurees = a.organisation?.dureesSeances ?? [];
                      const dureesSeances = Array.from({ length: opt.nbSeancesSemaine }, (_, i) => prevDurees[i] ?? 45);
                      return {
                        ...a,
                        organisation: {
                          ...a.organisation,
                          nbSeancesSemaine: opt.nbSeancesSemaine,
                          periodicite: opt.periodicite,
                          dureesSeances,
                        },
                      };
                    });
                  }}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors text-left ${
                    selected ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-200 hover:border-primary/50'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {erreurOrganisation && (
            <p className="text-xs text-red-500 mt-1.5">{erreurOrganisation}</p>
          )}
          {enModification && !anamnese.organisation?.nbSeancesSemaine && (
            <p className="text-xs text-amber-600 mt-1.5">
              Pensez à renseigner la fréquence des séances pour l'optimisation de tournée.
            </p>
          )}
        </div>
        {!!anamnese.organisation?.nbSeancesSemaine && (
          <div>
            <label className={CLS_LABEL}>Durée souhaitée par séance</label>
            <div className="grid grid-cols-2 gap-4">
              {(anamnese.organisation?.dureesSeances ?? []).map((duree, i) => (
                <div key={i}>
                  <label className="block text-xs text-gray-500 mb-1.5">Séance {i + 1}</label>
                  <select
                    value={duree}
                    onChange={e => setAnamnese(a => ({
                      ...a,
                      organisation: {
                        ...a.organisation,
                        dureesSeances: (a.organisation?.dureesSeances ?? []).map((d, j) => j === i ? Number(e.target.value) : d),
                      },
                    }))}
                    className={CLS_INPUT}
                  >
                    {OPTIONS_DUREE_SEANCE_MIN.map(d => (
                      <option key={d} value={d}>{d} min</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </Carte>
      </>}

      {(showAll || step === 2) && <>
      {/* ── MORPHOLOGIE ── (taille et poids viennent de l'étape 1, 25/11/2026) */}
      <Carte id="rubrique-morphologie" titre="Morphologie">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={CLS_LABEL}>Taille (cm)</label>
            <input type="number" name="taille" value={form.taille} onChange={handleChange}
              placeholder="165" min={100} max={220} className={CLS_INPUT} />
          </div>
          <div>
            <label className={CLS_LABEL}>Poids (kg)</label>
            <input type="number" name="poids" value={form.poids} onChange={handleChange}
              placeholder="70" min={30} max={250} className={CLS_INPUT} />
          </div>
        </div>
        {imc !== null && imcCat && (
          <div className="text-sm text-gray-600 flex items-center gap-3 flex-wrap">
            <span>IMC : <span className="font-semibold text-gray-700">{imc.toLocaleString('fr-FR')}</span></span>
            <button type="button" onClick={() => setVoirInterpretationIMC(v => !v)} aria-expanded={voirInterpretationIMC}
              className="text-xs text-gray-500 underline underline-offset-2 hover:text-primary">
              {voirInterpretationIMC ? "Masquer l'interprétation" : "Voir l'interprétation"}
            </button>
            {voirInterpretationIMC && <span className="text-xs text-gray-500">{imcCat.label} (classification OMS)</span>}
          </div>
        )}
      </Carte>

      {/* ── ÉTAT DE SANTÉ GÉNÉRAL ── */}
      <Carte id="rubrique-etat-sante" titre="État de santé général" aide="Ressenti au quotidien du bénéficiaire.">
        <Echelle10
          label="Douleur quotidienne (0-10)"
          value={anamnese.douleurQuotidienne}
          onChange={n => setAnamnese(a => ({ ...a, douleurQuotidienne: n }))}
        />
        <Echelle10
          label="Fatigue quotidienne (0-10)"
          value={anamnese.fatigueQuotidienne}
          onChange={n => setAnamnese(a => ({ ...a, fatigueQuotidienne: n }))}
        />
        <div className="border-t border-gray-100 pt-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-700">Contre-indications à l'effort physique ?</span>
            <ToggleOuiNon
              value={anamnese.contreIndications}
              onChange={v => setAnamnese(a => ({ ...a, contreIndications: v }))}
            />
          </div>
          {anamnese.contreIndications === 'oui' && (
            <textarea
              value={anamnese.contreIndicationsDetail ?? ''}
              onChange={e => setAnamnese(a => ({ ...a, contreIndicationsDetail: e.target.value }))}
              placeholder="FC max 130 bpm, éviter les impacts, pas de port de charges > 5 kg..."
              rows={2}
              className={`mt-2 ${CLS_INPUT}`}
            />
          )}
          <p className="text-xs text-gray-400 mt-1.5">Ces contre-indications seront affichées en alerte dans la fiche bénéficiaire et tous les PDFs.</p>
        </div>
      </Carte>

      {/* ── TRAITEMENTS ── */}
      <Carte id="rubrique-traitements" titre="Traitements médicamenteux" aide="Nom, dose et effet secondaire notable de chaque traitement en cours.">
        <ListeTraitementsForm value={traitements} onChange={setTraitements} />
      </Carte>

      {/* ── ANTÉCÉDENTS MÉDICAUX ── */}
      <Carte id="rubrique-antecedents" titre="Antécédents médicaux" aide="Pathologies, chirurgies, fractures, prothèses, hospitalisations, accidents…">
        <div>
          <label className={CLS_LABEL}>Allergies connues</label>
          <input name="allergies" value={form.allergies} onChange={handleChange}
            placeholder="Aspirine, latex..." className={CLS_INPUT} />
        </div>
        <ListeAntecedentsForm value={antecedents} onChange={setAntecedents} />
      </Carte>

      {/* ── ANTÉCÉDENTS DE CHUTES ── */}
      <Carte id="rubrique-chutes" titre="Antécédents de chutes" aide="Nombre, période, circonstances…">
        <ChutesForm
          value={anamnese.chutes ?? {}}
          onChange={chutes => setAnamnese(a => ({ ...a, chutes }))}
        />
      </Carte>

      {/* ── COGNITION & HUMEUR ── */}
      <Carte id="rubrique-cognition" titre="Cognition et humeur" aide="Mémoire, suivi psychologique, motivation.">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-700">Plaintes mémoire ?</span>
            <ToggleOuiNon
              value={anamnese.cognition?.plaintesMemoire}
              onChange={v => setAnamnese(a => ({ ...a, cognition: { ...a.cognition, plaintesMemoire: v } }))}
            />
          </div>
          {anamnese.cognition?.plaintesMemoire === 'oui' && (
            <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
              <ChoixOuTexte
                label="Depuis quand ?"
                options={OPTIONS_DEPUIS_QUAND}
                value={anamnese.cognition?.plaintesMemoireDepuisQuand}
                onChange={v => setAnamnese(a => ({ ...a, cognition: { ...a.cognition, plaintesMemoireDepuisQuand: v } }))}
              />
              <div>
                <label className={CLS_LABEL}>Dans quel contexte ?</label>
                <input
                  type="text"
                  value={anamnese.cognition?.plaintesMemoireContexte ?? ''}
                  onChange={e => setAnamnese(a => ({ ...a, cognition: { ...a.cognition, plaintesMemoireContexte: e.target.value } }))}
                  placeholder="Stress, fatigue, post-opératoire..."
                  className={CLS_INPUT}
                />
              </div>
              <ChoixUnique
                label="Plaintes signalées par"
                options={OPTIONS_SIGNALE_PAR}
                value={anamnese.cognition?.plaintesMemoireSignalePar}
                onChange={v => setAnamnese(a => ({ ...a, cognition: { ...a.cognition, plaintesMemoireSignalePar: v } }))}
              />
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-700">Suivi psychologique ?</span>
            <ToggleOuiNon
              value={anamnese.cognition?.suiviPsy}
              onChange={v => setAnamnese(a => ({ ...a, cognition: { ...a.cognition, suiviPsy: v } }))}
            />
          </div>
          {anamnese.cognition?.suiviPsy === 'oui' && (
            <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
              <ChoixUnique
                label="Par qui ?"
                options={OPTIONS_SUIVI_PSY_QUI}
                value={anamnese.cognition?.suiviPsyQui}
                onChange={v => setAnamnese(a => ({ ...a, cognition: { ...a.cognition, suiviPsyQui: v } }))}
              />
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className={CLS_LABEL}>Où ?</label>
                  <input
                    type="text"
                    value={anamnese.cognition?.suiviPsyOu ?? ''}
                    onChange={e => setAnamnese(a => ({ ...a, cognition: { ...a.cognition, suiviPsyOu: e.target.value } }))}
                    placeholder="Cabinet, hôpital, téléconsultation..."
                    className={CLS_INPUT}
                  />
                </div>
                <div>
                  <label className={CLS_LABEL}>Pourquoi ?</label>
                  <input
                    type="text"
                    value={anamnese.cognition?.suiviPsyPourquoi ?? ''}
                    onChange={e => setAnamnese(a => ({ ...a, cognition: { ...a.cognition, suiviPsyPourquoi: e.target.value } }))}
                    placeholder="Anxiété, dépression, deuil, trauma, autre..."
                    className={CLS_INPUT}
                  />
                </div>
              </div>
              <ChoixOuTexte
                label="Depuis quand ?"
                options={OPTIONS_DEPUIS_QUAND}
                value={anamnese.cognition?.suiviPsyDepuisQuand}
                onChange={v => setAnamnese(a => ({ ...a, cognition: { ...a.cognition, suiviPsyDepuisQuand: v } }))}
              />
              <ChoixUnique
                label="Fréquence"
                options={OPTIONS_SUIVI_PSY_FREQUENCE}
                value={anamnese.cognition?.suiviPsyFrequence}
                onChange={v => setAnamnese(a => ({ ...a, cognition: { ...a.cognition, suiviPsyFrequence: v } }))}
              />
            </div>
          )}
        </div>

        <div>
          <ChoixUnique
            label="Pourquoi le bénéficiaire est-il là aujourd'hui ?"
            options={OPTIONS_ORIGINE_DEMARCHE}
            value={anamnese.cognition?.origineDemarche}
            onChange={v => setAnamnese(a => ({
              ...a,
              // La précision ne vaut que pour « Autre » : on l'efface si on
              // change d'avis, pour ne pas garder un texte qui ne s'affiche plus.
              cognition: { ...a.cognition, origineDemarche: v, origineDemarcheDetail: v === OPTION_ORIGINE_AUTRE ? a.cognition?.origineDemarcheDetail : undefined },
            }))}
          />
          {anamnese.cognition?.origineDemarche === OPTION_ORIGINE_AUTRE && (
            <input
              type="text"
              value={anamnese.cognition?.origineDemarcheDetail ?? ''}
              onChange={e => setAnamnese(a => ({ ...a, cognition: { ...a.cognition, origineDemarcheDetail: e.target.value } }))}
              placeholder="Précisez : orienté par une structure, une association..."
              aria-label="Précision sur l'origine de la démarche"
              className={`mt-2 ${CLS_INPUT}`}
            />
          )}
          <p className="text-xs text-gray-400 mt-1.5">La motivation intrinsèque influence l'implication dans le suivi.</p>
        </div>
      </Carte>
      </>}

      {(showAll || step === 3) && <>
      {/* ── AUTONOMIE & MODE DE VIE ── */}
      <Carte id="rubrique-autonomie" titre="Autonomie et mode de vie" aide="Situation de vie, aides, mobilité et évaluation GIR.">
        <ChoixUnique
          label="Situation de vie"
          options={OPTIONS_SITUATION_VIE}
          value={anamnese.autonomie?.situationVie}
          onChange={v => setAnamnese(a => ({ ...a, autonomie: { ...a.autonomie, situationVie: v } }))}
        />
        <div className="border-t border-gray-100 pt-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-700">Aide à domicile ?</span>
            <ToggleOuiNon
              value={anamnese.autonomie?.aideADomicile}
              onChange={v => setAnamnese(a => ({ ...a, autonomie: { ...a.autonomie, aideADomicile: v } }))}
            />
          </div>
          {anamnese.autonomie?.aideADomicile === 'oui' && (
            <div className="mt-2 space-y-3">
              <ChoixMultiple
                label="Type d'aide"
                options={OPTIONS_TYPE_AIDE_DOMICILE}
                value={anamnese.autonomie?.aideADomicileTypes ?? []}
                onChange={v => setAnamnese(a => ({ ...a, autonomie: { ...a.autonomie, aideADomicileTypes: v } }))}
                avecChampLibre
                placeholderCustom="Type d'aide personnalisé..."
              />
              <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
                <ChoixUnique
                  label="Fréquence"
                  options={OPTIONS_FREQUENCE_AIDE}
                  value={anamnese.autonomie?.aideADomicileFrequence}
                  onChange={v => setAnamnese(a => ({ ...a, autonomie: { ...a.autonomie, aideADomicileFrequence: v } }))}
                />
                <div>
                  <label className={CLS_LABEL}>Heures / semaine</label>
                  <input
                    type="number"
                    value={anamnese.autonomie?.aideADomicileHeures ?? ''}
                    onChange={e => setAnamnese(a => ({ ...a, autonomie: { ...a.autonomie, aideADomicileHeures: e.target.value === '' ? null : Number(e.target.value) } }))}
                    className={NUM_INPUT_CLS}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-gray-100 pt-3">
          <AidesMobiliteForm
            value={anamnese.autonomie ?? {}}
            onChange={patch => setAnamnese(a => ({ ...a, autonomie: { ...a.autonomie, ...patch } }))}
          />
        </div>
        <div className="border-t border-gray-100 pt-3">
          <label className={CLS_LABEL}>Évaluation GIR (grille AGGIR)</label>
          <GIRWidget
            value={anamnese.autonomie?.gir ?? null}
            onChange={gir => setAnamnese(a => ({ ...a, autonomie: { ...a.autonomie, gir } }))}
          />
        </div>
      </Carte>

      {/* ── HABITUDES DE VIE ── (plus compacte, 25/11/2026) */}
      <Carte id="rubrique-habitudes" titre="Habitudes de vie" aide="Alimentation, sommeil, énergie.">
        <div className="grid sm:grid-cols-2 gap-4">
          <ChoixUnique
            label="Repas par jour"
            options={OPTIONS_REPAS}
            value={anamnese.habitudesVie?.nombreRepas}
            onChange={v => setAnamnese(a => ({ ...a, habitudesVie: { ...a.habitudesVie, nombreRepas: v } }))}
          />
          <ChoixUnique
            label="Hydratation estimée"
            options={OPTIONS_HYDRATATION}
            value={anamnese.habitudesVie?.hydratation}
            onChange={v => setAnamnese(a => ({ ...a, habitudesVie: { ...a.habitudesVie, hydratation: v } }))}
          />
          <Echelle5
            label="Qualité du sommeil (1-5)"
            value={anamnese.habitudesVie?.qualiteSommeil}
            onChange={n => setAnamnese(a => ({ ...a, habitudesVie: { ...a.habitudesVie, qualiteSommeil: n } }))}
          />
          <Echelle5
            label="Niveau d'appétit (1-5)"
            value={anamnese.habitudesVie?.niveauAppetit}
            onChange={n => setAnamnese(a => ({ ...a, habitudesVie: { ...a.habitudesVie, niveauAppetit: n } }))}
          />
        </div>
        <div className="grid sm:grid-cols-3 gap-4 border-t border-gray-100 pt-3">
          <div>
            <label className={CLS_LABEL}>Heures de sommeil / nuit</label>
            <input
              type="number"
              value={anamnese.habitudesVie?.heuresSommeil ?? ''}
              onChange={e => setAnamnese(a => ({ ...a, habitudesVie: { ...a.habitudesVie, heuresSommeil: e.target.value === '' ? null : Number(e.target.value) } }))}
              className={NUM_INPUT_CLS}
            />
          </div>
          <div>
            <div className={CLS_LABEL}>Variation de poids involontaire ?</div>
            <ToggleOuiNon
              value={anamnese.habitudesVie?.variationPoids}
              onChange={v => setAnamnese(a => ({ ...a, habitudesVie: { ...a.habitudesVie, variationPoids: v } }))}
            />
            {anamnese.habitudesVie?.variationPoids === 'oui' && (
              <input
                type="number"
                value={anamnese.habitudesVie?.variationPoidsKg ?? ''}
                onChange={e => setAnamnese(a => ({ ...a, habitudesVie: { ...a.habitudesVie, variationPoidsKg: e.target.value === '' ? null : Number(e.target.value) } }))}
                placeholder="kg"
                aria-label="Variation de poids en kg"
                className={`mt-2 ${NUM_INPUT_CLS}`}
              />
            )}
          </div>
          <div>
            <div className={CLS_LABEL}>Tabagisme ?</div>
            <ToggleOuiNon
              value={anamnese.habitudesVie?.tabagisme}
              onChange={v => setAnamnese(a => ({ ...a, habitudesVie: { ...a.habitudesVie, tabagisme: v } }))}
            />
            <p className="text-xs text-gray-400 mt-1.5">Aide à comprendre l'essoufflement à l'effort.</p>
          </div>
        </div>
      </Carte>

      {/* ── ACTIVITÉ PHYSIQUE ── */}
      <Carte id="rubrique-activite" titre="Activité physique" aide="Activités pratiquées aujourd'hui et par le passé.">
        <ChoixMultiple
          label="Activités pratiquées actuellement"
          options={OPTIONS_ACTIVITES}
          value={anamnese.activitePhysique?.activitesActuelles ?? []}
          onChange={v => setAnamnese(a => ({ ...a, activitePhysique: { ...a.activitePhysique, activitesActuelles: v } }))}
          avecChampLibre
        />
        <div className="border-t border-gray-100 pt-3">
          <ActivitesPrecedentesForm
            value={anamnese.activitePhysique?.activitesPrecedentes ?? []}
            onChange={v => setAnamnese(a => ({ ...a, activitePhysique: { ...a.activitePhysique, activitesPrecedentes: v } }))}
          />
        </div>
      </Carte>

      {/* ── MATÉRIEL ── (rubrique à part depuis le 25/11/2026 : c'est ce que
          l'enseignant cherche en préparant un programme) */}
      <Carte id="rubrique-materiel" titre="Matériel à disposition" aide="Ce que le bénéficiaire a chez lui pour les exercices. Repris dans sa fiche.">
        <ChoixMultiple
          label=""
          options={OPTIONS_MATERIEL}
          value={anamnese.activitePhysique?.materielDisponible ?? []}
          onChange={v => setAnamnese(a => ({ ...a, activitePhysique: { ...a.activitePhysique, materielDisponible: v } }))}
          avecChampLibre
          placeholderCustom="Matériel personnalisé..."
        />
      </Carte>

      <SectionSedentarite
        value={anamnese.sedentariteReponses ?? EMPTY_SED}
        onChange={setSedData}
      />
      <label className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-700 select-none">
        <input type="checkbox" checked={anamnese.sedentariteVisibleBeneficiaire === true} className="w-4 h-4 accent-primary"
          onChange={e => setAnamnese(a => ({ ...a, sedentariteVisibleBeneficiaire: e.target.checked }))} />
        Partager le niveau d'activité avec le bénéficiaire
      </label>
      <SectionFatigue
        value={anamnese.fatigueReponses ?? Array(9).fill(null)}
        onChange={setFSSData}
      />
      <label className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-700 select-none">
        <input type="checkbox" checked={anamnese.fatigueVisibleBeneficiaire === true} className="w-4 h-4 accent-primary"
          onChange={e => setAnamnese(a => ({ ...a, fatigueVisibleBeneficiaire: e.target.checked }))} />
        Partager le niveau de fatigue avec le bénéficiaire
      </label>
      <EtatPartageQuestionnaires
        sedentaritePartagee={anamnese.sedentariteVisibleBeneficiaire === true}
        fatiguePartagee={anamnese.fatigueVisibleBeneficiaire === true}
      />
      </>}

      {(showAll || step === 5) && <>
      {!showAll && (
        <Carte id="rubrique-recapitulatif" titre="Récapitulatif" aide="Vérifiez les informations avant d'enregistrer la fiche.">
          <dl className="grid sm:grid-cols-[180px_1fr] gap-x-4 gap-y-2 text-sm">
            <LigneRecap terme="Identité">
              {form.prenom || '—'} {form.nom || '—'}{form.dateNaissance ? ` · né(e) le ${new Date(form.dateNaissance).toLocaleDateString('fr-FR')}` : ''}
            </LigneRecap>
            {(form.email || form.telephone) && (
              <LigneRecap terme="Contact">{[form.telephone, form.email].filter(Boolean).join(' · ')}</LigneRecap>
            )}
            {(form.adresseRue || form.adresseVille) && (
              <LigneRecap terme="Adresse">{[form.adresseRue, form.adresseCodePostal, form.adresseVille].filter(Boolean).join(' ')}</LigneRecap>
            )}
            {contactsSante.length > 0 && (
              <LigneRecap terme="Professionnels">
                {contactsSante.map(c => [c.profession, [c.prenom, c.nom].filter(Boolean).join(' ')].filter(Boolean).join(' : ')).join(' · ')}
              </LigneRecap>
            )}
            <LigneRecap terme="Service à la personne">
              {beneficiaireSap ? 'SAP' : 'Hors SAP'}{ibanClean ? ' · IBAN renseigné' : ''}
            </LigneRecap>
            {imc !== null && <LigneRecap terme="IMC">{imc.toLocaleString('fr-FR')}</LigneRecap>}
            <LigneRecap terme="Traitements">{traitements.length > 0 ? `${traitements.length} renseigné(s)` : 'aucun'}</LigneRecap>
            <LigneRecap terme="Antécédents médicaux">{antecedents.length > 0 ? `${antecedents.length} renseigné(s)` : 'aucun'}</LigneRecap>
            {anamnese.contreIndications === 'oui' && (
              <LigneRecap terme="Contre-indications" alerte>{anamnese.contreIndicationsDetail || 'oui (détail non précisé)'}</LigneRecap>
            )}
            {anamnese.chutes?.aChutes === 'oui' && (
              <LigneRecap terme="Chutes">oui — {anamnese.chutes.chutesDetail?.length ?? 0} chute(s)</LigneRecap>
            )}
            {(aidesMobilite.length > 0 || anamnese.autonomie?.aideMarche === 'Aucune') && (
              <LigneRecap terme="Aides à la mobilité">{aidesMobilite.length > 0 ? aidesMobilite.join(', ') : 'aucune'}</LigneRecap>
            )}
            {anamnese.autonomie?.gir?.niveau != null && (
              <LigneRecap terme="GIR">
                {anamnese.autonomie.gir.niveau}{anamnese.autonomie.gir.mode === 'calcule' ? ' (estimation)' : ''}
              </LigneRecap>
            )}
            {materiel.length > 0 && <LigneRecap terme="Matériel">{materiel.join(', ')}</LigneRecap>}
            {objectifs.length > 0 && (
              <LigneRecap terme="Objectifs">
                <ol className="list-decimal pl-4">{objectifs.map((o, i) => <li key={`${o}-${i}`}>{sansEmoji(o)}</li>)}</ol>
              </LigneRecap>
            )}
            <LigneRecap terme="Suivi">
              {structureId ? (structures.find(s => s.id === structureId)?.nom ?? 'Structure') : 'Indépendant'}
            </LigneRecap>
          </dl>
        </Carte>
      )}

      {/* ── RGPD + DROIT À L'IMAGE ── */}
      <Carte id="rubrique-rgpd" titre="Consentement et protection des données" aide="Conformément au RGPD.">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-600 leading-relaxed">
          <div className="font-semibold text-gray-700 mb-1.5">À lire au bénéficiaire</div>
          <p>"Dans le cadre de votre suivi en APA, je collecte vos données personnelles et de santé. Utilisées uniquement pour votre suivi. Droits d'accès, rectification, effacement : <strong>{emailPraticien}</strong>"</p>
        </div>
        <div className="space-y-2.5">
          {([
            { key: 'consentementObtenu', label: 'Le bénéficiaire a été informé et a consenti' },
            { key: 'droitAcces',         label: "Droit d'accès expliqué" },
            { key: 'droitRectification', label: 'Droit de rectification expliqué' },
            { key: 'droitEffacement',    label: "Droit à l'effacement expliqué" },
          ] as const).map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-700 select-none">
              <input type="checkbox" checked={rgpd[key]} className="w-4 h-4 accent-primary"
                onChange={e => {
                  const coche = e.target.checked;
                  // La date de recueil suit la case du consentement.
                  setRgpd(r => key === 'consentementObtenu'
                    ? avecConsentement(r, coche, new Date().toISOString().slice(0, 10))
                    : { ...r, [key]: coche });
                }} />
              {label}
            </label>
          ))}
          {/* Droit à l'image */}
          <label className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-700 select-none">
            <input type="checkbox" checked={droitImage} className="w-4 h-4 accent-primary"
              onChange={e => setDroitImage(e.target.checked)} />
            Droit à l'image accordé (photos/vidéos en séance)
          </label>
        </div>
        <div>
          <div className="text-xs font-medium text-gray-600 mb-2">Mode de recueil</div>
          <div className="flex gap-2">
            {(['oral_note', 'ecrit', 'numerique'] as const).map(m => (
              <button key={m} type="button" onClick={() => setRgpd(r => ({ ...r, methodeConsentement: m }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  rgpd.methodeConsentement === m ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200'
                }`}>
                {m === 'oral_note' ? 'Oral noté' : m === 'ecrit' ? 'Écrit' : 'Numérique'}
              </button>
            ))}
          </div>
        </div>
        {!rgpd.consentementObtenu && (
          <p className="text-xs text-warning font-medium">
            {enModification
              ? '⚠️ Sans consentement, les données de santé ne peuvent pas être collectées légalement.'
              : '⚠️ Obligatoire pour créer la fiche : sans consentement, les données de santé ne peuvent pas être collectées légalement.'}
          </p>
        )}
      </Carte>

      </>}

      {showAll && (
        <div className="flex gap-3 pt-2">
          <button type="submit"
            className="flex-1 bg-primary text-white rounded-xl py-2.5 font-semibold flex items-center justify-center gap-2 hover:bg-dark transition-colors">
            <Save size={16} />
            Enregistrer
          </button>
          <button type="button" onClick={onCancel}
            className="px-5 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-2">
            <X size={16} />
            Annuler
          </button>
        </div>
      )}
    </Wrapper>
  );
});

function LigneRecap({ terme, alerte, children }: { terme: string; alerte?: boolean; children: React.ReactNode }) {
  return (
    <>
      <dt className={`font-medium ${alerte ? 'text-red-600' : 'text-gray-700'}`}>{terme}</dt>
      <dd className={alerte ? 'text-red-600' : 'text-gray-600'}>{children}</dd>
    </>
  );
}

export default ParticipantForm;
