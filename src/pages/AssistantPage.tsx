// ── Types ─────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback } from 'react';
import { chargerSettingsPraticien } from '../lib/settingsPraticien';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bot, Send, Mic, MicOff, Copy, RefreshCw, Search } from 'lucide-react';
import { useParticipants } from '../hooks/useParticipants';
import { useContrats } from '../hooks/useContrats';
import { useStructures } from '../hooks/useStructures';
import { partagerDocument } from '../lib/partageDocument';
import { supabase, getAuthHeader } from '../lib/supabase';
import { listerJournalAssistant, ajouterJournalAssistant, supprimerJournalAssistant, lireComptesRendusRecents, lireSeancesPatientRecentes, lireNotesRecentes, lireSeancesPlanifieesDepuis, lireExercicesRealises, partagerAvecBeneficiaire, partagerAvecStructure } from '../lib/acces/assistant';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { toast } from 'sonner';
import MarkdownRendu from '../components/ui/MarkdownRendu';
import ModalRelecturePartage from '../components/assistant/ModalRelecturePartage';
import RappelNomsIA from '../components/ui/RappelNomsIA';
import { loadExercicesPraticien } from '../lib/bibliothequeExercices';
import { genererQuestionsClarification, genererProgrammeStructure } from '../utils/genererProgrammeIA';
import { calculerPlanningReel, formatHistoriqueConversation, type SeanceReelleBrute, type NoteManuelleResume, type DicteeResume } from '../utils/assistantContexte';
import { buildActionPrompt, buildSystemPrompt, historiquePourIA, masquerExtrasIA, type ActionType } from '../utils/promptAssistant';
import { identiteDe, masquerIdentiteConnue, reinsererIdentite, versParticipantIA } from '../utils/pseudonymiserIA';
import type { Participant, Contrat, RessentiSeance, StatutSeance, TypeStructure } from '../types';
import { libelleAge } from '../lib/age';
import { LeftColumn } from './assistant/ColonneGauche';
import { type AssistantLog, type PatientExtras } from './assistant/communs';
import { downloadPDF } from './assistant/exportPdf';
import { chargerProgrammeActif } from './assistant/programmeActif';

type Phase = 'home' | 'chat';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'patient_select';
  content: string;
  /** Message d'interface statique (accueil, demande de bénéficiaire/objectif) plutôt
   *  que sortie du modèle — jamais une cible valide pour "🔄 Régénérer". */
  synthetic?: boolean;
  /** Version envoyable à l'IA (sans le nom), voir historiquePourIA. */
  contenuIA?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const ACTIONS: { id: ActionType; emoji: string; title: string; subtitle: string }[] = [
  { id: 'contre_indications', emoji: '💊',  title: 'Vérifier les contre-indications',  subtitle: 'CI actives + recommandations APA' },
  { id: 'compte_rendu',       emoji: '📋',  title: 'Rédiger un compte-rendu',          subtitle: 'Médecin prescripteur ou famille' },
  { id: 'programme',          emoji: '🏋️', title: "Suggérer un programme d'exercices", subtitle: 'Adapté au profil et aux CI' },
  { id: 'interpretation',     emoji: '📊',  title: 'Interpréter un résultat de test',  subtitle: 'Analyse clinique des derniers scores' },
];

