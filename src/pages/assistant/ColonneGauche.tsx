import { useState } from 'react';
import { ArrowLeft, Search, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { getContreIndications } from '../../lib/anamnese';
import { filtrerLogsHistorique, regrouperLogsParBeneficiaire } from '../../utils/assistantHistorique';
import type { Participant } from '../../types';
import { libelleAge } from '../../lib/age';
import { type AssistantLog, type PatientExtras } from './communs';

export function fmt(d: string): string {
  return new Date(d + (d.includes('T') ? '' : 'T12:00')).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

// ── Indicateur contexte chargé ────────────────────────────────────────────────

export function ContextIndicator({ patient, extras }: { patient: Participant; extras: PatientExtras }) {
  const hasBilans = patient.bilans.length > 0;
  const dernierBilan = [...patient.bilans].sort((a, b) => b.date.localeCompare(a.date))[0];
  const hasObjectif = !!(patient.objectifsPatient || patient.bilans[0]?.bilanInitialData?.formulaireFlat?.data);

  const items = [
    { ok: !!(patient.pathologie || patient.antecedentsMedicaux), label: 'Profil médical', detail: '' },
    { ok: hasBilans, label: hasBilans ? `${patient.bilans.length} bilan${patient.bilans.length > 1 ? 's' : ''} chargé${patient.bilans.length > 1 ? 's' : ''}` : 'Aucun bilan', detail: hasBilans && dernierBilan ? `dernier : ${fmt(dernierBilan.date)}` : '' },
    { ok: extras.compteRendus.length > 0, label: extras.compteRendus.length > 0 ? `${extras.compteRendus.length} séance${extras.compteRendus.length > 1 ? 's' : ''} dictée${extras.compteRendus.length > 1 ? 's' : ''}` : 'Aucune séance dictée', detail: '' },
    { ok: hasObjectif, label: 'Objectifs renseignés', detail: '' },
  ];

  if (extras.loading) {
    return <div style={{ fontSize: 11, color: '#9CA3AF', padding: '4px 0' }}>⏳ Chargement des données…</div>;
  }

  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: item.ok ? '#059669' : '#D97706' }}>
          <span>{item.ok ? '✅' : '⚠️'}</span>
          <span>{item.label}</span>
          {item.detail && <span style={{ color: '#9CA3AF', marginLeft: 2 }}>({item.detail})</span>}
        </div>
      ))}
    </div>
  );
}

// ── Colonne gauche (partagée home + chat) ─────────────────────────────────────

/** Une ligne d'historique (question restaurable + suppression). Le conteneur est un
 *  `div role="button"` (pas un `<button>`) car il contient lui-même un bouton de
 *  suppression — un bouton dans un bouton serait invalide en HTML. */
export function LigneHistorique({
  log, onRestoreLog, onDeleteLog,
}: {
  log: AssistantLog;
  onRestoreLog: (l: AssistantLog) => void;
  onDeleteLog: (id: string) => void;
}) {
  return (
    <div
      role="button" tabIndex={0}
      onClick={() => onRestoreLog(log)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRestoreLog(log); } }}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 4, width: '100%', textAlign: 'left', padding: '6px 4px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 5 }}
      onMouseOver={e => (e.currentTarget.style.background = '#F0F9F9')}
      onMouseOut={e => (e.currentTarget.style.background = 'none')}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.4 }}>· "{log.question.length > 44 ? log.question.slice(0, 44) + '…' : log.question}"</div>
        <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 1 }}>
          {new Date(log.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} →
        </div>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDeleteLog(log.id); }}
        title="Supprimer cette entrée"
        style={{ padding: 3, background: 'none', border: 'none', cursor: 'pointer', color: '#D1D5DB', flexShrink: 0 }}
        onMouseOver={e => (e.currentTarget.style.color = '#DC2626')}
        onMouseOut={e => (e.currentTarget.style.color = '#D1D5DB')}>
        <Trash2 size={11} />
      </button>
    </div>
  );
}

