import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Send, Copy, Plus, ChevronDown, Mic, MicOff, RefreshCw, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Participant, Bilan } from '../types';
import { supabase } from '../lib/supabase';
import { getContreIndications, getObjectifsActivites, formatTraitementLigne } from '../lib/anamnese';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { toast } from 'sonner';

interface AssistantLog {
  id: string;
  question: string;
  reponse: string;
  created_at: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  participant: Participant;
  bilanInitial: Bilan | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcAge(dateNaissance: string): number {
  const today = new Date();
  const birth = new Date(dateNaissance);
  let age = today.getFullYear() - birth.getFullYear();
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  ) age--;
  return age;
}

function buildSystemContext(participant: Participant, bilanInitial: Bilan | null): string {
  const age = calcAge(participant.dateNaissance);
  const profil = bilanInitial?.profilEnrichi;

  const ciContext = getContreIndications(participant, bilanInitial);
  const contreIndications = ciContext.actif ? (ciContext.detail ?? 'non précisées') : 'aucune contre-indication renseignée';

  const sortedBilans = [...participant.bilans].sort((a, b) => b.date.localeCompare(a.date));
  const lastBilan = sortedBilans[0];
  const borgRPE = lastBilan?.tm6?.borgRPE;

  const { objectifsPatient, activitesSouhaitees } = getObjectifsActivites(participant, bilanInitial);
  const objectifs = objectifsPatient.length > 0
    ? objectifsPatient.join(', ')
    : profil?.objectifsPersonnels ?? 'non renseignés';

  const pathologies = [
    participant.pathologie,
    participant.antecedentsMedicaux,
  ].filter(Boolean).join(' / ') || 'non renseigné';

  const PROFIL_HANDICAP_LABELS: Record<string, string> = {
    fauteuil_roulant: 'Fauteuil roulant',
    avc_hemiplegie: 'AVC / Hémiplégie',
    parkinson: 'Parkinson',
    sep: 'Sclérose en plaques',
  };

  const APLEY_H: Record<string, number> = { shoulder: 4, neck: 3, top: 2, below: 1 };
  const APLEY_B: Record<string, number> = { scapula: 4, mid_back: 3, low_back: 2, buttocks: 1 };
  const ap = lastBilan?.apley;
  const apleyAsym = ap
    ? ((ap.haut_d != null && ap.haut_g != null && Math.abs((APLEY_H[ap.haut_d] ?? 0) - (APLEY_H[ap.haut_g] ?? 0)) > 1)
      || (ap.bas_d != null && ap.bas_g != null && Math.abs((APLEY_B[ap.bas_d] ?? 0) - (APLEY_B[ap.bas_g] ?? 0)) > 1))
    : false;

  const lignesExtra = [
    profil?.douleursNiveau != null
      ? `- Douleur habituelle : ${profil.douleursNiveau}/10${profil.douleursLocalisation ? ` (${profil.douleursLocalisation})` : ''}`
      : null,
    profil?.chutes12mois != null
      ? `- Chutes / 12 mois : ${profil.chutes12mois}`
      : null,
    profil?.anticoagulants
      ? '- Anticoagulants : ⚠️ Oui — risque de saignement/chute à signaler dans chaque suggestion'
      : null,
    participant.profilHandicap
      ? `- Profil handicap : ${PROFIL_HANDICAP_LABELS[participant.profilHandicap] ?? participant.profilHandicap}`
      : null,
    participant.antecedentsChirurgicaux
      ? `- Antécédents chirurgicaux : ${participant.antecedentsChirurgicaux}`
      : null,
    participant.allergies
      ? `- Allergies : ${participant.allergies}`
      : null,
    ap?.score != null
      ? `- Apley Scratch Test : ${ap.score}/4 — ${
          ap.score >= 3.5 ? 'Amplitude normale' :
          ap.score >= 2.5 ? 'Légèrement limité' :
          ap.score >= 1.5 ? 'Modérément limité' : 'Très limité — à signaler au médecin'
        }${apleyAsym ? ' — Asymétrie D/G à surveiller' : ''}${ap.notes ? ` (${ap.notes})` : ''}`
      : null,
    ...(participant.traitements ?? [])
      .filter(t => !t.date_fin)
      .map(t => `- Traitement en cours : ${formatTraitementLigne(t)}`),
  ].filter(Boolean).join('\n');

  return `Tu es un assistant clinique expert en Activité Physique Adaptée (APA), spécialisé dans l'accompagnement des enseignants APA libéraux en France.

Tu réponds UNIQUEMENT en français.
Tu es concis, professionnel, et pratique.
Tu ne fais jamais de diagnostic médical.
Tu conseilles sur la pratique APA, pas sur les traitements médicaux.

PROFIL DU PATIENT :
- Nom : ${participant.prenom} ${participant.nom}, ${age} ans
- Pathologies : ${pathologies}
- Contre-indications à l'effort : ${contreIndications}
- Dernier Borg RPE : ${borgRPE ?? 'non renseigné'}
- Objectifs APA : ${objectifs}
- Activités souhaitées : ${activitesSouhaitees.length > 0 ? activitesSouhaitees.join(', ') : 'non renseignées'}
- Historique : ${participant.bilans.length} bilan(s)${lastBilan ? `, dernier le ${new Date(lastBilan.date).toLocaleDateString('fr-FR')}` : ''}
${lignesExtra}

RÈGLES ABSOLUES :
1. Toujours vérifier les contre-indications avant toute suggestion
2. Si anticoagulants → signaler le risque de choc/chute dans chaque suggestion
3. Si profil Parkinson → éviter les exercices de précision fine sans supervision
4. Si profil fauteuil roulant → adapter toutes les propositions à la position assise
5. Citer les sources HAS ou SFP-APA quand pertinent

FORMAT DE RÉPONSE pour suggestions de programme :
## Objectif traité
### Exercices recommandés
- **Nom de l'exercice** — [durée/répétitions]
  Précautions : [...]
  Variante si douleur : [...]
### Points de vigilance
### Ce qu'il faut éviter pour ce patient`;
}

