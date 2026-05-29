import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Navigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { Participant, Seance, Bilan, Programme } from '../types';
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

function formatDateLong(iso: string): string {
  return new Date(iso + 'T12:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

function formatDateFR(iso: string): string {
  return new Date(iso + 'T12:00').toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function formatDateCourt(iso: string): string {
  return new Date(iso + 'T12:00').toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short',
  });
}

function formatHeure(h: string): string { return h.slice(0, 5); }

function calculerScoreGlobal(bilan: Bilan): number | null {
  const scores: number[] = [];
  if (bilan.equilibre?.droite != null)
    scores.push(Math.min(bilan.equilibre.droite / 30 * 100, 100));
  if (bilan.chairStand30 != null)
    scores.push(Math.min(bilan.chairStand30 / 15 * 100, 100));
  if (bilan.handGrip?.droite != null)
    scores.push(Math.min(bilan.handGrip.droite / 30 * 100, 100));
  if (bilan.tug3m != null)
    scores.push(Math.max(0, Math.min(100, (30 - bilan.tug3m) / 22 * 100)));
  if (bilan.tm6?.distanceMetres != null)
    scores.push(Math.min(bilan.tm6.distanceMetres / 400 * 100, 100));
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

// ── Bannière PWA ──────────────────────────────────────────────────────────────

function BannierePWA() {
  const [visible, setVisible] = useState(true);
  const [promptInstall, setPromptInstall] = useState<Event & { prompt?: () => void; userChoice?: Promise<{ outcome: string }> } | null>(null);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
  const isAndroid = /Android/.test(navigator.userAgent);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptInstall(e as Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> });
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!visible) return null;

  return (
    <div style={{
      background: '#F4FAFA', border: '1px solid #E0EEEE',
      borderRadius: 14, padding: '16px', margin: '16px',
      position: 'relative',
    }}>
      <button
        onClick={() => setVisible(false)}
        style={{
          position: 'absolute', top: 10, right: 12,
          background: 'none', border: 'none',
          fontSize: 20, color: '#8FA8A8', cursor: 'pointer',
          lineHeight: 1,
        }}
        aria-label="Fermer"
      >
        ×
      </button>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#0D2B2B', marginBottom: 6 }}>
        📱 Installez l'app sur votre téléphone
      </div>
      <div style={{ fontSize: 13, color: '#5C7A7A', lineHeight: 1.5, marginBottom: 12 }}>
        Accédez à votre espace en 1 clic depuis l'écran d'accueil.
      </div>

      {isIOS && (
        <div style={{
          background: 'white', borderRadius: 10, padding: '12px 14px',
          fontSize: 13, color: '#0D2B2B', lineHeight: 1.7,
          border: '1px solid #E0EEEE',
        }}>
          Sur iPhone → Appuyez sur <strong>□↑</strong> puis<br />
          <strong>"Sur l'écran d'accueil"</strong>
        </div>
      )}

      {isAndroid && promptInstall && (
        <button
          onClick={async () => {
            if (!promptInstall?.prompt) return;
            promptInstall.prompt();
            const result = await promptInstall.userChoice;
            if (result?.outcome === 'accepted') setVisible(false);
            setPromptInstall(null);
          }}
          style={{
            width: '100%', padding: '12px',
            background: '#2BBFBF', color: 'white',
            border: 'none', borderRadius: 10,
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
            minHeight: 44,
          }}
        >
          Installer l'app
        </button>
      )}

      {!isIOS && !promptInstall && (
        <div style={{ fontSize: 12, color: '#8FA8A8', lineHeight: 1.6 }}>
          Menu de votre navigateur → "Ajouter à l'écran d'accueil"
        </div>
      )}
    </div>
  );
}

// ── Onglet Progrès ────────────────────────────────────────────────────────────