export function LeftColumn({
  logs, participants, selectedPatient, extras, logSearch, setLogSearch,
  onRestoreLog, onDeleteLog, onSelectPatient, onRemovePatient, showBackButton, onBack,
}: {
  logs: AssistantLog[];
  participants: Participant[];
  selectedPatient: Participant | null;
  extras: PatientExtras | null;
  logSearch: string;
  setLogSearch: (s: string) => void;
  onRestoreLog: (l: AssistantLog) => void;
  onDeleteLog: (id: string) => void;
  onSelectPatient: (p: Participant) => void;
  onRemovePatient: () => void;
  showBackButton: boolean;
  onBack: () => void;
}) {
  const [showPatientSearch, setShowPatientSearch] = useState(false);
  const [patientQ, setPatientQ] = useState('');
  const [expandedGroupes, setExpandedGroupes] = useState<Set<string>>(() => new Set());
  const [expandedFils, setExpandedFils] = useState<Set<string>>(() => new Set());

  const nomPatient = (patientId: string | null): string => {
    if (!patientId) return '';
    const p = participants.find(x => x.id === patientId);
    return p ? `${p.prenom} ${p.nom}` : '';
  };

  const groupes = regrouperLogsParBeneficiaire(filtrerLogsHistorique(logs, logSearch, nomPatient));
  const groupeKey = (patientId: string | null) => patientId ?? '__sans_beneficiaire__';

  function toggleGroupe(key: string) {
    setExpandedGroupes(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  function toggleFil(key: string) {
    setExpandedFils(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // Recherche : actifs uniquement ; `participants` (tous) reste utilisé pour retrouver un
  // bénéficiaire dans l'historique des échanges.
  const actifsRecherche = participants.filter(p => !p.archive);
  const filteredPatients = patientQ.trim()
    ? actifsRecherche.filter(p => `${p.prenom} ${p.nom}`.toLowerCase().includes(patientQ.toLowerCase())).slice(0, 8)
    : actifsRecherche.slice(0, 8);

  const ciTexte = selectedPatient ? getContreIndications(selectedPatient).detail : null;

  return (
    <div style={{ width: 280, flexShrink: 0, borderRight: '0.5px solid #E5E7EB', background: 'white', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      {showBackButton && (
        <div style={{ padding: '12px 14px 8px', borderBottom: '0.5px solid #F3F4F6' }}>
          <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#6B7280', padding: '4px 0' }}>
            <ArrowLeft size={14} /> Retour
          </button>
        </div>
      )}

      {/* Contexte patient */}
      <div style={{ padding: '14px 14px 10px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          Contexte bénéficiaire
        </div>

        {selectedPatient ? (
          <div>
            <div style={{ background: '#F0F9F9', border: '1px solid rgba(43,191,191,0.25)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>{selectedPatient.prenom} {selectedPatient.nom}</div>
                  <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>
                    {libelleAge(selectedPatient.dateNaissance)}{selectedPatient.pathologie ? ` · ${selectedPatient.pathologie.slice(0, 24)}` : ''}
                  </div>
                  {ciTexte && (
                    <div style={{ marginTop: 6, fontSize: 10, color: '#DC2626', fontWeight: 600, background: '#FEE2E2', borderRadius: 4, padding: '3px 7px' }}>
                      ⚠️ {ciTexte.slice(0, 60)}{ciTexte.length > 60 ? '…' : ''}
                    </div>
                  )}
                </div>
                <button onClick={onRemovePatient} title="Retirer" style={{ padding: 3, background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 14, flexShrink: 0 }}>✕</button>
              </div>
              {extras && <ContextIndicator patient={selectedPatient} extras={extras} />}
            </div>
            <button onClick={() => setShowPatientSearch(v => !v)}
              style={{ marginTop: 8, width: '100%', padding: '6px 10px', background: 'none', border: '1px solid #E5E7EB', borderRadius: 7, cursor: 'pointer', fontSize: 12, color: '#6B7280', textAlign: 'center' }}>
              Changer de bénéficiaire
            </button>
          </div>
        ) : (
          <button onClick={() => setShowPatientSearch(v => !v)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, cursor: 'pointer' }}>
            <Search size={13} style={{ color: '#9CA3AF' }} />
            <span style={{ fontSize: 12, color: '#9CA3AF' }}>Sélectionner un bénéficiaire…</span>
          </button>
        )}

        {showPatientSearch && (
          <div style={{ marginTop: 8, border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden', background: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
            <div style={{ padding: '6px 8px', borderBottom: '1px solid #F3F4F6', position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
              <input type="text" value={patientQ} onChange={e => setPatientQ(e.target.value)} placeholder="Rechercher…" autoFocus
                style={{ width: '100%', padding: '5px 8px 5px 24px', border: 'none', outline: 'none', fontSize: 12, background: 'transparent', boxSizing: 'border-box' }} />
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {filteredPatients.map(p => (
                <button key={p.id} onClick={() => { onSelectPatient(p); setShowPatientSearch(false); setPatientQ(''); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid #F9FAFB', textAlign: 'left' }}
                  onMouseOver={e => (e.currentTarget.style.background = '#F0F9F9')}
                  onMouseOut={e => (e.currentTarget.style.background = 'none')}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--color-teal)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                    {p.prenom[0]}{p.nom[0]}
                  </div>
                  <div><div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{p.prenom} {p.nom}</div>
                  <div style={{ fontSize: 11, color: '#6B7280' }}>{libelleAge(p.dateNaissance)}</div></div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ height: '0.5px', background: '#E5E7EB' }} />

      {/* Historique */}
      <div style={{ padding: '10px 14px', flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Questions récentes</div>
        {logs.length > 5 && (
          <div style={{ position: 'relative', marginBottom: 7 }}>
            <Search size={11} style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
            <input type="text" value={logSearch} onChange={e => setLogSearch(e.target.value)} placeholder="Filtrer par question ou bénéficiaire…"
              style={{ width: '100%', padding: '5px 7px 5px 22px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 11, outline: 'none', boxSizing: 'border-box', background: '#F9FAFB' }} />
          </div>
        )}
        {groupes.length === 0 ? (
          <div style={{ fontSize: 11, color: '#D1D5DB', textAlign: 'center', padding: '16px 0' }}>Aucune question récente</div>
        ) : groupes.map(groupe => {
          const key = groupeKey(groupe.patientId);
          const nom = groupe.patientId ? (nomPatient(groupe.patientId) || 'Bénéficiaire') : 'Sans bénéficiaire';
          const isOpen = expandedGroupes.has(key);
          return (
            <div key={key} style={{ marginBottom: 2 }}>
              <div
                role="button" tabIndex={0}
                onClick={() => toggleGroupe(key)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGroupe(key); } }}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 4px', cursor: 'pointer', borderRadius: 5, fontSize: 11.5, fontWeight: 600, color: '#374151' }}>
                {isOpen ? <ChevronUp size={12} style={{ color: '#9CA3AF', flexShrink: 0 }} /> : <ChevronDown size={12} style={{ color: '#9CA3AF', flexShrink: 0 }} />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nom} ({groupe.fils.length})</span>
              </div>
              {isOpen && (
                <div style={{ paddingLeft: 8 }}>
                  {groupe.fils.map(fil => {
                    const filKey = `${key}::${fil.question}`;
                    const filOpen = expandedFils.has(filKey);
                    const [dernier, ...anciennes] = fil.entries;
                    return (
                      <div key={filKey}>
                        <LigneHistorique log={dernier} onRestoreLog={onRestoreLog} onDeleteLog={onDeleteLog} />
                        {anciennes.length > 0 && (
                          <>
                            <button onClick={() => toggleFil(filKey)}
                              style={{ display: 'block', margin: '0 0 4px 8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--color-teal)' }}>
                              {filOpen ? 'Masquer' : 'Voir'} {anciennes.length} version{anciennes.length > 1 ? 's' : ''} précédente{anciennes.length > 1 ? 's' : ''}
                            </button>
                            {filOpen && anciennes.map(a => (
                              <LigneHistorique key={a.id} log={a} onRestoreLog={onRestoreLog} onDeleteLog={onDeleteLog} />
                            ))}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
