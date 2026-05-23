import type { Bilan, Participant, NotesBilan } from '../../types';
import { NORMES_SCORING, calculerNote } from '../../data/norms';

// ─── Utilitaires ──────────────────────────────────────────────────────────────

function fmt(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function age(dn: string) {
  const t = new Date(), b = new Date(dn);
  let a = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth()) a--;
  return a;
}

// ─── Calcul notes depuis valeurs brutes ───────────────────────────────────────

export function calculerNotesAuto(bilan: Bilan): NotesBilan {
  const n: NotesBilan = {};
  const { equilibre: eq, chairStand30: cs, handGrip: hg, tug3m, souplesse, tm6, memoire } = bilan;

  const eqVals = [eq.droite, eq.gauche].filter((v): v is number => v !== null);
  if (eqVals.length) n.equilibre = calculerNote(eqVals.reduce((s, v) => s + v, 0) / eqVals.length, NORMES_SCORING.equilibreUnipodal);
  if (cs !== null) n.force = calculerNote(cs, NORMES_SCORING.chairStand30);
  const hgVals = [hg.droite, hg.gauche].filter((v): v is number => v !== null);
  if (hgVals.length) n.handGrip = calculerNote(hgVals.reduce((s, v) => s + v, 0) / hgVals.length, NORMES_SCORING.handGrip);
  if (tug3m !== null) n.mobilite = calculerNote(tug3m, NORMES_SCORING.tug3m);
  if (souplesse.valeur !== null) n.souplesse = calculerNote(souplesse.valeur, NORMES_SCORING.souplesse);
  if (tm6.distanceMetres !== null) n.endurance = calculerNote(tm6.distanceMetres, NORMES_SCORING.tm6Distance);
  const mi = memoire.scoreImmediat, md = memoire.scoreDiffere;
  if (mi !== null || md !== null) n.memoire = calculerNote((mi ?? 0) + (md ?? 0), NORMES_SCORING.memoire);
  return n;
}

// ─── Composants internes ──────────────────────────────────────────────────────

