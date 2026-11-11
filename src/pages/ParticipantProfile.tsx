import { useState, useEffect, useMemo } from 'react';
import { chargerSettingsPraticien } from '../lib/settingsPraticien';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { ArrowLeft, Pencil, FileText, TrendingUp, Download, Trash2, Dumbbell, MapPin, RefreshCw, ClipboardList, Mic, ExternalLink, LayoutTemplate, Archive, ArchiveRestore, Bot, Phone, Navigation, ChevronDown } from 'lucide-react';
import { useParticipants } from '../hooks/useParticipants';
import { useProgramme } from '../hooks/useProgramme';
import { useProgrammeV2 } from '../hooks/useProgrammeV2';
import { useProgrammeWizard } from '../hooks/useProgrammeWizard';
import { useProgrammeIA } from '../hooks/useProgrammeIA';
import { useDevice } from '../hooks/useDevice';
import { ProgrammeWizardModal } from '../components/programme/ProgrammeWizard';
import { ConfigIAModal, PreviewIAModal, OBJECTIFS_IA } from '../components/programme/ProgrammeIA';
import { genererProgrammeStructure, versPayloadCreateProgramme, type ProgrammeIA } from '../utils/genererProgrammeIA';
import { exportProgrammePDF } from '../utils/exportPDF';
import { loadExercicesPraticien } from '../lib/bibliothequeExercices';
import { useContrats } from '../hooks/useContrats';
import { useStructures } from '../hooks/useStructures';
import { useAgenda } from '../hooks/useAgenda';
import SectionBilansAuto from '../components/participant/SectionBilansAuto';
import { useJournalSeance } from '../hooks/useJournalSeance';
import { useCompteRenduSeance } from '../hooks/useCompteRenduSeance';
import { getBrouillon } from '../hooks/useBrouillonBilan';
import PageWrapper from '../components/layout/PageWrapper';
import RadarChart from '../components/charts/RadarChart';
import BilanEvolutionCharts from '../components/charts/BilanEvolutionCharts';
import BilanTimeline from '../components/bilan/BilanTimeline';
import ContratsTab from '../components/participant/ContratsTab';
import CoursCollectifsTab from '../components/participant/CoursCollectifsTab';
import DocumentsTab from '../components/participant/DocumentsTab';
import { useCoursCollectifs } from '../hooks/useCoursCollectifs';
import { entreesCoursDuParticipant } from '../lib/coursCollectifs';
import DicteePostSeance from '../components/DicteePostSeance';
import ModalEspacePatient from '../components/participant/ModalEspacePatient';
import AppliquerModeleModal from '../components/programme/AppliquerModeleModal';
import { exportDossierPraticien } from '../utils/exportDossierPDF';
import { TAG_CONFIG } from '../data/profiles';
import { toast } from 'sonner';
import { getAuthHeader } from '../lib/supabase';
import { chargerRetoursSeance, chargerSeancesStats, ressentisPreoccupants, type RetourSeance, type SeancePatientStat } from '../lib/suiviBeneficiaire';
import { patientAccesPraticien } from '../lib/patientApi';
import type { ProfilHandicap } from '../types';
import { getContreIndications } from '../lib/anamnese';
import { libelleAge } from '../lib/age';
import { CarteDisponibilites } from './fiche-beneficiaire/CarteDisponibilites';
import { CarteJournalFusion } from './fiche-beneficiaire/CarteJournalFusion';
import { CarteProfilFonctionnel } from './fiche-beneficiaire/CarteProfilFonctionnel';
import { CarteSante } from './fiche-beneficiaire/CarteSante';
import { CarteStats } from './fiche-beneficiaire/CarteStats';
import { SectionRappelsPatient } from './fiche-beneficiaire/SectionRappelsPatient';
import { TabsSection } from './fiche-beneficiaire/TabsSection';
import { type TabId } from './fiche-beneficiaire/communs';

const METHODE_LABEL: Record<string, string> = {
  oral_note: 'oral noté', ecrit: 'écrit', numerique: 'numérique', declare_import: "déclaré à l'import",
};

