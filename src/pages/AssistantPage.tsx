import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Bot, Send, Mic, MicOff, Copy, ArrowLeft, RefreshCw, Search } from 'lucide-react';
import { useParticipants } from '../hooks/useParticipants';
import { supabase } from '../lib/supabase';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import toast from 'react-hot-toast';
import type { Participant } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

type ActionType = 'contre_indications' | 'compte_rendu' | 'programme' | 'interpretation' | 'libre';
type Phase = 'home' | 'chat';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'patient_select';
  content: string;
}

interface AssistantLog {
  id: string;
  question: string;
  reponse: string;
  patient_id: string | null;
  created_at: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const ACTIONS: { id: ActionType; emoji: string; title: string; subtitle: string }[] = [
  { id: 'contre_indications', emoji: '💊', title: 'Vérifier les contre-indications', subtitle: 'CI actives + recommandations APA' },
  { id: 'compte_rendu',       emoji: '📋', title: 'Rédiger un compte-rendu médecin', subtitle: 'Basé sur le dernier bilan + séances' },
  { id: 'programme',          emoji: '🏋️', title: "Suggérer un programme d'exercices", subtitle: 'Adapté au profil et aux CI' },
  { id: 'interpretation',     emoji: '📊', title: 'Interpréter un résultat de test',  subtitle: 'Analyse clinique des derniers scores' },
];

const ACTION_LABELS: Record<ActionType, string> = {
  contre_indications: 'vérifier les contre-indications',
  compte_rendu:       'rédiger un compte-rendu médecin',
  programme:          "suggérer un programme d'exercices",
  interpretation:     'interpréter les résultats de test',
  libre:              'poser une question',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

let _msgId = 0;
function newId() { return String(++_msgId); }

function calcAge(d: string): number {
  const today = new Date(), birth = new Date(d);
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return age;
}

function loadPraticienPrenom(): string {
  try { return JSON.parse(localStorage.getItem('settings_praticien') || '{}').prenom || ''; }
  catch { return ''; }
}

function buildSystemPrompt(patient: Participant | null): string {
  const base = `Tu es un assistant clinique expert en Activité Physique Adaptée (APA), spécialisé dans l'accompagnement des enseignants APA libéraux en France.
Tu réponds UNIQUEMENT en français. Tu es concis, professionnel et pratique.
Tu ne fais jamais de diagnostic médical. Tu conseilles sur la pratique APA uniquement.
Tu cites les recommandations HAS ou SFP-APA quand pertinent.`;

  if (!patient) return base;

  const age = calcAge(patient.dateNaissance);
  const bi = patient.bilans.find(b => b.type === 'initial') ?? null;
  const profil = bi?.profilEnrichi;
  const ci = bi?.bilanInitialData?.formulaireFlat?.data?.contreIndications === 'oui'
    ? (bi.bilanInitialData?.formulaireFlat?.data?.contreIndicationsDetail ?? 'non précisées')
    : 'aucune contre-indication renseignée';
  const pathologies = [patient.pathologie, patient.antecedentsMedicaux].filter(Boolean).join(' / ') || 'non renseigné';
  const sorted = [...patient.bilans].sort((a, b) => b.date.localeCompare(a.date));
  const last = sorted[0];

  const bilansStr = sorted.slice(0, 3).map(b => {
    const scores = [
      b.tug3m != null && `TUG ${b.tug3m}s`,
      b.chairStand30 != null && `Chair Stand ${b.chairStand30} rép.`,
      b.handGrip.droite != null && `HandGrip ${b.handGrip.droite} kg`,
      b.equilibre.droite != null && `Équilibre ${b.equilibre.droite}s`,
      b.tm6.borgRPE != null && `Borg ${b.tm6.borgRPE}`,
    ].filter(Boolean).join(', ');
    return `- ${new Date(b.date + 'T12:00').toLocaleDateString('fr-FR')}: ${scores || 'scores non renseignés'}`;
  }).join('\n');

  const extra = [
    profil?.douleursNiveau != null ? `- Douleur habituelle : ${profil.douleursNiveau}/10` : null,
    profil?.chutes12mois != null ? `- Chutes / 12 mois : ${profil.chutes12mois}` : null,
    profil?.anticoagulants ? '- Anticoagulants : ⚠️ Oui — risque de saignement/chute à signaler' : null,
    patient.antecedentsChirurgicaux ? `- ATCD chir. : ${patient.antecedentsChirurgicaux}` : null,
  ].filter(Boolean).join('\n');

  return `${base}

PROFIL PATIENT :
- Identité : ${patient.prenom} ${patient.nom}, ${age} ans
- Pathologies : ${pathologies}
- Contre-indications à l'effort : ${ci}
- Bilans (${patient.bilans.length} total, dernier : ${last ? new Date(last.date).toLocaleDateString('fr-FR') : 'aucun'}) :
${bilansStr || '  aucun bilan enregistré'}
${extra}

RÈGLES ABSOLUES :
1. Toujours vérifier les CI avant toute suggestion
2. Si anticoagulants → signaler le risque choc/chute dans chaque proposition
3. Ne jamais faire de diagnostic médical`;
}

function buildActionPrompt(action: ActionType, patient: Participant): string {
  const sys = buildSystemPrompt(patient);
  switch (action) {
    case 'contre_indications':
      return `${sys}\n\n---\nQUESTION:\nEffectue une analyse complète des contre-indications à l'effort pour ce patient.\nPour chaque contre-indication identifiée :\n1. Décris le risque spécifique en APA\n2. Donne les précautions à respecter\n3. Liste les types d'exercices à éviter absolument\n4. Propose des alternatives adaptées et sécurisées`;
    case 'compte_rendu':
      return `${sys}\n\n---\nQUESTION:\nGénère un compte-rendu médecin professionnel et structuré à envoyer au médecin prescripteur.\nFormat :\n## Compte-rendu APA — ${patient.prenom} ${patient.nom}\n**Date :** ${new Date().toLocaleDateString('fr-FR')}\n### Bilan fonctionnel initial\n### Évolution constatée\n### Programme réalisé\n### Recommandations pour la suite\n### Points de vigilance\nRédige ce compte-rendu en te basant sur les données disponibles.`;
    case 'interpretation':
      return `${sys}\n\n---\nQUESTION:\nAnalyse et interprète les derniers résultats de bilans de ce patient.\nPour chaque test disponible :\n- Compare aux normes pour l'âge\n- Indique si le résultat est satisfaisant, à surveiller, ou préoccupant\n- Explique les implications pratiques pour les séances APA\nConclude sur le profil fonctionnel global et les priorités de travail.`;
    case 'programme':
      return `${sys}\n\n---\nQUESTION:\nGénère un programme d'exercices APA complet et adapté pour ce patient.\n\n## Objectif principal\n### Exercices recommandés\n- **Nom** — durée/répétitions\n  Précautions : ...\n  Variante si douleur : ...\n### Points de vigilance\n### À éviter absolument\n### Progression suggérée sur 4 semaines`;
    default:
      return sys;
  }
}

// ── PatientChips (sélecteur inline dans la conversation) ───────────────────

function PatientChips({
  participants,
  onSelect,
}: {
  participants: Participant[];
  onSelect: (p: Participant) => void;
}) {
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
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Rechercher un patient…"
            autoFocus
            style={{
              width: '100%', padding: '8px 10px 8px 30px',
              border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13,
              outline: 'none', boxSizing: 'border-box', background: '#F9FAFB',
            }}
          />
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map(p => (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', background: 'white',
              border: '1px solid #E5E7EB', borderRadius: 10,
              cursor: 'pointer', textAlign: 'left',
              transition: 'border-color 0.15s',
            }}
            onMouseOver={e => (e.currentTarget.style.borderColor = '#2BBFBF')}
            onMouseOut={e => (e.currentTarget.style.borderColor = '#E5E7EB')}
          >
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: '#2BBFBF',
              color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, flexShrink: 0,
            }}>
              {p.prenom[0]}{p.nom[0]}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{p.prenom} {p.nom}</div>
              <div style={{ fontSize: 12, color: '#6B7280' }}>
                {calcAge(p.dateNaissance)} ans{p.pathologie ? ` · ${p.pathologie.slice(0, 28)}` : ''}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Component principal ───────────────────────────────────────────────────────

export default function AssistantPage() {
  const { participants } = useParticipants();
  const location = useLocation();

  const [phase, setPhase]               = useState<Phase>('home');
  const [actionType, setActionType]     = useState<ActionType | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Participant | null>(null);
  const [messages, setMessages]         = useState<Message[]>([]);
  const [awaitingPatient, setAwaitingPatient] = useState(false);
  const [input, setInput]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [logs, setLogs]                 = useState<AssistantLog[]>([]);
  const [logSearch, setLogSearch] = useState('');

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
      if (p) {
        setSelectedPatient(p);
        handleStartAction('libre', p);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, participants]);

