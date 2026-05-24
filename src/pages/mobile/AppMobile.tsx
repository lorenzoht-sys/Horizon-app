import { useState } from 'react';
import toast from 'react-hot-toast';
import { useParticipants } from '../../hooks/useParticipants';
import { useAgenda } from '../../hooks/useAgenda';
import { useJournalSeance } from '../../hooks/useJournalSeance';
import { useContrats } from '../../hooks/useContrats';
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
  dark:    '#0D2B2B',
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

// ── Composants UI réutilisables ───────────────────────────────────────────────

function CarteStatMobile({ icon, label, valeur }: { icon: string; label: string; valeur: number }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '12px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>{valeur}</div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function BoutonActionMobile({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 14,
      padding: '13px 16px', background: 'white', border: `1px solid ${C.border}`,
      borderRadius: 12, marginBottom: 8, cursor: 'pointer', textAlign: 'left',
    }}>
      <span style={{ fontSize: 22 }}>{icon}</span>
      <span style={{ fontSize: 15, fontWeight: 600, color: C.text, flex: 1 }}>{label}</span>
      <i className="ti ti-chevron-right" style={{ fontSize: 16, color: '#D0DCDC' }} />
    </button>
  );
}

function SectionMobile({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#5C7A7A', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, paddingLeft: 4 }}>
        {titre}
      </div>
      <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

function ItemMobile({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 14,
      padding: '13px 16px', background: 'none', border: 'none',
      borderBottom: `1px solid #F4FAFA`, cursor: 'pointer', textAlign: 'left',
    }}>
      <i className={`ti ${icon}`} style={{ fontSize: 20, color: C.primary }} aria-hidden="true" />
      <span style={{ fontSize: 15, fontWeight: 500, color: C.text, flex: 1 }}>{label}</span>
      <i className="ti ti-chevron-right" style={{ fontSize: 16, color: '#D0DCDC' }} aria-hidden="true" />
    </button>
  );
}

function InfoSection({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '14px 16px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
        {titre}
      </div>
      {children}
    </div>
  );
}

function InfoLigne({ icon, texte }: { icon: string; texte: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: '#4A6080', marginBottom: 6 }}>
      <i className={`ti ${icon}`} style={{ fontSize: 16, color: C.primary, flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
      <span>{texte}</span>
    </div>
  );
}

function BoutonRapide({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      padding: '8px 4px', background: C.bg, border: `1px solid ${C.border}`,
      borderRadius: 10, cursor: 'pointer',
    }}>
      <i className={`ti ${icon}`} style={{ fontSize: 18, color: C.primary }} aria-hidden="true" />
      <span style={{ fontSize: 10, color: '#5C7A7A', fontWeight: 600 }}>{label}</span>
    </button>
  );
}

// ── Bottom Nav ────────────────────────────────────────────────────────────────

