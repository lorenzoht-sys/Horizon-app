import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Navigate } from 'react-router-dom';
import type { Participant, Seance, Bilan, Programme, ProgrammeV2, ProgrammeSeanceV2, JourProgramme } from '../types';
import { JOURS_PROGRAMME } from '../types';
import { supabase } from '../lib/supabase';
import { dbToParticipant, dbToBilan, dbToSeance, dbToProgramme } from '../lib/mappers';
import { loadExercices } from '../data/exercices';
import { exportProgrammePDF } from '../utils/exportPDF';

// ── Helpers ───────────────────────────────────────────────────────────────────

function calculerCode(prenom: string): string {
  return prenom
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '')
    + '2026';
}

function fmt(iso: string, options?: Intl.DateTimeFormatOptions): string {
  return new Date(iso + 'T12:00').toLocaleDateString('fr-FR', options ?? {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

function fmtCourt(iso: string): string {
  return new Date(iso + 'T12:00').toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function fmtMoisAnnee(iso: string): string {
  return new Date(iso + 'T12:00').toLocaleDateString('fr-FR', {
    month: 'long', year: 'numeric',
  });
}

function fmtHeure(h: string): string { return h.slice(0, 5); }

function loadPraticien() {
  try {
    const s = JSON.parse(localStorage.getItem('settings_praticien') ?? '{}');
    const nom = [s.prenom, s.nom].filter(Boolean).join(' ') || 'votre enseignant APA';
    const societe = s.societe || '';
    return { nom, societe };
  } catch { return { nom: 'votre enseignant APA', societe: '' }; }
}

// ── Couleurs ──────────────────────────────────────────────────────────────────

const C = {
  dark:    'var(--color-ink)',
  teal:    'var(--color-teal)',
  bg:      'var(--color-bg)',
  border:  '#E0EEEE',
  muted:   '#8FA8A8',
  text:    '#1A3A3A',
  white:   'white',
  green:   '#16A34A',
  orange:  '#EA580C',
  gray:    '#94A3B8',
};

// ── Bannière PWA ──────────────────────────────────────────────────────────────

function BannierePWA() {
  const [visible, setVisible] = useState(() => {
    return !sessionStorage.getItem('pwa_dismissed');
  });
  const [prompt, setPrompt] = useState<{ prompt: () => void; userChoice: Promise<{ outcome: string }> } | null>(null);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
  const isAndroid = /Android/.test(navigator.userAgent);

  useEffect(() => {
    const onP = (e: Event) => {
      e.preventDefault();
      setPrompt(e as unknown as { prompt: () => void; userChoice: Promise<{ outcome: string }> });
    };
    window.addEventListener('beforeinstallprompt', onP);
    return () => window.removeEventListener('beforeinstallprompt', onP);
  }, []);

  if (!visible) return null;

  return (
    <div style={{
      margin: '12px 16px',
      background: 'white',
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: '14px 16px',
      position: 'relative',
    }}>
      <button onClick={() => { setVisible(false); sessionStorage.setItem('pwa_dismissed', '1'); }}
        style={{ position: 'absolute', top: 10, right: 12, background: 'none', border: 'none', fontSize: 20, color: C.muted, cursor: 'pointer' }}>×</button>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 4 }}>
        📱 Installer l'app sur votre téléphone
      </div>
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 10 }}>
        Accédez à votre espace en 1 clic depuis l'écran d'accueil.
      </div>
      {isIOS && (
        <div style={{ fontSize: 12, color: C.text, lineHeight: 1.7, background: C.bg, borderRadius: 8, padding: '10px 12px' }}>
          Sur iPhone → <strong>□↑</strong> puis <strong>"Sur l'écran d'accueil"</strong>
        </div>
      )}
      {isAndroid && prompt && (
        <button onClick={async () => {
          prompt.prompt();
          const r = await prompt.userChoice;
          if (r.outcome === 'accepted') { setVisible(false); sessionStorage.setItem('pwa_dismissed', '1'); }
          setPrompt(null);
        }} style={{ width: '100%', padding: '11px', background: C.teal, color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          Installer l'app
        </button>
      )}
    </div>
  );
}

// ── ÉCRAN 1 — Accueil ─────────────────────────────────────────────────────────

function EcranAccueil({
  participant, seances, bilans, programmes, programmesV2,
}: {
  participant: Participant;
  seances: Seance[];
  bilans: Bilan[];
  programmes: Programme[];
  programmesV2: ProgrammeV2[];
}) {
  const praticien = loadPraticien();
  const today = new Date().toISOString().split('T')[0];

  const realisees = seances.filter(s => s.statut === 'realisee');
  const prochaine = seances
    .filter(s => s.date >= today && s.statut === 'planifiee')
    .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;

  const sortedBilans = [...bilans].sort((a, b) => a.date.localeCompare(b.date));
  const premierBilan = sortedBilans[0] ?? null;
  const dernierBilan = sortedBilans[sortedBilans.length - 1] ?? null;

  // Programme actif (V2 en priorité, V1 en fallback)
  const progsV2Actifs = programmesV2.filter(p => p.actif);
  const programmeActif = programmes.filter(p => p.actif)
    .sort((a, b) => b.dateCreation.localeCompare(a.dateCreation))[0] ?? null;

  // Message personnalisé = messageClient du dernier bilan
  const messagePierre = dernierBilan?.messageClient;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Header de bienvenue */}
      <div style={{
        background: C.dark,
        borderRadius: 18,
        padding: '20px 18px',
      }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'white', marginBottom: 4 }}>
          Bonjour {participant.prenom} 👋
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
          Suivi par {praticien.nom}{praticien.societe ? ` · ${praticien.societe}` : ''}
        </div>
      </div>

      {/* Stats de suivi */}
      <div style={{
        background: 'white', border: `1px solid ${C.border}`,
        borderRadius: 18, padding: '18px 16px',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
          Votre suivi
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {premierBilan && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, color: C.text }}>📅 Suivi depuis</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>
                {fmtMoisAnnee(premierBilan.date)}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, color: C.text }}>🏃 Séances réalisées</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.teal }}>{realisees.length}</span>
          </div>
          {dernierBilan && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, color: C.text }}>📊 Dernier bilan</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>
                {fmtCourt(dernierBilan.date)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Prochain RDV */}
      {prochaine && (
        <div style={{
          background: C.dark, borderRadius: 18, padding: '18px 16px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.teal, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Votre prochain rendez-vous
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'white', textTransform: 'capitalize', marginBottom: 4 }}>
            📅 {fmt(prochaine.date)}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
            {fmtHeure(prochaine.heureDebut)} · {prochaine.dureeMinutes} min avec {praticien.nom}
          </div>
        </div>
      )}

      {/* Programmes en cours — V2 */}
      {progsV2Actifs.length > 0 && (
        <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 18, padding: '18px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
            Vos programmes
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {progsV2Actifs.map(prog => {
              const totalEx = prog.seances.reduce((sum, s) => sum + s.exercices.length, 0);
              const joursActifs = [...new Set(prog.planning.map(p => p.jour))];
              return (
                <div key={prog.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>🏋️ {prog.nom}</div>
                    {joursActifs.length > 0 && (
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                        {joursActifs.length} jour{joursActifs.length > 1 ? 's' : ''}/semaine · {totalEx} exercice{totalEx > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 11, background: 'rgba(43,191,191,0.12)', color: C.teal, fontWeight: 700, padding: '3px 8px', borderRadius: 8 }}>Actif</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Programme en cours — V1 fallback */}
      {progsV2Actifs.length === 0 && programmeActif && (
        <div style={{
          background: 'white', border: `1px solid ${C.border}`,
          borderRadius: 18, padding: '18px 16px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Votre programme actuel
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.dark, marginBottom: 4 }}>
            🏋️ {programmeActif.titre}
          </div>
          <div style={{ fontSize: 13, color: C.muted }}>
            {programmeActif.exercices.length} exercice{programmeActif.exercices.length > 1 ? 's' : ''} · Mis à jour le {fmtCourt(programmeActif.dateCreation)}
          </div>
        </div>
      )}

      {/* Message de Pierre */}
      {messagePierre && (
        <div style={{
          background: 'rgba(43,191,191,0.08)',
          border: '1px solid rgba(43,191,191,0.25)',
          borderRadius: 18, padding: '16px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.teal, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
            Message de {praticien.nom.split(' ')[0]}
          </div>
          <div style={{ fontSize: 14, color: C.text, lineHeight: 1.7, fontStyle: 'italic' }}>
            💬 "{messagePierre}"
          </div>
        </div>
      )}

      {/* État vide */}
      {realisees.length === 0 && bilans.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '40px 20px',
          background: 'white', borderRadius: 18, border: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🌱</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.dark, marginBottom: 6 }}>C'est parti !</div>
          <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>
            Vos séances et progrès apparaîtront ici<br />au fur et à mesure du suivi.
          </div>
        </div>
      )}

      <BannierePWA />
    </div>
  );
}

// ── ÉCRAN 2 — Mes progrès ─────────────────────────────────────────────────────

// Traduction des tests en langage patient
const TEST_LABELS_PATIENT: Record<string, { label: string; emoji: string; description: string }> = {
  equilibre:  { label: 'Équilibre sur un pied',        emoji: '🦵', description: 'Durée d\'équilibre unipodal' },
  chairStand: { label: 'Force pour se lever',          emoji: '💪', description: 'Lever de chaise 30 secondes' },
  handGrip:   { label: 'Force des mains',              emoji: '✊', description: 'Préhension de la main' },
  tug:        { label: 'Vitesse de marche',            emoji: '🚶', description: 'Test de marche et demi-tour' },
  tm6:        { label: 'Endurance à la marche',        emoji: '🏃', description: 'Distance de marche en 6 minutes' },
};

type ProgItem = {
  key: string;
  label: string;
  emoji: string;
  val0: number;
  val1: number;
  unite: string;
  lowerBetter: boolean;
};

function calculerProgressions(bilanInitial: Bilan, dernierBilan: Bilan): ProgItem[] {
  const items: ProgItem[] = [];

  const eq0 = bilanInitial.equilibre?.droite, eq1 = dernierBilan.equilibre?.droite;
  if (eq0 != null && eq1 != null)
    items.push({ key: 'equilibre', ...TEST_LABELS_PATIENT.equilibre, val0: +eq0.toFixed(1), val1: +eq1.toFixed(1), unite: 's', lowerBetter: false });

  const cs0 = bilanInitial.chairStand30, cs1 = dernierBilan.chairStand30;
  if (cs0 != null && cs1 != null)
    items.push({ key: 'chairStand', ...TEST_LABELS_PATIENT.chairStand, val0: cs0, val1: cs1, unite: ' rép.', lowerBetter: false });

  const hg0 = bilanInitial.handGrip?.droite, hg1 = dernierBilan.handGrip?.droite;
  if (hg0 != null && hg1 != null)
    items.push({ key: 'handGrip', ...TEST_LABELS_PATIENT.handGrip, val0: +hg0.toFixed(1), val1: +hg1.toFixed(1), unite: ' kg', lowerBetter: false });

  const tug0 = bilanInitial.tug3m, tug1 = dernierBilan.tug3m;
  if (tug0 != null && tug1 != null)
    items.push({ key: 'tug', ...TEST_LABELS_PATIENT.tug, val0: +tug0.toFixed(1), val1: +tug1.toFixed(1), unite: 's', lowerBetter: true });

  const tm0 = bilanInitial.tm6?.distanceMetres, tm1 = dernierBilan.tm6?.distanceMetres;
  if (tm0 != null && tm1 != null)
    items.push({ key: 'tm6', ...TEST_LABELS_PATIENT.tm6, val0: tm0, val1: tm1, unite: ' m', lowerBetter: false });

  return items;
}

function CarteProgression({ item }: { item: ProgItem }) {
  const delta = item.lowerBetter ? item.val0 - item.val1 : item.val1 - item.val0;
  const improved = delta > 0;
  const stable = Math.abs(delta) < 0.1;
  const regression = delta < -0.1;

  // Barre de progression : représente l'amélioration relative
  const ref = Math.max(Math.abs(item.val0), 0.1);
  const rawPct = Math.min(Math.abs(delta) / ref * 100, 100);
  const barPct = improved ? rawPct : stable ? 50 : rawPct;

  const barColor = improved ? C.green : stable ? C.gray : C.orange;

  const deltaAbs = Math.abs(+delta.toFixed(1));
  const message = improved
    ? `Vous avez gagné ${deltaAbs}${item.unite.trim()} ! 🎉`
    : stable
    ? 'On continue à travailler dessus 💪'
    : `Encore ${deltaAbs}${item.unite.trim()} à récupérer — c'est le chemin !`;

  const badge = improved ? '✅ Progression' : stable ? '➡️ Stable' : '⬇️ En cours';

  return (
    <div style={{
      background: 'white', border: `1px solid ${C.border}`,
      borderRadius: 18, overflow: 'hidden',
    }}>
      {/* En-tête */}
      <div style={{
        padding: '14px 16px 10px',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>{item.emoji}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>{item.label}</span>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
          background: improved ? '#DCFCE7' : stable ? '#F1F5F9' : '#FEF3C7',
          color: improved ? C.green : stable ? C.gray : C.orange,
        }}>
          {badge}
        </span>
      </div>
      {/* Corps */}
      <div style={{ padding: '14px 16px' }}>
        {/* Valeurs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>Départ</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#94A3B8' }}>{item.val0}{item.unite}</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center', fontSize: 16, color: C.muted }}>→</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>Aujourd'hui</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.dark }}>{item.val1}{item.unite}</div>
          </div>
        </div>
        {/* Barre */}
        <div style={{ height: 8, background: C.bg, borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
          <div style={{
            height: '100%',
            width: `${Math.max(barPct, 4)}%`,
            background: barColor,
            borderRadius: 4,
            transition: 'width 0.8s ease',
          }} />
        </div>
        {/* Message */}
        <div style={{ fontSize: 13, color: improved ? C.green : regression ? C.orange : C.muted }}>
          {message}
        </div>
      </div>
    </div>
  );
}

function EcranProgres({ bilans }: { bilans: Bilan[] }) {
  const sorted = [...bilans].sort((a, b) => a.date.localeCompare(b.date));
  const bilanInitial = sorted.find(b => b.type === 'initial') ?? sorted[0] ?? null;
  const dernierBilan = sorted[sorted.length - 1] ?? null;
  const flatData = bilanInitial?.bilanInitialData?.formulaireFlat?.data;
  const sedProfil = flatData?.sedentariteProfil as string | null ?? null;
  const fssProfil = flatData?.fatigueProfil as string | null ?? null;

  const hasDeux = bilanInitial && dernierBilan && bilanInitial.id !== dernierBilan.id;
  const progressions = hasDeux ? calculerProgressions(bilanInitial!, dernierBilan!) : [];
  const nProgressed = progressions.filter(p =>
    (p.lowerBetter ? p.val0 - p.val1 : p.val1 - p.val0) > 0
  ).length;

  if (!bilanInitial) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.dark, marginBottom: 8 }}>
          Pas encore de bilan
        </div>
        <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>
          Votre premier bilan permettra de mesurer<br />vos capacités de départ.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Titre + dates */}
      <div style={{ background: C.dark, borderRadius: 18, padding: '18px 16px' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'white', marginBottom: 4 }}>
          Votre évolution 📈
        </div>
        {hasDeux ? (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
            De {fmtMoisAnnee(bilanInitial!.date)} à {fmtMoisAnnee(dernierBilan!.date)}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
            1er bilan réalisé le {fmtCourt(bilanInitial.date)}
          </div>
        )}
      </div>

      {/* Cas un seul bilan */}
      {!hasDeux && (
        <div style={{
          background: 'white', border: `1px solid ${C.border}`,
          borderRadius: 18, padding: '24px 20px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🌱</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.dark, marginBottom: 8 }}>
            Premier bilan enregistré !
          </div>
          <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>
            Votre prochain bilan permettra de mesurer<br />
            vos progrès depuis le départ.
          </div>
        </div>
      )}

      {/* Cartes de progression */}
      {progressions.map(item => (
        <CarteProgression key={item.key} item={item} />
      ))}

      {/* Activité physique & Fatigue */}
      {(sedProfil || fssProfil) && (
        <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 16px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 10 }}>
            Votre profil de forme
          </div>
          {sedProfil && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: C.muted }}>Votre niveau d'activité</span>
              <span style={{
                fontSize: 13, fontWeight: 600,
                color: sedProfil === 'inactif' ? '#E24B4A' : sedProfil === 'actif' ? '#BA7517' : '#0F6E56',
              }}>
                {sedProfil === 'inactif' ? 'Faible 🔴' : sedProfil === 'actif' ? 'Modéré 🟡' : 'Élevé 🟢'}
              </span>
            </div>
          )}
          {fssProfil && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: C.muted }}>Votre fatigue</span>
              <span style={{
                fontSize: 13, fontWeight: 600,
                color: fssProfil === 'pas_de_fatigue' ? '#0F6E56' : '#A32D2D',
              }}>
                {fssProfil === 'pas_de_fatigue' ? 'Légère 🟢' : 'À surveiller 🔴'}
              </span>
            </div>
          )}
          <p style={{ fontSize: 12, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
            Votre praticien adapte vos séances en conséquence.
          </p>
        </div>
      )}

      {/* Message d'encouragement global */}
      {progressions.length > 0 && (
        <div style={{
          background: nProgressed > 0
            ? 'rgba(22,163,74,0.08)'
            : C.bg,
          border: `1px solid ${nProgressed > 0 ? 'rgba(22,163,74,0.2)' : C.border}`,
          borderRadius: 18, padding: '18px 16px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>
            {nProgressed >= 3 ? '🌟' : nProgressed >= 1 ? '💪' : '🔄'}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 4 }}>
            {nProgressed >= 3
              ? `Excellent ! Vous progressez sur ${nProgressed} domaine${nProgressed > 1 ? 's' : ''}.`
              : nProgressed >= 1
              ? `Vous progressez sur ${nProgressed} domaine${nProgressed > 1 ? 's' : ''} — continuez !`
              : 'Continuez à suivre votre programme. Les progrès arrivent !'}
          </div>
          <div style={{ fontSize: 13, color: C.muted }}>
            {bilans.length} bilan{bilans.length > 1 ? 's' : ''} réalisé{bilans.length > 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers planning V2 ───────────────────────────────────────────────────────

const JOURS_JS_TO_FR: JourProgramme[] = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOUR_COURT_FR: Record<JourProgramme, string> = {
  lundi: 'Lun', mardi: 'Mar', mercredi: 'Mer', jeudi: 'Jeu',
  vendredi: 'Ven', samedi: 'Sam', dimanche: 'Dim',
};

function getTodayJour(): JourProgramme {
  return JOURS_JS_TO_FR[new Date().getDay()];
}

function getSeancesAujourdHuiV2(prog: ProgrammeV2): ProgrammeSeanceV2[] {
  const today = getTodayJour();
  const seanceIds = prog.planning.filter(p => p.jour === today).map(p => p.seanceId);
  return prog.seances.filter(s => seanceIds.includes(s.id));
}

function getJoursActifsV2(prog: ProgrammeV2): JourProgramme[] {
  const active = new Set(prog.planning.map(p => p.jour));
  return JOURS_PROGRAMME.filter(j => active.has(j));
}

// ── Carte exercice patient ────────────────────────────────────────────────────

function CarteExercicePatient({ ex, index }: { ex: ProgrammeV2['seances'][0]['exercices'][0]; index: number }) {
  return (
    <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', marginBottom: 12 }}>
      <div style={{
        background: C.bg, padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%', background: C.teal,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, color: 'white', flexShrink: 0,
        }}>
          {index + 1}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>{ex.nom}</div>
          {ex.categorie && (
            <div style={{ fontSize: 12, color: C.teal, fontWeight: 600, marginTop: 1 }}>{ex.categorie}</div>
          )}
        </div>
      </div>
      <div style={{ padding: '14px 16px' }}>
        {/* Compteurs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {ex.series != null && ex.series > 0 && (
            <div style={{ background: '#E8F8F8', borderRadius: 10, padding: '8px 12px', textAlign: 'center', flex: 1, minWidth: 60 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.teal }}>{ex.series}</div>
              <div style={{ fontSize: 11, color: C.muted }}>série{ex.series > 1 ? 's' : ''}</div>
            </div>
          )}
          {ex.repetitions != null && (
            <div style={{ background: '#E8F8F8', borderRadius: 10, padding: '8px 12px', textAlign: 'center', flex: 1, minWidth: 60 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.teal }}>{ex.repetitions}</div>
              <div style={{ fontSize: 11, color: C.muted }}>répétitions</div>
            </div>
          )}
          {ex.dureeSecondes != null && (
            <div style={{ background: '#E8F8F8', borderRadius: 10, padding: '8px 12px', textAlign: 'center', flex: 1, minWidth: 60 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.teal }}>{ex.dureeSecondes}</div>
              <div style={{ fontSize: 11, color: C.muted }}>secondes</div>
            </div>
          )}
        </div>
        {ex.description && (
          <div style={{ fontSize: 13, color: '#4A6080', lineHeight: 1.7, marginBottom: 8 }}>{ex.description}</div>
        )}
        {ex.conseilSecurite && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#92400E', lineHeight: 1.5 }}>
            💡 {ex.conseilSecurite}
          </div>
        )}
      </div>
    </div>
  );
}

// ── ÉCRAN 3 — Programme ───────────────────────────────────────────────────────

function EcranProgramme({ participant, programmes, programmesV2 }: {
  participant: Participant;
  programmes: Programme[];
  programmesV2: ProgrammeV2[];
}) {
  const [selectedProgId, setSelectedProgId] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const praticien = loadPraticien();
  const exercicesCatalog = loadExercices();

  const progsV2Actifs = programmesV2.filter(p => p.actif);
  const today = getTodayJour();
  const todayFR = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  // V1 fallback
  const programmeV1 = programmes.filter(p => p.actif).sort((a, b) => b.dateCreation.localeCompare(a.dateCreation))[0] ?? null;

  // Séances du jour (V2)
  const seancesAujourdHui = progsV2Actifs.flatMap(prog =>
    getSeancesAujourdHuiV2(prog).map(s => ({ ...s, progNom: prog.nom, progId: prog.id }))
  );

  // Programme sélectionné pour le détail
  const selectedProg = selectedProgId ? progsV2Actifs.find(p => p.id === selectedProgId) : null;

  // PDF pour programme V1
  async function telechargerPDF() {
    if (!programmeV1) return;
    setPdfLoading(true);
    try {
      await exportProgrammePDF(
        { programme: programmeV1, exercices: exercicesCatalog, participant, settings: { prenom: praticien.nom, nom: '', email: '', telephone: '', societe: praticien.societe } },
        `programme-${participant.prenom.toLowerCase()}.pdf`
      );
    } finally { setPdfLoading(false); }
  }

  if (progsV2Actifs.length === 0 && !programmeV1) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🏋️</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.dark, marginBottom: 8 }}>Programme à venir</div>
        <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.7 }}>
          Votre programme d'exercices sera bientôt<br />
          disponible ici. {praticien.nom.split(' ')[0]} le préparera<br />
          lors de votre prochaine séance.
        </div>
      </div>
    );
  }

  // Vue détail d'un programme V2
  if (selectedProg) {
    const seancesAujourdHuiDetail = getSeancesAujourdHuiV2(selectedProg);
    const joursActifs = getJoursActifsV2(selectedProg);

    return (
      <div>
        <button
          onClick={() => setSelectedProgId(null)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: C.muted, marginBottom: 14, padding: 0 }}
        >
          ← Tous les programmes
        </button>

        {/* En-tête */}
        <div style={{ background: C.dark, borderRadius: 18, padding: '18px 16px', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.teal, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Votre programme</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'white', marginBottom: 4 }}>🏋️ {selectedProg.nom}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
            Établi par {praticien.nom.split(' ')[0]}
          </div>
          {selectedProg.objectif && (
            <div style={{ marginTop: 10, background: 'rgba(43,191,191,0.15)', border: '1px solid rgba(43,191,191,0.3)', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: 'rgba(255,255,255,0.8)', fontStyle: 'italic' }}>
              🎯 {selectedProg.objectif}
            </div>
          )}
          {selectedProg.messageMotivation && (
            <div style={{ marginTop: 8, background: 'rgba(255,255,255,0.07)', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: 'rgba(255,255,255,0.65)', fontStyle: 'italic' }}>
              💬 "{selectedProg.messageMotivation}"
            </div>
          )}
        </div>

        {/* Planning semaine */}
        {joursActifs.length > 0 && (
          <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 16, padding: '14px 16px', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Planning</div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
              {JOURS_PROGRAMME.map(jour => {
                const actif = joursActifs.includes(jour);
                const isToday = jour === today;
                return (
                  <div key={jour} style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontSize: 10, color: isToday ? C.teal : C.muted, marginBottom: 4, fontWeight: isToday ? 700 : 400 }}>
                      {JOUR_COURT_FR[jour]}
                    </div>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', margin: '0 auto',
                      background: actif ? (isToday ? C.teal : C.dark) : C.bg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12,
                    }}>
                      {actif ? '●' : '○'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Séances du jour ou repos */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Séance d'aujourd'hui — {todayFR}
          </div>
          {seancesAujourdHuiDetail.length === 0 ? (
            <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', textAlign: 'center', color: C.muted, fontSize: 14 }}>
              😌 Repos aujourd'hui
            </div>
          ) : seancesAujourdHuiDetail.map(seance => (
            <div key={seance.id} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 8 }}>{seance.nom}</div>
              {seance.exercices.sort((a, b) => a.ordre - b.ordre).map((ex, i) => (
                <CarteExercicePatient key={ex.id} ex={ex} index={i} />
              ))}
            </div>
          ))}
        </div>

        {/* Toutes les séances */}
        {selectedProg.seances.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
              Tous les exercices
            </div>
            {selectedProg.seances.map(seance => (
              <div key={seance.id} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{seance.nom}</span>
                  <span style={{ fontSize: 11, color: C.muted, fontWeight: 400 }}>
                    {seance.exercices.length} exercice{seance.exercices.length > 1 ? 's' : ''}
                  </span>
                </div>
                {seance.exercices.sort((a, b) => a.ordre - b.ordre).map((ex, i) => (
                  <CarteExercicePatient key={ex.id} ex={ex} index={i} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Vue liste de tous les programmes
  return (
    <div>
      {/* Aujourd'hui — V2 */}
      {progsV2Actifs.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Aujourd'hui — {todayFR}
          </div>
          {seancesAujourdHui.length === 0 ? (
            <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', textAlign: 'center', color: C.muted, fontSize: 14 }}>
              😌 Repos aujourd'hui
            </div>
          ) : seancesAujourdHui.map(s => (
            <div key={s.id} style={{ background: 'white', border: `1px solid rgba(43,191,191,0.3)`, borderRadius: 16, padding: '14px 16px', marginBottom: 10, cursor: 'pointer' }}
              onClick={() => setSelectedProgId(s.progId)}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>🏋️ {s.nom} · {s.progNom}</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
                {s.exercices.length} exercice{s.exercices.length > 1 ? 's' : ''} · Voir les exercices →
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Planning semaine — V2 */}
      {progsV2Actifs.length > 0 && (
        <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 16, padding: '14px 16px', marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Cette semaine</div>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'space-between' }}>
            {JOURS_PROGRAMME.map(jour => {
              const actif = progsV2Actifs.some(p => p.planning.some(pl => pl.jour === jour));
              const isToday = jour === today;
              return (
                <div key={jour} style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ fontSize: 10, color: isToday ? C.teal : C.muted, marginBottom: 3, fontWeight: isToday ? 700 : 400 }}>
                    {JOUR_COURT_FR[jour]}
                  </div>
                  <div style={{
                    fontSize: 16, color: actif ? C.teal : C.border,
                    fontWeight: 700,
                  }}>
                    {actif ? '●' : '○'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tous vos programmes — V2 */}
      {progsV2Actifs.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Tous vos programmes
          </div>
          {progsV2Actifs.map(prog => {
            const joursActifs = getJoursActifsV2(prog);
            const totalEx = prog.seances.reduce((sum, s) => sum + s.exercices.length, 0);
            return (
              <div
                key={prog.id}
                onClick={() => setSelectedProgId(prog.id)}
                style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 16, padding: '14px 16px', marginBottom: 10, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>🏋️ {prog.nom}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                    {joursActifs.length > 0 ? joursActifs.map(j => JOUR_COURT_FR[j]).join(' · ') : 'Pas de planning'}
                    {totalEx > 0 && ` · ${totalEx} exercice${totalEx > 1 ? 's' : ''}`}
                  </div>
                </div>
                <span style={{ fontSize: 16, color: C.muted }}>›</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Fallback programme V1 */}
      {programmeV1 && progsV2Actifs.length === 0 && (
        <div>
          <div style={{ background: C.dark, borderRadius: 18, padding: '18px 16px', marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.teal, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Votre programme</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'white', marginBottom: 4 }}>{programmeV1.titre}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
              Établi par {praticien.nom.split(' ')[0]} · mis à jour le {fmtCourt(programmeV1.dateCreation)}
            </div>
            {programmeV1.objectif && (
              <div style={{ marginTop: 10, background: 'rgba(43,191,191,0.15)', border: '1px solid rgba(43,191,191,0.3)', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: 'rgba(255,255,255,0.8)', fontStyle: 'italic' }}>
                🎯 {programmeV1.objectif}
              </div>
            )}
            {programmeV1.messageMotivation && (
              <div style={{ marginTop: 8, background: 'rgba(255,255,255,0.07)', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: 'rgba(255,255,255,0.65)', fontStyle: 'italic' }}>
                💬 "{programmeV1.messageMotivation}"
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
            {programmeV1.exercices.sort((a, b) => a.ordre - b.ordre).map((ep, index) => {
              const ex = exercicesCatalog.find(e => e.id === ep.exerciceId);
              if (!ex) return null;
              return (
                <div key={ep.exerciceId} style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ background: C.bg, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                      {index + 1}
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>{ex.nom}</div>
                      <div style={{ fontSize: 12, color: C.teal, fontWeight: 600, marginTop: 1 }}>{ex.categorie}</div>
                    </div>
                  </div>
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                      {ep.series > 0 && (
                        <div style={{ background: '#E8F8F8', borderRadius: 10, padding: '8px 12px', textAlign: 'center', flex: 1, minWidth: 60 }}>
                          <div style={{ fontSize: 20, fontWeight: 700, color: C.teal }}>{ep.series}</div>
                          <div style={{ fontSize: 11, color: C.muted }}>séries</div>
                        </div>
                      )}
                      {ep.repetitions != null && (
                        <div style={{ background: '#E8F8F8', borderRadius: 10, padding: '8px 12px', textAlign: 'center', flex: 1, minWidth: 60 }}>
                          <div style={{ fontSize: 20, fontWeight: 700, color: C.teal }}>{ep.repetitions}</div>
                          <div style={{ fontSize: 11, color: C.muted }}>répétitions</div>
                        </div>
                      )}
                      {ep.dureeSecondes != null && (
                        <div style={{ background: '#E8F8F8', borderRadius: 10, padding: '8px 12px', textAlign: 'center', flex: 1, minWidth: 60 }}>
                          <div style={{ fontSize: 20, fontWeight: 700, color: C.teal }}>{ep.dureeSecondes}</div>
                          <div style={{ fontSize: 11, color: C.muted }}>secondes</div>
                        </div>
                      )}
                    </div>
                    {ex.description && <div style={{ fontSize: 13, color: '#4A6080', lineHeight: 1.7, marginBottom: 8 }}>{ex.description}</div>}
                    {ex.consigneSecurite && (
                      <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#92400E', lineHeight: 1.5 }}>
                        💡 {ex.consigneSecurite}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <button onClick={telechargerPDF} disabled={pdfLoading} style={{ width: '100%', padding: '16px', background: pdfLoading ? C.muted : C.dark, color: 'white', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: pdfLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52 }}>
            {pdfLoading ? '⏳ Génération…' : '📄 Télécharger mon programme PDF'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── ÉCRAN 4 — Documents ───────────────────────────────────────────────────────

function EcranDocuments({ bilans, documentsPatient }: {
  bilans: Bilan[];
  participant: Participant;
  documentsPatient: { id: string; titre: string; contenu: string; date_creation: string }[];
}) {
  const praticien = loadPraticien();
  const sortedBilans = [...bilans].sort((a, b) => b.date.localeCompare(a.date));
  const hasContent = documentsPatient.length > 0 || sortedBilans.length > 0;

  if (!hasContent) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.dark, marginBottom: 8 }}>
          Pas encore de documents
        </div>
        <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>
          Les documents que {praticien.nom.split(' ')[0]} partage avec vous<br />apparaîtront ici.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Documents partagés explicitement par Pierre */}
      {documentsPatient.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', paddingLeft: 2 }}>
            Partagé par {praticien.nom.split(' ')[0]} ({documentsPatient.length})
          </div>
          {documentsPatient.map(doc => (
            <div key={doc.id} style={{
              background: 'white', border: `1.5px solid rgba(43,191,191,0.3)`,
              borderRadius: 18, padding: '18px 16px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>
                    📝 {doc.titre}
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                    {fmtCourt(doc.date_creation?.slice(0, 10) ?? '')} · {praticien.nom.split(' ')[0]}
                  </div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(43,191,191,0.1)', color: C.teal, padding: '3px 8px', borderRadius: 20 }}>
                  Partagé
                </span>
              </div>
              <div style={{
                fontSize: 13, color: C.text, lineHeight: 1.7,
                whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'hidden',
              }}>
                {doc.contenu.slice(0, 400)}{doc.contenu.length > 400 ? '…' : ''}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Bilans — résumé en langage patient */}
      {sortedBilans.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', paddingLeft: 2, marginTop: documentsPatient.length > 0 ? 8 : 0 }}>
            Vos bilans ({sortedBilans.length})
          </div>
          {sortedBilans.map((bilan, i) => {
            const isInitial = bilan.type === 'initial';
            return (
              <div key={bilan.id} style={{
                background: 'white', border: `1px solid ${C.border}`,
                borderRadius: 18, padding: '16px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>
                      📊 {isInitial ? 'Bilan initial' : `Bilan de suivi n°${sortedBilans.length - i}`}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                      {fmtCourt(bilan.date)} · Évaluation par {praticien.nom.split(' ')[0]}
                    </div>
                  </div>
                  {i === 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, background: '#E8F8F8', color: C.teal, padding: '3px 8px', borderRadius: 20 }}>
                      Le plus récent
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.6, marginBottom: bilan.messageClient ? 10 : 0 }}>
                  {[
                    bilan.equilibre?.droite != null && `Équilibre : ${bilan.equilibre.droite.toFixed(1)} s`,
                    bilan.chairStand30 != null && `Force jambes : ${bilan.chairStand30} lever${bilan.chairStand30 > 1 ? 's' : ''}`,
                    bilan.handGrip?.droite != null && `Force des mains : ${bilan.handGrip.droite.toFixed(1)} kg`,
                    bilan.tug3m != null && `Marche : ${bilan.tug3m.toFixed(1)} s`,
                    bilan.tm6?.distanceMetres != null && `Endurance : ${bilan.tm6.distanceMetres} m`,
                  ].filter(Boolean).map((line, j) => (
                    <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: C.teal }}>·</span> {String(line)}
                    </div>
                  ))}
                </div>
                {bilan.messageClient && (
                  <div style={{ background: C.bg, borderRadius: 10, padding: '10px 12px', fontSize: 13, color: C.text, fontStyle: 'italic', lineHeight: 1.6 }}>
                    💬 "{bilan.messageClient}"
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ── Navigation bas de page ────────────────────────────────────────────────────

type Tab = 'accueil' | 'progres' | 'programme' | 'documents';

const TABS_CONFIG: { id: Tab; emoji: string; label: string }[] = [
  { id: 'accueil',    emoji: '🏠', label: 'Accueil' },
  { id: 'progres',   emoji: '📊', label: 'Progrès' },
  { id: 'programme', emoji: '🏋️', label: 'Programme' },
  { id: 'documents', emoji: '📋', label: 'Documents' },
];

// ── Page principale ───────────────────────────────────────────────────────────

export default function EspacePatient() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code');

  const [loading, setLoading]           = useState(true);
  const [participant, setParticipant]   = useState<Participant | null>(null);
  const [seances, setSeances]           = useState<Seance[]>([]);
  const [bilans, setBilans]             = useState<Bilan[]>([]);
  const [programmes, setProgrammes]     = useState<Programme[]>([]);
  const [programmesV2, setProgrammesV2] = useState<ProgrammeV2[]>([]);
  const [documentsPatient, setDocumentsPatient] = useState<{ id: string; titre: string; contenu: string; date_creation: string }[]>([]);
  const [tab, setTab]                   = useState<Tab>('accueil');

  useEffect(() => {
    if (!id || !supabase) { setLoading(false); return; }

    async function charger() {
      // allSettled : si une requête échoue, les autres continuent
      const [pRes, bRes, sRes, prRes, docRes] = await Promise.allSettled([
        supabase!.from('participants').select('*').eq('id', id).single(),
        supabase!.from('bilans').select('*').eq('participant_id', id).order('date'),
        supabase!.from('seances').select('*').eq('participant_id', id).order('date'),
        supabase!.from('programmes').select('*').eq('participant_id', id),
        // Documents explicitement partagés par Pierre
        supabase!.from('documents_patient')
          .select('id, titre, contenu, date_creation')
          .eq('participant_id', id)
          .order('date_creation', { ascending: false }),
      ]);

      if (pRes.status === 'fulfilled' && pRes.value.data)
        setParticipant(dbToParticipant(pRes.value.data));
      if (bRes.status === 'fulfilled' && bRes.value.data)
        setBilans(bRes.value.data.map(dbToBilan));
      if (sRes.status === 'fulfilled' && sRes.value.data)
        setSeances(sRes.value.data.map(dbToSeance));
      if (prRes.status === 'fulfilled' && prRes.value.data) {
        const allProgs = prRes.value.data;
        setProgrammes(allProgs.map(dbToProgramme));

        // Charger les programmes V2 (avec type != null) + leurs séances/planning/exercices
        const v2Rows = allProgs.filter((p: Record<string, unknown>) => p.type != null);
        if (v2Rows.length > 0) {
          const [seancesRes, planningRes] = await Promise.allSettled([
            supabase!.from('programme_seances').select('*').in('programme_id', v2Rows.map((p: Record<string, unknown>) => p.id)).order('ordre'),
            supabase!.from('programme_planning').select('*').in('programme_id', v2Rows.map((p: Record<string, unknown>) => p.id)),
          ]);
          const seanceRows = seancesRes.status === 'fulfilled' ? (seancesRes.value.data ?? []) : [];
          const planningRows = planningRes.status === 'fulfilled' ? (planningRes.value.data ?? []) : [];

          let exerciceRows: Record<string, unknown>[] = [];
          if (seanceRows.length > 0) {
            const exRes = await supabase!.from('programme_exercices').select('*')
              .in('seance_id', seanceRows.map((s: Record<string, unknown>) => s.id)).order('ordre');
            exerciceRows = exRes.data ?? [];
          }

          const v2Programmes: ProgrammeV2[] = v2Rows.map((progRow: Record<string, unknown>) => {
            const progSeances = seanceRows
              .filter((s: Record<string, unknown>) => s.programme_id === progRow.id)
              .map((s: Record<string, unknown>) => ({
                id: s.id as string,
                programmeId: s.programme_id as string,
                nom: (s.nom as string) ?? '',
                description: (s.description as string | null) ?? undefined,
                ordre: (s.ordre as number) ?? 0,
                exercices: exerciceRows
                  .filter((e: Record<string, unknown>) => e.seance_id === s.id)
                  .map((e: Record<string, unknown>) => ({
                    id: e.id as string,
                    seanceId: e.seance_id as string,
                    nom: (e.nom as string) ?? '',
                    categorie: (e.categorie as string | null) ?? undefined,
                    description: (e.description as string | null) ?? undefined,
                    conseilSecurite: (e.conseil_securite as string | null) ?? undefined,
                    series: (e.series as number | null) ?? undefined,
                    repetitions: (e.repetitions as number | null) ?? undefined,
                    dureeSecondes: (e.duree_secondes as number | null) ?? undefined,
                    ordre: (e.ordre as number) ?? 0,
                  })),
              })) as ProgrammeSeanceV2[];

            const progPlanning = planningRows
              .filter((p: Record<string, unknown>) => p.programme_id === progRow.id)
              .map((p: Record<string, unknown>) => ({
                id: p.id as string,
                programmeId: p.programme_id as string,
                seanceId: p.seance_id as string,
                jour: p.jour as JourProgramme,
              }));

            return {
              id: progRow.id as string,
              participantId: progRow.participant_id as string,
              nom: (progRow.nom as string | null) ?? (progRow.titre as string | null) ?? '',
              objectif: (progRow.objectif as string | null) ?? undefined,
              messageMotivation: (progRow.message_motivation as string | null) ?? undefined,
              type: ((progRow.type as string) ?? 'domicile') as ProgrammeV2['type'],
              actif: (progRow.actif as boolean) ?? true,
              createdAt: (progRow.created_at as string | null) ?? (progRow.date_creation as string | null) ?? '',
              seances: progSeances,
              planning: progPlanning,
            } as ProgrammeV2;
          });

          setProgrammesV2(v2Programmes);
        }
      }
      if (docRes.status === 'fulfilled' && docRes.value.data)
        setDocumentsPatient(docRes.value.data as { id: string; titre: string; contenu: string; date_creation: string }[]);

      setLoading(false);
    }

    void charger();
  }, [id]);

  if (!id) return <Navigate to="/patient" replace />;

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: C.dark,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "var(--font-sans)",
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🌊</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.teal, marginBottom: 6 }}>Chargement…</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Récupération de vos données</div>
        </div>
      </div>
    );
  }

  if (!participant) return <Navigate to="/patient" replace />;
  if (!code || calculerCode(participant.prenom) !== code) return <Navigate to="/patient" replace />;

  return (
    <div style={{
      maxWidth: 600, margin: '0 auto',
      minHeight: '100vh',
      background: C.bg,
      fontFamily: "var(--font-sans)",
      fontSize: 14,
      paddingBottom: 72, // espace pour la nav bas
    }}>

      {/* HEADER COMPACT */}
      <div style={{
        background: C.dark,
        padding: '14px 16px 12px',
        display: 'flex', alignItems: 'center', gap: 10,
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <img
          src="/logo-horizon.png"
          style={{ height: 22, flexShrink: 0 }}
          alt="Horizon"
          onError={e => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {participant.prenom} {participant.nom}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>
            Espace personnel · Horizon
          </div>
        </div>
      </div>

      {/* CONTENU */}
      <div style={{ padding: '16px' }}>
        {tab === 'accueil' && (
          <EcranAccueil
            participant={participant}
            seances={seances}
            bilans={bilans}
            programmes={programmes}
            programmesV2={programmesV2}
          />
        )}
        {tab === 'progres' && <EcranProgres bilans={bilans} />}
        {tab === 'programme' && (
          <EcranProgramme participant={participant} programmes={programmes} programmesV2={programmesV2} />
        )}
        {tab === 'documents' && (
          <EcranDocuments bilans={bilans} participant={participant} documentsPatient={documentsPatient} />
        )}
      </div>

      {/* NAVIGATION BAS DE PAGE */}
      <nav style={{
        position: 'fixed',
        bottom: 0, left: '50%',
        transform: 'translateX(-50%)',
        width: '100%', maxWidth: 600,
        background: 'white',
        borderTop: `1px solid ${C.border}`,
        display: 'flex',
        zIndex: 30,
        boxShadow: '0 -4px 16px rgba(13,43,43,0.08)',
      }}>
        {TABS_CONFIG.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              padding: '10px 4px 12px',
              background: 'none', border: 'none',
              borderTop: tab === t.id ? `2px solid ${C.teal}` : '2px solid transparent',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              cursor: 'pointer',
              transition: 'border-color 0.15s',
              minHeight: 60,
            }}
          >
            <span style={{ fontSize: 20 }}>{t.emoji}</span>
            <span style={{
              fontSize: 10, fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? C.teal : C.muted,
              letterSpacing: '0.01em',
            }}>
              {t.label}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}