function CelluleTest({ titre, unite, children }: { titre: string; unite?: string; children?: React.ReactNode }) {
  return (
    <div style={{ border: '1.5px solid #D0D8E8', borderRadius: 6, overflow: 'hidden' }}>
      <div style={{ background: '#E8EDF5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 10px' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#1A5F9E' }}>{titre}</span>
        {unite && <span style={{ fontWeight: 700, fontSize: 13, color: '#0D2B4B' }}>{unite}</span>}
      </div>
      {children && <div style={{ padding: '6px 10px', fontSize: 12, color: '#333', background: 'white' }}>{children}</div>}
    </div>
  );
}

const NOTE_COLOR = (n: number) => n <= 2 ? '#EF4444' : n === 3 ? '#F59E0B' : '#22C55E';

function BarreNote({ label, note }: { label: string; note: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 5, gap: 8 }}>
      <div style={{ width: 75, fontSize: 11, color: '#333', fontWeight: 500, textAlign: 'right', flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 20, background: '#E8EDF5', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${(note / 5) * 100}%`, height: '100%', background: NOTE_COLOR(note), borderRadius: 3 }} />
      </div>
      <div style={{ width: 20, fontSize: 11, fontWeight: 700, color: '#333' }}>{note}</div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

interface Props {
  bilan: Bilan;
  participant: Participant;
  notes: NotesBilan;
  settings: { email: string; telephone: string; logoUrl: string };
}

export default function FicheBilanPDF({ bilan, participant, notes, settings }: Props) {
  const { equilibre: eq, chairStand30: cs, handGrip: hg, tug3m, souplesse, tm6, memoire } = bilan;
  const sVal = souplesse.valeur !== null ? (souplesse.valeur >= 0 ? '+' : '') + souplesse.valeur : '—';

  const ALL_BARRES: { label: string; key: keyof NotesBilan }[] = [
    { label: 'Souplesse', key: 'souplesse' },
    { label: 'Mémoire',   key: 'memoire'   },
    { label: 'Mobilité',  key: 'mobilite'  },
    { label: 'Équilibre', key: 'equilibre' },
    { label: 'Endurance', key: 'endurance' },
    { label: 'Force',     key: 'force'     },
  ];
  const barres = ALL_BARRES
    .filter(b => notes[b.key] !== undefined)
    .map(b => ({ label: b.label, key: b.key, note: notes[b.key] as number }));

  return (
    <div style={{ width: 794, fontFamily: 'Arial, sans-serif', fontSize: 12, color: '#0D2B4B', background: 'white', padding: '28px 32px', boxSizing: 'border-box' }}>

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#1A5F9E', lineHeight: 1.1, letterSpacing: '-0.5px' }}>FICHE BILAN</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#1A5F9E', lineHeight: 1.1, marginBottom: 4 }}>
            {bilan.type === 'initial' ? 'PREMIER RENDEZ-VOUS' : 'BILAN TRIMESTRIEL'}
          </div>
          <div style={{ fontSize: 11, color: '#888', fontStyle: 'italic' }}>Mouv'APA – Activité Physique Adaptée</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {settings.logoUrl
            ? <img src={settings.logoUrl} style={{ height: 52, objectFit: 'contain' }} alt="Logo" />
            : <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#1A5F9E', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 900, fontSize: 18 }}>M</div>
          }
          <div style={{ fontSize: 13, color: '#333' }}>Date : {fmt(bilan.date)}</div>
          <div style={{ fontSize: 12, color: '#555' }}>{participant.prenom} {participant.nom} · {age(participant.dateNaissance)} ans</div>
        </div>
      </div>

      {/* Ligne bleue */}
      <div style={{ height: 2, background: '#1A5F9E', marginBottom: 20 }} />

      {/* RÉSULTATS DES TESTS */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#1A5F9E', textAlign: 'right', letterSpacing: '0.05em', marginBottom: 10 }}>RÉSULTATS DES TESTS</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <CelluleTest titre="Force" unite={`${cs ?? '—'} Reps`}>
            <div style={{ display: 'flex', gap: 16 }}>
              <span>Main D : <strong>{hg.droite ?? '—'} Kg</strong></span>
              <span>Main G : <strong>{hg.gauche ?? '—'} Kg</strong></span>
            </div>
          </CelluleTest>

          <CelluleTest titre="Endurance" unite={`${tm6.distanceMetres ?? '—'} M`}>
            <div>
              <div style={{ fontSize: 11 }}>{tm6.spo2Avant ?? '—'} / {tm6.spo2Apres ?? '—'} / {tm6.spo22min ?? '—'} O2</div>
              <div style={{ fontSize: 11 }}>{tm6.fcAvant ?? '—'} / {tm6.fcApres ?? '—'} / {tm6.fc2min ?? '—'} Bpm</div>
            </div>
          </CelluleTest>

          <CelluleTest titre="Souplesse" unite={`${sVal} Cm`} />
          <CelluleTest titre="Mobilité" unite={`${tug3m ?? '—'} Sec`} />

          <CelluleTest titre="Équilibre">
            <div style={{ display: 'flex', gap: 16 }}>
              <span>Jambe D : <strong>{eq.droite ?? '—'} Sec</strong></span>
              <span>Jambe G : <strong>{eq.gauche ?? '—'} Sec</strong></span>
            </div>
          </CelluleTest>

          <CelluleTest titre="Mémoire">
            <div>
              <span><strong>{memoire.scoreImmediat ?? '—'} / 5</strong> Mots</span>
              <span style={{ margin: '0 8px' }}>10 Min :</span>
              <span><strong>{memoire.scoreDiffere ?? '—'} / 5</strong> Mots</span>
            </div>
          </CelluleTest>
        </div>
      </div>

      {/* GRAPHIQUES */}
      {barres.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#1A5F9E', textAlign: 'center', letterSpacing: '0.08em', marginBottom: 12 }}>GRAPHIQUES</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 83, paddingRight: 28, marginBottom: 4, fontSize: 10, color: '#999' }}>
            {[0,1,2,3,4,5].map(v => <span key={v}>{v}</span>)}
          </div>
          {barres.map(({ label, key }) => (
            <BarreNote key={label} label={label} note={(notes[key] as number)!} />
          ))}
          <div style={{ textAlign: 'right', fontSize: 10, color: '#555', fontStyle: 'italic', marginTop: 8 }}>
            1/5 = Faible — 5/5 = Très Bon
          </div>
        </div>
      )}

      {/* INTERPRÉTATION */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#1A5F9E', letterSpacing: '0.05em', marginBottom: 8 }}>INTERPRÉTATION :</div>
        <div style={{ border: '1px solid #D0D8E8', borderRadius: 6, padding: '10px 14px', minHeight: 80, fontSize: 12, color: '#333', lineHeight: 1.65, textAlign: 'justify', background: 'white' }}>
          {bilan.interpretationIA?.textePro || bilan.notesProfessionnelles || '—'}
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ borderTop: '1.5px solid #1A5F9E', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#555' }}>
        <span>{settings.email}</span>
        <span>{settings.telephone}</span>
        <span>www.mouvapa.com</span>
      </div>
    </div>
  );
}
