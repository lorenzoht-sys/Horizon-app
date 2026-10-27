import { useState, useRef, useEffect } from 'react';
import { useParticipants } from '../../../hooks/useParticipants';
import type { Participant } from '../../../types';
import { supabase, getAuthHeader } from '../../../lib/supabase';
import { ajouterJournalAssistant } from '../../../lib/acces/assistant';
import { getContreIndications } from '../../../lib/anamnese';
import { libelleAge } from '../../../lib/age';
import { useEtatSession } from '../../../hooks/useEtatSession';
import { buildAssistantPromptMobile, historiquePourIA } from '../../../utils/promptAssistant';
import { identiteDe, masquerIdentiteConnue, reinsererIdentite, versParticipantIA } from '../../../utils/pseudonymiserIA';
import RappelNomsIA from '../../../components/ui/RappelNomsIA';
import { C } from './communs';

// ── EcranAssistant ────────────────────────────────────────────────────────────

export function EcranAssistant({
  preSelectedPatientId,
  onOuvrirSettings,
}: {
  preSelectedPatientId?: string | null;
  onOuvrirSettings: () => void;
}) {
  const { participants } = useParticipants();
  // contenuIA : version envoyable (sans le nom), voir historiquePourIA.
  type Msg = { role: 'user' | 'assistant'; content: string; contenuIA?: string };
  // Conversation conservée si l'interface est remplacée (rotation). Une réponse
  // encore en attente à ce moment-là est perdue ; la question, non.
  const [selectedPatientId, setSelectedPatientId] = useEtatSession<string | null>('assistant_mobile_beneficiaire', null);
  const selectedPatient = participants.find(p => p.id === selectedPatientId) ?? null;
  const setSelectedPatient = (p: Participant | null) => setSelectedPatientId(p ? p.id : null);
  const [messages, setMessages] = useEtatSession<Msg[]>('assistant_mobile_messages', []);
  const [input, setInput] = useEtatSession('assistant_mobile_saisie', '');
  const [loading, setLoading] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (preSelectedPatientId && participants.length > 0) {
      const p = participants.find(x => x.id === preSelectedPatientId);
      if (p) setSelectedPatientId(p.id);
    }
  }, [preSelectedPatientId, participants, setSelectedPatientId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    setLoading(true);
    try {
      // Pseudonymisation (lot A, 2026-10-27) : ni le nom ni la date de
      // naissance ne partent ; l'identité est réinsérée dans la réponse.
      const identite = selectedPatient ? identiteDe(selectedPatient) : null;
      const prompt = buildAssistantPromptMobile(
        selectedPatient ? versParticipantIA(selectedPatient) : null,
        historiquePourIA(messages, identite),
        masquerIdentiteConnue(trimmed, identite),
      );
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      const brut: string | undefined = data.text;
      const responseText: string = brut != null ? reinsererIdentite(brut, identite) : (data.error ? `Erreur : ${data.error}` : 'Pas de réponse.');
      setMessages(prev => [...prev, { role: 'assistant', content: responseText, ...(brut != null ? { contenuIA: brut } : {}) }]);
      if (supabase) {
        try {
          await ajouterJournalAssistant({
            patient_id: selectedPatient?.id ?? null,
            question: trimmed,
            reponse: responseText,
          });
        } catch { /* non bloquant */ }
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Erreur : ${err instanceof Error ? err.message : String(err)}` }]);
    } finally {
      setLoading(false);
    }
  }

  const filteredPatients = searchQ.trim()
    ? participants.filter(p => `${p.prenom} ${p.nom}`.toLowerCase().includes(searchQ.toLowerCase())).slice(0, 8)
    : participants.slice(0, 10);

  const ciTexte = selectedPatient ? getContreIndications(selectedPatient).detail : null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: C.bg }}>

      {/* Header */}
      <div style={{ background: C.dark, paddingTop: 'calc(env(safe-area-inset-top, 44px) + 12px)', paddingLeft: 16, paddingRight: 16, paddingBottom: 14, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'white' }}>🤖 Mon assistant</div>
          <button
            onClick={onOuvrirSettings}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', padding: 6 }}
          >
            <i className="ti ti-settings" style={{ fontSize: 18 }} />
          </button>
        </div>
        {/* Sélecteur patient */}
        <button
          onClick={() => setShowSheet(true)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 12px', background: selectedPatient ? 'rgba(43,191,191,0.15)' : 'rgba(255,255,255,0.07)',
            border: `1px solid ${selectedPatient ? 'rgba(43,191,191,0.4)' : 'rgba(255,255,255,0.12)'}`,
            borderRadius: 10, cursor: 'pointer', color: 'white',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {selectedPatient ? (
              <>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                  {selectedPatient.prenom[0]}{selectedPatient.nom[0]}
                </div>
                <div style={{ textAlign: 'left', minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{selectedPatient.prenom} {selectedPatient.nom}</div>
                  {ciTexte && <div style={{ fontSize: 11, color: '#F87171' }}>⚠️ CI active</div>}
                </div>
              </>
            ) : (
              <>
                <i className="ti ti-search" style={{ fontSize: 15, color: 'rgba(255,255,255,0.4)' }} />
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Sélectionner un patient (optionnel)</span>
              </>
            )}
          </div>
          {selectedPatient ? (
            <button
              onClick={e => { e.stopPropagation(); setSelectedPatient(null); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 4, flexShrink: 0 }}
            >
              ✕
            </button>
          ) : (
            <i className="ti ti-chevron-right" style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)' }} />
          )}
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: C.muted }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>Mon assistant APA</div>
            <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
              {selectedPatient
                ? `Contexte : ${selectedPatient.prenom} ${selectedPatient.nom}. Posez votre question.`
                : 'Posez une question générale ou sélectionnez un patient pour un contexte personnalisé.'}
            </div>
            {[
              '💊 Analyser les contre-indications',
              '🏋️ Suggérer un programme',
              '📊 Interpréter un test',
            ].map((s, i) => (
              <button key={i} onClick={() => setInput(s.slice(3))}
                style={{ display: 'block', width: '100%', padding: '10px 14px', marginBottom: 6, background: 'white', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, color: C.text, cursor: 'pointer', textAlign: 'left' }}>
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '82%', padding: '11px 14px', fontSize: 14, lineHeight: 1.6,
              borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
              background: msg.role === 'user' ? C.primary : 'white',
              color: msg.role === 'user' ? 'white' : C.text,
              border: msg.role === 'assistant' ? `1px solid ${C.border}` : 'none',
              whiteSpace: 'pre-wrap',
            }}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: '12px 12px 12px 2px', padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18, animation: 'spin 1s linear infinite' }}>⟳</span>
              <span style={{ fontSize: 13, color: C.muted }}>Réflexion en cours…</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Zone saisie */}
      <div style={{ background: 'white', borderTop: `1px solid ${C.border}`, padding: '10px 14px', paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))', flexShrink: 0 }}>
        {/* Au-dessus de la saisie, pas en dessous : mesuré le 2026-10-27
            (15-fumee-mobile, 390×844), le bas de cette zone passe sous la
            barre de navigation basse ; un rappel placé dessous y était caché. */}
        <RappelNomsIA style={{ marginBottom: 6 }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            placeholder="Posez votre question…"
            rows={1}
            disabled={loading}
            style={{
              flex: 1, padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 10,
              fontSize: 14, outline: 'none', resize: 'none', fontFamily: 'inherit',
              background: C.bg, lineHeight: 1.5, maxHeight: 100,
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            style={{
              width: 44, height: 44, borderRadius: 10, border: 'none', cursor: 'pointer',
              background: input.trim() && !loading ? C.primary : '#D0DCDC',
              color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <i className="ti ti-send" style={{ fontSize: 17 }} />
          </button>
        </div>
      </div>

      {/* Bottom sheet sélecteur patient */}
      {showSheet && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }}
          onClick={() => setShowSheet(false)}>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'white', borderRadius: '20px 20px 0 0', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 16px 8px' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: '#E5E7EB', margin: '0 auto 14px' }} />
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 10 }}>Sélectionner un bénéficiaire</div>
              <input
                type="search"
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Rechercher…"
                autoFocus
                style={{ width: '100%', padding: '10px 14px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, background: C.bg, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '0 16px 20px', paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}>
              {selectedPatient && (
                <button
                  onClick={() => { setSelectedPatient(null); setShowSheet(false); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 6, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ fontSize: 16 }}>✕</span>
                  <span style={{ fontSize: 13, color: '#DC2626', fontWeight: 600 }}>Retirer le contexte bénéficiaire</span>
                </button>
              )}
              {filteredPatients.map(p => (
                <button key={p.id} onClick={() => { setSelectedPatient(p); setSearchQ(''); setShowSheet(false); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', marginBottom: 4, background: selectedPatient?.id === p.id ? '#E8F8F8' : 'white', border: `1px solid ${selectedPatient?.id === p.id ? C.primary : C.border}`, borderRadius: 10, cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                    {p.prenom[0]}{p.nom[0]}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{p.prenom} {p.nom}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>{libelleAge(p.dateNaissance)}{p.pathologie ? ` · ${p.pathologie.slice(0, 20)}` : ''}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