const NAV = [
  { id: 'aujourdhui', icon: 'ti-home', label: 'Accueil' },
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

function EcranAujourdhui({ onVoirFiche, onNaviguerSaisie }: { onVoirFiche: (id: string) => void; onNaviguerSaisie: () => void }) {
  const { participants } = useParticipants();
  const { seances: allSeances, seancesDuJour, changerStatut } = useAgenda();
  const { contratsARenouveler } = useContrats();
  const today = new Date().toISOString().slice(0, 10);
  const seances = seancesDuJour(today);
  const settings = (() => { try { return JSON.parse(localStorage.getItem('settings_praticien') || '{}'); } catch { return {}; } })();
  const prenom = settings.prenom || 'Pierre';

  // Séances de la semaine courante
  const now = new Date();
  const lundiOffset = now.getDay() === 0 ? -6 : 1 - now.getDay();
  const lundi = new Date(now); lundi.setDate(now.getDate() + lundiOffset);
  const dim = new Date(lundi); dim.setDate(lundi.getDate() + 6);
  const seancesSemaine = allSeances.filter(s =>
    s.date >= lundi.toISOString().slice(0, 10) &&
    s.date <= dim.toISOString().slice(0, 10) &&
    s.statut === 'planifiee'
  );

  // Patients sans bilan dans les 90 derniers jours
  const il90j = new Date(); il90j.setDate(il90j.getDate() - 90);
  const il90jFmt = il90j.toISOString().slice(0, 10);
  const bilansAFaire = participants.filter(p =>
    p.bilans.length === 0 || p.bilans.every(b => b.date < il90jFmt)
  );

  return (
    <div>
      <div style={{ background: C.dark, paddingTop: 'calc(16px + env(safe-area-inset-top))', paddingLeft: 16, paddingRight: 16, paddingBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <img src="/logo-horizon.png.png?v=2" alt="Horizon" style={{ height: 24 }} onError={e => { (e.target as HTMLImageElement).src = '/logo-horizon.svg'; }} />
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
          <div>
            {/* Stats rapides */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              <CarteStatMobile icon="👥" label="Patients" valeur={participants.length} />
              <CarteStatMobile icon="📋" label="Bilans à faire" valeur={bilansAFaire.length} />
              <CarteStatMobile icon="📅" label="Séances semaine" valeur={seancesSemaine.length} />
              <CarteStatMobile icon="⏰" label="Contrats fin proche" valeur={contratsARenouveler.length} />
            </div>

            <div style={{ textAlign: 'center', padding: '16px 0 20px', color: C.muted, fontSize: 14 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🌅</div>
              Aucune séance aujourd'hui
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#5C7A7A', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Actions rapides
              </div>
              <BoutonActionMobile icon="👤" label="Nouveau patient" onClick={onNaviguerSaisie} />
              <BoutonActionMobile icon="📋" label="Nouveau bilan" onClick={onNaviguerSaisie} />
            </div>

            {contratsARenouveler.length > 0 && (
              <div style={{ marginTop: 16, background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 12, padding: '12px 14px', fontSize: 13, color: '#92400E', fontWeight: 600 }}>
                ⏰ {contratsARenouveler.length} contrat{contratsARenouveler.length > 1 ? 's' : ''} à renouveler bientôt
              </div>
            )}
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
      <div style={{ background: 'white', paddingTop: 'calc(16px + env(safe-area-inset-top))', paddingLeft: 16, paddingRight: 16, paddingBottom: 16, borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 10 }}>
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
                {(p.contexteClinic || p.pathologie) && (
                  <div style={{ fontSize: 11, color: '#5C7A7A', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
      <div style={{ background: 'white', paddingTop: 'calc(16px + env(safe-area-inset-top))', paddingLeft: 16, paddingRight: 16, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
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

// ── EcranSettings ─────────────────────────────────────────────────────────────

function EcranSettings({ onBack }: { onBack: () => void }) {
  const inp: React.CSSProperties = { width: '100%', padding: '12px 14px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 15, outline: 'none', marginBottom: 14, boxSizing: 'border-box', background: 'white' };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#5C7A7A', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 };

  const [form, setForm] = useState(() => {
    const defaults = { prenom: '', nom: '', titre: 'Enseignant en Activité Physique Adaptée', email: '', telephone: '', siret: '', numeroSAP: '', villeSignature: '', tarifHoraire: '45' };
    try { return { ...defaults, ...JSON.parse(localStorage.getItem('settings_praticien') || '{}') }; }
    catch { return defaults; }
  });
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('anthropic_api_key') ?? '');
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  function set(field: string, value: string) { setForm((f: Record<string, string>) => ({ ...f, [field]: value })); }

  function sauvegarder() {
    if (!form.prenom.trim() || !form.nom.trim()) { toast.error('Prénom et nom requis'); return; }
    const existing = (() => { try { return JSON.parse(localStorage.getItem('settings_praticien') || '{}'); } catch { return {}; } })();
    localStorage.setItem('settings_praticien', JSON.stringify({ ...existing, ...form }));
    if (apiKey.trim()) localStorage.setItem('anthropic_api_key', apiKey.trim());
    else localStorage.removeItem('anthropic_api_key');
    toast.success('Paramètres enregistrés ✅');
    onBack();
  }

  function reinitialiserDonnees() {
    localStorage.setItem('mouvtrack_demo_cleared', '1');
    ['mouvtrack_participants', 'mouvtrack_seances', 'mouvtrack_contrats',
     'mouvtrack_zones', 'notes_seances', 'mouvtrack_indispos_pierre',
     'mouvtrack_question_templates'].forEach(k => localStorage.removeItem(k));
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('brouillon_bilan_') || key.startsWith('bilan_en_cours_'))) toRemove.push(key);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
    toast.success('Données supprimées — rechargement…');
    setTimeout(() => window.location.reload(), 800);
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <div style={{ background: C.dark, paddingTop: 'calc(16px + env(safe-area-inset-top))', paddingLeft: 16, paddingRight: 16, paddingBottom: 16 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 12 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 20, color: 'rgba(255,255,255,0.7)' }} aria-hidden="true" />
        </button>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>Paramètres</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>Profil et informations professionnelles</div>
      </div>

      <div style={{ padding: 16, paddingBottom: 40 }}>

        <InfoSection titre="Mon profil">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 0 }}>
            <div>
              <label style={lbl}>Prénom *</label>
              <input value={form.prenom} onChange={e => set('prenom', e.target.value)} placeholder="Pierre" style={inp} />
            </div>
            <div>
              <label style={lbl}>Nom *</label>
              <input value={form.nom} onChange={e => set('nom', e.target.value)} placeholder="Clavier" style={inp} />
            </div>
          </div>
          <label style={lbl}>Titre professionnel</label>
          <input value={form.titre} onChange={e => set('titre', e.target.value)} placeholder="Enseignant APA" style={inp} />
          <label style={lbl}>Email</label>
          <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="pierre@mouvapa.com" style={inp} />
          <label style={lbl}>Téléphone</label>
          <input type="tel" value={form.telephone} onChange={e => set('telephone', e.target.value)} placeholder="06 12 34 56 78" style={{ ...inp, marginBottom: 0 }} />
        </InfoSection>

        <div style={{ height: 12 }} />

        <InfoSection titre="Informations légales">
          <label style={lbl}>Numéro SIRET</label>
          <input value={form.siret} onChange={e => set('siret', e.target.value)} placeholder="XXX XXX XXX XXXXX" style={inp} />
          <label style={lbl}>Numéro SAP</label>
          <input value={form.numeroSAP} onChange={e => set('numeroSAP', e.target.value)} placeholder="SAP XXXXXXXXX" style={inp} />
          <label style={lbl}>Ville de signature</label>
          <input value={form.villeSignature} onChange={e => set('villeSignature', e.target.value)} placeholder="Paris" style={inp} />
          <label style={lbl}>Tarif horaire (€)</label>
          <input type="number" value={form.tarifHoraire} onChange={e => set('tarifHoraire', e.target.value)} placeholder="45" style={{ ...inp, marginBottom: 0 }} />
        </InfoSection>

        <div style={{ height: 12 }} />

        <InfoSection titre="🧠 Clé API Claude (IA)">
          <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400E', marginBottom: 10 }}>
            Nécessaire pour les interprétations automatiques des bilans.
          </div>
          <label style={lbl}>Clé API (sk-ant-...)</label>
          <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-ant-api03-..." style={{ ...inp, fontFamily: 'monospace', marginBottom: 0 }} />
          {apiKey && <div style={{ fontSize: 12, color: '#1D9E75', marginTop: 6 }}>✓ Clé configurée</div>}
        </InfoSection>

        <button onClick={sauvegarder} style={{ width: '100%', padding: 16, background: C.primary, color: 'white', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 16 }}>
          💾 Enregistrer
        </button>

        {/* Zone danger */}
        <div style={{ marginTop: 28, borderTop: `1px solid ${C.border}`, paddingTop: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#E85050', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Zone danger
          </div>
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #FECACA', padding: '14px 16px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>
              🗑️ Supprimer les données patients
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, lineHeight: 1.5 }}>
              Supprime tous les patients, bilans, contrats et séances. Les exercices et paramètres sont conservés.
            </div>
            <button onClick={() => setShowConfirmReset(true)} style={{ padding: '10px 16px', background: 'none', border: '1px solid #E85050', borderRadius: 10, color: '#E85050', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Réinitialiser les données
            </button>
          </div>
        </div>
      </div>

      {/* Modal de confirmation */}
      {showConfirmReset && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 340 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 10 }}>
              ⚠️ Confirmer la suppression
            </div>
            <p style={{ fontSize: 14, color: '#4A6080', lineHeight: 1.6, marginBottom: 20 }}>
              Tous les <strong>patients, bilans, contrats et séances</strong> seront supprimés.<br />
              Les exercices et paramètres sont conservés.<br />
              <strong style={{ color: '#E85050' }}>Cette action est irréversible.</strong>
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowConfirmReset(false)} style={{ flex: 1, padding: '12px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, fontWeight: 600, color: C.muted, cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={reinitialiserDonnees} style={{ flex: 1, padding: '12px', background: '#E85050', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, color: 'white', cursor: 'pointer' }}>
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── EcranPlus ─────────────────────────────────────────────────────────────────

function EcranPlus({ onLogout, onOuvrirSettings, onNaviguerOnglet }: { onLogout: () => void; onOuvrirSettings: () => void; onNaviguerOnglet: (id: string) => void }) {
  const settings = (() => { try { return JSON.parse(localStorage.getItem('settings_praticien') || '{}'); } catch { return {}; } })();
  const initiales = `${(settings.prenom || 'P')[0]}${(settings.nom || '')[0] || ''}`;

  return (
    <div style={{ padding: 16 }}>

      {/* Profil praticien */}
      <div style={{ background: C.dark, borderRadius: 14, padding: '16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: 'white', flexShrink: 0 }}>
          {initiales}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>
            {settings.prenom || 'Praticien'}{settings.nom ? ` ${settings.nom}` : ''}
          </div>
          {settings.titre && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{settings.titre}</div>}
        </div>
      </div>

      {/* Section Mon activité */}
      <SectionMobile titre="Mon activité">
        <ItemMobile icon="ti-route" label="Tournée du jour" onClick={() => onNaviguerOnglet('tournee')} />
        <ItemMobile icon="ti-calendar" label="Agenda complet" onClick={() => toast('Accessible depuis l\'ordinateur 💻', { icon: 'ℹ️' })} />
        <ItemMobile icon="ti-map-pin" label="Carte patients" onClick={() => toast('Accessible depuis l\'ordinateur 💻', { icon: 'ℹ️' })} />
      </SectionMobile>

      {/* Section Contenu */}
      <SectionMobile titre="Contenu">
        <ItemMobile icon="ti-dumbbell" label="Bibliothèque exercices" onClick={() => toast('Accessible depuis l\'ordinateur 💻', { icon: 'ℹ️' })} />
      </SectionMobile>

      {/* Section Compte */}
      <SectionMobile titre="Compte">
        <ItemMobile icon="ti-settings" label="Paramètres" onClick={onOuvrirSettings} />
      </SectionMobile>

      {/* Déconnexion */}
      <button onClick={onLogout} style={{
        width: '100%', padding: '14px 16px', marginTop: 8,
        background: 'none', border: `1px solid ${C.border}`,
        borderRadius: 12, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 14,
        color: '#E85050', fontSize: 15,
      }}>
        <i className="ti ti-logout" style={{ fontSize: 20 }} aria-hidden="true" />
        Déconnexion
      </button>

      <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: C.muted }}>
        Horizon v1.0
      </div>
    </div>
  );
}

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
      <div style={{ background: C.dark, paddingTop: 'calc(16px + env(safe-area-inset-top))', paddingLeft: 16, paddingRight: 16, paddingBottom: 16 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 12 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 20, color: 'rgba(255,255,255,0.7)' }} />
        </button>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>
          {bilan.type === 'initial' ? 'Bilan initial' : `Bilan T${bilan.trimestre}`}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>{dateLabel}</div>
      </div>

      <div style={{ padding: 16 }}>

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

        {bilan.notesProfessionnelles && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Notes professionnelles</div>
            <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '12px 14px', marginBottom: 16, fontSize: 14, color: C.text, lineHeight: 1.6 }}>
              {bilan.notesProfessionnelles}
            </div>
          </>
        )}

        {bilan.objectifsSuivants && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Objectifs suivants</div>
            <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '12px 14px', marginBottom: 16, fontSize: 14, color: C.text, lineHeight: 1.6 }}>
              {bilan.objectifsSuivants}
            </div>
          </>
        )}

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
  const { seances } = useAgenda();
  const { contratActifDeParticipant } = useContrats();
  const p = participants.find(x => x.id === participantId);
  const [onglet, setOnglet] = useState('infos');
  const [bilanDetail, setBilanDetail] = useState<import('../../types').Bilan | null>(null);
  if (!p) return null;
  if (bilanDetail) return <DetailBilanMobile bilan={bilanDetail} onBack={() => setBilanDetail(null)} />;

  const notes = notesParPatient(p.id);
  const sortedBilans = [...p.bilans].sort((a, b) => b.date.localeCompare(a.date));
  const contrat = contratActifDeParticipant(participantId);
  const today = new Date().toISOString().slice(0, 10);
  const prochaineSeance = seances
    .filter(s => s.participantId === participantId && s.date >= today && s.statut === 'planifiee')
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  const ONGLETS = [
    { id: 'infos',   label: 'Infos' },
    { id: 'sante',   label: 'Santé' },
    { id: 'bilans',  label: 'Bilans' },
    { id: 'journal', label: 'Journal' },
  ];

  return (
    <div>
      <div style={{ background: C.dark, paddingTop: 'calc(16px + env(safe-area-inset-top))', paddingLeft: 16, paddingRight: 16, paddingBottom: 16 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', marginBottom: 12, padding: 0 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 20, color: 'rgba(255,255,255,0.7)' }} aria-hidden="true" />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: 'white', flexShrink: 0 }}>
            {p.prenom[0]}{p.nom[0]}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>{p.prenom} {p.nom}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
              {calcAge(p.dateNaissance)} ans
              {p.taille ? ` · ${p.taille} cm` : ''}
              {p.poids ? ` · ${p.poids} kg` : ''}
            </div>
            {(p.contexteClinic || p.pathologie) && (
              <div style={{ marginTop: 6, background: 'rgba(43,191,191,0.2)', border: '1px solid rgba(43,191,191,0.3)', borderRadius: 20, padding: '2px 10px', fontSize: 11, color: C.primary, display: 'inline-block' }}>
                {p.contexteClinic || p.pathologie}
              </div>
            )}
          </div>
        </div>

        {/* Stats rapides */}
        <div style={{ display: 'flex', gap: 8 }}>
          {contrat && (
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>{contrat.nombreSeancesRealisees}/{contrat.nombreSeancesTotal}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>séances</div>
            </div>
          )}
          {sortedBilans[0] && (
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>{formatDateCourt(sortedBilans[0].date)}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>dernier bilan</div>
            </div>
          )}
          {prochaineSeance && (
            <div style={{ flex: 1, background: 'rgba(43,191,191,0.2)', borderRadius: 10, padding: '8px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.primary }}>{prochaineSeance.heureDebut}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{formatDateCourt(prochaineSeance.date)}</div>
            </div>
          )}
        </div>
      </div>

      {/* Actions rapides */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', background: 'white', borderBottom: `1px solid ${C.border}` }}>
        <BoutonRapide icon="ti-clipboard" label="Bilan" onClick={() => {}} />
        <BoutonRapide icon="ti-notes" label="Note" onClick={() => {}} />
        {p.adresseRue && (
          <BoutonRapide icon="ti-map-pin" label="Maps" onClick={() => ouvrirMaps(`${p.adresseRue} ${p.adresseVille || ''}`)} />
        )}
      </div>

      {/* Onglets */}
      <div style={{ display: 'flex', background: 'white', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 10 }}>
        {ONGLETS.map(o => (
          <button key={o.id} onClick={() => setOnglet(o.id)}
            style={{ flex: 1, padding: '11px 2px', background: 'none', border: 'none', borderBottom: `2px solid ${onglet === o.id ? C.primary : 'transparent'}`, color: onglet === o.id ? C.primary : C.muted, fontWeight: onglet === o.id ? 700 : 400, fontSize: 12, cursor: 'pointer' }}>
            {o.label}
          </button>
        ))}
      </div>

      <div style={{ padding: 16 }}>

        {onglet === 'infos' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <InfoSection titre="Coordonnées">
              {p.telephone && <InfoLigne icon="ti-phone" texte={p.telephone} />}
              {p.email && <InfoLigne icon="ti-mail" texte={p.email} />}
              {p.adresseRue && <InfoLigne icon="ti-map-pin" texte={`${p.adresseRue}, ${p.adresseCodePostal || ''} ${p.adresseVille || ''}`} />}
            </InfoSection>

            {contrat && (
              <InfoSection titre="Contrat actif">
                <InfoLigne icon="ti-calendar" texte={`${contrat.joursFixe.join(', ')} à ${contrat.heureDebut} · ${contrat.dureeMinutes} min`} />
                <InfoLigne icon="ti-clock" texte={`${new Date(contrat.dateDebut + 'T12:00').toLocaleDateString('fr-FR')} → ${new Date(contrat.dateFin + 'T12:00').toLocaleDateString('fr-FR')}`} />
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: C.muted }}>Progression</span>
                    <span style={{ fontWeight: 700, color: C.text }}>{contrat.nombreSeancesRealisees}/{contrat.nombreSeancesTotal}</span>
                  </div>
                  <div style={{ height: 5, background: C.border, borderRadius: 3 }}>
                    <div style={{ height: '100%', width: `${(contrat.nombreSeancesRealisees / contrat.nombreSeancesTotal) * 100}%`, background: C.primary, borderRadius: 3 }} />
                  </div>
                </div>
              </InfoSection>
            )}

            {(p.activitesSouhaitees?.length || p.objectifsPatient) && (
              <InfoSection titre="Objectifs">
                {p.activitesSouhaitees?.length ? (
                  <div style={{ fontSize: 13, color: '#4A6080' }}>🎯 {p.activitesSouhaitees.join(' · ')}</div>
                ) : null}
                {p.objectifsPatient && (
                  <div style={{ fontSize: 13, color: '#4A6080', marginTop: 4, fontStyle: 'italic' }}>"{p.objectifsPatient}"</div>
                )}
              </InfoSection>
            )}

            {p.pathologie && !p.contexteClinic && (
              <InfoSection titre="Pathologie">
                <div style={{ fontSize: 13, color: '#4A6080' }}>{p.pathologie}</div>
              </InfoSection>
            )}
          </div>
        )}

        {onglet === 'sante' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {p.antecedentsMedicaux ? (
              <InfoSection titre="Antécédents médicaux">
                <div style={{ fontSize: 13, color: '#4A6080', lineHeight: 1.6 }}>{p.antecedentsMedicaux}</div>
              </InfoSection>
            ) : null}
            {p.antecedentsChirurgicaux ? (
              <InfoSection titre="Antécédents chirurgicaux">
                <div style={{ fontSize: 13, color: '#4A6080', lineHeight: 1.6 }}>{p.antecedentsChirurgicaux}</div>
              </InfoSection>
            ) : null}
            {p.allergies ? (
              <InfoSection titre="Allergies">
                <div style={{ fontSize: 13, color: '#4A6080' }}>{p.allergies}</div>
              </InfoSection>
            ) : null}
            {!p.antecedentsMedicaux && !p.antecedentsChirurgicaux && !p.allergies && (
              <div style={{ color: C.muted, textAlign: 'center', padding: 30 }}>Aucune information de santé renseignée</div>
            )}
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
  const [showSettings, setShowSettings] = useState(false);

  const shell: React.CSSProperties = { maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: C.bg, fontFamily: "'Nunito',sans-serif" };

  if (showSettings) {
    return <div style={shell}><EcranSettings onBack={() => setShowSettings(false)} /></div>;
  }

  if (ficheId) {
    return <div style={shell}><FichePatientMobile participantId={ficheId} onBack={() => setFicheId(null)} /></div>;
  }

  return (
    <div style={{ ...shell, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 80 }}>
        {onglet === 'aujourdhui' && <EcranAujourdhui onVoirFiche={setFicheId} onNaviguerSaisie={() => setOnglet('saisie')} />}
        {onglet === 'patients'   && <EcranPatients onVoirFiche={setFicheId} />}
        {onglet === 'saisie'     && <EcranSaisie />}
        {onglet === 'tournee'    && <EcranTournee />}
        {onglet === 'plus'       && <EcranPlus onLogout={onLogout} onOuvrirSettings={() => setShowSettings(true)} onNaviguerOnglet={setOnglet} />}
      </div>
      <BottomNav onglet={onglet} onChange={setOnglet} />
    </div>
  );
}