  // Sync dictée
  useEffect(() => {
    const text = finalTranscript + interimTranscript;
    if (text) setInput(text);
  }, [finalTranscript, interimTranscript]);

  // Scroll auto
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Charger historique
  useEffect(() => { loadLogs(); }, []);

  async function loadLogs() {
    if (!supabase) return;
    try {
      const { data } = await supabase
        .from('assistant_logs')
        .select('id, question, reponse, patient_id, created_at')
        .order('created_at', { ascending: false })
        .limit(10);
      if (data) setLogs(data as AssistantLog[]);
    } catch { /* table peut ne pas exister */ }
  }

  // Démarrer une action
  function handleStartAction(action: ActionType, prePatient?: Participant) {
    setPhase('chat');
    setActionType(action);

    if (action === 'libre') {
      if (prePatient) {
        setSelectedPatient(prePatient);
        const greeting: Message = {
          id: newId(), role: 'assistant',
          content: `Contexte de ${prePatient.prenom} ${prePatient.nom} chargé. Posez votre question.`,
        };
        setMessages([greeting]);
      } else {
        const greeting: Message = {
          id: newId(), role: 'assistant',
          content: 'Bonjour ! Je suis votre assistant clinique APA. Posez votre question, ou sélectionnez un patient dans la liste à gauche pour un contexte personnalisé.',
        };
        setMessages([greeting]);
      }
      return;
    }

    const label = ACTION_LABELS[action];
    const questionMsg: Message = {
      id: newId(), role: 'assistant',
      content: `Pour quel patient souhaitez-vous ${label} ?`,
    };
    const selectorMsg: Message = {
      id: newId(), role: 'patient_select',
      content: '',
    };
    setMessages([questionMsg, selectorMsg]);
    setAwaitingPatient(true);
  }