const MD_COMPONENTS_LIGHT = {
  h1: ({children}: any) => <h1 style={{fontSize:'16px', fontWeight:'600', color:'#111827', marginBottom:'10px', marginTop:'14px'}}>{children}</h1>,
  h2: ({children}: any) => <h2 style={{fontSize:'14px', fontWeight:'600', color:'#111827', marginBottom:'8px', marginTop:'12px'}}>{children}</h2>,
  h3: ({children}: any) => <h3 style={{fontSize:'13px', fontWeight:'500', color:'var(--color-teal)', marginBottom:'6px', marginTop:'10px'}}>{children}</h3>,
  p: ({children}: any) => <p style={{fontSize:'13px', lineHeight:'1.7', color:'#374151', marginBottom:'6px'}}>{children}</p>,
  strong: ({children}: any) => <strong style={{fontWeight:'600', color:'#111827'}}>{children}</strong>,
  ul: ({children}: any) => <ul style={{paddingLeft:'16px', marginBottom:'6px'}}>{children}</ul>,
  li: ({children}: any) => <li style={{fontSize:'13px', lineHeight:'1.7', color:'#374151', marginBottom:'3px'}}>{children}</li>,
  hr: () => <hr style={{border:'none', borderTop:'0.5px solid #E5E7EB', margin:'10px 0'}} />,
  table: ({children}: any) => (
    <div style={{overflowX:'auto', marginBottom:'16px', marginTop:'8px'}}>
      <table style={{width:'100%', borderCollapse:'collapse', fontSize:'13px', border:'0.5px solid #E5E7EB', borderRadius:'8px', overflow:'hidden'}}>{children}</table>
    </div>
  ),
  thead: ({children}: any) => <thead style={{background:'#F9FAFB'}}>{children}</thead>,
  tbody: ({children}: any) => <tbody>{children}</tbody>,
  tr: ({children}: any) => <tr style={{borderBottom:'0.5px solid #E5E7EB'}}>{children}</tr>,
  th: ({children}: any) => <th style={{padding:'8px 12px', fontWeight:'500', color:'#6B7280', textAlign:'left', fontSize:'12px', letterSpacing:'0.03em'}}>{children}</th>,
  td: ({children}: any) => <td style={{padding:'8px 12px', color:'#374151', fontSize:'13px', verticalAlign:'top'}}>{children}</td>,
};