const AVATAR_COLORS = ['#1A5F9E', 'var(--color-teal)', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899'];
function avatarColor(id: string): string {
  return AVATAR_COLORS[id.charCodeAt(0) % AVATAR_COLORS.length];
}

const PROFILS_HANDICAP: { id: ProfilHandicap; label: string; emoji: string }[] = [
  { id: 'fauteuil_roulant', label: 'Fauteuil roulant',    emoji: '♿' },
  { id: 'avc_hemiplegie',   label: 'AVC / Hémiplégie',    emoji: '🧠' },
  { id: 'parkinson',        label: 'Parkinson',            emoji: '🫸' },
  { id: 'sep',              label: 'Sclérose en plaques',  emoji: '🎗️' },
];

function formatDate(date: string): string {
  return new Date(date + 'T12:00').toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

// ── Types ressentis ───────────────────────────────────────────────────────────

// RetourSeance : voir src/lib/suiviBeneficiaire.ts

// Libellés Borg RPE simplifié (valeurs utilisées : 2/4/6/8/10)
const BORG_LABEL: Record<number, string> = {
  2: 'Très facile', 4: 'Facile', 6: 'Modéré', 8: 'Difficile', 10: 'Très difficile',
};
const BIEN_ETRE_LABEL: Record<number, string> = {
  1: 'Très bien', 2: 'Bien', 3: 'Correct', 4: 'Fatigué', 5: 'Épuisé',
};

function labelBorg(v: number): string { return BORG_LABEL[v] ?? `${v}`; }
function labelBienEtre(v: number): string { return BIEN_ETRE_LABEL[v] ?? `${v}`; }

// Libellé Borg côté praticien (carte de séance, onglet Assiduité) — distinct du
// libellé simplifié utilisé pour le graphique ci-dessus.
const BORG_LABEL_PRATICIEN: Record<number, string> = {
  2: 'Borg 2 — Très léger', 4: 'Borg 4 — Léger', 6: 'Borg 6 — Modéré', 8: 'Borg 8 — Intense', 10: 'Borg 10 — Très intense',
};
function labelBorgPraticien(v: number): string { return BORG_LABEL_PRATICIEN[v] ?? `Borg ${v}`; }

// Normalise une date Supabase ("YYYY-MM-DD" pour une colonne DATE, mais
// potentiellement "YYYY-MM-DDTHH:mm:ss+00:00" pour une colonne TIMESTAMP) en
// "YYYY-MM-DD" — seances_patient ayant été créée hors migration (Studio), son
// type de colonne réel n'est pas garanti identique à celui de retours_seance.
function dateOnly(s: string): string { return s.slice(0, 10); }

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ParticipantProfile() {
  const { id } = useParams<{ id: string }>();
  const { participants, loading: chargementParticipants, updateParticipant, deleteParticipant, deleteBilan, geocodeParticipant, archiverParticipant } = useParticipants();
  const { programmeActif, deleteProgramme, reload: reloadProgrammeActif } = useProgramme(id ?? '');
  const { programmes: programmesV2, seancesAutonomesStats, loading: chargementProgrammesV2, reload: reloadProgrammesV2, createProgramme } = useProgrammeV2(id ?? '');
  const { isMobile } = useDevice();
  const {
    showWizard: showWizardCreation, step: stepWizardCreation, setStep: setStepWizardCreation,
    wizardData: wizardDataCreation, saving: savingWizardCreation,
    updateWizard: updateWizardCreation, openWizard: openWizardCreation,
    closeWizard: closeWizardCreation, handleSave: handleSaveWizardCreationBase,
  } = useProgrammeWizard();
  const {
    showConfigIA, configIA, generatingIA, errorIA, savingIA,
    questionsIA, reponsesIA, chargementQuestionsIA, precisionsLibresIA,
    showPreviewIA, programmePreview, setProgrammePreview,
    updateConfigIA, updateReponseIA, setPrecisionsLibresIA, setErrorIA,
    ouvrirConfigIA: ouvrirConfigIABase, fermerConfigIA, genererProgramme,
    fermerPreviewIA, modifierConfigDepuisPreview, regenererIA: regenererIABase,
    handleValiderEtCreerIA: handleValiderEtCreerIABase,
  } = useProgrammeIA();
  const { contrats } = useContrats();
  const { structures } = useStructures();
  const { seances } = useAgenda();
  const { coursCollectifs, participations: participationsCours, loading: chargementCours } = useCoursCollectifs();
  useJournalSeance(); // conservé pour ne pas casser le hook
  const navigate = useNavigate();
  const settings = chargerSettingsPraticien();

  const [menuOuvert, setMenuOuvert]         = useState(false);
  const [confirmDelete, setConfirmDelete]   = useState(false);
  const [confirmDeleteProg, setConfirmDeleteProg] = useState(false);
  const [pdfProgrammeEnCours, setPdfProgrammeEnCours] = useState(false);
  const [showDictee, setShowDictee]         = useState(false);
  const [geocoding, setGeocoding]           = useState(false);
  const [exportingDossier, setExportingDossier] = useState(false);
  const [showProfilPicker, setShowProfilPicker] = useState(false);
  const [showEspacePatient, setShowEspacePatient] = useState(false);
  const [ouvertureEspacePatient, setOuvertureEspacePatient] = useState(false);
  const [showModeleModal, setShowModeleModal] = useState(false);
  const [voirTousExercices, setVoirTousExercices] = useState(false);
  const [activeTab, setActiveTab]           = useState<TabId>('bilans');
  const [seancesStats, setSeancesStats]     = useState<SeancePatientStat[]>([]);
  const [retours, setRetours]               = useState<RetourSeance[]>([]);

  useEffect(() => {
    if (!id) return;
    void chargerRetoursSeance(id).then(data => { if (data) setRetours(data); });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    // Toujours remplacer l'état, même par une liste vide : sinon, en passant
    // d'une fiche à une autre sans démontage, les séances du bénéficiaire
    // précédent resteraient affichées (2026-11-10).
    void chargerSeancesStats(id).then(setSeancesStats);
  }, [id]);

  const alerteRessentis = useMemo(() => ressentisPreoccupants(retours), [retours]);

  const participant = participants.find(p => p.id === id);
  const { compteRendus, ajouterCompteRendu } = useCompteRenduSeance(participant?.id ?? '');
  // Avant le retour anticipé ci-dessous : un hook ne peut pas être appelé après un `return`.
  const entreesCours = useMemo(
    () => entreesCoursDuParticipant(coursCollectifs, participationsCours, id ?? ''),
    [coursCollectifs, participationsCours, id],
  );

  // Fiche UNIQUE depuis le 2026-09-13 : servie telle quelle sous 768 px
  // (App.tsx, estRouteInterfaceUnique). ParticipantProfileMobile, montée ici
  // sous `md:hidden`, n'était jamais visible — cette page n'était jamais
  // affichée sous 768 px — mais chargeait ses données en double.
  if (!participant) return (
    <PageWrapper>
      <div className="text-center py-20 text-gray-400">
        {chargementParticipants ? 'Chargement…' : 'Participant introuvable'}
      </div>
    </PageWrapper>
  );

  const sortedBilans   = [...participant.bilans].sort((a, b) => a.date.localeCompare(b.date));
  const bilanInitial   = participant.bilans.find(b => b.type === 'initial') ?? null;
  const contreIndicationsTexte: string | null = getContreIndications(participant, bilanInitial).detail;
  const latestBilan    = sortedBilans[sortedBilans.length - 1] ?? null;
  const contratActif   = contrats.find(c => c.participantId === participant.id && c.statut === 'actif') ?? null;
  const contratsCount  = contrats.filter(c => c.participantId === participant.id).length;
  const color          = avatarColor(participant.id);
  const age            = libelleAge(participant.dateNaissance);
  const today          = new Date().toISOString().slice(0, 10);
  const imc            = participant.taille && participant.poids
    ? Math.round((participant.poids / ((participant.taille / 100) ** 2)) * 10) / 10 : null;
  const joursDepuisBilan = latestBilan
    ? Math.floor((Date.now() - new Date(latestBilan.date).getTime()) / 86400000) : Infinity;
  const prochaineSeance = seances
    .filter(s => s.participantId === participant.id && s.statut === 'planifiee' && s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
  const hasAddress     = Boolean(participant.adresseRue?.trim() && participant.adresseVille?.trim());
  const brouillon      = getBrouillon(participant.id);

  // Programme affiché sur la fiche : programmeActif (useProgramme, V1) lit une colonne
  // JSON `exercices` sur la table `programmes`, laissée VIDE par toute création récente
  // (useProgrammeV2.createProgramme insère `exercices: []` — les exercices vivent dans
  // programme_seances/programme_exercices depuis la V2, seul chemin de création restant
  // dans ProgrammePage.tsx). Résultat avant ce chantier : la carte ci-dessous n'affichait
  // ni compte ni liste d'exercices pour tout programme créé aujourd'hui — pas seulement
  // "limité à 4", comme le diagnostic initial du chantier le supposait (vérifié en lisant
  // useProgramme.ts, useProgrammeV2.ts et dbToProgramme, lib/mappers.ts).
  // titre/dateCreation/objectif restent lisibles via programmeActif (V1) même pour une
  // ligne V2 : createProgramme (V2) les écrit aussi sur les colonnes historiques
  // (titre/date_creation/objectif — "backward compat", useProgrammeV2.ts) pour ne pas
  // casser ce composant. Seuls exercices/count doivent donc être re-sourcés depuis V2.
  const activeProgV2 = programmesV2.find(p => p.actif) ?? null;
  type ExerciceAffiche = {
    id: string; nom: string; series?: number; repetitions?: number;
    dureeSecondes?: number; notes?: string; seanceNom?: string;
  };
  const exercicesAffiches: ExerciceAffiche[] = activeProgV2
    ? [...activeProgV2.seances]
        .sort((a, b) => a.ordre - b.ordre)
        .flatMap(s => [...s.exercices]
          .sort((a, b) => a.ordre - b.ordre)
          .map(e => ({
            id: e.id,
            nom: e.nom,
            series: e.series,
            repetitions: e.repetitions,
            dureeSecondes: e.dureeSecondes,
            notes: e.description || e.conseilSecurite || undefined,
            // Regroupement affiché seulement si le programme a plusieurs
            // séances distinctes (ex. "Séance A" / "Séance B") — inutile de
            // le répéter s'il n'y en a qu'une.
            seanceNom: activeProgV2.seances.length > 1 ? s.nom : undefined,
          })))
    // Repli V1 : programme légacy jamais migré vers V2 (plus créé par l'UI
    // actuelle, voir commentaire ci-dessus) — exerciceId brut faute de
    // catalogue chargé ici, comportement inchangé par rapport à avant.
    : (programmeActif?.exercices ?? []).map(e => ({
        id: e.exerciceId,
        nom: e.exerciceId.replace(/-/g, ' '),
        series: e.series,
        repetitions: e.repetitions,
        dureeSecondes: e.dureeSecondes,
        notes: e.notePersonnalisee,
      }));

  // PDF du programme en cours, sans passer par la page Programme. Même export que
  // ProgrammePage / EspacePatient (exportProgrammePDF normalise V1 et V2). La version V2
  // est préférée quand elle existe : une ligne V2 relue via useProgramme (forme V1) n'a
  // pas ses séances, d'où le bouton désactivé tant que useProgrammeV2 charge.
  async function handleTelechargerProgrammePDF() {
    if (!participant || !programmeActif || pdfProgrammeEnCours) return;
    setPdfProgrammeEnCours(true);
    try {
      const programme = programmesV2.find(p => p.id === programmeActif.id) ?? programmeActif;
      const nomProgramme = 'seances' in programme ? programme.nom : programme.titre;
      await exportProgrammePDF(
        { programme, exercices: await loadExercicesPraticien(), participant, settings: chargerSettingsPraticien() },
        `programme-${participant.prenom.toLowerCase()}-${nomProgramme.toLowerCase().replace(/s+/g, '-')}.pdf`,
      );
    } catch (err) {
      console.error('Erreur export PDF programme:', err);
      toast.error('Impossible de générer le PDF du programme. Réessayez, ou ouvrez la page Programme.');
    } finally {
      setPdfProgrammeEnCours(false);
    }
  }

  function handleAction(action: string) {
    setMenuOuvert(false);
    if (!participant) return;
    switch (action) {
      case 'modifier':        navigate(`/participants/${id}/modifier`); break;
      case 'evolution':       navigate(`/participant/${id}/comparaison`); break;
      case 'lien':            copyClientLink(); break;
      case 'export':          handleExport(); break;
      case 'supprimer':       setConfirmDelete(true); break;
      case 'archiver':
        // Le message de succès n'est affiché qu'une fois l'enregistrement confirmé : il
        // s'affichait avant, même quand l'écriture échouait juste après.
        archiverParticipant(participant.id, true)
          .then(() => toast.success(`${participant.prenom} ${participant.nom} archivé(e). Retrouvez-le dans « Bénéficiaires archivés » ; son dossier est conservé.`))
          .catch(err => { console.error('Erreur archivage:', err); toast.error('Erreur lors de l\'archivage'); });
        break;
      case 'desarchiver':
        archiverParticipant(participant.id, false)
          .then(() => toast.success(`${participant.prenom} ${participant.nom} est de nouveau parmi les bénéficiaires actifs.`))
          .catch(err => { console.error('Erreur désarchivage:', err); toast.error('Erreur lors du désarchivage'); });
        break;
      case 'programme':
        // Desktop : inchangé, on navigue vers la page dédiée (ProgrammePage.tsx).
        // Mobile : cette route n'a pas d'équivalent mobile (routesMobile.ts la
        // fait retomber sur l'invitation "tournez votre téléphone") — ouvre le
        // wizard directement ici, sur la fiche déjà affichée sous 768 px.
        if (isMobile) openWizardCreation();
        else navigate(`/participant/${id}/programme`);
        break;
      case 'nouveau_bilan':   navigate(`/participant/${id}/bilan/new`); break;
      case 'nouveau_contrat': navigate(`/participant/${id}/contrat/nouveau`); break;
      case 'rgpd':            navigate(`/participants/${id}/modifier`); break;
    }
  }

  // Sauvegarde du wizard ouvert depuis le mobile (voir handleAction, case
  // 'programme') — même construction de payload que ProgrammePage.tsx
  // (handleSave), CREATION seulement : pas d'édition mobile pour l'instant,
  // l'entrée mobile ne s'ouvre que quand il n'y a pas encore de programme
  // actif (voir la carte "Programme" plus bas dans ce fichier).
  async function handleSaveWizardCreation() {
    const objectifSeancesAutonomes = wizardDataCreation.objectifSeancesAutonomes.trim()
      ? Number(wizardDataCreation.objectifSeancesAutonomes)
      : undefined;
    const payload = {
      nom: wizardDataCreation.nom,
      objectif: wizardDataCreation.objectif || undefined,
      objectifSeancesAutonomes: objectifSeancesAutonomes != null && objectifSeancesAutonomes > 0 ? objectifSeancesAutonomes : undefined,
      messageMotivation: wizardDataCreation.messageMotivation || undefined,
      type: wizardDataCreation.type,
      seances: wizardDataCreation.seances.map(s => ({
        tempId: s.tempId,
        nom: s.nom,
        exercices: s.exercices.map(ex => ({
          nom: ex.nom,
          categorie: ex.categorie || undefined,
          description: ex.description || undefined,
          conseilSecurite: ex.conseilSecurite || undefined,
          series: ex.mode !== 'total' ? ex.series : undefined,
          repetitions: ex.mode === 'reps' ? ex.repetitions : undefined,
          dureeSecondes: (ex.mode === 'duree' || ex.mode === 'total') ? ex.dureeSecondes : undefined,
          exerciceId: ex.exerciceId || undefined,
          niveau: ex.niveau || undefined,
        })),
      })),
      planning: wizardDataCreation.planning,
    };

    const ok = await handleSaveWizardCreationBase(async () => {
      const created = await createProgramme(payload);
      toast[created ? 'success' : 'error'](created ? 'Programme créé et partagé avec le bénéficiaire !' : 'Erreur lors de la création du programme');
      return created;
    });
    if (ok) await Promise.all([reloadProgrammeActif(), reloadProgrammesV2()]);
  }

  // Génération IA — mobile uniquement (voir handleAction, case 'programme_ia'
  // ci-dessous), même construction que ProgrammePage.tsx (genererProgrammeIA
  // sans réponses de clarification préexistantes puisqu'on repart d'un état
  // vierge à chaque ouverture, comme sur desktop).
  function ouvrirConfigIA() {
    if (participant) ouvrirConfigIABase(participant);
  }

  async function construireProgrammeIA(): Promise<ProgrammeIA> {
    if (!participant) throw new Error('Participant introuvable');

    const bilans = participant.bilans ?? [];
    const dernierBilan = bilans.length
      ? [...bilans].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
      : null;

    const objectifLabel = configIA.objectif === 'personnalise'
      ? (configIA.objectifPersonnalise || 'objectif personnalisé du patient')
      : OBJECTIFS_IA.find(o => o.value === configIA.objectif)?.label ?? configIA.objectif;

    const reponsesTexte = questionsIA
      .map((q, i) => (reponsesIA[i]?.trim() ? `- ${q}\n  Réponse : ${reponsesIA[i].trim()}` : null))
      .filter(Boolean)
      .join('\n');

    const catalogue = await loadExercicesPraticien();

    return genererProgrammeStructure(
      participant,
      { objectif: objectifLabel, frequence: configIA.frequence, duree: configIA.duree, niveau: configIA.niveau },
      reponsesTexte,
      catalogue,
      dernierBilan,
      programmesV2,
      precisionsLibresIA,
    );
  }

  function genererProgrammeIA() {
    // Vérifié ici, AVANT genererProgramme() (qui passe generatingIA à true) :
    // une validation qui échoue doit rester instantanée, sans faire
    // apparaître même brièvement l'écran "L'IA génère le programme…".
    if (configIA.objectif === 'personnalise' && !configIA.objectifPersonnalise.trim()) {
      setErrorIA("Précisez l'objectif personnalisé.");
      return;
    }
    genererProgramme(construireProgrammeIA);
  }

  function regenererIA() {
    regenererIABase(construireProgrammeIA);
  }

  async function handleValiderEtCreerIA() {
    const ok = await handleValiderEtCreerIABase(async () => {
      if (!programmePreview) return false;
      const payload = versPayloadCreateProgramme(programmePreview, 'domicile', uuidv4);
      const created = await createProgramme(payload);
      toast[created ? 'success' : 'error'](created ? 'Programme généré et créé avec succès 🎉' : 'Erreur lors de la création du programme');
      return created;
    });
    if (ok) await Promise.all([reloadProgrammeActif(), reloadProgrammesV2()]);
  }

  async function handleExportDossier() {
    setExportingDossier(true);
    try {
      await exportDossierPraticien(
        {
          participant: participant!,
          bilans: sortedBilans,
          contratActif,
          programmeActif,
          // Corrige le compte d'exercices pour un programme créé via V2 —
          // voir lib/programmeActifV2.ts.
          programmesV2,
          compteRendus,
          // Cours RÉALISÉS de ce bénéficiaire, avec présence constatée, effort, bien-être et note.
          coursRealises: entreesCours.filter(e => e.cours.statut === 'realise'),
          settings,
        },
        `Dossier_${participant!.nom}_${participant!.prenom}.pdf`
      );
    } finally { setExportingDossier(false); }
  }

  async function handleVoirEspacePatient() {
    setOuvertureEspacePatient(true);
    try {
      const authHeader = await getAuthHeader();
      const result = await patientAccesPraticien(authHeader, participant!.id);
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      window.open(`/patient/${result.participantId}?ptoken=${encodeURIComponent(result.token)}`, '_blank');
    } finally {
      setOuvertureEspacePatient(false);
    }
  }

  function copyClientLink() {
    navigator.clipboard.writeText(`${window.location.origin}/client/${participant!.token}`);
    toast.success('Lien copié !');
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(participant, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `donnees_${participant!.prenom}_${participant!.nom}_${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Export téléchargé');
  }

  function handleGeocode() {
    setGeocoding(true);
    geocodeParticipant(participant!.id);
    setTimeout(() => setGeocoding(false), 4000);
  }

  const MENU_ACTIONS = [
    { Icon: Pencil,     label: 'Modifier le bénéficiaire',    action: 'modifier' },
    { Icon: TrendingUp, label: "Rapport d'évolution",    action: 'evolution', disabled: participant.bilans.length < 2 },
    // "Lien client" (copyClientLink, plus bas) masqué temporairement : la
    // colonne participants.token n'existe plus en base (confirmé sur
    // staging, erreur 42703 "column does not exist") — tout lien généré
    // est donc non fonctionnel pour un patient réel. Le mécanisme d'accès
    // patient actuel et fonctionnel est code_acces, déjà utilisé par
    // EspacePatient.tsx. Ne pas réafficher sans avoir réparé/migré ce
    // mécanisme (voir issue de suivi). copyClientLink() et le handler
    // 'lien' restent en place, volontairement, pour un retour rapide une
    // fois le point tranché.
    { Icon: Download,   label: 'Mes données (JSON)',      action: 'export' },
    participant.archive
      ? { Icon: ArchiveRestore, label: 'Désarchiver', action: 'desarchiver' }
      : { Icon: Archive,        label: 'Archiver',    action: 'archiver' },
    { Icon: Trash2,     label: 'Supprimer',               action: 'supprimer', danger: true },
  ];

  const TABS: { id: TabId; label: string; count?: number }[] = [
    { id: 'bilans',    label: 'Historique bilans',   count: participant.bilans.length },
    { id: 'contrats',  label: 'Contrats de suivi',   count: contratsCount },
    { id: 'cours',     label: '👥 Cours collectifs',  count: entreesCours.length > 0 ? entreesCours.length : undefined },
    { id: 'assiduite', label: alerteRessentis ? '📊 Assiduité ⚠' : '📊 Assiduité', count: seancesStats.length > 0 ? seancesStats.length : undefined },
    { id: 'documents', label: '📄 Documents' },
    { id: 'rappels',   label: '🔔 Rappels' },
  ];

  return (
    <PageWrapper>
      <Link to="/" className="inline-flex items-center gap-1.5 text-[13px] text-gray-400 hover:text-gray-700 mb-4 transition-colors">
        <ArrowLeft size={14} /> Tableau de bord
      </Link>

      {/* ── HEADER BLANC ───────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200/50 shadow-sm mb-4">
        <div className="px-4 sm:px-5 pt-5 pb-4">

          {/* Ligne 1 : avatar + nom + badges + menu */}
          <div className="flex items-start gap-3.5">
            <div
              className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-white font-bold text-[18px] flex-shrink-0"
              style={{ background: color }}
            >
              {participant.prenom[0]}{participant.nom[0]}
            </div>

            <div className="flex-1 min-w-0">
              {/* Nom + badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-heading font-bold text-gray-900 text-xl leading-tight">
                  {participant.prenom} {participant.nom}
                </h1>
                {/* Badge Sénior */}
                {participant.tags?.includes('senior') && (
                  <span className="text-[12px] font-medium px-2.5 py-0.5 rounded-full" style={{ background: '#E6F1FB', color: '#185FA5' }}>
                    Sénior
                  </span>
                )}
                {/* Badge pathologie */}
                {participant.tags?.includes('chronique') && (
                  <span className="text-[12px] font-medium px-2.5 py-0.5 rounded-full" style={{ background: '#E1F5EE', color: '#0F6E56' }}>
                    Pathologie chronique
                  </span>
                )}
                {/* Autres tags */}
                {participant.tags?.filter(t => t in TAG_CONFIG && t !== 'senior' && t !== 'chronique').map(tag => (
                  <span key={tag}
                    className="text-[12px] font-medium px-2.5 py-0.5 rounded-full text-white"
                    style={{ background: TAG_CONFIG[tag].color }}
                  >
                    {TAG_CONFIG[tag].emoji} {TAG_CONFIG[tag].label}
                  </span>
                ))}
                {/* Badge contre-indications */}
                {contreIndicationsTexte && (
                  <span className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-0.5 rounded-full" style={{ background: '#FCEBEB', color: '#A32D2D' }}>
                    ⚠️ CI active
                  </span>
                )}
                {/* Profil handicap */}
                {participant.profilHandicap && (() => {
                  const ph = PROFILS_HANDICAP.find(x => x.id === participant.profilHandicap);
                  return ph ? (
                    <span className="text-[12px] font-medium px-2.5 py-0.5 rounded-full" style={{ background: '#F0F4F4', color: '#0D5050' }}>
                      {ph.emoji} {ph.label}
                    </span>
                  ) : null;
                })()}
                {/* RGPD manquant */}
                {!participant.rgpd?.consentementObtenu && (
                  <button
                    onClick={() => handleAction('rgpd')}
                    className="inline-flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full border transition-colors hover:bg-red-light"
                    style={{ borderColor: '#E24B4A', color: '#E24B4A' }}
                  >
                    RGPD ⚠
                  </button>
                )}
              </div>

              {/* Ligne secondaire : infos */}
              <div className="flex items-center gap-1.5 flex-wrap mt-1 text-[13px] text-gray-500">
                <span>
                  {age} · né(e) le {new Date(participant.dateNaissance).toLocaleDateString('fr-FR')}
                </span>
                {participant.taille && <><span className="text-gray-300">·</span><span>{participant.taille} cm</span></>}
                {participant.poids && <><span className="text-gray-300">·</span><span>{participant.poids} kg</span></>}
                {imc && <><span className="text-gray-300">·</span><span>IMC {imc}</span></>}
                {participant.telephone && (
                  <>
                    <span className="text-gray-300">·</span>
                    <a
                      href={`tel:${participant.telephone}`}
                      className="hover:text-gray-800 transition-colors"
                      style={{ whiteSpace: 'nowrap', display: 'inline-block', maxWidth: '100%' }}
                    >
                      📞 {participant.telephone}
                    </a>
                  </>
                )}
                {participant.email && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span>✉️ {participant.email}</span>
                  </>
                )}
                {hasAddress && (
                  <>
                    <span className="text-gray-300">·</span>
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(`${participant.adresseRue}, ${participant.adresseCodePostal} ${participant.adresseVille}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-gray-800 transition-colors inline-flex items-center gap-1"
                    >
                      📍 {participant.adresseRue}, {participant.adresseCodePostal} {participant.adresseVille}
                      {participant.coordonnees
                        ? <MapPin size={10} className="text-green-500" />
                        : !geocoding
                          ? <button onClick={e => { e.preventDefault(); handleGeocode(); }} className="text-[#2BBFBF] underline text-[11px]">Localiser</button>
                          : <RefreshCw size={10} className="animate-spin" style={{ color: 'var(--color-teal)' }} />
                      }
                    </a>
                  </>
                )}
                {participant.rgpd?.consentementObtenu && (
                  <><span className="text-gray-300">·</span>
                  <span className="text-[12px]" style={{ color: '#0F6E56' }}>
                    ✅ RGPD {METHODE_LABEL[participant.rgpd.methodeConsentement] ?? ''}
                  </span></>
                )}
              </div>

              {/* Barre de progression bilan en cours */}
              {brouillon && (
                <button
                  onClick={() => handleAction('nouveau_bilan')}
                  className="mt-2 inline-flex items-center gap-2.5 hover:opacity-80 transition-opacity"
                >
                  <span className="text-[12px] text-gray-500">Bilan en cours</span>
                  <span className="w-[140px] h-1 rounded-full overflow-hidden" style={{ background: '#E6F8F8' }}>
                    <span className="h-full rounded-full block" style={{ width: `${brouillon.completionPct}%`, background: 'var(--color-teal)' }} />
                  </span>
                  <span className="text-[12px] font-semibold" style={{ color: 'var(--color-teal)' }}>{brouillon.completionPct}%</span>
                  <span className="text-[12px] text-gray-400">· Reprendre →</span>
                </button>
              )}

              {/* Badge dernier bilan */}
              {joursDepuisBilan > 85 && (
                <div className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: '#FFF7E6', color: '#B45309' }}>
                  ⏰ Bilan à planifier ({joursDepuisBilan}j)
                </div>
              )}
              {latestBilan && joursDepuisBilan <= 85 && (
                <div className="mt-1.5 text-[12px] text-gray-400">
                  Dernier bilan : {formatDate(latestBilan.date)}
                </div>
              )}

              {/* Structure de rattachement */}
              {participant.structureId && (() => {
                const str = structures.find(s => s.id === participant.structureId);
                return str ? (
                  <div className="mt-1.5">
                    <Link
                      to={`/structures/${str.id}`}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full hover:opacity-80 transition-opacity"
                      style={{ background: '#EEF2FF', color: '#4F46E5' }}
                    >
                      🏢 {str.nom}
                    </Link>
                  </div>
                ) : null;
              })()}

              {/* Contexte clinique */}
              {participant.contexteClinic && (
                <p className="mt-1 text-[12px] text-gray-400 italic">"{participant.contexteClinic}"</p>
              )}

              {/* Contre-indications détaillées */}
              {contreIndicationsTexte && (
                <div className="mt-2 flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: '#FCEBEB' }}>
                  <span className="flex-shrink-0 text-sm">⚠️</span>
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#A32D2D' }}>Contre-indications à l'effort</span>
                    <p className="text-[12px] mt-0.5 leading-relaxed" style={{ color: '#A32D2D' }}>{contreIndicationsTexte}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Menu ··· */}
            <div className="relative flex-shrink-0">
              {/* Profil handicap button (top right) */}
              <div className="flex items-center gap-2 mb-1.5 justify-end">
                <div className="relative">
                  <button
                    onClick={() => setShowProfilPicker(v => !v)}
                    className="text-[12px] font-medium px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    {/* Libellé masqué sur téléphone : il écrasait le nom du bénéficiaire. */}
                    ♿<span className="hidden sm:inline"> {participant.profilHandicap ? 'Modifier profil' : '+ Profil handicap'}</span>
                  </button>
                  {showProfilPicker && (
                    <>
                      <div className="fixed inset-0 z-50" onClick={() => setShowProfilPicker(false)} />
                      <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl z-50 py-1 min-w-[210px] border border-gray-100">
                        {participant.profilHandicap && (
                          <button
                            onClick={() => { updateParticipant(id!, { profilHandicap: undefined }).catch(err => { console.error('Erreur retrait profil:', err); toast.error('Erreur lors de la sauvegarde, réessayez'); }); setShowProfilPicker(false); }}
                            className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-light flex items-center gap-2"
                          >
                            ✕ Retirer le profil
                          </button>
                        )}
                        {PROFILS_HANDICAP.map(p => (
                          <button
                            key={p.id}
                            onClick={() => { updateParticipant(id!, { profilHandicap: p.id }).catch(err => { console.error('Erreur changement profil:', err); toast.error('Erreur lors de la sauvegarde, réessayez'); }); setShowProfilPicker(false); }}
                            className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors ${participant.profilHandicap === p.id ? 'bg-teal-50 text-teal-800 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
                          >
                            {p.emoji} {p.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => setMenuOuvert(v => !v)}
                  className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 px-3 py-2 rounded-lg font-bold text-lg transition-colors"
                >
                  ···
                </button>
              </div>
              {menuOuvert && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOuvert(false)} />
                  <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-xl z-50 py-2 w-52 border border-gray-100">
                    {MENU_ACTIONS.map(item => (
                      <button
                        key={item.action}
                        onClick={() => !item.disabled && handleAction(item.action)}
                        disabled={item.disabled}
                        className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors text-left
                          ${item.danger ? 'text-red-500 hover:bg-red-light' : 'text-gray-700 hover:bg-gray-50'}
                          ${item.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        <item.Icon size={13} />
                        {item.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Séparateur + boutons d'action */}
        <div className="border-t border-gray-100 px-4 sm:px-5 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Groupe 1 : primaires */}
            <button
              onClick={() => handleAction('nouveau_bilan')}
              className="flex items-center gap-1.5 text-white text-[13px] font-semibold px-3.5 py-[7px] rounded-lg transition-colors hover:opacity-90"
              style={{ background: 'var(--color-teal)' }}
            >
              + Nouveau bilan
            </button>
            <button
              onClick={() => setShowDictee(true)}
              className="flex items-center gap-1.5 bg-white border border-gray-200 text-[13px] font-medium px-3.5 py-[7px] rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Mic size={13} style={{ color: 'var(--color-teal)' }} /> Dicter séance
            </button>
            {/* Desktop seulement (chantier « retrait de l'Assistant de la
                navigation mobile ») : l'assistant sort du périmètre mobile,
                ce bouton était l'un de ses deux points d'entrée sur téléphone
                (avec la barre de navigation, retiré séparément). Le state
                {{patientId}} reste utile ici pour AssistantPage (desktop) ;
                l'URL ne sert plus qu'à cet usage desktop désormais. */}
            <button
              onClick={() => navigate(`/assistant?beneficiaire=${encodeURIComponent(participant.id)}`, { state: { patientId: participant.id } })}
              className="hidden md:flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 text-[13px] font-medium px-3.5 py-[7px] rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Bot size={13} /> Assistant
            </button>
            {/* Boutons terrain : sur téléphone seulement, où l'on appelle et
                où l'on part en visite. Sur desktop, le téléphone et l'adresse
                restent des liens dans la ligne d'informations. */}
            {participant.telephone && (
              <a
                href={`tel:${participant.telephone}`}
                className="md:hidden flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 text-[13px] font-medium px-3.5 py-[7px] rounded-lg"
              >
                <Phone size={13} style={{ color: 'var(--color-teal)' }} /> Appeler
              </a>
            )}
            {hasAddress && (
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(`${participant.adresseRue}, ${participant.adresseCodePostal} ${participant.adresseVille}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="md:hidden flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 text-[13px] font-medium px-3.5 py-[7px] rounded-lg"
              >
                <Navigation size={13} style={{ color: 'var(--color-teal)' }} /> Itinéraire
              </a>
            )}

            {/* Groupe 2 : secondaires */}
            {participant.bilans.length >= 2 && (
              <button
                onClick={() => handleAction('evolution')}
                className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 text-[13px] font-medium px-3.5 py-[7px] rounded-lg hover:bg-gray-50 transition-colors"
              >
                <TrendingUp size={13} /> Évolution
              </button>
            )}
            <button
              onClick={handleExportDossier}
              // Désactivé tant que les cours se chargent (comme le PDF du programme) : cliquer trop tôt
              // produirait un dossier SANS les cours, sans le moindre message.
              disabled={exportingDossier || chargementCours}
              className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 text-[13px] font-medium px-3.5 py-[7px] rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <FileText size={13} />
              {exportingDossier ? 'PDF…' : 'Dossier'}
            </button>
            <button
              onClick={() => handleAction('programme')}
              className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 text-[13px] font-medium px-3.5 py-[7px] rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Dumbbell size={13} /> Programme
            </button>

            {/* Groupe 3 : ghost, poussé à droite */}
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => handleAction('nouveau_contrat')}
                className="flex items-center gap-1.5 text-gray-400 text-[13px] font-medium px-3 py-[7px] rounded-lg hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <ClipboardList size={13} /> Contrat
              </button>
              <button
                onClick={() => setShowEspacePatient(true)}
                className="flex items-center gap-1.5 text-gray-400 text-[13px] font-medium px-3 py-[7px] rounded-lg hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                Espace bénéficiaire
              </button>
              <button
                onClick={handleVoirEspacePatient}
                disabled={ouvertureEspacePatient}
                title="Ouvrir l'espace bénéficiaire de ce participant dans un nouvel onglet"
                className="flex items-center gap-1.5 text-gray-400 text-[13px] font-medium px-3 py-[7px] rounded-lg hover:bg-gray-100 hover:text-gray-600 transition-colors disabled:opacity-50"
              >
                <ExternalLink size={13} /> {ouvertureEspacePatient ? 'Ouverture…' : "Voir l'espace bénéficiaire"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── GRILLE 2 COLONNES ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4 mb-4">
        {/* Colonne gauche */}
        <div className="flex flex-col gap-3">
          <CarteSante participant={participant} bilanInitial={bilanInitial} onModifier={() => navigate(`/participants/${id}/modifier`)} />
          <CarteDisponibilites
            participant={participant}
            onSave={data => updateParticipant(id!, data)}
          />
          <CarteStats participant={participant} contratActif={contratActif} prochaineSeance={prochaineSeance} seances={seances} />
          <SectionBilansAuto participant={participant} />
        </div>
        {/* Colonne droite */}
        <div className="flex flex-col gap-3">
          {latestBilan && <CarteProfilFonctionnel participant={participant} bilans={participant.bilans} />}
          <CarteJournalFusion
            compteRendus={compteRendus}
            coursRealises={entreesCours.filter(e => e.cours.statut === 'realise')}
            onDicter={() => setShowDictee(true)}
          />
        </div>
      </div>

      {/* ── PROGRAMME EN COURS ─────────────────────────────────── */}
      {programmeActif ? (
        <div className="bg-white rounded-xl border border-gray-200/50 shadow-sm mb-4 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-1">Programme en cours</div>
              <div className="font-heading font-semibold text-dark text-[15px]">{programmeActif.titre}</div>
              <div className="text-[12px] text-gray-400 mt-0.5">
                Généré le {new Date(programmeActif.dateCreation).toLocaleDateString('fr-FR')}
                {exercicesAffiches.length > 0 && ` · ${exercicesAffiches.length} exercice${exercicesAffiches.length > 1 ? 's' : ''}`}
              </div>
              {(() => {
                const objectif = activeProgV2?.objectifSeancesAutonomes;
                if (!objectif) return null;
                const nb = seancesAutonomesStats[activeProgV2!.id]?.count ?? 0;
                const pct = Math.min(100, Math.round((nb / objectif) * 100));
                return (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[11px] font-medium text-gray-500 whitespace-nowrap">🏃 Séances autonomes : {nb}/{objectif}</span>
                    <div className="h-1.5 w-20 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleTelechargerProgrammePDF}
                disabled={pdfProgrammeEnCours || chargementProgrammesV2}
                aria-label="Télécharger le programme en PDF"
                className="text-xs font-medium text-primary border border-primary/30 hover:bg-primary/5 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Download size={12} /> {pdfProgrammeEnCours ? 'Génération…' : 'PDF'}
              </button>
              <button
                onClick={() => navigate(`/participant/${id}/programme`)}
                className="text-xs font-medium text-primary border border-primary/30 hover:bg-primary/5 px-3 py-1.5 rounded-lg transition-colors"
              >
                Voir complet →
              </button>
              <button
                onClick={() => setConfirmDeleteProg(true)}
                className="text-xs text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1"
              >
                <Trash2 size={12} /> Supprimer
              </button>
            </div>
          </div>
          {exercicesAffiches.length > 0 && (() => {
            const APERCU = 4;
            const liste = voirTousExercices ? exercicesAffiches : exercicesAffiches.slice(0, APERCU);
            let derniereSeance: string | undefined;
            return (
              <div className="flex flex-col gap-2">
                {liste.map(ex => {
                  const enteteSeance = ex.seanceNom && ex.seanceNom !== derniereSeance;
                  if (enteteSeance) derniereSeance = ex.seanceNom;
                  const detail = [
                    ex.series != null && ex.repetitions != null ? `${ex.series} × ${ex.repetitions}` : null,
                    ex.series != null && ex.repetitions == null && ex.dureeSecondes != null ? `${ex.series} × ${ex.dureeSecondes}s` : null,
                    ex.series == null && ex.dureeSecondes != null ? `${ex.dureeSecondes}s` : null,
                  ].filter(Boolean).join(' · ');
                  return (
                    <div key={ex.id}>
                      {enteteSeance && (
                        <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-gray-400 mt-1.5 mb-1">{ex.seanceNom}</div>
                      )}
                      <div className="flex items-start gap-2 text-[13px] text-gray-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/50 flex-shrink-0 mt-1.5" />
                        <div>
                          <span>{ex.nom}</span>
                          {detail && <span className="text-gray-400"> · {detail}</span>}
                          {ex.notes && <div className="text-[12px] text-gray-400 italic mt-0.5">{ex.notes}</div>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {exercicesAffiches.length > APERCU && (
                  <button
                    onClick={() => setVoirTousExercices(v => !v)}
                    className="flex items-center gap-1 text-[12px] font-medium text-primary pl-3.5 mt-0.5 self-start"
                  >
                    <ChevronDown size={13} className={voirTousExercices ? 'rotate-180 transition-transform' : 'transition-transform'} />
                    {voirTousExercices ? 'Réduire' : `Voir tout (${exercicesAffiches.length})`}
                  </button>
                )}
              </div>
            );
          })()}
          {programmeActif.objectif && (
            <div className="mt-2 text-[12px] text-gray-500 italic">🎯 {programmeActif.objectif}</div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200/50 shadow-sm mb-4 p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-1">Programme</div>
          <div className="text-[13px] text-gray-500 mb-3">Aucun programme en cours pour ce bénéficiaire.</div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleAction('programme')}
              className="flex items-center gap-1.5 bg-primary text-white text-[13px] font-medium px-3.5 py-[7px] rounded-lg hover:bg-dark transition-colors"
            >
              <Dumbbell size={13} /> Créer un programme
            </button>
            <button
              onClick={() => setShowModeleModal(true)}
              className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 text-[13px] font-medium px-3.5 py-[7px] rounded-lg hover:bg-gray-50 transition-colors"
            >
              <LayoutTemplate size={13} /> Utiliser un modèle
            </button>
            {/* Mobile uniquement : sur desktop, "Générer avec l'IA" vit déjà
                dans le header de ProgrammePage.tsx (bouton toujours visible,
                pas seulement à l'état vide) — ajouter ce bouton ici aussi
                changerait le rendu desktop de cette carte, hors périmètre de
                ce chantier. isMobile gate le RENDU du bouton, pas seulement
                son clic, pour qu'aucune différence n'existe côté desktop. */}
            {isMobile && (
              <button
                onClick={ouvrirConfigIA}
                className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 text-[13px] font-medium px-3.5 py-[7px] rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Bot size={13} /> Générer avec l'IA
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── TABS ───────────────────────────────────────────────── */}
      <TabsSection activeTab={activeTab} setActiveTab={setActiveTab} tabs={TABS}>
        {activeTab === 'bilans' && (
          <div>
            <BilanTimeline
              bilans={participant.bilans}
              participantId={participant.id}
              onDelete={(bilanId) => deleteBilan(participant.id, bilanId)}
            />
            {sortedBilans.length >= 1 && (
              <div className="mt-5 pt-5 border-t border-gray-100">
                <BilanEvolutionCharts bilans={sortedBilans} />
              </div>
            )}
            {latestBilan && (
              <div className="mt-5 pt-5 border-t border-gray-100">
                <div className="text-[12px] font-semibold text-gray-500 mb-3">Radar fonctionnel</div>
                <div className="max-w-sm">
                  <RadarChart
                    initial={sortedBilans.length > 1 ? sortedBilans[0] : null}
                    current={latestBilan}
                    testsActifs={participant.testsActifs}
                  />
                </div>
              </div>
            )}
          </div>
        )}
        {activeTab === 'contrats' && (
          <ContratsTab participantId={participant.id} />
        )}
        {activeTab === 'cours' && (
          <CoursCollectifsTab entrees={entreesCours} aujourdhui={new Date().toLocaleDateString('sv-SE')} />
        )}
        {activeTab === 'documents' && (
          <DocumentsTab participantId={participant.id} />
        )}
        {activeTab === 'assiduite' && (() => {
          if (seancesStats.length === 0) return (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-3">📊</div>
              <p className="font-medium">Aucune séance enregistrée</p>
              <p className="text-sm mt-1">Les séances faites par le bénéficiaire via l'espace bénéficiaire apparaîtront ici.</p>
            </div>
          );

          const now = new Date();
          const j30 = new Date(now); j30.setDate(j30.getDate() - 30);
          const j14 = new Date(now); j14.setDate(j14.getDate() - 14);
          const j7  = new Date(now); j7.setDate(j7.getDate() - 7);

          const s30 = seancesStats.filter(s => new Date(s.dateSeance) >= j30);
          const s14 = seancesStats.filter(s => new Date(s.dateSeance) >= j14);

          const totalRealises30 = s30.reduce((a, s) => a + s.nbRealises, 0);
          const totalEx30       = s30.reduce((a, s) => a + s.nbTotal, 0);
          const taux30          = totalEx30 > 0 ? Math.round((totalRealises30 / totalEx30) * 100) : null;

          const totalRealises14 = s14.reduce((a, s) => a + s.nbRealises, 0);
          const totalEx14       = s14.reduce((a, s) => a + s.nbTotal, 0);
          const taux14          = totalEx14 > 0 ? Math.round((totalRealises14 / totalEx14) * 100) : null;

          const derniereSeance  = seancesStats[0];
          const joursInactivite = derniereSeance
            ? Math.floor((now.getTime() - new Date(derniereSeance.dateSeance).getTime()) / 86400000)
            : null;

          const alerteDouleur = seancesStats.slice(0, 5).find(s =>
            s.commentairePatient?.toLowerCase().match(/douleur|mal|fait mal|douloureux/)
          );

          // Ressentis post-séance (Borg RPE + bien-être) : alerte si 3 dernières séances dégradées
          const last3 = retours.slice(0, 3);
          const alerteEffort = retours.length >= 3 && last3.every(r => r.borgRpe >= 8);
          const alerteBienEtre = retours.length >= 3 && last3.every(r => r.bienEtre >= 4);

          // Données graphique (chronologique, anciens→récents)
          const chartData = [...retours].reverse().slice(-20).map(r => ({
            date: new Date(r.date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
            Effort: r.borgRpe,
            'Bien-être': r.bienEtre,
          }));

          return (
            <div className="space-y-5">
              {/* Alertes */}
              {(joursInactivite !== null && joursInactivite >= 5 || alerteDouleur || (taux14 !== null && taux14 < 50) || alerteEffort || alerteBienEtre) && (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">À surveiller</div>
                  {joursInactivite !== null && joursInactivite >= 5 && (
                    <div className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium" style={{ background: '#FFF7E6', color: '#B45309' }}>
                      ⏰ Inactivité : {joursInactivite} jours sans séance
                    </div>
                  )}
                  {alerteDouleur && (
                    <div className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm" style={{ background: '#FCEBEB', color: '#A32D2D' }}>
                      <span className="font-bold flex-shrink-0">⚠️</span>
                      <div>
                        <div className="font-semibold">Douleur signalée</div>
                        <div className="text-[12px] mt-0.5 opacity-80">
                          Le {new Date(alerteDouleur.dateSeance + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} : "{alerteDouleur.commentairePatient}"
                        </div>
                      </div>
                    </div>
                  )}
                  {taux14 !== null && taux14 < 50 && (
                    <div className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium" style={{ background: '#FCEBEB', color: '#A32D2D' }}>
                      📉 Taux de réalisation faible sur 14 jours : {taux14}%
                    </div>
                  )}
                  {alerteEffort && (
                    <div className="rounded-lg px-3 py-2.5 text-sm" style={{ background: '#FEF3C7', color: '#92400E' }}>
                      <span className="font-semibold">Effort élevé répété</span>
                      {' '}— Borg ≥ 8 sur les 3 dernières séances.
                      Envisager d'adapter la charge lors de la prochaine séance.
                    </div>
                  )}
                  {alerteBienEtre && (
                    <div className="rounded-lg px-3 py-2.5 text-sm" style={{ background: '#FEE2E2', color: '#991B1B' }}>
                      <span className="font-semibold">Bien-être dégradé répété</span>
                      {' '}— Fatigué ou épuisé sur les 3 dernières séances.
                      Vérifier la récupération et la charge globale.
                    </div>
                  )}
                </div>
              )}

              {/* Statistiques */}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-3">Statistiques</div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-gray-200/70 p-3 text-center">
                    <div className="text-2xl font-bold" style={{ color: taux30 !== null && taux30 >= 70 ? '#16A34A' : taux30 !== null && taux30 >= 50 ? '#EA580C' : '#DC2626' }}>
                      {taux30 !== null ? `${taux30}%` : '—'}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">Taux 30j</div>
                  </div>
                  <div className="rounded-xl border border-gray-200/70 p-3 text-center">
                    <div className="text-2xl font-bold text-gray-800">{s30.length}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">Séances 30j</div>
                  </div>
                  <div className="rounded-xl border border-gray-200/70 p-3 text-center">
                    <div className="text-2xl font-bold text-gray-800">{seancesStats.length}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">Total</div>
                  </div>
                </div>
                {taux30 !== null && (
                  <div className="mt-3">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${taux30}%`,
                          background: taux30 >= 70 ? '#16A34A' : taux30 >= 50 ? '#EA580C' : '#DC2626',
                        }}
                      />
                    </div>
                    <div className="text-[11px] text-gray-400 mt-1 text-right">{totalRealises30}/{totalEx30} exercices réalisés sur 30j</div>
                  </div>
                )}
              </div>

              {/* Courbe d'évolution des ressentis — double axe Y */}
              {chartData.length >= 2 && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-3">
                    Évolution ressentis ({chartData.length} retours)
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} />
                      {/* Axe gauche : Effort (Borg 1-10) */}
                      <YAxis
                        yAxisId="left"
                        domain={[0, 10]}
                        ticks={[2, 4, 6, 8, 10]}
                        tick={{ fontSize: 11, fill: '#1A5F9E' }}
                        tickLine={false}
                        axisLine={false}
                        label={{ value: 'Effort', angle: -90, position: 'insideLeft', offset: 10, fontSize: 11, fill: '#1A5F9E' }}
                      />
                      {/* Axe droit : Bien-être (1-5, 1=Très bien 5=Épuisé) */}
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        domain={[0, 5]}
                        ticks={[1, 2, 3, 4, 5]}
                        tick={{ fontSize: 11, fill: '#EA580C' }}
                        tickLine={false}
                        axisLine={false}
                        label={{ value: 'Bien-être', angle: 90, position: 'insideRight', offset: 10, fontSize: 11, fill: '#EA580C' }}
                      />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                        formatter={(value, name) => {
                          const v = Number(value);
                          if (name === 'Effort') return [`${v} — ${labelBorg(v)}`, 'Effort'];
                          return [`${v} — ${labelBienEtre(v)}`, 'Bien-être'];
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="Effort"
                        stroke="#1A5F9E"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#1A5F9E' }}
                        activeDot={{ r: 5 }}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="Bien-être"
                        stroke="#EA580C"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#EA580C' }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="text-[10px] text-gray-400 mt-1 text-right">
                    Effort (axe gauche, 2=très facile 10=très difficile) ·
                    Bien-être (axe droit, 1=très bien 5=épuisé)
                  </div>
                </div>
              )}

              {/* Historique */}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-3">Détail des séances</div>
                <div className="space-y-2">
                  {seancesStats.slice(0, 15).map(sp => {
                    const emoji = sp.statut === 'terminee' ? '✅' : sp.statut === 'partielle' ? '⚠️' : '🔄';
                    const dateLabel = new Date(sp.dateSeance + 'T12:00').toLocaleDateString('fr-FR', {
                      weekday: 'short', day: 'numeric', month: 'short',
                    });
                    const retour = retours.find(r => dateOnly(r.date) === dateOnly(sp.dateSeance));
                    return (
                      <div key={sp.id} className="flex items-start gap-2.5 rounded-lg border border-gray-100 px-3 py-2.5">
                        <span className="text-sm flex-shrink-0 mt-0.5">{emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-semibold text-gray-800">{dateLabel}</span>
                            {sp.nbTotal > 0 && (
                              <span className="text-[12px] font-medium px-1.5 py-0.5 rounded-full"
                                style={{
                                  background: sp.nbRealises === sp.nbTotal ? '#DCFCE7' : '#FEF3C7',
                                  color: sp.nbRealises === sp.nbTotal ? '#16A34A' : '#B45309',
                                }}>
                                {sp.nbRealises}/{sp.nbTotal} ex.
                              </span>
                            )}
                            {sp.dureeMinutes && (
                              <span className="text-[11px] text-gray-400">{sp.dureeMinutes} min</span>
                            )}
                          </div>
                          {sp.commentairePatient && (
                            <div className="text-[12px] text-gray-400 italic mt-0.5 truncate">"{sp.commentairePatient}"</div>
                          )}
                          {retour && (
                            <div className="text-[12px] mt-0.5" style={{ color: retour.borgRpe >= 8 || retour.bienEtre >= 4 ? '#B45309' : '#6B7280' }}>
                              Effort : {labelBorgPraticien(retour.borgRpe)} · Ressenti : {labelBienEtre(retour.bienEtre)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}
        {activeTab === 'rappels' && (
          <SectionRappelsPatient participantId={participant.id} />
        )}
      </TabsSection>

      {/* ── MODALS ─────────────────────────────────────────────── */}

      {/* Confirmation suppression programme */}
      {confirmDeleteProg && programmeActif && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-light flex items-center justify-center flex-shrink-0">
                <Trash2 size={18} className="text-red-500" />
              </div>
              <h2 className="font-heading font-bold text-gray-900 text-lg">Supprimer le programme ?</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Le programme <strong>"{programmeActif.titre}"</strong> sera définitivement supprimé.
            </p>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  try {
                    await deleteProgramme(programmeActif.id);
                    setConfirmDeleteProg(false);
                    toast.success('Programme supprimé');
                  } catch (err) {
                    console.error('Erreur suppression programme:', err);
                    toast.error('Erreur lors de la suppression, réessayez');
                  }
                }}
                className="flex-1 bg-danger text-white rounded-xl py-2.5 font-semibold text-sm hover:bg-danger transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 size={14} /> Supprimer
              </button>
              <button onClick={() => setConfirmDeleteProg(false)} className="px-4 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 text-sm">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-light flex items-center justify-center flex-shrink-0">
                <Trash2 size={18} className="text-red-500" />
              </div>
              <h2 className="font-heading font-bold text-gray-900 text-lg">Supprimer ce bénéficiaire ?</h2>
            </div>
            <p className="text-sm text-gray-600 mb-1">
              Vous allez supprimer <strong>{participant.prenom} {participant.nom}</strong> et toutes ses données.
            </p>
            <ul className="text-xs text-gray-400 mb-4 pl-4 list-disc space-y-0.5">
              <li>{participant.bilans.length} bilan{participant.bilans.length !== 1 ? 's' : ''}</li>
              <li>{participant.programmes?.length ?? 0} programme{(participant.programmes?.length ?? 0) !== 1 ? 's' : ''}</li>
            </ul>
            <p className="text-xs text-red-500 font-semibold mb-4">⚠ Cette action est irréversible.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(false)}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                Annuler
              </button>
              <button
                onClick={async () => {
                  // On n'annonce la suppression et on ne quitte la fiche qu'une fois la base d'accord : un
                  // bénéficiaire avec un historique financier ne se supprime pas (il s'archive).
                  const r = await deleteParticipant(participant.id);
                  setConfirmDelete(false);
                  if ('erreur' in r) { toast.error(r.erreur, { duration: 10000 }); return; }
                  toast.success(`${participant.prenom} ${participant.nom} supprimé(e).`);
                  navigate('/');
                }}
                style={{ backgroundColor: '#E24B4A', color: 'white', border: 'none' }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">
                Supprimer définitivement
              </button>
            </div>
          </div>
        </div>
      )}

      {showEspacePatient && (
        <ModalEspacePatient
          participant={participant}
          onClose={() => setShowEspacePatient(false)}
          onUpdate={data => updateParticipant(participant.id, data)}
        />
      )}

      {showDictee && (
        <DicteePostSeance
          participant={participant}
          onClose={() => setShowDictee(false)}
          onSave={async (data) => { await ajouterCompteRendu(data); }}
        />
      )}

      {showModeleModal && (
        <AppliquerModeleModal
          participantId={id!}
          onClose={() => setShowModeleModal(false)}
          onApplied={async () => {
            // Recharge en place plutôt que de naviguer vers /programme
            // (desktop-only : sur mobile, hors route fusionnée, retombe
            // sur l'invitation "tournez votre téléphone" — la fiche ne
            // reflétait donc jamais le nouveau programme sans que le
            // praticien y revienne manuellement). ParticipantProfile.tsx
            // est la MÊME fiche fusionnée des deux côtés : ce comportement
            // change aussi pour le desktop, qui reste désormais sur place
            // au lieu d'être redirigé — AppliquerModeleModal n'est appelé
            // que d'ici, ProgrammePage.tsx ne l'utilise pas.
            //
            // Les deux rechargements sont nécessaires : la carte "Programme
            // en cours" bascule sur programmeActif (V1, useProgramme) —
            // resté périmé sans son propre reload — puis lit les exercices
            // via programmesV2 (V2, useProgrammeV2) quand il existe (voir
            // lib/programmeActifV2.ts).
            setShowModeleModal(false);
            await Promise.all([reloadProgrammeActif(), reloadProgrammesV2()]);
          }}
        />
      )}

      {/* Wizard de création — mobile uniquement (voir handleAction, case
          'programme'). Desktop garde ProgrammePage.tsx inchangée. */}
      {showWizardCreation && (
        <ProgrammeWizardModal
          step={stepWizardCreation}
          onStepChange={setStepWizardCreation}
          data={wizardDataCreation}
          onChange={updateWizardCreation}
          onClose={closeWizardCreation}
          onSave={handleSaveWizardCreation}
          saving={savingWizardCreation}
          isEditing={false}
          participant={participant}
        />
      )}

      {/* Génération IA — mobile uniquement (bouton ci-dessus, gate isMobile
          au rendu). Desktop garde ProgrammePage.tsx inchangée. */}
      {showConfigIA && participant && (
        <ConfigIAModal
          participant={participant}
          config={configIA}
          onChange={updateConfigIA}
          onGenerer={genererProgrammeIA}
          onClose={fermerConfigIA}
          generating={generatingIA}
          error={errorIA}
          questions={questionsIA}
          chargementQuestions={chargementQuestionsIA}
          reponses={reponsesIA}
          onReponseChange={updateReponseIA}
          precisionsLibres={precisionsLibresIA}
          onPrecisionsLibresChange={setPrecisionsLibresIA}
        />
      )}

      {showPreviewIA && programmePreview && (
        <PreviewIAModal
          programme={programmePreview}
          onChange={setProgrammePreview}
          onValider={handleValiderEtCreerIA}
          onRegenerer={regenererIA}
          onModifierConfig={modifierConfigDepuisPreview}
          onClose={fermerPreviewIA}
          saving={savingIA}
        />
      )}

    </PageWrapper>
  );
}