  // Patient sélectionné depuis le sélecteur inline
  async function handlePatientSelected(patient: Participant) {
    setSelectedPatient(patient);
    setAwaitingPatient(false);

    // Retirer le message patient_select, ajouter le nom du patient
    setMessages(prev => [
      ...prev.filter(m => m.role !== 'patient_select'),
      { id: newId(), role: 'user', content: `${patient.prenom} ${patient.nom}` },
    ]);

    if (!actionType || actionType === 'libre') return;

    // Pour "programme", on demande d'abord l'objectif
    if (actionType === 'programme') {
      setMessages(prev => [
        ...prev,
        {
          id: newId(), role: 'assistant',
          content: `Parfait ! Pour quel objectif souhaitez-vous un programme pour ${patient.prenom} ?\n(ex : équilibre, force musculaire, endurance, réduction des douleurs, autonomie…)`,
        },
      ]);
      return;
    }

    // Lancer automatiquement l'action
    await runAction(actionType, patient);
  }

  async function runAction(action: ActionType, patient: Participant) {
    setLoading(true);
    const prompt = buildActionPrompt(action, patient);

    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data = await res.json();
      const text: string = data.text ?? '';

      const assistantMsg: Message = { id: newId(), role: 'assistant', content: text };
      setMessages(prev => [...prev, assistantMsg]);

      await saveLog(ACTION_LABELS[action], text, patient.id, action);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { id: newId(), role: 'assistant', content: `Erreur : ${err instanceof Error ? err.message : String(err)}` },
      ]);
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

    const userMsg: Message = { id: newId(), role: 'user', content: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    // Si programme et pas encore déclenché, utiliser la réponse de l'objectif
    if (actionType === 'programme' && selectedPatient) {
      const sys = buildSystemPrompt(selectedPatient);
      const prompt = `${sys}\n\n---\nQUESTION:\nGénère un programme d'exercices APA adapté pour l'objectif suivant : "${trimmed}"\n\n## Objectif traité\n### Exercices recommandés\n- **Nom** — durée/répétitions\n  Précautions : ...\n### Points de vigilance\n### Ce qu'il faut éviter`;
      try {
        const res = await fetch('/api/claude', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
        const data = await res.json();
        const responseText: string = data.text ?? '';
        setMessages(prev => [...prev, { id: newId(), role: 'assistant', content: responseText }]);
        await saveLog(trimmed, responseText, selectedPatient.id, 'programme');
      } catch (err) {
        setMessages(prev => [...prev, { id: newId(), role: 'assistant', content: `Erreur : ${String(err)}` }]);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Conversation libre avec historique
    const sys = buildSystemPrompt(selectedPatient);
    const history = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => `${m.role === 'user' ? 'Q' : 'R'}: ${m.content}`)
      .join('\n\n');
    const fullPrompt = history
      ? `${sys}\n\n---\nÉCHANGES PRÉCÉDENTS:\n${history}\n\n---\nQUESTION:\n${trimmed}`
      : `${sys}\n\n---\nQUESTION:\n${trimmed}`;

    try {
      const res = await fetch('/api/claude', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: fullPrompt }) });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data = await res.json();
      const responseText: string = data.text ?? '';
      setMessages(prev => [...prev, { id: newId(), role: 'assistant', content: responseText }]);
      await saveLog(trimmed, responseText, selectedPatient?.id ?? null, actionType ?? 'libre');
    } catch (err) {
      setMessages(prev => [...prev, { id: newId(), role: 'assistant', content: `Erreur : ${err instanceof Error ? err.message : String(err)}` }]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages, selectedPatient, actionType, resetSpeech]);

  async function saveLog(question: string, reponse: string, patientId: string | null, action: ActionType) {
    if (!supabase) return;
    try {
      await supabase.from('assistant_logs').insert({
        patient_id: patientId,
        question,
        reponse,
        action_type: action,
      });
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
      { id: newId(), role: 'user', content: log.question },
      { id: newId(), role: 'assistant', content: log.reponse },
    ]);
    if (log.patient_id) {
      const p = participants.find(x => x.id === log.patient_id);
      if (p) setSelectedPatient(p);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  }

  function resetToHome() {
    setPhase('home');
    setActionType(null);
    setSelectedPatient(null);
    setMessages([]);
    setAwaitingPatient(false);
    setInput('');
  }

  const filteredLogs = logSearch.trim()
    ? logs.filter(l => l.question.toLowerCase().includes(logSearch.toLowerCase()))
    : logs;

  // ── RENDER HOME ────────────────────────────────────────────────────────────

  if (phase === 'home') {
    return (
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F8FAFA' }}>

        {/* Colonne gauche — historique */}
        <div style={{ width: 280, flexShrink: 0, borderRight: '0.5px solid #E5E7EB', background: 'white', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <div style={{ padding: '20px 16px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Questions récentes
            </div>
            {logs.length > 5 && (
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
                <input type="text" value={logSearch} onChange={e => setLogSearch(e.target.value)} placeholder="Filtrer…"
                  style={{ width: '100%', padding: '6px 8px 6px 26px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 12, outline: 'none', boxSizing: 'border-box', background: '#F9FAFB' }} />
              </div>
            )}
            {filteredLogs.length === 0 ? (
              <div style={{ fontSize: 12, color: '#D1D5DB', textAlign: 'center', padding: '20px 0' }}>Aucune question récente</div>
            ) : filteredLogs.map(log => {
              const pName = log.patient_id ? participants.find(x => x.id === log.patient_id) : null;
              return (
                <button key={log.id} onClick={() => handleRestoreLog(log)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 4px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 6 }}
                  onMouseOver={e => (e.currentTarget.style.background = '#F0F9F9')}
                  onMouseOut={e => (e.currentTarget.style.background = 'none')}>
                  <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.4 }}>
                    · "{log.question.length > 44 ? log.question.slice(0, 44) + '…' : log.question}"
                  </div>
                  <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 1 }}>
                    {pName ? `${pName.prenom} ${pName.nom} · ` : ''}
                    {new Date(log.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} →
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Zone principale */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
          <div style={{ maxWidth: 600, width: '100%' }}>

            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 36 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827', margin: 0, lineHeight: 1.2 }}>Mon assistant</h1>
              <p style={{ fontSize: 15, color: '#6B7280', marginTop: 8 }}>
                {praticienPrenom ? `Bonjour ${praticienPrenom} ! ` : ''}Que souhaitez-vous faire ?
              </p>
            </div>

            {/* 4 cartes d'action */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              {ACTIONS.map(action => (
                <button
                  key={action.id}
                  onClick={() => handleStartAction(action.id)}
                  style={{
                    padding: '20px 18px', background: 'white',
                    border: '1.5px solid #E5E7EB', borderRadius: 14,
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                  }}
                  onMouseOver={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = '#2BBFBF';
                    (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(43,191,191,0.12)';
                  }}
                  onMouseOut={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = '#E5E7EB';
                    (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                  }}
                >
                  <div style={{ fontSize: 28, marginBottom: 10 }}>{action.emoji}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', lineHeight: 1.4, marginBottom: 5 }}>
                    {action.title}
                  </div>
                  <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.4 }}>
                    {action.subtitle}
                  </div>
                </button>
              ))}
            </div>

            {/* Question libre */}
            <div style={{ textAlign: 'center' }}>
              <button
                onClick={() => handleStartAction('libre')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#6B7280', padding: '8px 16px', borderRadius: 8 }}
                onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = '#2BBFBF'; }}
                onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = '#6B7280'; }}
              >
                ou ✏️ Poser une question libre…
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── RENDER CHAT ────────────────────────────────────────────────────────────

  const currentAction = actionType ? ACTIONS.find(a => a.id === actionType) : null;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F8FAFA' }}>

      {/* Colonne gauche — historique */}
      <div style={{ width: 280, flexShrink: 0, borderRight: '0.5px solid #E5E7EB', background: 'white', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ padding: '16px 14px 10px', borderBottom: '0.5px solid #F3F4F6' }}>
          <button
            onClick={resetToHome}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#6B7280', padding: '4px 0' }}
          >
            <ArrowLeft size={14} /> Retour
          </button>
        </div>
        <div style={{ padding: '12px 14px', flex: 1, overflowY: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Questions récentes
          </div>
          {logs.length === 0 ? (
            <div style={{ fontSize: 12, color: '#D1D5DB', textAlign: 'center', padding: '20px 0' }}>Aucune question récente</div>
          ) : logs.map(log => {
            const pName = log.patient_id ? participants.find(x => x.id === log.patient_id) : null;
            return (
              <button key={log.id} onClick={() => handleRestoreLog(log)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 4px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 6 }}
                onMouseOver={e => (e.currentTarget.style.background = '#F0F9F9')}
                onMouseOut={e => (e.currentTarget.style.background = 'none')}>
                <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.4 }}>
                  · "{log.question.length > 44 ? log.question.slice(0, 44) + '…' : log.question}"
                </div>
                <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 1 }}>
                  {pName ? `${pName.prenom} ${pName.nom} · ` : ''}
                  {new Date(log.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} →
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Colonne droite — conversation */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ background: 'white', borderBottom: '0.5px solid #E5E7EB', padding: '13px 22px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <Bot size={18} style={{ color: '#2BBFBF', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
                {currentAction ? `${currentAction.emoji} ${currentAction.title}` : 'Mon assistant'}
              </div>
              {selectedPatient && (
                <div style={{ fontSize: 12, color: '#2BBFBF' }}>
                  Contexte : {selectedPatient.prenom} {selectedPatient.nom}
                </div>
              )}
            </div>
          </div>
          {messages.some(m => m.role === 'assistant') && !loading && (
            <div style={{ display: 'flex', gap: 8 }}>
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

        {/* Zone messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {messages.map(msg => {
            if (msg.role === 'patient_select') {
              return (
                <div key={msg.id} style={{ maxWidth: 520 }}>
                  <PatientChips participants={participants} onSelect={handlePatientSelected} />
                </div>
              );
            }
            return (
              <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '74%', padding: '12px 16px', fontSize: 14, lineHeight: 1.7,
                  borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  background: msg.role === 'user' ? '#2BBFBF' : 'white',
                  color: msg.role === 'user' ? 'white' : '#111827',
                  border: msg.role === 'assistant' ? '0.5px solid #E5E7EB' : 'none',
                  whiteSpace: 'pre-wrap',
                }}>
                  {msg.content}
                </div>
              </div>
            );
          })}

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ background: 'white', border: '0.5px solid #E5E7EB', borderRadius: '12px 12px 12px 2px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <RefreshCw size={12} className="animate-spin" style={{ color: '#2BBFBF' }} />
                <span style={{ fontSize: 13, color: '#9CA3AF' }}>L'assistant rédige…</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Zone saisie */}
        {!awaitingPatient && (
          <div style={{ background: 'white', borderTop: '0.5px solid #E5E7EB', padding: '11px 22px 15px', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1, border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
                  }}
                  placeholder={isRecording ? '🎙️ Dictée en cours…' : 'Posez votre question… (Entrée pour envoyer)'}
                  rows={1}
                  disabled={loading}
                  style={{ width: '100%', padding: '10px 12px', border: 'none', outline: 'none', fontSize: 14, resize: 'none', background: 'transparent', fontFamily: 'inherit', lineHeight: 1.5, maxHeight: 120, boxSizing: 'border-box', display: 'block' }}
                />
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
                style={{ width: 44, height: 44, borderRadius: 10, border: 'none', cursor: 'pointer', background: input.trim() && !loading ? '#2BBFBF' : '#E5E7EB', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Send size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