function OngletProgresPatient({
  participant, seances, bilans,
}: {
  participant: Participant;
  seances: Seance[];
  bilans: Bilan[];
}) {
  const realisees = seances.filter(s => s.statut === 'realisee');
  const sorted = [...bilans].sort((a, b) => a.date.localeCompare(b.date));
  const bilanInitial = sorted.find(b => b.type === 'initial') ?? sorted[0] ?? null;
  const dernierBilan = sorted[sorted.length - 1] ?? null;

  type ProgItem = { label: string; delta: number; unite: string; lowerBetter: boolean };
  const progressions: ProgItem[] = [];

  if (bilanInitial && dernierBilan && bilanInitial.id !== dernierBilan.id) {
    const eq0 = bilanInitial.equilibre?.droite, eq1 = dernierBilan.equilibre?.droite;
    if (eq0 != null && eq1 != null)
      progressions.push({ label: 'Équilibre', delta: +(eq1 - eq0).toFixed(1), unite: 's', lowerBetter: false });

    const cs0 = bilanInitial.chairStand30, cs1 = dernierBilan.chairStand30;
    if (cs0 != null && cs1 != null)
      progressions.push({ label: 'Force jambes', delta: cs1 - cs0, unite: ' rép', lowerBetter: false });

    const tm0 = bilanInitial.tm6?.distanceMetres, tm1 = dernierBilan.tm6?.distanceMetres;
    if (tm0 != null && tm1 != null)
      progressions.push({ label: 'Endurance', delta: tm1 - tm0, unite: 'm', lowerBetter: false });

    const tug0 = bilanInitial.tug3m, tug1 = dernierBilan.tug3m;
    if (tug0 != null && tug1 != null)
      progressions.push({ label: 'TUG', delta: +(tug0 - tug1).toFixed(1), unite: 's', lowerBetter: true });
  }

  const chartData = sorted
    .map(b => ({ date: formatDateCourt(b.date), score: calculerScoreGlobal(b) }))
    .filter(d => d.score != null);

  const messagePierre = dernierBilan?.messageClient;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Message de bienvenue */}
      <div style={{ background: '#0D2B2B', borderRadius: 14, padding: '18px 16px' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'white', marginBottom: 6 }}>
          Bonjour {participant.prenom} 👋
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
          Voici vos progrès depuis le début<br />de votre suivi avec Pierre.
        </div>
      </div>

      {/* Stats globales */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #E0EEEE', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, fontWeight: 700, color: '#2BBFBF' }}>{realisees.length}</div>
          <div style={{ fontSize: 12, color: '#8FA8A8', marginTop: 4 }}>séances réalisées</div>
        </div>
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #E0EEEE', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, fontWeight: 700, color: '#2BBFBF' }}>{bilans.length}</div>
          <div style={{ fontSize: 12, color: '#8FA8A8', marginTop: 4 }}>bilans effectués</div>
        </div>
      </div>

      {/* Meilleures progressions */}
      {progressions.length > 0 && (
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #E0EEEE', padding: '16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#5C7A7A', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Meilleures progressions
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {progressions.map(({ label, delta, unite, lowerBetter }) => {
              const isPositive = lowerBetter ? delta > 0 : delta >= 0;
              const display = delta > 0 ? `+${delta}${unite}` : `${delta}${unite}`;
              return (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F4FAFA' }}>
                  <span style={{ fontSize: 14, color: '#0D2B2B' }}>{label}</span>
                  <span style={{ fontWeight: 700, color: isPositive ? '#22C55E' : '#EF4444', fontSize: 14 }}>
                    ↑ {display}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Graphique évolution */}
      {chartData.length > 1 && (
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #E0EEEE', padding: '16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#5C7A7A', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Évolution du score global /100
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E0EEEE" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8FA8A8' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#8FA8A8' }} />
              <Tooltip
                formatter={(v) => [`${v}/100`, 'Score']}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E0EEEE' }}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#2BBFBF"
                strokeWidth={2.5}
                dot={{ fill: '#2BBFBF', r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Dernier message de Pierre */}
      {messagePierre && (
        <div style={{
          background: 'rgba(43,191,191,0.08)',
          border: '1px solid rgba(43,191,191,0.3)',
          borderRadius: 14, padding: '16px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#2BBFBF', letterSpacing: '0.06em', marginBottom: 8 }}>
            MESSAGE DE PIERRE
          </div>
          <div style={{ fontSize: 14, color: '#0D2B2B', lineHeight: 1.7, fontStyle: 'italic' }}>
            💬 {messagePierre}
          </div>
        </div>
      )}

      {realisees.length === 0 && bilans.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', background: 'white', borderRadius: 14, border: '1px solid #E0EEEE' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏃</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0D2B2B', marginBottom: 6 }}>C'est parti !</div>
          <div style={{ fontSize: 13, color: '#8FA8A8' }}>Vos séances apparaîtront ici au fur et à mesure.</div>
        </div>
      )}
    </div>
  );
}

// ── Onglet RDV ────────────────────────────────────────────────────────────────

function OngletRDVPatient({ seances }: { seances: Seance[] }) {
  const today = new Date().toISOString().split('T')[0];

  const futures = seances
    .filter(s => s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  const passees = seances
    .filter(s => s.date < today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  const prochaine = futures[0] ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Prochain RDV mis en avant */}
      {prochaine && (
        <div style={{ background: '#0D2B2B', borderRadius: 14, padding: '20px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#2BBFBF', letterSpacing: '0.06em', marginBottom: 10 }}>
            VOTRE PROCHAIN RENDEZ-VOUS
          </div>
          <div style={{ fontSize: 19, fontWeight: 700, color: 'white', marginBottom: 6, textTransform: 'capitalize' }}>
            {formatDateLong(prochaine.date)}
          </div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
            à {formatHeure(prochaine.heureDebut)} — {prochaine.dureeMinutes} min
          </div>
        </div>
      )}

      {/* 5 prochaines séances */}
      {futures.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#5C7A7A', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, paddingLeft: 2 }}>
            Prochaines séances
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {futures.map((s, i) => (
              <div key={s.id} style={{
                background: 'white', borderRadius: 12,
                border: '1px solid #E0EEEE', padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10,
                  background: i === 0 ? 'rgba(43,191,191,0.12)' : '#F4FAFA',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: i === 0 ? '#2BBFBF' : '#0D2B2B' }}>
                    {new Date(s.date + 'T12:00').getDate()}
                  </div>
                  <div style={{ fontSize: 10, color: '#8FA8A8', textTransform: 'uppercase' }}>
                    {new Date(s.date + 'T12:00').toLocaleDateString('fr-FR', { month: 'short' })}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0D2B2B', textTransform: 'capitalize' }}>
                    {formatDateLong(s.date)}
                  </div>
                  <div style={{ fontSize: 12, color: '#8FA8A8', marginTop: 2 }}>
                    {formatHeure(s.heureDebut)} · {s.dureeMinutes} min
                  </div>
                </div>
                <span style={{ fontSize: 16, color: '#2BBFBF' }}>⏳</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historique des 5 dernières séances */}
      {passees.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#5C7A7A', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, paddingLeft: 2 }}>
            Séances passées
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {passees.map(s => (
              <div key={s.id} style={{
                background: 'white', borderRadius: 12,
                border: '1px solid #E0EEEE', padding: '12px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0D2B2B', textTransform: 'capitalize' }}>
                    {formatDateLong(s.date)}
                  </div>
                  <div style={{ fontSize: 12, color: '#8FA8A8', marginTop: 2 }}>
                    {formatHeure(s.heureDebut)}
                  </div>
                </div>
                <span style={{ fontSize: 22 }}>
                  {s.statut === 'realisee' ? '✅' : '⏳'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {futures.length === 0 && passees.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', background: 'white', borderRadius: 14, border: '1px solid #E0EEEE' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0D2B2B', marginBottom: 6 }}>Aucun RDV planifié</div>
          <div style={{ fontSize: 13, color: '#8FA8A8' }}>Vos prochains rendez-vous apparaîtront ici.</div>
        </div>
      )}
    </div>
  );
}

// ── Onglet Programme ──────────────────────────────────────────────────────────

function OngletProgrammePatient({
  participant, programmes,
}: {
  participant: Participant;
  programmes: Programme[];
}) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const programme = programmes
    .filter(p => p.actif)
    .sort((a, b) => b.dateCreation.localeCompare(a.dateCreation))[0] ?? null;
  const exercicesCatalog = loadExercices();

  async function telechargerPDF() {
    if (!programme) return;
    setPdfLoading(true);
    try {
      await exportProgrammePDF(
        {
          programme,
          exercices: exercicesCatalog,
          participant,
          settings: {
            prenom: 'Pierre', nom: 'Clavier',
            email: '', telephone: '',
            societe: "Mouv'APA",
          },
        },
        `programme-${participant.prenom.toLowerCase()}.pdf`
      );
    } finally {
      setPdfLoading(false);
    }
  }

  if (!programme) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🏋️</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#0D2B2B', marginBottom: 8 }}>Programme à venir</div>
        <div style={{ fontSize: 14, color: '#8FA8A8', lineHeight: 1.6 }}>
          Votre programme n'est pas encore disponible.<br />
          Pierre le partagera prochainement avec vous 😊
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* En-tête programme */}
      <div style={{ background: '#0D2B2B', borderRadius: 14, padding: '16px', marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'white', marginBottom: 4 }}>
          {programme.titre}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: programme.objectif ? 10 : 0 }}>
          Depuis le {formatDateFR(programme.dateDebut)} · {programme.exercices.length} exercice{programme.exercices.length > 1 ? 's' : ''}
        </div>
        {programme.objectif && (
          <div style={{
            background: 'rgba(43,191,191,0.15)', border: '1px solid rgba(43,191,191,0.3)',
            borderRadius: 8, padding: '10px 12px',
            fontSize: 13, color: 'rgba(255,255,255,0.8)', fontStyle: 'italic', lineHeight: 1.5,
          }}>
            🎯 {programme.objectif}
          </div>
        )}
        {programme.messageMotivation && (
          <div style={{
            background: 'rgba(43,191,191,0.1)', border: '1px solid rgba(43,191,191,0.2)',
            borderRadius: 8, padding: '10px 12px', marginTop: 8,
            fontSize: 13, color: 'rgba(255,255,255,0.7)', fontStyle: 'italic', lineHeight: 1.5,
          }}>
            💬 "{programme.messageMotivation}"
          </div>
        )}
      </div>

      {/* Liste des exercices */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        {programme.exercices.map((ep, index) => {
          const ex = exercicesCatalog.find(e => e.id === ep.exerciceId);
          if (!ex) return null;
          return (
            <div key={ep.exerciceId} style={{
              background: 'white', border: '1px solid #E0EEEE',
              borderRadius: 14, overflow: 'hidden',
            }}>
              {/* Header exercice */}
              <div style={{
                background: '#F4FAFA', padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: 12,
                borderBottom: '1px solid #E0EEEE',
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', background: '#2BBFBF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color: 'white', flexShrink: 0,
                }}>
                  {index + 1}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0D2B2B' }}>{ex.nom}</div>
                  <div style={{ fontSize: 12, color: '#2BBFBF', marginTop: 2, fontWeight: 600 }}>{ex.categorie}</div>
                </div>
              </div>

              {/* Corps */}
              <div style={{ padding: '14px 16px' }}>
                {/* Séries / rép / durée */}
                <div style={{ display: 'flex', gap: 8, marginBottom: ex.description ? 12 : 0, flexWrap: 'wrap' }}>
                  {ep.series > 0 && (
                    <div style={{ background: '#E8F8F8', borderRadius: 8, padding: '8px 14px', textAlign: 'center', flex: 1, minWidth: 70 }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#2BBFBF' }}>{ep.series}</div>
                      <div style={{ fontSize: 11, color: '#5C7A7A' }}>série{ep.series > 1 ? 's' : ''}</div>
                    </div>
                  )}
                  {ep.repetitions != null && (
                    <div style={{ background: '#E8F8F8', borderRadius: 8, padding: '8px 14px', textAlign: 'center', flex: 1, minWidth: 70 }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#2BBFBF' }}>{ep.repetitions}</div>
                      <div style={{ fontSize: 11, color: '#5C7A7A' }}>répétitions</div>
                    </div>
                  )}
                  {ep.dureeSecondes != null && (
                    <div style={{ background: '#E8F8F8', borderRadius: 8, padding: '8px 14px', textAlign: 'center', flex: 1, minWidth: 70 }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#2BBFBF' }}>{ep.dureeSecondes}</div>
                      <div style={{ fontSize: 11, color: '#5C7A7A' }}>secondes</div>
                    </div>
                  )}
                </div>

                {/* Description */}
                {ex.description && (
                  <div style={{ fontSize: 13, color: '#4A6080', lineHeight: 1.7, marginBottom: 8 }}>
                    {ex.description}
                  </div>
                )}

                {/* Adaptation handicap */}
                {participant.profilHandicap && ex.adaptations?.[participant.profilHandicap] && (
                  <div style={{
                    background: '#FFFBEB', border: '1px solid #FCD34D',
                    borderRadius: 8, padding: '10px 12px',
                    fontSize: 13, color: '#92400E', lineHeight: 1.5, marginBottom: 8,
                  }}>
                    ♿ <strong>Adaptation :</strong> {ex.adaptations[participant.profilHandicap]}
                  </div>
                )}

                {/* Note de Pierre */}
                {ep.notePersonnalisee && (
                  <div style={{
                    background: '#EAF3DE', border: '1px solid #C0DD97',
                    borderRadius: 8, padding: '10px 12px',
                    fontSize: 13, color: '#3B6D11', lineHeight: 1.5, marginBottom: 8,
                  }}>
                    <strong>📝 Note de Pierre :</strong> {ep.notePersonnalisee}
                  </div>
                )}

                {/* Bouton vidéo */}
                {ex.videoYoutubeId && (
                  <button
                    onClick={() => window.open(`https://youtube.com/watch?v=${ex.videoYoutubeId}`, '_blank')}
                    style={{
                      width: '100%', padding: '10px', marginTop: ep.notePersonnalisee ? 0 : 4,
                      background: '#FEE2E2', border: '1px solid #FECACA',
                      borderRadius: 10, fontSize: 13, fontWeight: 700,
                      color: '#991B1B', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      minHeight: 44,
                    }}
                  >
                    ▶ Voir la vidéo
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bouton PDF */}
      <button
        onClick={telechargerPDF}
        disabled={pdfLoading}
        style={{
          width: '100%', padding: '16px',
          background: pdfLoading ? '#8FA8A8' : '#0D2B2B',
          color: 'white', border: 'none', borderRadius: 12,
          fontSize: 15, fontWeight: 700, cursor: pdfLoading ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          minHeight: 54, transition: 'background 0.15s',
        }}
      >
        {pdfLoading ? '⏳ Génération en cours...' : '📄 Télécharger mon programme PDF'}
      </button>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function EspacePatient() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code');

  const [loading, setLoading] = useState(true);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [seances, setSeances] = useState<Seance[]>([]);
  const [bilans, setBilans] = useState<Bilan[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [onglet, setOnglet] = useState<'progres' | 'rdv' | 'programme'>('progres');

  useEffect(() => {
    if (!id || !supabase) { setLoading(false); return; }

    async function chargerDonnees() {
      try {
        const [participantRes, bilansRes, seancesRes, programmesRes] = await Promise.all([
          supabase!.from('participants').select('*').eq('id', id).single(),
          supabase!.from('bilans').select('*').eq('participant_id', id).order('date'),
          supabase!.from('seances').select('*').eq('participant_id', id).order('date'),
          supabase!.from('programmes').select('*').eq('participant_id', id),
        ]);

        if (participantRes.data) setParticipant(dbToParticipant(participantRes.data));
        if (bilansRes.data) setBilans(bilansRes.data.map(dbToBilan));
        if (seancesRes.data) setSeances(seancesRes.data.map(dbToSeance));
        if (programmesRes.data) setProgrammes(programmesRes.data.map(dbToProgramme));
      } catch (err) {
        console.error('[EspacePatient] erreur chargement:', err);
      } finally {
        setLoading(false);
      }
    }

    void chargerDonnees();
  }, [id]);

  if (!id) return <Navigate to="/patient" replace />;

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0D2B2B',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🌊</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#2BBFBF', marginBottom: 8 }}>Chargement…</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Récupération de vos données</div>
        </div>
      </div>
    );
  }

  if (!participant) return <Navigate to="/patient" replace />;
  if (!code || calculerCode(participant.prenom) !== code) return <Navigate to="/patient" replace />;

  const today = new Date().toISOString().split('T')[0];
  const prochaine = seances
    .filter(s => s.date >= today && s.statut === 'planifiee')
    .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;

  const onglets = [
    { id: 'progres' as const, label: '📈 Progrès' },
    { id: 'rdv'    as const, label: '📅 RDV' },
    { id: 'programme' as const, label: '🏋️ Programme' },
  ];

  return (
    <div style={{
      maxWidth: 600, margin: '0 auto',
      minHeight: '100vh', background: '#F4FAFA',
      fontFamily: "'Nunito', sans-serif",
      fontSize: 14,
    }}>

      {/* HEADER */}
      <div style={{ background: '#0D2B2B', padding: '24px 20px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <img src="/logo-horizon.png" style={{ height: 24 }} alt="Horizon" />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
            Mouv'APA · Pierre Clavier
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', background: '#2BBFBF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 700, color: 'white', flexShrink: 0,
          }}>
            {participant.prenom[0]}{participant.nom[0]}
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'white' }}>
              Bonjour {participant.prenom} 👋
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
              Votre espace personnel de suivi APA
            </div>
          </div>
        </div>

        {prochaine && (
          <div style={{
            marginTop: 14,
            background: 'rgba(43,191,191,0.2)',
            border: '1px solid rgba(43,191,191,0.3)',
            borderRadius: 10, padding: '10px 14px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 10, color: '#2BBFBF', fontWeight: 700, letterSpacing: '0.06em' }}>
                PROCHAIN RENDEZ-VOUS
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'white', marginTop: 2, textTransform: 'capitalize' }}>
                {formatDateLong(prochaine.date)}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                {formatHeure(prochaine.heureDebut)} · {prochaine.dureeMinutes} min
              </div>
            </div>
            <span style={{ fontSize: 26 }}>📅</span>
          </div>
        )}
      </div>

      {/* ONGLETS */}
      <div style={{
        display: 'flex', background: 'white',
        borderBottom: '1px solid #E0EEEE',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        {onglets.map(o => (
          <button
            key={o.id}
            onClick={() => setOnglet(o.id)}
            style={{
              flex: 1, padding: '14px 8px',
              background: 'none', border: 'none',
              borderBottom: onglet === o.id ? '2px solid #2BBFBF' : '2px solid transparent',
              color: onglet === o.id ? '#2BBFBF' : '#8FA8A8',
              fontWeight: onglet === o.id ? 700 : 400,
              fontSize: 13, cursor: 'pointer',
              whiteSpace: 'nowrap', minHeight: 44,
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* CONTENU */}
      <div style={{ padding: '16px' }}>
        {onglet === 'progres' && (
          <OngletProgresPatient
            participant={participant}
            seances={seances}
            bilans={bilans}
          />
        )}
        {onglet === 'rdv' && <OngletRDVPatient seances={seances} />}
        {onglet === 'programme' && (
          <OngletProgrammePatient
            participant={participant}
            programmes={programmes}
          />
        )}
      </div>

      {/* BANNIERE PWA */}
      <BannierePWA />

      {/* FOOTER */}
      <div style={{
        textAlign: 'center', padding: '20px',
        fontSize: 12, color: '#8FA8A8',
        borderTop: '1px solid #E0EEEE', background: 'white',
        lineHeight: 1.7,
      }}>
        Espace personnel sécurisé · Horizon<br />
        Données visibles uniquement par vous<br />
        et Pierre Clavier · Mouv'APA
      </div>
    </div>
  );
}
