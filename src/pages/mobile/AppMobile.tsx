import { useState } from 'react';
import toast from 'react-hot-toast';
import { useParticipants } from '../../hooks/useParticipants';
import { useAgenda } from '../../hooks/useAgenda';
import { useJournalSeance } from '../../hooks/useJournalSeance';
import { RESSENTI_CONFIG } from '../../components/journal/NoteSeanceModal';
import BilanStepper from '../../components/bilan/BilanStepper';
import type { RessentiSeance, Bilan } from '../../types';
import { v4 as uuidv4 } from 'uuid';

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcAge(d: string) {
  const a = new Date(), b = new Date(d);
  let age = a.getFullYear() - b.getFullYear();
  if (a.getMonth() < b.getMonth()) age--;
  return age;
}

function formatDateLong(d: Date) {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatDateCourt(d: string) {
  return new Date(d + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function ouvrirMaps(adresse: string) {
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`, '_blank');
}

const C = { // colors
  dark:    '#032c28',
  primary: '#2BBFBF',
  green:   '#1ca48c',
  bg:      '#F4FAFA',
  border:  '#E0EEEE',
  text:    '#032c28',
  muted:   '#8FA8A8',
};

const card: React.CSSProperties = {
  background: 'white', borderRadius: 12,
  border: `1px solid ${C.border}`, padding: '12px 14px', marginBottom: 8,
};

// ── Bottom Nav ────────────────────────────────────────────────────────────────

const NAV = [
  { id: 'aujourdhui', icon: 'ti-calendar-today', label: "Aujourd'hui" },
  { id: 'patients',   icon: 'ti-users',           label: 'Patients' },
  { id: 'saisie',     icon: 'ti-plus',            label: 'Saisie', principal: true },
  { id: 'tournee',    icon: 'ti-route',           label: 'Tournée' },
  { id: 'plus',       icon: 'ti-dots',            label: 'Plus' },
];

function BottomNav({ onglet, onChange }: { onglet: string; onChange: (id: string) => void }) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      maxWidth: 480, margin: '0 auto',
      background: 'white', borderTop: `1px solid ${C.border}`,
      display: 'flex', padding: 'calc(8px + env(safe-area-inset-bottom)) 0 8px',
      zIndex: 100,
    }}>
      {NAV.map(item => (
        <button key={item.id} onClick={() => onChange(item.id)}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
          {item.principal ? (
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: -20, boxShadow: '0 4px 12px rgba(43,191,191,0.4)' }}>
              <i className="ti ti-plus" style={{ fontSize: 22, color: 'white' }} />
            </div>
          ) : (
            <i className={`ti ${item.icon}`} style={{ fontSize: 22, color: onglet === item.id ? C.green : C.muted }} />
          )}
          <span style={{ fontSize: 10, fontWeight: onglet === item.id ? 700 : 400, color: onglet === item.id ? C.green : C.muted }}>
            {item.label}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── EcranAujourdhui ───────────────────────────────────────────────────────────

function EcranAujourdhui({ onVoirFiche }: { onVoirFiche: (id: string) => void }) {
  const { participants } = useParticipants();
  const { seancesDuJour, changerStatut } = useAgenda();
  const today = new Date().toISOString().slice(0, 10);
  const seances = seancesDuJour(today);
  const settings = (() => { try { return JSON.parse(localStorage.getItem('settings_praticien') || '{}'); } catch { return {}; } })();
  const prenom = settings.prenom || 'Pierre';

  return (
    <div>
      <div style={{ background: C.dark, padding: '20px 16px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <img src="/logo-horizon.png.png?v=2" alt="Horizon" style={{ height: 24 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <div style={{ fontSize: 18, fontWeight: 700, color: 'white', marginTop: 10 }}>Bonjour {prenom} 👋</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{formatDateLong(new Date())}</div>
          </div>
          <div style={{ background: C.primary, borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700, color: 'white' }}>
            {seances.length} séance{seances.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {seances.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: C.muted, fontSize: 14 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🌅</div>
            Aucune séance aujourd'hui
          </div>
        ) : seances.map(s => {
          const p = participants.find(x => x.id === s.participantId);
          return (
            <div key={s.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, opacity: s.statut === 'annulee' ? 0.5 : 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.primary, minWidth: 40, textAlign: 'center' }}>{s.heureDebut}</div>
              <div style={{ width: 1, height: 36, background: C.border, flexShrink: 0 }} />
              <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => p && onVoirFiche(p.id)}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{p?.prenom} {p?.nom}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{s.dureeMinutes} min</div>
              </div>
              {s.statut === 'realisee' ? (
                <span style={{ fontSize: 12, color: '#1D9E75', fontWeight: 700 }}>✅</span>
              ) : (
                <button onClick={() => { changerStatut(s.id, 'realisee'); toast.success('Séance réalisée'); }}
                  style={{ background: '#E8F8F8', border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 700, color: C.primary, cursor: 'pointer' }}>
                  ✓ Fait
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── EcranPatients ─────────────────────────────────────────────────────────────

function EcranPatients({ onVoirFiche }: { onVoirFiche: (id: string) => void }) {
  const { participants } = useParticipants();
  const { seances } = useAgenda();
  const [q, setQ] = useState('');
  const today = new Date().toISOString().slice(0, 10);

  const filtered = participants.filter(p =>
    `${p.prenom} ${p.nom}`.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div>
      <div style={{ background: 'white', padding: 16, borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 10 }}>Mes patients</div>
        <input type="search" placeholder="Rechercher..." value={q} onChange={e => setQ(e.target.value)}
          style={{ width: '100%', padding: '10px 14px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, background: C.bg, outline: 'none', boxSizing: 'border-box' }} />
      </div>

      <div style={{ padding: '8px 16px' }}>
        {filtered.map(p => {
          const prochaine = seances.filter(s => s.participantId === p.id && s.date >= today && s.statut === 'planifiee').sort((a, b) => a.date.localeCompare(b.date))[0];
          return (
            <div key={p.id} onClick={() => onVoirFiche(p.id)} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
              <div style={{ width: 42, height: 42, borderRadius: '50%', background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                {p.prenom[0]}{p.nom[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{p.prenom} {p.nom}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>
                  {calcAge(p.dateNaissance)} ans{prochaine ? ` · ${formatDateCourt(prochaine.date)}` : ''}
                </div>
              </div>
              <i className="ti ti-chevron-right" style={{ fontSize: 18, color: '#D0DCDC' }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── EcranSaisie ───────────────────────────────────────────────────────────────

type ModeSaisie = 'choix' | 'note' | 'patient' | 'bilan';

function EcranSaisie() {
  const [mode, setMode] = useState<ModeSaisie>('choix');
  const back = () => setMode('choix');
  if (mode === 'note')    return <NoteRapide onBack={back} />;
  if (mode === 'patient') return <NouveauPatientMobile onBack={back} />;
  if (mode === 'bilan')   return <NouveauBilanMobile onBack={back} />;
  return <ChoixSaisie onNote={() => setMode('note')} onPatient={() => setMode('patient')} onBilan={() => setMode('bilan')} />;
}

function ChoixSaisie({ onNote, onPatient, onBilan }: { onNote: () => void; onPatient: () => void; onBilan: () => void }) {
  const btn: React.CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: 16, background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 10, cursor: 'pointer', textAlign: 'left' };
  return (
    <div style={{ padding: 20 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 20 }}>Que saisir ?</div>
      <button onClick={onNote} style={btn}>
        <span style={{ fontSize: 28 }}>📝</span>
        <div><div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Note de séance</div><div style={{ fontSize: 12, color: C.muted }}>Note rapide après une séance</div></div>
        <i className="ti ti-chevron-right" style={{ fontSize: 18, color: '#D0DCDC', marginLeft: 'auto' }} />
      </button>
      <button onClick={onBilan} style={btn}>
        <span style={{ fontSize: 28 }}>📋</span>
        <div><div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Nouveau bilan</div><div style={{ fontSize: 12, color: C.muted }}>Bilan initial ou trimestriel</div></div>
        <i className="ti ti-chevron-right" style={{ fontSize: 18, color: '#D0DCDC', marginLeft: 'auto' }} />
      </button>
      <button onClick={onPatient} style={btn}>
        <span style={{ fontSize: 28 }}>👤</span>
        <div><div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Nouveau patient</div><div style={{ fontSize: 12, color: C.muted }}>Créer une fiche patient</div></div>
        <i className="ti ti-chevron-right" style={{ fontSize: 18, color: '#D0DCDC', marginLeft: 'auto' }} />
      </button>
    </div>
  );
}

// ── Nouveau patient mobile ─────────────────────────────────────────────────────

function NouveauPatientMobile({ onBack }: { onBack: () => void }) {
  const { addParticipant } = useParticipants();
  const [form, setForm] = useState({ prenom: '', nom: '', dateNaissance: '', telephone: '', pathologie: '' });
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#5C7A7A', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 };
  const input: React.CSSProperties = { width: '100%', padding: '12px 14px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 15, outline: 'none', marginBottom: 14, boxSizing: 'border-box' };

  function sauvegarder() {
    if (!form.prenom.trim() || !form.nom.trim() || !form.dateNaissance) {
      toast.error('Prénom, nom et date de naissance requis');
      return;
    }
    addParticipant({
      prenom: form.prenom.trim(),
      nom: form.nom.trim(),
      dateNaissance: form.dateNaissance,
      telephone: form.telephone || undefined,
      pathologie: form.pathologie || undefined,
      dateCreation: new Date().toISOString(),
      bilans: [],
      token: uuidv4().slice(0, 12),
    } as any);
    toast.success(`${form.prenom} ${form.nom} créé(e) ✅`);
    onBack();
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 22, color: C.text }} />
        </button>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Nouveau patient</div>
      </div>

      <label style={label}>Prénom *</label>
      <input value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} placeholder="Marie" style={input} />

      <label style={label}>Nom *</label>
      <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="Dupont" style={input} />

      <label style={label}>Date de naissance *</label>
      <input type="date" value={form.dateNaissance} onChange={e => setForm(f => ({ ...f, dateNaissance: e.target.value }))} style={input} />

      <label style={label}>Téléphone</label>
      <input type="tel" value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} placeholder="06 00 00 00 00" style={input} />

      <label style={label}>Pathologie / contexte</label>
      <input value={form.pathologie} onChange={e => setForm(f => ({ ...f, pathologie: e.target.value }))} placeholder="Ex : arthrose genou droit" style={input} />

      <button onClick={sauvegarder}
        style={{ width: '100%', padding: 16, background: C.primary, color: 'white', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 8 }}>
        ✅ Créer le patient
      </button>
    </div>
  );
}

// ── Nouveau bilan mobile ───────────────────────────────────────────────────────

function NouveauBilanMobile({ onBack }: { onBack: () => void }) {
  const { participants, addBilan } = useParticipants();
  const [participantId, setParticipantId] = useState('');
  const [etape, setEtape] = useState<'choix' | 'bilan'>('choix');

  const participant = participants.find(p => p.id === participantId);

  if (etape === 'bilan' && participant) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={() => setEtape('choix')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <i className="ti ti-arrow-left" style={{ fontSize: 22, color: C.text }} />
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Bilan — {participant.prenom} {participant.nom}</div>
            <div style={{ fontSize: 12, color: C.muted }}>Bilan n° {participant.bilans.length + 1}</div>
          </div>
        </div>
        <BilanStepper
          participant={participant}
          onSave={(bilan: Omit<Bilan, 'id'>) => {
            addBilan(participant.id, bilan);
            toast.success('Bilan enregistré ✅');
            onBack();
          }}
          onCancel={() => setEtape('choix')}
        />
      </div>
    );
  }

  const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#5C7A7A', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 22, color: C.text }} />
        </button>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Nouveau bilan</div>
      </div>

      <label style={label}>Sélectionner le patient</label>
      <select value={participantId} onChange={e => setParticipantId(e.target.value)}
        style={{ width: '100%', padding: '12px 14px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 15, background: 'white', color: C.text, outline: 'none', marginBottom: 20 }}>
        <option value="">Choisir un patient...</option>
        {participants.map(p => (
          <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>
        ))}
      </select>

      <button
        onClick={() => { if (participantId) setEtape('bilan'); }}
        disabled={!participantId}
        style={{ width: '100%', padding: 16, background: participantId ? C.primary : '#D0DCDC', color: 'white', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: participantId ? 'pointer' : 'not-allowed' }}>
        Commencer le bilan →
      </button>
    </div>
  );
}

function NoteRapide({ onBack }: { onBack: () => void }) {
  const { participants } = useParticipants();
  const { seancesDuJour } = useAgenda();
  const { ajouterNote } = useJournalSeance();
  const [patientId, setPatientId] = useState('');
  const [ressenti, setRessenti] = useState<RessentiSeance | null>(null);
  const [note, setNote] = useState('');
  const [alertes, setAlertes] = useState<string[]>([]);
  const today = new Date().toISOString().slice(0, 10);
  const seancesAuj = seancesDuJour(today);

  const RESSENTIS = Object.entries(RESSENTI_CONFIG) as [RessentiSeance, typeof RESSENTI_CONFIG[RessentiSeance]][];
  const ALERTES_OPT = [
    { id: 'douleurSignalee', label: '⚠️ Douleur signalée' },
    { id: 'fatiguePlusQueHabitude', label: '😓 Fatigue inhabituelle' },
    { id: 'progressionNotable', label: '🎉 Progression notable' },
    { id: 'pointARevoir', label: '👁️ Point à revoir' },
  ];

  function sauvegarder() {
    if (!patientId || !ressenti) return;
    ajouterNote({
      seanceId: seancesAuj.find(s => s.participantId === patientId)?.id ?? '',
      participantId: patientId,
      date: today,
      heureDebut: new Date().toTimeString().slice(0, 5),
      ressenti,
      note,
      alertes: {
        douleurSignalee: alertes.includes('douleurSignalee'),
        fatiguePlusQueHabitude: alertes.includes('fatiguePlusQueHabitude'),
        progressionNotable: alertes.includes('progressionNotable'),
        pointARevoir: alertes.includes('pointARevoir'),
      },
    });
    toast.success('Note enregistrée ✅');
    onBack();
  }

  const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#5C7A7A', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 22, color: C.text }} />
        </button>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Note de séance</div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={label}>Patient</label>
        <select value={patientId} onChange={e => setPatientId(e.target.value)}
          style={{ width: '100%', padding: '12px 14px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 15, background: 'white', color: C.text, outline: 'none' }}>
          <option value="">Choisir un patient...</option>
          {seancesAuj.map(s => {
            const p = participants.find(x => x.id === s.participantId);
            return p ? <option key={s.id} value={s.participantId}>{p.prenom} {p.nom} — {s.heureDebut}</option> : null;
          })}
          {participants.filter(p => !seancesAuj.some(s => s.participantId === p.id)).map(p => (
            <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={label}>Comment s'est passée la séance ?</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {RESSENTIS.map(([id, cfg]) => (
            <button key={id} onClick={() => setRessenti(id)}
              style={{ flex: 1, padding: '10px 4px', border: `1.5px solid ${ressenti === id ? C.primary : C.border}`, background: ressenti === id ? '#E8F8F8' : 'white', borderRadius: 10, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 22 }}>{cfg.emoji}</span>
              <span style={{ fontSize: 9, color: ressenti === id ? C.primary : C.muted, fontWeight: 600 }}>{cfg.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={label}>Points à noter</label>
        {ALERTES_OPT.map(a => (
          <button key={a.id} onClick={() => setAlertes(prev => prev.includes(a.id) ? prev.filter(x => x !== a.id) : [...prev, a.id])}
            style={{ width: '100%', padding: '10px 14px', marginBottom: 6, border: `1.5px solid ${alertes.includes(a.id) ? C.primary : C.border}`, background: alertes.includes(a.id) ? '#E8F8F8' : 'white', borderRadius: 10, cursor: 'pointer', textAlign: 'left', fontSize: 14, color: C.text }}>
            {a.label}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={label}>Note libre</label>
        <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Observations..." rows={3}
          style={{ width: '100%', padding: '12px 14px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, fontFamily: "'Nunito',sans-serif", resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      <button onClick={sauvegarder} disabled={!patientId || !ressenti}
        style={{ width: '100%', padding: 16, background: (!patientId || !ressenti) ? '#D0DCDC' : C.primary, color: 'white', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: (!patientId || !ressenti) ? 'not-allowed' : 'pointer' }}>
        💾 Enregistrer la note
      </button>
    </div>
  );
}

// ── EcranTournee ──────────────────────────────────────────────────────────────

function EcranTournee() {
  const { participants } = useParticipants();
  const { seancesDuJour, changerStatut } = useAgenda();
  const today = new Date().toISOString().slice(0, 10);
  const seances = seancesDuJour(today);

  return (
    <div>
      <div style={{ background: 'white', padding: 16, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 4 }}>Ma tournée</div>
        <div style={{ fontSize: 12, color: C.muted }}>{seances.length} patient{seances.length !== 1 ? 's' : ''} · {formatDateLong(new Date())}</div>
      </div>

      <div style={{ padding: '8px 16px' }}>
        {seances.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: C.muted }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗺️</div>
            Aucune séance aujourd'hui
          </div>
        ) : seances.map((s, i) => {
          const p = participants.find(x => x.id === s.participantId);
          return (
            <div key={s.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ width: 26, height: 26, borderRadius: '50%', background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'white', flexShrink: 0 }}>{i + 1}</span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{p?.prenom} {p?.nom}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>{s.heureDebut} · {s.dureeMinutes} min</div>
                  </div>
                </div>
                {s.adresse && (
                  <button onClick={() => ouvrirMaps(s.adresse)}
                    style={{ background: '#E8F8F8', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: C.primary }}>
                    <i className="ti ti-map-pin" style={{ fontSize: 15 }} />Maps
                  </button>
                )}
              </div>
              {s.adresse && <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>📍 {s.adresse}</div>}
              <button onClick={() => { if (s.statut !== 'realisee') { changerStatut(s.id, 'realisee'); toast.success('Séance réalisée ✅'); } }}
                style={{ width: '100%', padding: 9, background: s.statut === 'realisee' ? '#DCFCE7' : C.primary, color: s.statut === 'realisee' ? '#166534' : 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: s.statut === 'realisee' ? 'default' : 'pointer' }}>
                {s.statut === 'realisee' ? '✅ Réalisée' : '✓ Marquer réalisée'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── EcranPlus ─────────────────────────────────────────────────────────────────

function EcranPlus({ onLogout }: { onLogout: () => void }) {
  const items = [
    { icon: 'ti-settings', label: 'Paramètres', path: '/settings' },
    { icon: 'ti-map-pin',  label: 'Carte',       path: '/map' },
  ];
  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 16 }}>Plus</div>
      {items.map(item => (
        <button key={item.path} onClick={() => window.location.assign(item.path)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 8, cursor: 'pointer', textAlign: 'left' }}>
          <i className={`ti ${item.icon}`} style={{ fontSize: 20, color: C.primary }} />
          <span style={{ fontSize: 15, fontWeight: 500, color: C.text, flex: 1 }}>{item.label}</span>
          <i className="ti ti-chevron-right" style={{ fontSize: 16, color: '#D0DCDC' }} />
        </button>
      ))}
      <button onClick={onLogout}
        style={{ width: '100%', padding: '14px 16px', marginTop: 8, background: 'none', border: `1px solid ${C.border}`, borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, color: '#E85050', fontSize: 15 }}>
        <i className="ti ti-logout" style={{ fontSize: 20 }} />
        Déconnexion
      </button>
    </div>
  );
}

// ── Fiche patient mobile ───────────────────────────────────────────────────────

// ── Détail bilan mobile ────────────────────────────────────────────────────────

function DetailBilanMobile({ bilan, onBack }: { bilan: import('../../types').Bilan; onBack: () => void }) {
  const TESTS = [
    { label: 'Équilibre Droit',  val: bilan.equilibre.droite,       unite: 's' },
    { label: 'Équilibre Gauche', val: bilan.equilibre.gauche,       unite: 's' },
    { label: 'Chair Stand 30s',  val: bilan.chairStand30,           unite: ' rép.' },
    { label: 'HandGrip Droit',   val: bilan.handGrip.droite,        unite: ' kg' },
    { label: 'HandGrip Gauche',  val: bilan.handGrip.gauche,        unite: ' kg' },
    { label: 'TUG 3m',           val: bilan.tug3m,                  unite: 's' },
    { label: 'Souplesse',        val: bilan.souplesse.valeur,       unite: ' cm' },
    { label: 'TM6 Distance',     val: bilan.tm6.distanceMetres,     unite: ' m' },
    { label: 'TM6 FC avant',     val: bilan.tm6.fcAvant,            unite: ' bpm' },
    { label: 'TM6 FC après',     val: bilan.tm6.fcApres,            unite: ' bpm' },
    { label: 'SpO2 avant',       val: bilan.tm6.spo2Avant,          unite: '%' },
    { label: 'Mémoire imm.',     val: bilan.memoire.scoreImmediat,  unite: '/5' },
    { label: 'Mémoire dif.',     val: bilan.memoire.scoreDiffere,   unite: '/5' },
  ].filter(t => t.val !== null && t.val !== undefined);

  const dateLabel = new Date(bilan.date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div>
      <div style={{ background: C.dark, padding: 16 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 12 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 20, color: 'rgba(255,255,255,0.7)' }} />
        </button>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>
          {bilan.type === 'initial' ? 'Bilan initial' : `Bilan T${bilan.trimestre}`}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>{dateLabel}</div>
      </div>

      <div style={{ padding: 16 }}>

        {/* Résultats des tests */}
        {TESTS.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Résultats des tests</div>
            <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden', marginBottom: 16 }}>
              {TESTS.map((t, i) => (
                <div key={t.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px', borderBottom: i < TESTS.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <span style={{ fontSize: 13, color: C.muted }}>{t.label}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{t.val}{t.unite}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Notes professionnelles */}
        {bilan.notesProfessionnelles && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Notes professionnelles</div>
            <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '12px 14px', marginBottom: 16, fontSize: 14, color: C.text, lineHeight: 1.6 }}>
              {bilan.notesProfessionnelles}
            </div>
          </>
        )}

        {/* Objectifs suivants */}
        {bilan.objectifsSuivants && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Objectifs suivants</div>
            <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '12px 14px', marginBottom: 16, fontSize: 14, color: C.text, lineHeight: 1.6 }}>
              {bilan.objectifsSuivants}
            </div>
          </>
        )}

        {/* Interprétation IA */}
        {bilan.interpretationIA && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Analyse IA</div>
            <div style={{ background: '#E8F8F8', borderRadius: 12, border: `1px solid ${C.primary}30`, padding: '12px 14px', marginBottom: 10, fontSize: 14, color: C.text, lineHeight: 1.6 }}>
              {bilan.interpretationIA.textePro}
            </div>
            {bilan.interpretationIA.pointsForts.length > 0 && (
              <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '12px 14px', marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1D9E75', marginBottom: 6 }}>✅ Points forts</div>
                {bilan.interpretationIA.pointsForts.map((p, i) => <div key={i} style={{ fontSize: 13, color: C.text, marginBottom: 3 }}>· {p}</div>)}
              </div>
            )}
            {bilan.interpretationIA.pointsATravail.length > 0 && (
              <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#E8A020', marginBottom: 6 }}>⚡ À travailler</div>
                {bilan.interpretationIA.pointsATravail.map((p, i) => <div key={i} style={{ fontSize: 13, color: C.text, marginBottom: 3 }}>· {p}</div>)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Fiche patient mobile ───────────────────────────────────────────────────────

function FichePatientMobile({ participantId, onBack }: { participantId: string; onBack: () => void }) {
  const { participants } = useParticipants();
  const { notesParPatient } = useJournalSeance();
  const p = participants.find(x => x.id === participantId);
  const [onglet, setOnglet] = useState('infos');
  const [bilanDetail, setBilanDetail] = useState<import('../../types').Bilan | null>(null);
  if (!p) return null;
  if (bilanDetail) return <DetailBilanMobile bilan={bilanDetail} onBack={() => setBilanDetail(null)} />;
  const notes = notesParPatient(p.id);
  const sortedBilans = [...p.bilans].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div>
      <div style={{ background: C.dark, padding: 16 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', marginBottom: 12, padding: 0 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 20, color: 'rgba(255,255,255,0.7)' }} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: 'white' }}>
            {p.prenom[0]}{p.nom[0]}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>{p.prenom} {p.nom}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{calcAge(p.dateNaissance)} ans{p.pathologie ? ` · ${p.pathologie.slice(0, 30)}` : ''}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', background: 'white', borderBottom: `1px solid ${C.border}` }}>
        {[{ id: 'infos', label: 'Infos' }, { id: 'bilans', label: 'Bilans' }, { id: 'journal', label: 'Journal' }].map(o => (
          <button key={o.id} onClick={() => setOnglet(o.id)}
            style={{ flex: 1, padding: '12px 4px', background: 'none', border: 'none', borderBottom: `2px solid ${onglet === o.id ? C.primary : 'transparent'}`, color: onglet === o.id ? C.primary : C.muted, fontWeight: onglet === o.id ? 700 : 400, fontSize: 13, cursor: 'pointer' }}>
            {o.label}
          </button>
        ))}
      </div>

      <div style={{ padding: 16 }}>
        {onglet === 'infos' && (
          <div>
            {p.telephone && <div style={{ ...card }}><span style={{ fontSize: 12, color: C.muted }}>Téléphone</span><div style={{ fontWeight: 600, color: C.text }}>{p.telephone}</div></div>}
            {p.email && <div style={{ ...card }}><span style={{ fontSize: 12, color: C.muted }}>Email</span><div style={{ fontWeight: 600, color: C.text }}>{p.email}</div></div>}
            {p.adresseRue && <div style={{ ...card }}><span style={{ fontSize: 12, color: C.muted }}>Adresse</span><div style={{ fontWeight: 600, color: C.text }}>{p.adresseRue}, {p.adresseCodePostal} {p.adresseVille}</div></div>}
            {p.pathologie && <div style={{ ...card }}><span style={{ fontSize: 12, color: C.muted }}>Pathologie</span><div style={{ fontWeight: 600, color: C.text }}>{p.pathologie}</div></div>}
          </div>
        )}
        {onglet === 'bilans' && (
          <div>
            {sortedBilans.length === 0 ? <div style={{ color: C.muted, textAlign: 'center', padding: 30 }}>Aucun bilan</div> :
              sortedBilans.map((b, i) => (
                <div key={b.id} onClick={() => setBilanDetail(b)}
                  style={{ ...card, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: C.text }}>{b.type === 'initial' ? 'Bilan initial' : `Bilan T${b.trimestre}`}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>{new Date(b.date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {i === 0 && <span style={{ background: '#E8F8F8', color: C.primary, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>Dernier</span>}
                    <i className="ti ti-chevron-right" style={{ fontSize: 16, color: '#D0DCDC' }} />
                  </div>
                </div>
              ))}
          </div>
        )}
        {onglet === 'journal' && (
          <div>
            {notes.length === 0 ? <div style={{ color: C.muted, textAlign: 'center', padding: 30 }}>Aucune note</div> :
              notes.slice(0, 10).map(n => {
                const r = n.ressenti ? RESSENTI_CONFIG[n.ressenti] : null;
                return (
                  <div key={n.id} style={card}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      {r && <span>{r.emoji}</span>}
                      <span style={{ fontSize: 12, color: C.muted }}>{formatDateCourt(n.date)} · {n.heureDebut}</span>
                      {r && <span style={{ fontSize: 11, fontWeight: 700, color: r.color }}>{r.label}</span>}
                    </div>
                    {n.note && <div style={{ fontSize: 13, color: C.text }}>"{n.note}"</div>}
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── App Mobile principal ──────────────────────────────────────────────────────

interface Props { onLogout: () => void }

export default function AppMobile({ onLogout }: Props) {
  const [onglet, setOnglet] = useState('aujourdhui');
  const [ficheId, setFicheId] = useState<string | null>(null);

  if (ficheId) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: C.bg, fontFamily: "'Nunito',sans-serif" }}>
        <FichePatientMobile participantId={ficheId} onBack={() => setFicheId(null)} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', fontFamily: "'Nunito',sans-serif" }}>
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 80 }}>
        {onglet === 'aujourdhui' && <EcranAujourdhui onVoirFiche={setFicheId} />}
        {onglet === 'patients'   && <EcranPatients onVoirFiche={setFicheId} />}
        {onglet === 'saisie'     && <EcranSaisie />}
        {onglet === 'tournee'    && <EcranTournee />}
        {onglet === 'plus'       && <EcranPlus onLogout={onLogout} />}
      </div>
      <BottomNav onglet={onglet} onChange={setOnglet} />
    </div>
  );
}
