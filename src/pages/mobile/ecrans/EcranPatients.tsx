import { useState } from 'react';
import { useParticipants } from '../../../hooks/useParticipants';
import { useAgenda } from '../../../hooks/useAgenda';
import { getContreIndications } from '../../../lib/anamnese';
import { libelleAge } from '../../../lib/age';
import { C, card, formatDateCourt } from './communs';

// ── EcranPatients ─────────────────────────────────────────────────────────────

export type FiltrePatients = 'tous' | 'ci' | 'bilan' | 'seance';

export function EcranPatients({ onVoirFiche }: { onVoirFiche: (id: string) => void }) {
  const { participantsActifs: participants } = useParticipants();
  const { seances } = useAgenda();
  const [q, setQ] = useState('');
  const [filtre, setFiltre] = useState<FiltrePatients>('tous');
  const today = new Date().toISOString().slice(0, 10);
  const il90jFmt = (() => { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10); })();

  function hasCI(p: import('../../../types').Participant): boolean {
    return getContreIndications(p).actif;
  }

  const baseFiltered = participants.filter(p =>
    `${p.prenom} ${p.nom}`.toLowerCase().includes(q.toLowerCase())
  );

  const filtered = baseFiltered.filter(p => {
    if (filtre === 'ci')     return hasCI(p);
    if (filtre === 'bilan')  return p.bilans.length === 0 || p.bilans.every(b => b.date < il90jFmt);
    if (filtre === 'seance') return seances.some(s => s.participantId === p.id && s.date === today && s.statut === 'planifiee');
    return true;
  });

  const FILTRES: { id: FiltrePatients; label: string }[] = [
    { id: 'tous',   label: 'Tous' },
    { id: 'ci',     label: '⚠️ CI' },
    { id: 'bilan',  label: '📊 Bilan' },
    { id: 'seance', label: '📅 Aujourd\'hui' },
  ];

  return (
    <div>
      <div style={{ background: 'white', paddingTop: 'calc(env(safe-area-inset-top, 44px) + 12px)', paddingLeft: 16, paddingRight: 16, paddingBottom: 12, borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 10 }}>Mes bénéficiaires</div>
        <input type="search" placeholder="Rechercher..." value={q} onChange={e => setQ(e.target.value)}
          style={{ width: '100%', padding: '10px 14px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, background: C.bg, outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          {FILTRES.map(f => (
            <button key={f.id} onClick={() => setFiltre(f.id)} style={{
              flexShrink: 0, padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
              background: filtre === f.id ? C.primary : C.bg,
              color: filtre === f.id ? 'white' : 'var(--color-ink-2)',
            }}>{f.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '8px 16px' }}>
        {filtered.length === 0 && (
          <div style={{ color: C.muted, textAlign: 'center', padding: 30 }}>Aucun bénéficiaire trouvé</div>
        )}
        {filtered.map(p => {
          const prochaine = seances.filter(s => s.participantId === p.id && s.date >= today && s.statut === 'planifiee').sort((a, b) => a.date.localeCompare(b.date))[0];
          const ci = hasCI(p);
          return (
            <div key={p.id} onClick={() => onVoirFiche(p.id)} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', position: 'relative' }}>
              <div style={{ width: 42, height: 42, borderRadius: '50%', background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                {p.prenom[0]}{p.nom[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {p.prenom} {p.nom}
                  {ci && <span style={{ fontSize: 13 }} title="Contre-indications actives">⚠️</span>}
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>
                  {libelleAge(p.dateNaissance)}{prochaine ? ` · ${formatDateCourt(prochaine.date)}` : ''}
                </div>
                {(p.contexteClinic || p.pathologie) && (
                  <div style={{ fontSize: 11, color: 'var(--color-ink-2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.contexteClinic || p.pathologie}
                  </div>
                )}
              </div>
              <i className="ti ti-chevron-right" style={{ fontSize: 18, color: '#D0DCDC' }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
