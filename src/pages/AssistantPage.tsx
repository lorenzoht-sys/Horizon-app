import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Bot, Send, Mic, MicOff, Copy, X, Search, RefreshCw,
} from 'lucide-react';
import { useParticipants } from '../hooks/useParticipants';
import { supabase } from '../lib/supabase';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import toast from 'react-hot-toast';
import type { Participant } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AssistantLog {
  id: string;
  question: string;
  reponse: string;
  patient_id: string | null;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

Tu réponds UNIQUEMENT en français.
Tu es concis, professionnel, et pratique.
Tu ne fais jamais de diagnostic médical.
Tu conseilles sur la pratique APA, pas sur les traitements médicaux.
Tu cites les recommandations HAS ou SFP-APA quand pertinent.

FORMAT DE RÉPONSE pour suggestions de programme :
## Objectif traité
### Exercices recommandés
- **Nom de l'exercice** — [durée/répétitions]
  Précautions : [...]
  Variante si douleur : [...]
### Points de vigilance
### Ce qu'il faut éviter pour ce patient`;

  if (!patient) return base;

  const age = calcAge(patient.dateNaissance);
  const bilanInitial = patient.bilans.find(b => b.type === 'initial') ?? null;
  const profil = bilanInitial?.profilEnrichi;

  const contreIndications =
    bilanInitial?.bilanInitialData?.formulaireFlat?.data?.contreIndications === 'oui'
      ? (bilanInitial.bilanInitialData?.formulaireFlat?.data?.contreIndicationsDetail ?? 'non précisées')
      : 'aucune contre-indication renseignée';

  const pathologies = [patient.pathologie, patient.antecedentsMedicaux]
    .filter(Boolean).join(' / ') || 'non renseigné';

  const sortedBilans = [...patient.bilans].sort((a, b) => b.date.localeCompare(a.date));
  const lastBilan = sortedBilans[0];

  const lignesExtra = [
    profil?.douleursNiveau != null
      ? `- Douleur habituelle : ${profil.douleursNiveau}/10${profil.douleursLocalisation ? ` (${profil.douleursLocalisation})` : ''}`
      : null,
    profil?.chutes12mois != null ? `- Chutes / 12 mois : ${profil.chutes12mois}` : null,
    profil?.anticoagulants ? '- Anticoagulants : ⚠️ Oui — risque de saignement/chute' : null,
    patient.antecedentsChirurgicaux ? `- Antécédents chirurgicaux : ${patient.antecedentsChirurgicaux}` : null,
    patient.allergies ? `- Allergies : ${patient.allergies}` : null,
  ].filter(Boolean).join('\n');

  return `${base}

PROFIL DU PATIENT :
- Nom : ${patient.prenom} ${patient.nom}, ${age} ans
- Pathologies : ${pathologies}
- Contre-indications à l'effort : ${contreIndications}
- Historique : ${patient.bilans.length} bilan(s)${lastBilan ? `, dernier le ${new Date(lastBilan.date).toLocaleDateString('fr-FR')}` : ''}
${lignesExtra}

RÈGLES ABSOLUES :
1. Toujours vérifier les contre-indications avant toute suggestion
2. Si anticoagulants → signaler le risque de choc/chute dans chaque suggestion`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AssistantPage() {
  const { participants } = useParticipants();
  const location = useLocation();

  const [selectedPatient, setSelectedPatient] = useState<Participant | null>(null);
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [logs, setLogs]           = useState<AssistantLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const praticienPrenom = loadPraticienPrenom();
  const messagesEndRef  = useRef<HTMLDivElement>(null);
  const textareaRef     = useRef<HTMLTextAreaElement>(null);

  const {
    isRecording, finalTranscript, interimTranscript,
    isSupported, startRecording, stopRecording, reset: resetSpeech,
  } = useSpeechRecognition();

  // Pré-sélectionner le patient depuis l'état de navigation
  useEffect(() => {
    const state = location.state as { patientId?: string } | null;
    if (state?.patientId && participants.length > 0) {
      const p = participants.find(x => x.id === state.patientId);
      if (p) setSelectedPatient(p);
    }
  }, [location.state, participants]);

  // Sync dictée vocale
  useEffect(() => {
    const text = finalTranscript + interimTranscript;
    if (text) setInput(text);
  }, [finalTranscript, interimTranscript]);

  // Scroll auto
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Charger l'historique
  useEffect(() => {
    loadLogs();
  }, []);

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

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setInput('');
    resetSpeech();
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    setLoading(true);

    const systemPrompt = buildSystemPrompt(selectedPatient);
    const prior = messages
      .map(m => `${m.role === 'user' ? 'QUESTION' : 'RÉPONSE'}: ${m.content}`)
      .join('\n\n');
    const fullPrompt = prior
      ? `${systemPrompt}\n\n---\nÉCHANGES PRÉCÉDENTS:\n${prior}\n\n---\nQUESTION:\n${trimmed}`
      : `${systemPrompt}\n\n---\n\nQUESTION:\n${trimmed}`;

    try {
      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: fullPrompt }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => response.statusText);
        throw new Error(`Erreur ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const responseText: string = data.text ?? '';

      setMessages(prev => [...prev, { role: 'assistant', content: responseText }]);

      if (supabase) {
        try {
          await supabase.from('assistant_logs').insert({
            patient_id: selectedPatient?.id ?? null,
            question: trimmed,
            reponse: responseText,
          });
          await loadLogs();
        } catch { /* non bloquant */ }
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Erreur : ${err instanceof Error ? err.message : String(err)}` },
      ]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages, selectedPatient, resetSpeech]);

  function handleToggleMic() {
    if (isRecording) { stopRecording(); }
    else { resetSpeech(); setInput(''); startRecording(); }
  }

  function handleCopyLast() {
    const last = messages.filter(m => m.role === 'assistant').at(-1)?.content;
    if (!last) return;
    navigator.clipboard.writeText(last);
    toast.success('Réponse copiée');
  }

  function handleRestoreLog(log: AssistantLog) {
    setMessages([
      { role: 'user',      content: log.question },
      { role: 'assistant', content: log.reponse },
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

  const filteredPatients = searchQuery.trim()
    ? participants.filter(p =>
        `${p.prenom} ${p.nom}`.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 8)
    : [];

  const contreIndicationsTexte = selectedPatient
    ? (() => {
        const bi = selectedPatient.bilans.find(b => b.type === 'initial') ?? null;
        return bi?.bilanInitialData?.formulaireFlat?.data?.contreIndications === 'oui'
          ? (bi.bilanInitialData?.formulaireFlat?.data?.contreIndicationsDetail ?? null)
          : null;
      })()
    : null;

  const hasAssistantResponse = messages.some(m => m.role === 'assistant');

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'inherit', background: '#F8FAFA' }}>

      {/* ── COLONNE GAUCHE 300px ──────────────────────────── */}
      <div style={{
        width: 300, flexShrink: 0,
        borderRight: '0.5px solid #E5E7EB',
        background: 'white',
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}>
        <div style={{ padding: '20px 16px 12px' }}>

          {/* Section label */}
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
            Contexte patient
          </div>

          {/* Patient sélectionné */}
          {selectedPatient ? (
            <div style={{ background: '#F0F9F9', border: '1px solid rgba(43,191,191,0.25)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>
                    {selectedPatient.prenom} {selectedPatient.nom}
                  </div>
                  <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                    {calcAge(selectedPatient.dateNaissance)} ans
                    {selectedPatient.pathologie && ` · ${selectedPatient.pathologie}`}
                  </div>
                  {contreIndicationsTexte && (
                    <div style={{ marginTop: 8, fontSize: 11, color: '#DC2626', fontWeight: 600, background: '#FEE2E2', borderRadius: 6, padding: '5px 8px' }}>
                      ⚠️ {contreIndicationsTexte}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setSelectedPatient(null)}
                  title="Retirer le contexte patient"
                  style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', flexShrink: 0 }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '14px 8px', color: '#9CA3AF', fontSize: 13, marginBottom: 12 }}>
              <Bot size={28} style={{ margin: '0 auto 8px', opacity: 0.4, display: 'block' }} />
              <div style={{ fontWeight: 600, color: '#6B7280' }}>Mode général APA</div>
              <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
                Posez une question sur la pratique APA en général.
              </div>
            </div>
          )}

          {/* Recherche patient */}
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                placeholder="Rechercher un patient…"
                style={{
                  width: '100%', padding: '8px 10px 8px 30px',
                  border: '1px solid #E5E7EB', borderRadius: 8,
                  fontSize: 13, outline: 'none', boxSizing: 'border-box',
                  background: '#F9FAFB', color: '#374151',
                }}
              />
            </div>
            {showDropdown && filteredPatients.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0,
                background: 'white', border: '1px solid #E5E7EB',
                borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
                zIndex: 100, maxHeight: 220, overflowY: 'auto', marginTop: 2,
              }}>
                {filteredPatients.map(p => (
                  <button
                    key={p.id}
                    onMouseDown={() => { setSelectedPatient(p); setSearchQuery(''); setShowDropdown(false); }}
                    style={{
                      width: '100%', textAlign: 'left', padding: '10px 12px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 10,
                      borderBottom: '1px solid #F3F4F6',
                    }}
                    onMouseOver={e => (e.currentTarget.style.background = '#F0F9F9')}
                    onMouseOut={e => (e.currentTarget.style.background = 'none')}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: '#2BBFBF', color: 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, flexShrink: 0,
                    }}>
                      {p.prenom[0]}{p.nom[0]}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{p.prenom} {p.nom}</div>
                      <div style={{ fontSize: 11, color: '#6B7280' }}>{calcAge(p.dateNaissance)} ans{p.pathologie ? ` · ${p.pathologie.slice(0, 20)}` : ''}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: '0.5px', background: '#E5E7EB', margin: '4px 0' }} />

        {/* Historique */}
        <div style={{ padding: '12px 16px', flex: 1, overflowY: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Questions récentes
          </div>
          {logs.length === 0 ? (
            <div style={{ fontSize: 12, color: '#D1D5DB', textAlign: 'center', padding: '20px 0' }}>
              Aucune question récente
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {logs.map(log => {
                const patientName = log.patient_id
                  ? participants.find(x => x.id === log.patient_id)
                  : null;
                return (
                  <button
                    key={log.id}
                    onClick={() => handleRestoreLog(log)}
                    style={{
                      textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                      padding: '8px 6px', borderRadius: 6,
                    }}
                    onMouseOver={e => (e.currentTarget.style.background = '#F0F9F9')}
                    onMouseOut={e => (e.currentTarget.style.background = 'none')}
                  >
                    <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.4, marginBottom: 2 }}>
                      · "{log.question.length > 48 ? log.question.slice(0, 48) + '…' : log.question}"
                    </div>
                    <div style={{ fontSize: 10, color: '#9CA3AF' }}>
                      {patientName ? `${patientName.prenom} ${patientName.nom} · ` : ''}
                      {new Date(log.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} →
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── COLONNE DROITE ────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ background: 'white', borderBottom: '0.5px solid #E5E7EB', padding: '14px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Bot size={20} style={{ color: '#2BBFBF', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#111827' }}>Mon assistant</div>
              <div style={{ fontSize: 12, color: '#6B7280' }}>
                {praticienPrenom ? `Bonjour ${praticienPrenom}, p` : 'P'}osez vos questions cliniques APA.
                {selectedPatient && (
                  <span style={{ color: '#2BBFBF' }}> Contexte : {selectedPatient.prenom} {selectedPatient.nom}.</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Zone messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.length === 0 && !loading ? (
            /* État initial */
            <div style={{ margin: 'auto', maxWidth: 420, padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>🤖</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#111827', marginBottom: 6 }}>
                {praticienPrenom ? `Bonjour ${praticienPrenom}` : 'Bonjour'}
              </div>
              <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 24, lineHeight: 1.6 }}>
                Je suis votre assistant clinique APA.
              </div>
              <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E5E7EB', padding: '16px', textAlign: 'left' }}>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 8 }}>Vous pouvez me demander :</div>
                {[
                  '💊 Vérifier les contre-indications',
                  '🏋️ Suggérer un programme d\'exercices',
                  '📊 Interpréter un résultat de test',
                  '📋 Rédiger un compte-rendu médecin',
                ].map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(s.slice(3))}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '8px 6px', background: 'none', border: 'none',
                      cursor: 'pointer', fontSize: 13, color: '#374151',
                      marginBottom: 2, borderRadius: 4,
                    }}
                    onMouseOver={e => (e.currentTarget.style.background = '#F0F9F9')}
                    onMouseOut={e => (e.currentTarget.style.background = 'none')}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '72%',
                    padding: '12px 16px',
                    fontSize: 14,
                    lineHeight: 1.6,
                    borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    background: msg.role === 'user' ? '#2BBFBF' : 'white',
                    color: msg.role === 'user' ? 'white' : '#111827',
                    border: msg.role === 'assistant' ? '0.5px solid #E5E7EB' : 'none',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{
                    background: 'white', border: '0.5px solid #E5E7EB',
                    borderRadius: '12px 12px 12px 2px', padding: '12px 16px',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <RefreshCw size={12} className="animate-spin" style={{ color: '#2BBFBF' }} />
                    <span style={{ fontSize: 13, color: '#9CA3AF' }}>L'assistant réfléchit…</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Boutons action (copier) */}
        {hasAssistantResponse && !loading && (
          <div style={{ padding: '4px 24px 0', display: 'flex', gap: 8 }}>
            <button
              onClick={handleCopyLast}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '5px 12px', background: 'none',
                border: '1px solid #E5E7EB', borderRadius: 6,
                cursor: 'pointer', fontSize: 12, color: '#6B7280',
              }}
            >
              <Copy size={11} /> Copier la réponse
            </button>
            <button
              onClick={() => setMessages([])}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '5px 12px', background: 'none',
                border: '1px solid #E5E7EB', borderRadius: 6,
                cursor: 'pointer', fontSize: 12, color: '#9CA3AF',
              }}
            >
              Nouvelle conversation
            </button>
          </div>
        )}

        {/* Zone saisie */}
        <div style={{ background: 'white', borderTop: '0.5px solid #E5E7EB', padding: '12px 24px 16px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{
              flex: 1, border: '1px solid #E5E7EB', borderRadius: 10,
              overflow: 'hidden', background: 'white',
              transition: 'border-color 0.15s',
            }}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(input);
                  }
                }}
                placeholder={isRecording ? '🎙️ Dictée en cours…' : 'Posez votre question… (Entrée = envoyer, Shift+Entrée = saut de ligne)'}
                rows={1}
                disabled={loading}
                style={{
                  width: '100%', padding: '10px 14px',
                  border: 'none', outline: 'none',
                  fontSize: 14, resize: 'none',
                  background: 'transparent', fontFamily: 'inherit',
                  lineHeight: 1.5, maxHeight: 120, boxSizing: 'border-box',
                  display: 'block',
                }}
              />
              {isSupported && (
                <div style={{ padding: '4px 10px', borderTop: '0.5px solid #F3F4F6', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={handleToggleMic}
                    disabled={loading}
                    style={{
                      padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: isRecording ? '#FEE2E2' : '#F3F4F6',
                      color: isRecording ? '#DC2626' : '#6B7280',
                      fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    {isRecording ? <MicOff size={12} /> : <Mic size={12} />}
                    {isRecording ? 'Arrêter' : '🎙️ Dicter'}
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              style={{
                width: 44, height: 44, borderRadius: 10, border: 'none', cursor: 'pointer',
                background: input.trim() && !loading ? '#2BBFBF' : '#E5E7EB',
                color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s', flexShrink: 0,
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