const MODE_TEMPLATES: Record<string, string> = {
  contre_indications: "Analyser les contre-indications pour l'exercice suivant : ",
  programme: 'Suggère un programme d\'exercices adapté pour l\'objectif suivant : ',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function AssistantCliniqueIA({ participant, bilanInitial }: Props) {
  const navigate = useNavigate();
  const [messages, setMessages]     = useState<Message[]>([]);
  const [input, setInput]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [logs, setLogs]             = useState<AssistantLog[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [lastResponse, setLastResponse] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    isRecording, finalTranscript, interimTranscript,
    isSupported, startRecording, stopRecording, reset: resetSpeech,
  } = useSpeechRecognition();

  const systemContext = buildSystemContext(participant, bilanInitial);

  // Synchronise la transcription vocale dans le champ input
  useEffect(() => {
    const text = finalTranscript + interimTranscript;
    if (text) setInput(text);
  }, [finalTranscript, interimTranscript]);

  // Charger l'historique Supabase
  useEffect(() => {
    if (!supabase) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('assistant_logs')
          .select('id, question, reponse, created_at')
          .eq('patient_id', participant.id)
          .order('created_at', { ascending: false })
          .limit(5);
        if (data) setLogs(data as AssistantLog[]);
      } catch { /* table peut ne pas exister encore */ }
    })();
  }, [participant.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const saveLog = useCallback(async (question: string, reponse: string) => {
    if (!supabase) return;
    try {
      await supabase
        .from('assistant_logs')
        .insert({ patient_id: participant.id, question, reponse });
    } catch { /* log non bloquant */ }
  }, [participant.id]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setInput('');
    resetSpeech();
    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    setLoading(true);

    const prompt = `${systemContext}\n\n---\n\nQUESTION DE PIERRE :\n${trimmed}`;

    try {
      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => response.statusText);
        throw new Error(`Erreur ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const responseText: string = data.text ?? '';

      setMessages(prev => [...prev, { role: 'assistant', content: responseText }]);
      setLastResponse(responseText);
      await saveLog(trimmed, responseText);

      // Rafraîchir l'historique
      if (supabase) {
        try {
          const { data: logData } = await supabase
            .from('assistant_logs')
            .select('id, question, reponse, created_at')
            .eq('patient_id', participant.id)
            .order('created_at', { ascending: false })
            .limit(5);
          if (logData) setLogs(logData as AssistantLog[]);
        } catch { /* non bloquant */ }
      }
    } catch (err) {
      const errMsg = `Erreur de l'assistant : ${err instanceof Error ? err.message : String(err)}`;
      setMessages(prev => [...prev, { role: 'assistant', content: errMsg }]);
    } finally {
      setLoading(false);
    }
  }, [loading, systemContext, saveLog, participant.id, resetSpeech]);

  function handleModeClick(mode: 'contre_indications' | 'programme') {
    setInput(MODE_TEMPLATES[mode]);
  }

  function handleToggleMic() {
    if (isRecording) {
      stopRecording();
    } else {
      resetSpeech();
      setInput('');
      startRecording();
    }
  }

  function handleCopy() {
    const text = lastResponse || messages.filter(m => m.role === 'assistant').at(-1)?.content;
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success('Réponse copiée');
  }

  function handleAddToProgramme() {
    navigate(`/participant/${participant.id}/programme`);
    toast.success('Consultez le programme pour ajouter les exercices suggérés');
  }

  const contreIndicationsTexte = getContreIndications(participant, bilanInitial).detail;

  const hasResponse = lastResponse || messages.some(m => m.role === 'assistant');

  return (
    <div className="space-y-4">
      {/* Contexte patient */}
      <div className="bg-teal-50 border border-teal-100 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <Bot size={14} className="text-primary" />
          <span className="text-xs font-bold text-primary uppercase tracking-wide">Contexte patient chargé</span>
        </div>
        <p className="text-xs text-gray-600">
          {participant.prenom} {participant.nom} · {calcAge(participant.dateNaissance)} ans
          {participant.pathologie && ` · ${participant.pathologie}`}
        </p>
        {contreIndicationsTexte && (
          <div className="flex items-start gap-1.5 mt-1.5">
            <AlertCircle size={12} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-600 font-medium">{contreIndicationsTexte}</p>
          </div>
        )}
      </div>

      {/* Boutons de mode */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => handleModeClick('contre_indications')}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-orange-200 text-orange-700 bg-orange-50 hover:bg-orange-100 transition-colors"
        >
          💊 Analyser contre-indications
        </button>
        <button
          onClick={() => handleModeClick('programme')}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-teal-200 text-primary bg-teal-50 hover:bg-teal-100 transition-colors"
        >
          🏋️ Suggérer un programme
        </button>
      </div>

      {/* Zone de conversation */}
      {messages.length > 0 && (
        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-primary text-white'
                    : 'bg-gray-50 border border-gray-100 text-gray-800'
                }`}
                style={{ whiteSpace: msg.role === 'user' ? 'pre-wrap' : undefined }}
              >
                {msg.role === 'user'
                  ? msg.content
                  : <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS_LIGHT}>{msg.content}</ReactMarkdown>
                }
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 flex items-center gap-2">
                <RefreshCw size={12} className="animate-spin text-primary" />
                <span className="text-xs text-gray-400">L'assistant réfléchit…</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Boutons action sur la dernière réponse */}
      {hasResponse && !loading && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Copy size={11} /> Copier
          </button>
          <button
            onClick={handleAddToProgramme}
            className="flex items-center gap-1.5 text-xs font-semibold text-primary border border-primary/30 px-3 py-1.5 rounded-lg hover:bg-primary/5 transition-colors"
          >
            <Plus size={11} /> Ajouter au programme
          </button>
        </div>
      )}

      {/* Zone de saisie */}
      <div className="border border-gray-200 rounded-2xl overflow-hidden focus-within:border-primary transition-colors">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage(input);
            }
          }}
          placeholder={
            isRecording
              ? '🎙 Dictée en cours…'
              : 'Décrivez l\'exercice ou l\'objectif… (Entrée pour envoyer)'
          }
          rows={3}
          disabled={loading}
          className="w-full px-4 py-3 text-sm text-gray-800 resize-none focus:outline-none bg-white placeholder:text-gray-400 disabled:bg-gray-50"
        />
        <div className="flex items-center justify-between px-3 py-2 bg-white border-t border-gray-100">
          <div className="flex items-center gap-2">
            {isSupported && (
              <button
                onClick={handleToggleMic}
                disabled={loading}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                  isRecording
                    ? 'bg-red-100 text-red-600 hover:bg-red-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {isRecording ? <MicOff size={13} /> : <Mic size={13} />}
                {isRecording ? 'Arrêter' : 'Dicter'}
              </button>
            )}
          </div>
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="flex items-center gap-1.5 bg-primary text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send size={13} /> Envoyer
          </button>
        </div>
      </div>

      {/* Historique des 5 derniers échanges */}
      {logs.length > 0 && (
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <button
            onClick={() => setHistoryOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
          >
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Historique ({logs.length} échange{logs.length > 1 ? 's' : ''})
            </span>
            <ChevronDown
              size={14}
              className={`text-gray-400 transition-transform ${historyOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {historyOpen && (
            <div className="divide-y divide-gray-50">
              {logs.map(log => (
                <div key={log.id} className="px-4 py-3 bg-white">
                  <p className="text-[11px] text-gray-400 mb-1">
                    {new Date(log.created_at).toLocaleDateString('fr-FR', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                  <p className="text-xs font-medium text-gray-700 mb-1.5 line-clamp-2">
                    Q : {log.question}
                  </p>
                  <p className="text-xs text-gray-500 line-clamp-3">
                    R : {log.reponse}
                  </p>
                  <button
                    onClick={() => {
                      setMessages([
                        { role: 'user', content: log.question },
                        { role: 'assistant', content: log.reponse },
                      ]);
                      setLastResponse(log.reponse);
                    }}
                    className="mt-1.5 text-[11px] text-primary hover:underline"
                  >
                    Revoir cet échange →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