const ACTION_LABELS: Record<ActionType, string> = {
  contre_indications:   'vérifier les contre-indications',
  compte_rendu:         'rédiger un compte-rendu médecin',
  compte_rendu_famille: 'rédiger un compte-rendu famille',
  programme:            "suggérer un programme d'exercices",
  interpretation:       'interpréter les résultats de test',
  libre:                'poser une question',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

let _msgId = 0;
function newId() { return String(++_msgId); }

function loadPraticienPrenom(): string {
  return chargerSettingsPraticien().prenom;
}


// ── PatientChips ──────────────────────────────────────────────────────────────

function PatientChips({ participants, onSelect }: { participants: Participant[]; onSelect: (p: Participant) => void }) {
  const [q, setQ] = useState('');
  const filtered = q.trim()
    ? participants.filter(p => `${p.prenom} ${p.nom}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8)
    : participants.slice(0, participants.length <= 5 ? participants.length : 6);
  const showSearch = participants.length > 5;
  return (
    <div style={{ maxWidth: 480 }}>
      {showSearch && (
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
          <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un bénéficiaire…" autoFocus
            style={{ width: '100%', padding: '8px 10px 8px 30px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#F9FAFB' }} />
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map(p => (
          <button key={p.id} onClick={() => onSelect(p)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'white', border: '1px solid #E5E7EB', borderRadius: 10, cursor: 'pointer', textAlign: 'left' }}
            onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--color-teal)')}
            onMouseOut={e => (e.currentTarget.style.borderColor = '#E5E7EB')}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-teal)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
              {p.prenom[0]}{p.nom[0]}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{p.prenom} {p.nom}</div>
              <div style={{ fontSize: 12, color: '#6B7280' }}>{libelleAge(p.dateNaissance)}{p.pathologie ? ` · ${p.pathologie.slice(0, 28)}` : ''}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Component principal ───────────────────────────────────────────────────────

export default function AssistantPage() {
  // `participants` (tous) : retrouver un bénéficiaire par identifiant. `participantsActifs` :
  // choix et recherche — un archivé n'est plus suivi.
  const { participants, participantsActifs } = useParticipants();
  const { contratsDeParticipant } = useContrats();
  const { structures } = useStructures();
  const location = useLocation();
  const navigate = useNavigate();

  const [phase, setPhase]               = useState<Phase>('home');
  const [actionType, setActionType]     = useState<ActionType | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Participant | null>(null);
  const [patientExtras, setPatientExtras] = useState<PatientExtras | null>(null);
  const [messages, setMessages]         = useState<Message[]>([]);
  const [awaitingPatient, setAwaitingPatient] = useState(false);
  // Action "programme" : questions de clarification posées → affiche le
  // bouton "Générer le programme structuré". Le chat reste libre jusque-là
  // (et après) — jamais de génération automatique sur une réponse.
  const [programmeQuestionsPosees, setProgrammeQuestionsPosees] = useState(false);
  const [genererProgrammeLoading, setGenererProgrammeLoading] = useState(false);
  // Texte libre optionnel, en plus des échanges du chat (déjà transmis comme
  // reponsesClarification) — même mécanisme que ProgrammePage.tsx, voir
  // construirePrompt() dans genererProgrammeIA.ts.
  const [precisionsLibresProgramme, setPrecisionsLibresProgramme] = useState('');
  const [input, setInput]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [logs, setLogs]                 = useState<AssistantLog[]>([]);
  const [logSearch, setLogSearch]       = useState('');
  const [expandedCard, setExpandedCard] = useState<ActionType | null>(null);
  const [modalPartage, setModalPartage] = useState<{
    destinataire: string;
    texteInitial: string;
    onConfirmer: (texteFinal: string) => Promise<void>;
  } | null>(null);

  const praticienPrenom = loadPraticienPrenom();
  const messagesEndRef  = useRef<HTMLDivElement>(null);
  const textareaRef     = useRef<HTMLTextAreaElement>(null);

  const {
    isRecording, finalTranscript, interimTranscript,
    isSupported, startRecording, stopRecording, reset: resetSpeech,
  } = useSpeechRecognition();

  // Pré-sélectionner patient depuis l'état de navigation
  useEffect(() => {
    const state = location.state as { patientId?: string } | null;
    if (state?.patientId && participants.length > 0) {
      const p = participants.find(x => x.id === state.patientId);
      if (p) { selectPatient(p); handleStartAction('libre', p); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, participants]);

  useEffect(() => {
    const text = finalTranscript + interimTranscript;
    if (text) setInput(text);
  }, [finalTranscript, interimTranscript]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => { loadLogs(); }, []);

  async function loadLogs() {
    if (!supabase) return;
    try {
      const { data } = await listerJournalAssistant();
      if (data) setLogs(data as AssistantLog[]);
    } catch { /* non bloquant */ }
  }

  async function handleDeleteLog(logId: string) {
    if (!supabase) return;
    if (!window.confirm('Supprimer cette question de l’historique ?')) return;
    const precedent = logs;
    setLogs(prev => prev.filter(l => l.id !== logId));
    const { error } = await supprimerJournalAssistant(logId);
    if (error) {
      setLogs(precedent);
      toast.error('Erreur lors de la suppression');
    }
  }

  /** Charge les séances dictées, notes manuelles, présence aux séances planifiées et
   *  assiduité aux exercices depuis Supabase pour le prompt IA. Renvoie la valeur
   *  calculée (en plus de la poser en state) pour les appelants qui en ont besoin
   *  immédiatement, sans dupliquer ces requêtes (cf. handlePatientSelected). */
  async function loadPatientExtras(patientId: string): Promise<PatientExtras> {
    setPatientExtras({ compteRendus: [], notesManuelles: [], programme: null, loading: true });
    try {
      return await loadPatientExtrasUnsafe(patientId);
    } catch (err) {
      // Dégradation gracieuse : une exception ici (réseau, etc.) ne doit ni bloquer
      // indéfiniment l'indicateur "Chargement…", ni empêcher runAction() de répondre
      // (le prompt se construit alors avec un contexte vide plutôt que de rien renvoyer).
      console.error('[AssistantPage] Erreur chargement contexte patient:', err);
      const extras: PatientExtras = { compteRendus: [], notesManuelles: [], programme: null, loading: false };
      setPatientExtras(extras);
      return extras;
    }
  }

  async function loadPatientExtrasUnsafe(patientId: string): Promise<PatientExtras> {
    const fenetrePlanningJours = 90;
    const seuilPlanning = new Date();
    seuilPlanning.setDate(seuilPlanning.getDate() - fenetrePlanningJours);
    const seuilPlanningISO = seuilPlanning.toISOString().slice(0, 10);

    const [crRes, spRes, notesRes, seancesRes, programmeRes] = await Promise.allSettled([
      supabase ? lireComptesRendusRecents(patientId) : Promise.resolve({ data: null }),
      supabase ? lireSeancesPatientRecentes(patientId) : Promise.resolve({ data: null }),
      supabase ? lireNotesRecentes(patientId) : Promise.resolve({ data: null }),
      // Colonnes explicites : motif_annulation/motif_annulation_detail sont internes
      // au praticien et ne doivent jamais transiter par le prompt IA (cf. assistantContexte.ts).
      supabase ? lireSeancesPlanifieesDepuis(patientId, seuilPlanningISO) : Promise.resolve({ data: null }),
      chargerProgrammeActif(patientId),
    ]);
    const programme = programmeRes.status === 'fulfilled' ? programmeRes.value : null;
    const crs: DicteeResume[] = crRes.status === 'fulfilled' && crRes.value.data
      ? (crRes.value.data as { date_seance: string; observations: string; progression: string | null; points_attention: string | null; douleurs_signalees: string | null }[]).map(r => ({
          dateSeance: r.date_seance, observations: r.observations, progression: r.progression,
          pointsAttention: r.points_attention, douleursSignalees: r.douleurs_signalees,
        }))
      : [];

    const notesManuelles: NoteManuelleResume[] = notesRes.status === 'fulfilled' && notesRes.value.data
      ? (notesRes.value.data as { date: string; ressenti: RessentiSeance | null; note: string; alertes: NoteManuelleResume['alertes']; douleur_eva: number | null }[]).map(r => ({
          date: r.date, ressenti: r.ressenti, note: r.note, alertes: r.alertes, douleurEVA: r.douleur_eva,
        }))
      : [];

    const seancesReelles: SeanceReelleBrute[] = seancesRes.status === 'fulfilled' && seancesRes.value.data
      ? (seancesRes.value.data as { date: string; statut: StatutSeance }[]).map(r => ({ date: r.date, statut: r.statut }))
      : [];
    const planningReel = calculerPlanningReel(seancesReelles, new Date(), fenetrePlanningJours);

    let adherence: PatientExtras['adherence'] = undefined;
    const spData = spRes.status === 'fulfilled' ? (spRes.value.data as Record<string, unknown>[] | null) ?? [] : [];
    if (spData.length > 0) {
      const j30 = new Date(); j30.setDate(j30.getDate() - 30);
      const sp30 = spData.filter(s => new Date(s.date_seance as string) >= j30);
      let taux30j: number | null = null;
      if (supabase && sp30.length > 0) {
        const erRes = await lireExercicesRealises(sp30.map(s => s.id));
        const erRows = (erRes.data ?? []) as { seance_patient_id: string; realise: boolean }[];
        const total = erRows.length;
        const realises = erRows.filter(e => e.realise).length;
        taux30j = total > 0 ? Math.round((realises / total) * 100) : null;
      }
      adherence = {
        taux30j,
        nbSeances30j: sp30.length,
        derniereSeance: (spData[0]?.date_seance as string | null) ?? null,
        commentairesRecents: spData
          .filter(s => s.commentaire_patient)
          .slice(0, 3)
          .map(s => `${s.date_seance as string} : "${s.commentaire_patient as string}"`),
      };
    }

    const extras: PatientExtras = { compteRendus: crs, notesManuelles, programme, adherence, planningReel, loading: false };
    setPatientExtras(extras);
    return extras;
  }

  function selectPatient(p: Participant) {
    setSelectedPatient(p);
    void loadPatientExtras(p.id);
  }

  function deselectPatient() {
    setSelectedPatient(null);
    setPatientExtras(null);
  }

  function handleStartAction(action: ActionType, prePatient?: Participant) {
    setPhase('chat');
    setActionType(action);
    setProgrammeQuestionsPosees(false);
    setPrecisionsLibresProgramme('');

    if (action === 'libre') {
      const p = prePatient ?? selectedPatient;
      const content = p
        ? `Contexte de ${p.prenom} ${p.nom} chargé avec ${p.bilans.length} bilan(s). Posez votre question.`
        : 'Bonjour ! Je suis votre assistant clinique APA. Posez votre question, ou sélectionnez un bénéficiaire dans la colonne gauche.';
      const greeting: Message = {
        id: newId(), role: 'assistant', synthetic: true, content,
        contenuIA: p ? masquerIdentiteConnue(content, identiteDe(p)) : content,
      };
      setMessages([greeting]);
      return;
    }

    const label = ACTION_LABELS[action];
    setMessages([
      { id: newId(), role: 'assistant', synthetic: true, content: `Pour quel bénéficiaire souhaitez-vous ${label} ?` },
      { id: newId(), role: 'patient_select', content: '' },
    ]);
    setAwaitingPatient(true);
  }

  async function handlePatientSelected(patient: Participant) {
    selectPatient(patient);
    setAwaitingPatient(false);

    setMessages(prev => [
      ...prev.filter(m => m.role !== 'patient_select'),
      { id: newId(), role: 'user', content: `${patient.prenom} ${patient.nom}`, contenuIA: masquerIdentiteConnue(`${patient.prenom} ${patient.nom}`, identiteDe(patient)) },
    ]);

    if (!actionType || actionType === 'libre') return;

    if (actionType === 'programme') {
      setLoading(true);
      try {
        const questions = await genererQuestionsClarification(patient);
        setProgrammeQuestionsPosees(true);
        const content = `Pour construire le programme de ${patient.prenom}, quelques précisions :\n\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nRépondez librement (une ou plusieurs questions, ou creusez un point en particulier), puis cliquez sur "Générer le programme structuré" quand vous êtes prêt.`;
        setMessages(prev => [...prev, {
          id: newId(), role: 'assistant', synthetic: true, content,
          contenuIA: masquerIdentiteConnue(content, identiteDe(patient)),
        }]);
      } catch {
        // Non bloquant — Pierre peut répondre librement puis générer sans
        // questions ciblées si l'appel de clarification échoue.
        setProgrammeQuestionsPosees(true);
        const content = `Pour quel objectif souhaitez-vous un programme pour ${patient.prenom} ? (ex : équilibre, force musculaire, endurance, douleurs…)\n\nRépondez librement, puis cliquez sur "Générer le programme structuré" quand vous êtes prêt.`;
        setMessages(prev => [...prev, {
          id: newId(), role: 'assistant', synthetic: true, content,
          contenuIA: masquerIdentiteConnue(content, identiteDe(patient)),
        }]);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Charger les extras avant de lancer l'action (même chemin que selectPatient,
    // pour ne pas dupliquer ces requêtes avec une deuxième implémentation).
    const extras = supabase ? await loadPatientExtras(patient.id) : { compteRendus: [], notesManuelles: [], programme: null, loading: false };

    await runAction(actionType, patient, extras);
  }

  /** Contrat le plus récent, quel que soit son statut — un contrat terminé/suspendu
   *  doit rester visible (et signalé) plutôt que de disparaître silencieusement. */
  function getContratInfo(patient: Participant): Contrat | null {
    return contratsDeParticipant(patient.id)[0] ?? null;
  }

  function getStructureInfo(patient: Participant): { nom: string; type?: TypeStructure } | null {
    if (!patient.structureId) return null;
    const s = structures.find(st => st.id === patient.structureId);
    return s ? { nom: s.nom, type: s.type } : null;
  }

  /** Point d'appel unique vers /api/claude : centralise la vérification de statut HTTP
   *  et l'extraction du message d'erreur — un appelant qui oublierait `res.ok` afficherait
   *  silencieusement une réponse vide en cas d'échec (rate limit, timeout, clé manquante…). */
  async function callClaudeAPI(prompt: string): Promise<string> {
    const res = await fetch('/api/claude', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify({ prompt }) });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error ?? `Erreur ${res.status}`);
    return data?.text ?? '';
  }

  async function runAction(action: ActionType, patient: Participant, extras: PatientExtras) {
    setLoading(true);
    // Pseudonymisation (lot A, 2026-10-27) : le prompt ne voit qu'un
    // ParticipantIA ; l'identité est réinsérée dans la réponse, ici.
    const identite = identiteDe(patient);
    const prompt = buildActionPrompt(action, versParticipantIA(patient), masquerExtrasIA(extras, identite), getContratInfo(patient), getStructureInfo(patient));
    // console.log('[AssistantPage] prompt:', prompt); // Décommenter pour débugger
    try {
      const brut = await callClaudeAPI(prompt);
      const text = reinsererIdentite(brut, identite);
      setMessages(prev => [...prev, { id: newId(), role: 'assistant', content: text, contenuIA: brut }]);
      await saveLog(ACTION_LABELS[action], text, patient.id, action);
    } catch (err) {
      setMessages(prev => [...prev, { id: newId(), role: 'assistant', content: `Erreur : ${err instanceof Error ? err.message : String(err)}` }]);
    } finally {
      setLoading(false);
    }
  }

  function extrasParDefaut(): PatientExtras {
    return patientExtras ?? { compteRendus: [], notesManuelles: [], programme: null, loading: false };
  }

  /** Cœur commun à l'envoi d'un message et à la régénération : construit le prompt
   *  (avec ou sans objectif de programme), appelle l'API et journalise. `historique`
   *  est passé explicitement (plutôt que de lire `messages`) pour que la régénération
   *  puisse l'exclure la paire Q/R qu'elle est en train de refaire. */
  async function genererReponse(questionText: string, historique: Message[]) {
    setLoading(true);
    try {

      const extras = extrasParDefaut();
      const identite = selectedPatient ? identiteDe(selectedPatient) : null;
      const sys = buildSystemPrompt(selectedPatient ? versParticipantIA(selectedPatient) : null, masquerExtrasIA(extras, identite), selectedPatient ? getContratInfo(selectedPatient) : null, selectedPatient ? getStructureInfo(selectedPatient) : null);
      const history = formatHistoriqueConversation(historiquePourIA(historique, identite));
      const questionIA = masquerIdentiteConnue(questionText, identite);
      const fullPrompt = history
        ? `${sys}\n\n---\nÉCHANGES PRÉCÉDENTS:\n${history}\n\n---\nQUESTION:\n${questionIA}`
        : `${sys}\n\n---\nQUESTION:\n${questionIA}`;
      const brut = await callClaudeAPI(fullPrompt);
      const responseText = reinsererIdentite(brut, identite);
      setMessages(prev => [...prev, { id: newId(), role: 'assistant', content: responseText, contenuIA: brut }]);
      await saveLog(questionText, responseText, selectedPatient?.id ?? null, actionType ?? 'libre');
    } catch (err) {
      setMessages(prev => [...prev, { id: newId(), role: 'assistant', content: `Erreur : ${err instanceof Error ? err.message : String(err)}` }]);
    } finally {
      setLoading(false);
    }
  }

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput('');
    resetSpeech();
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const historiqueAvant = messages;
    setMessages(prev => [...prev, { id: newId(), role: 'user', content: trimmed }]);
    await genererReponse(trimmed, historiqueAvant);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, messages, selectedPatient, actionType, patientExtras, resetSpeech, contratsDeParticipant, structures]);

  /** Relance la dernière réponse de l'assistant avec le même contexte. Insère une
   *  NOUVELLE entrée dans l'historique (jamais un update) pour garder une trace de
   *  chaque tentative — comparables entre elles — mais avec le même intitulé de
   *  question que l'original : LeftColumn regroupe alors les régénérations sous
   *  l'entrée d'origine au lieu de les lister à plat (cf. assistantHistorique.ts). */
  function regenerateLastResponse() {
    if (loading) return;
    const lastAssistantIdx = [...messages].map((_, i) => i).reverse().find(i => messages[i].role === 'assistant');
    if (lastAssistantIdx == null || messages[lastAssistantIdx].synthetic) return;
    let userIdx = lastAssistantIdx - 1;
    while (userIdx >= 0 && messages[userIdx].role !== 'user') userIdx--;
    if (userIdx < 0) return;
    const questionText = messages[userIdx].content;

    if (actionType && actionType !== 'libre' && actionType !== 'programme' && selectedPatient) {
      void runAction(actionType, selectedPatient, extrasParDefaut());
      return;
    }
    void genererReponse(questionText, messages.slice(0, userIdx));
  }

  async function saveLog(question: string, reponse: string, patientId: string | null, action: ActionType) {
    if (!supabase) return;
    try {
      await ajouterJournalAssistant({ patient_id: patientId, question, reponse, action_type: action });
      await loadLogs();
    } catch { /* non bloquant */ }
  }

  function handleToggleMic() {
    if (isRecording) { stopRecording(); }
    else { resetSpeech(); setInput(''); startRecording(); }
  }

  function handleCopyLast() {
    const last = [...messages].reverse().find(m => m.role === 'assistant')?.content;
    if (!last) return;
    navigator.clipboard.writeText(last);
    toast.success('Réponse copiée');
  }

  function handleRestoreLog(log: AssistantLog) {
    setPhase('chat');
    setActionType('libre');
    setMessages([
      { id: newId(), role: 'user',      content: log.question },
      { id: newId(), role: 'assistant', content: log.reponse },
    ]);
    if (log.patient_id) {
      const p = participants.find(x => x.id === log.patient_id);
      if (p) selectPatient(p);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  }

  /** Déclenchement EXPLICITE uniquement (clic du praticien) — jamais sur une
   *  réponse du chat. Même mécanisme de génération que ProgrammePage.tsx
   *  (genererProgrammeIA.ts) : à la réussite, on ouvre l'écran de relecture
   *  déjà existant (PreviewIAModal) via navigation, plutôt que d'en construire
   *  un second dans le chat. */
  async function handleGenererProgrammeStructure() {
    if (!selectedPatient) return;
    setGenererProgrammeLoading(true);
    try {
      const contrat = getContratInfo(selectedPatient);
      const catalogue = await loadExercicesPraticien();
      const dernierBilan = [...selectedPatient.bilans].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
      const reponsesClarification = formatHistoriqueConversation(historiquePourIA(messages.filter(m => m.role === 'user' || m.role === 'assistant'), identiteDe(selectedPatient)));

      const programme = await genererProgrammeStructure(
        selectedPatient,
        {
          objectif: 'à déduire des échanges ci-dessous',
          frequence: contrat?.nbSeancesSemaine ?? 3,
          duree: contrat?.dureesSeances?.[0] ?? 45,
          niveau: 2,
        },
        reponsesClarification,
        catalogue,
        dernierBilan,
        [],
        precisionsLibresProgramme,
      );

      await saveLog('Génération de programme structuré', `Programme "${programme.nom}" généré (${programme.seances.length} séance(s))`, selectedPatient.id, 'programme');
      navigate(`/participant/${selectedPatient.id}/programme`, { state: { programmeGenereIA: programme } });
    } catch (err) {
      setMessages(prev => [...prev, {
        id: newId(), role: 'assistant',
        content: `Impossible de générer le programme structuré : ${err instanceof Error ? err.message : String(err)}. Réessayez.`,
      }]);
    } finally {
      setGenererProgrammeLoading(false);
    }
  }

  function resetToHome() {
    setPhase('home'); setActionType(null); setMessages([]); setAwaitingPatient(false); setInput(''); setExpandedCard(null);
    setProgrammeQuestionsPosees(false);
    setPrecisionsLibresProgramme('');
  }

  const sharedLeftColumn = (
    <LeftColumn
      logs={logs} participants={participants} selectedPatient={selectedPatient}
      extras={patientExtras} logSearch={logSearch} setLogSearch={setLogSearch}
      onRestoreLog={handleRestoreLog} onDeleteLog={handleDeleteLog} onSelectPatient={selectPatient} onRemovePatient={deselectPatient}
      showBackButton={phase === 'chat'} onBack={resetToHome}
    />
  );

  // ── HOME ──────────────────────────────────────────────────────────────────

  if (phase === 'home') {
    return (
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F8FAFA' }}>
        {sharedLeftColumn}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
          <div style={{ maxWidth: 600, width: '100%' }}>
            <div style={{ textAlign: 'center', marginBottom: 36 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827', margin: 0 }}>Mon assistant</h1>
              <p style={{ fontSize: 15, color: '#6B7280', marginTop: 8 }}>
                {praticienPrenom ? `Bonjour ${praticienPrenom} ! ` : ''}Que souhaitez-vous faire ?
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              {ACTIONS.map(action => {
                if (action.id === 'compte_rendu' && expandedCard === 'compte_rendu') {
                  return (
                    <div key={action.id} style={{ gridColumn: '1 / -1', padding: '20px 18px', background: 'white', border: '1.5px solid #2BBFBF', borderRadius: 14, boxShadow: '0 4px 16px rgba(43,191,191,0.12)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                        <span style={{ fontSize: 24 }}>{action.emoji}</span>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{action.title}</div>
                          <div style={{ fontSize: 12, color: '#6B7280' }}>Choisissez le destinataire</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button
                          onClick={() => { setExpandedCard(null); handleStartAction('compte_rendu'); }}
                          style={{ flex: 1, padding: '12px 14px', background: '#F0F9F9', border: '1.5px solid #2BBFBF', borderRadius: 10, cursor: 'pointer', textAlign: 'left' }}
                          onMouseOver={e => (e.currentTarget.style.background = '#E0F5F5')}
                          onMouseOut={e => (e.currentTarget.style.background = '#F0F9F9')}>
                          <div style={{ fontSize: 18, marginBottom: 4 }}>👨‍⚕️</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Médecin prescripteur</div>
                          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>Vocabulaire clinique, valeurs exactes</div>
                        </button>
                        <button
                          onClick={() => { setExpandedCard(null); handleStartAction('compte_rendu_famille'); }}
                          style={{ flex: 1, padding: '12px 14px', background: '#F0F9F9', border: '1.5px solid #2BBFBF', borderRadius: 10, cursor: 'pointer', textAlign: 'left' }}
                          onMouseOver={e => (e.currentTarget.style.background = '#E0F5F5')}
                          onMouseOut={e => (e.currentTarget.style.background = '#F0F9F9')}>
                          <div style={{ fontSize: 18, marginBottom: 4 }}>👨‍👩‍👧</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Famille</div>
                          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>Langage accessible, conseils pratiques</div>
                        </button>
                      </div>
                      <button onClick={() => setExpandedCard(null)}
                        style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#9CA3AF' }}>
                        ✕ Annuler
                      </button>
                    </div>
                  );
                }
                return (
                  <button key={action.id}
                    onClick={() => action.id === 'compte_rendu' ? setExpandedCard('compte_rendu') : handleStartAction(action.id)}
                    style={{ padding: '20px 18px', background: 'white', border: '1.5px solid #E5E7EB', borderRadius: 14, cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s, box-shadow 0.15s' }}
                    onMouseOver={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-teal)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(43,191,191,0.12)'; }}
                    onMouseOut={e => { (e.currentTarget as HTMLElement).style.borderColor = '#E5E7EB'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}>
                    <div style={{ fontSize: 28, marginBottom: 10 }}>{action.emoji}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', lineHeight: 1.4, marginBottom: 5 }}>{action.title}</div>
                    <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.4 }}>{action.subtitle}</div>
                  </button>
                );
              })}
            </div>
            <div style={{ textAlign: 'center' }}>
              <button onClick={() => handleStartAction('libre')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#6B7280', padding: '8px 16px', borderRadius: 8 }}
                onMouseOver={e => (e.currentTarget as HTMLElement).style.color = 'var(--color-teal)'}
                onMouseOut={e => (e.currentTarget as HTMLElement).style.color = '#6B7280'}>
                ou ✏️ Poser une question libre…
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── CHAT ──────────────────────────────────────────────────────────────────

  const currentAction = actionType ? ACTIONS.find(a => a.id === actionType) : null;
  const chatTitle = actionType === 'compte_rendu_famille'
    ? '👨‍👩‍👧 Compte-rendu famille'
    : currentAction ? `${currentAction.emoji} ${currentAction.title}` : 'Mon assistant';

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F8FAFA' }}>
      {sharedLeftColumn}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ background: 'white', borderBottom: '0.5px solid #E5E7EB', padding: '13px 22px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <Bot size={18} style={{ color: 'var(--color-teal)', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
                {chatTitle}
              </div>
              {selectedPatient && (
                <div style={{ fontSize: 12, color: 'var(--color-teal)' }}>
                  Contexte : {selectedPatient.prenom} {selectedPatient.nom} · {selectedPatient.bilans.length} bilan(s)
                  {patientExtras && !patientExtras.loading && patientExtras.compteRendus.length > 0 && ` · ${patientExtras.compteRendus.length} dictée(s)`}
                </div>
              )}
            </div>
          </div>
          {messages.some(m => m.role === 'assistant') && !loading && (
            <div style={{ display: 'flex', gap: 8 }}>
              {![...messages].reverse().find(m => m.role === 'assistant')?.synthetic && (
                <button onClick={regenerateLastResponse}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'none', border: '1px solid #E5E7EB', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#6B7280' }}>
                  <RefreshCw size={11} /> Régénérer
                </button>
              )}
              <button onClick={handleCopyLast}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'none', border: '1px solid #E5E7EB', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#6B7280' }}>
                <Copy size={11} /> Copier
              </button>
              <button onClick={resetToHome}
                style={{ padding: '5px 10px', background: 'none', border: '1px solid #E5E7EB', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#9CA3AF' }}>
                Nouvelle action
              </button>
            </div>
          )}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {messages.map(msg => {
            if (msg.role === 'patient_select') {
              return <div key={msg.id} style={{ maxWidth: 520 }}><PatientChips participants={participantsActifs} onSelect={handlePatientSelected} /></div>;
            }
            const lastAssistantId = messages.filter(m => m.role === 'assistant').at(-1)?.id;
            const isLastAssistant = msg.role === 'assistant' && msg.id === lastAssistantId;
            const showPdfBar = isLastAssistant && !loading &&
              (actionType === 'compte_rendu' || actionType === 'compte_rendu_famille');
            const showPartagerBtn = isLastAssistant && !loading &&
              actionType === 'compte_rendu_famille' && selectedPatient != null;
            return (
              <div key={msg.id}>
                <div style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div
                    style={{
                      maxWidth: '74%', padding: '12px 16px', fontSize: 14, lineHeight: 1.7,
                      borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      background: msg.role === 'user' ? 'var(--color-teal)' : 'white',
                      color: msg.role === 'user' ? 'white' : '#111827',
                      border: msg.role === 'assistant' ? '0.5px solid #E5E7EB' : 'none',
                      whiteSpace: msg.role === 'user' ? 'pre-wrap' : undefined,
                    }}>
                    {msg.role === 'user'
                      ? msg.content
                      : <MarkdownRendu>{msg.content}</MarkdownRendu>
                    }
                  </div>
                </div>
                {showPdfBar && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => downloadPDF(selectedPatient ? `${selectedPatient.prenom}-${selectedPatient.nom}` : 'patient', actionType!, msg.content)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--color-teal)', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                      📄 Télécharger en PDF
                    </button>
                    <button
                      onClick={handleCopyLast}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'white', border: '0.5px solid #E5E7EB', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#374151' }}>
                      📋 Copier le texte
                    </button>
                    {showPartagerBtn && (
                      <button
                        onClick={() => {
                          if (!selectedPatient) return;
                          const patient = selectedPatient;
                          setModalPartage({
                            destinataire: `${patient.prenom} ${patient.nom} (bénéficiaire)`,
                            texteInitial: msg.content,
                            onConfirmer: async (texteFinal) => {
                              if (!supabase) return;
                              const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
                              const resultat = await partagerDocument(
                                () => partagerAvecBeneficiaire({
                                  participant_id: patient.id,
                                  titre: `Compte-rendu du ${date}`,
                                  contenu: texteFinal,
                                  type: 'compte_rendu_famille',
                                }),
                                `Document partagé avec ${patient.prenom} ✅`,
                              );
                              // Ne ferme la modale qu'en cas de succès — sinon le texte relu/édité
                              // serait perdu et il faudrait tout recommencer pour réessayer.
                              if (resultat.succes) { toast.success(resultat.message); setModalPartage(null); }
                              else toast.error(resultat.message);
                            },
                          });
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--color-ink)', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        👁️ Partager avec le bénéficiaire
                      </button>
                    )}
                    {showPdfBar && selectedPatient?.structureId && (
                      <button
                        onClick={() => {
                          if (!selectedPatient?.structureId) return;
                          const patient = selectedPatient;
                          const structureId = patient.structureId!;
                          const nomStructure = structures.find(s => s.id === structureId)?.nom ?? 'la structure';
                          setModalPartage({
                            destinataire: `${nomStructure} (structure)`,
                            texteInitial: msg.content,
                            onConfirmer: async (texteFinal) => {
                              if (!supabase) return;
                              const resultat = await partagerDocument(
                                () => partagerAvecStructure({
                                  participant_id: patient.id,
                                  structure_id: structureId,
                                  type_document: actionType,
                                  contenu: texteFinal,
                                }),
                                'Document partagé avec la structure ✅',
                              );
                              if (resultat.succes) { toast.success(resultat.message); setModalPartage(null); }
                              else toast.error(resultat.message);
                            },
                          });
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'white', border: '0.5px solid #E5E7EB', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--color-ink)' }}>
                        🏢 Partager avec la structure
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ background: 'white', border: '0.5px solid #E5E7EB', borderRadius: '12px 12px 12px 2px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <RefreshCw size={12} className="animate-spin" style={{ color: 'var(--color-teal)' }} />
                <span style={{ fontSize: 13, color: '#9CA3AF' }}>L'assistant analyse les données du bénéficiaire…</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Génération du programme structuré — déclenchement explicite uniquement */}
        {actionType === 'programme' && programmeQuestionsPosees && selectedPatient && !awaitingPatient && (
          <div style={{ padding: '0 22px 12px', flexShrink: 0 }}>
            <textarea
              value={precisionsLibresProgramme}
              onChange={e => setPrecisionsLibresProgramme(e.target.value)}
              placeholder="Autres précisions pour ce programme (facultatif)…"
              rows={2}
              style={{
                width: '100%', boxSizing: 'border-box' as const, marginBottom: 8, padding: '8px 10px',
                borderRadius: 10, border: '1px solid #E0EEEE', fontSize: 13, fontFamily: 'inherit', resize: 'vertical',
              }}
            />
            <button
              onClick={handleGenererProgrammeStructure}
              disabled={loading || genererProgrammeLoading}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', padding: '11px 14px', borderRadius: 10, border: 'none',
                background: (loading || genererProgrammeLoading) ? '#E5E7EB' : 'var(--color-ink)',
                color: (loading || genererProgrammeLoading) ? '#9CA3AF' : 'white',
                fontSize: 13, fontWeight: 700, cursor: (loading || genererProgrammeLoading) ? 'not-allowed' : 'pointer',
              }}
            >
              {genererProgrammeLoading ? (
                <><RefreshCw size={14} className="animate-spin" /> Génération du programme…</>
              ) : (
                <>🏋️ Générer le programme structuré</>
              )}
            </button>
          </div>
        )}

        {/* Saisie */}
        {!awaitingPatient && (
          <div style={{ background: 'white', borderTop: '0.5px solid #E5E7EB', padding: '11px 22px 15px', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1, border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
                <textarea ref={textareaRef} value={input} onChange={handleInputChange}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                  placeholder={isRecording ? '🎙️ Dictée en cours…' : 'Posez votre question… (Entrée pour envoyer)'}
                  rows={1} disabled={loading}
                  style={{ width: '100%', padding: '10px 12px', border: 'none', outline: 'none', fontSize: 14, resize: 'none', background: 'transparent', fontFamily: 'inherit', lineHeight: 1.5, maxHeight: 120, boxSizing: 'border-box', display: 'block' }} />
                {isSupported && (
                  <div style={{ padding: '3px 10px', borderTop: '0.5px solid #F3F4F6', display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={handleToggleMic} disabled={loading}
                      style={{ padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: isRecording ? '#FEE2E2' : '#F3F4F6', color: isRecording ? '#DC2626' : '#6B7280', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {isRecording ? <MicOff size={11} /> : <Mic size={11} />}
                      {isRecording ? 'Arrêter' : '🎙️ Dicter'}
                    </button>
                  </div>
                )}
              </div>
              <button onClick={() => sendMessage(input)} disabled={!input.trim() || loading}
                style={{ width: 44, height: 44, borderRadius: 10, border: 'none', cursor: 'pointer', background: input.trim() && !loading ? 'var(--color-teal)' : '#E5E7EB', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Send size={16} />
              </button>
            </div>
            <RappelNomsIA style={{ marginTop: 6 }} />
          </div>
        )}
      </div>

      {modalPartage && (
        <ModalRelecturePartage
          destinataire={modalPartage.destinataire}
          texteInitial={modalPartage.texteInitial}
          onAnnuler={() => setModalPartage(null)}
          onConfirmer={modalPartage.onConfirmer}
          identite={selectedPatient ? identiteDe(selectedPatient) : null}
        />
      )}
    </div>
  );
}
