import { useState } from 'react';
import { useParams, useSearchParams, Navigate } from 'react-router-dom';
import type { Participant, Seance, Bilan, Contrat, Programme } from '../types';
import { getAccesPatient, isExpire, mettreAJourDernierAcces } from '../hooks/useAccesPatients';
import { loadExercices } from '../data/exercices';

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadParticipant(id: string): Participant | null {
  try {
    const list: Participant[] = JSON.parse(localStorage.getItem('mouvtrack_participants') ?? '[]');
    return list.find(p => p.id === id) ?? null;
  } catch { return null; }
}

function loadSeancesPatient(participantId: string): Seance[] {
  try {
    const list: Seance[] = JSON.parse(localStorage.getItem('mouvtrack_seances') ?? '[]');
    return list.filter(s => s.participantId === participantId);
  } catch { return []; }
}

function loadContratActif(participantId: string): Contrat | null {
  try {
    const list: Contrat[] = JSON.parse(localStorage.getItem('mouvtrack_contrats') ?? '[]');
    return list.find(c => c.participantId === participantId && c.statut === 'actif') ?? null;
  } catch { return null; }
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

function formatHeure(h: string): string { return h.slice(0, 5); }

// ── Onglet Progrès ────────────────────────────────────────────────────────────

function OngletProgresPatient({
  participant, seances, messagePierre,
}: {
  participant: Participant;
  seances: Seance[];
  messagePierre: boolean;
}) {
  const realisees = seances.filter(s => s.statut === 'realisee');
  const maintenant = new Date();
  const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1).toISOString().split('T')[0];
  const seancesMois = realisees.filter(s => s.date >= debutMois).length;

  const bilans = [...participant.bilans].sort((a, b) => a.date.localeCompare(b.date));
  const dernierBilan = bilans[bilans.length - 1] ?? null;

  const settings = (() => {
    try { return JSON.parse(localStorage.getItem('settings_praticien') ?? '{}'); } catch { return {}; }
  })();
  const messagePierreTexte = (() => {
    try {
      const acces = JSON.parse(localStorage.getItem('horizon_acces_patients') ?? '[]');
      return acces.find((a: { participantId: string; messagePierreTexte?: string }) => a.participantId === participant.id)?.messagePierreTexte ?? null;
    } catch { return null; }
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Message de Pierre */}
      {messagePierre && messagePierreTexte && (
        <div style={{
          background: 'white', borderRadius: 14,
          border: '1px solid #E0EEEE', padding: '16px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#2BBFBF', letterSpacing: '0.06em', marginBottom: 6 }}>
            MESSAGE DE {(settings.prenom || 'PIERRE').toUpperCase()}
          </div>
          <div style={{ fontSize: 14, color: '#0D2B2B', lineHeight: 1.6, fontStyle: 'italic' }}>
            💬 {messagePierreTexte}
          </div>
        </div>
      )}

      {/* Stats séances */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{
          background: 'white', borderRadius: 14, border: '1px solid #E0EEEE',
          padding: '16px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#2BBFBF' }}>{realisees.length}</div>
          <div style={{ fontSize: 12, color: '#8FA8A8', marginTop: 4 }}>séances réalisées</div>
        </div>
        <div style={{
          background: 'white', borderRadius: 14, border: '1px solid #E0EEEE',
          padding: '16px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#2BBFBF' }}>{seancesMois}</div>
          <div style={{ fontSize: 12, color: '#8FA8A8', marginTop: 4 }}>ce mois-ci</div>
        </div>
      </div>

      {/* Dernier bilan */}
      {dernierBilan && (
        <div style={{
          background: 'white', borderRadius: 14, border: '1px solid #E0EEEE', padding: '16px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#5C7A7A', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Dernier bilan — {formatDateFR(dernierBilan.date)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Équilibre', valeur: dernierBilan.equilibre?.droite != null ? `${dernierBilan.equilibre.droite}s` : '—' },
              { label: 'Chair Stand', valeur: dernierBilan.chairStand30 != null ? `${dernierBilan.chairStand30} rép.` : '—' },
              { label: 'HandGrip', valeur: dernierBilan.handGrip?.droite != null ? `${dernierBilan.handGrip.droite} kg` : '—' },
              { label: 'TUG 3m', valeur: dernierBilan.tug3m != null ? `${dernierBilan.tug3m}s` : '—' },
            ].map(({ label, valeur }) => (
              <div key={label} style={{
                background: '#F4FAFA', borderRadius: 10, padding: '10px 12px',
              }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#0D2B2B' }}>{valeur}</div>
                <div style={{ fontSize: 11, color: '#8FA8A8', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {realisees.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '40px 20px',
          background: 'white', borderRadius: 14, border: '1px solid #E0EEEE',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏃</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0D2B2B', marginBottom: 6 }}>
            C'est parti !
          </div>
          <div style={{ fontSize: 13, color: '#8FA8A8' }}>
            Vos séances apparaîtront ici au fur et à mesure.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Onglet Bilans ─────────────────────────────────────────────────────────────

function OngletBilansPatient({ bilans }: { bilans: Bilan[] }) {
  const sorted = [...bilans].sort((a, b) => b.date.localeCompare(a.date));

  if (sorted.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0D2B2B', marginBottom: 6 }}>Aucun bilan</div>
        <div style={{ fontSize: 13, color: '#8FA8A8' }}>Votre premier bilan apparaîtra ici.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {sorted.map(b => (
        <div key={b.id} style={{
          background: 'white', borderRadius: 14,
          border: '1px solid #E0EEEE', padding: '16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0D2B2B' }}>
                {b.type === 'initial' ? 'Bilan initial' : 'Bilan trimestriel'}
              </div>
              <div style={{ fontSize: 12, color: '#8FA8A8', marginTop: 2 }}>{formatDateFR(b.date)}</div>
            </div>
            <span style={{
              background: b.type === 'initial' ? '#DBEAFE' : '#D1FAE5',
              color: b.type === 'initial' ? '#1D4ED8' : '#065F46',
              fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
            }}>
              {b.type === 'initial' ? 'Initial' : 'Trimestriel'}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            {[
              { label: 'Équilibre D', val: b.equilibre?.droite != null ? `${b.equilibre.droite}s` : '—' },
              { label: 'Chair Stand', val: b.chairStand30 != null ? `${b.chairStand30}` : '—' },
              { label: 'HandGrip D', val: b.handGrip?.droite != null ? `${b.handGrip.droite}kg` : '—' },
              { label: 'TUG 3m', val: b.tug3m != null ? `${b.tug3m}s` : '—' },
              { label: 'TM6', val: b.tm6?.distanceMetres != null ? `${b.tm6.distanceMetres}m` : '—' },
              { label: 'Souplesse', val: b.souplesse?.valeur != null ? `${b.souplesse.valeur}cm` : '—' },
            ].map(({ label, val }) => (
              <div key={label} style={{ background: '#F4FAFA', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0D2B2B' }}>{val}</div>
                <div style={{ fontSize: 10, color: '#8FA8A8', marginTop: 1 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Onglet RDV ────────────────────────────────────────────────────────────────

function OngletRDVPatient({ seances }: { seances: Seance[] }) {
  const maintenant = new Date().toISOString().split('T')[0];
  const futures = seances
    .filter(s => s.date >= maintenant && s.statut === 'planifiee')
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10);

  if (futures.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0D2B2B', marginBottom: 6 }}>
          Aucun RDV planifié
        </div>
        <div style={{ fontSize: 13, color: '#8FA8A8' }}>
          Vos prochains rendez-vous apparaîtront ici.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {futures.map((s, i) => (
        <div key={s.id} style={{
          background: i === 0 ? '#0D2B2B' : 'white',
          borderRadius: 14,
          border: i === 0 ? 'none' : '1px solid #E0EEEE',
          padding: '16px',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, flexShrink: 0,
            background: i === 0 ? 'rgba(43,191,191,0.2)' : '#F4FAFA',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              fontSize: 16, fontWeight: 700,
              color: i === 0 ? '#2BBFBF' : '#0D2B2B',
            }}>
              {new Date(s.date + 'T12:00').getDate()}
            </div>
            <div style={{ fontSize: 10, color: i === 0 ? '#2BBFBF' : '#8FA8A8', textTransform: 'uppercase' }}>
              {new Date(s.date + 'T12:00').toLocaleDateString('fr-FR', { month: 'short' })}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 14, fontWeight: 700,
              color: i === 0 ? 'white' : '#0D2B2B',
            }}>
              {i === 0 ? 'Prochain RDV · ' : ''}{formatDateLong(s.date)}
            </div>
            <div style={{ fontSize: 12, color: i === 0 ? 'rgba(255,255,255,0.5)' : '#8FA8A8', marginTop: 2 }}>
              {formatHeure(s.heureDebut)} — {formatHeure(s.heureFin)} · {s.dureeMinutes} min
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Onglet Programme ──────────────────────────────────────────────────────────

function OngletProgrammePatient({ participant }: { participant: Participant }) {
  const programmes: Programme[] = (participant.programmes ?? [])
    .filter(p => p.actif)
    .sort((a, b) => b.dateCreation.localeCompare(a.dateCreation));
  const programme = programmes[0] ?? null;
  const exercicesCatalog = loadExercices();

  if (!programme) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🏋️</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#0D2B2B', marginBottom: 8 }}>
          Programme à venir
        </div>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                  <div style={{ fontSize: 12, color: '#2BBFBF', marginTop: 2, fontWeight: 600 }}>
                    {ex.categorie}
                  </div>
                </div>
              </div>

              {/* Corps */}
              <div style={{ padding: '14px 16px' }}>
                {/* Séries / répétitions */}
                <div style={{ display: 'flex', gap: 8, marginBottom: ex.description ? 12 : 0, flexWrap: 'wrap' }}>
                  {ep.series > 0 && (
                    <div style={{
                      background: '#E8F8F8', borderRadius: 8, padding: '8px 14px',
                      textAlign: 'center', flex: 1, minWidth: 70,
                    }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#2BBFBF' }}>{ep.series}</div>
                      <div style={{ fontSize: 11, color: '#5C7A7A' }}>série{ep.series > 1 ? 's' : ''}</div>
                    </div>
                  )}
                  {ep.repetitions != null && (
                    <div style={{
                      background: '#E8F8F8', borderRadius: 8, padding: '8px 14px',
                      textAlign: 'center', flex: 1, minWidth: 70,
                    }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#2BBFBF' }}>{ep.repetitions}</div>
                      <div style={{ fontSize: 11, color: '#5C7A7A' }}>répétitions</div>
                    </div>
                  )}
                  {ep.dureeSecondes != null && (
                    <div style={{
                      background: '#E8F8F8', borderRadius: 8, padding: '8px 14px',
                      textAlign: 'center', flex: 1, minWidth: 70,
                    }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#2BBFBF' }}>{ep.dureeSecondes}</div>
                      <div style={{ fontSize: 11, color: '#5C7A7A' }}>secondes</div>
                    </div>
                  )}
                </div>

                {/* Description du niveau */}
                {ex.description && (
                  <div style={{ fontSize: 13, color: '#4A6080', lineHeight: 1.7, marginBottom: 8 }}>
                    {ex.description}
                  </div>
                )}

                {/* Note personnalisée de Pierre */}
                {ep.notePersonnalisee && (
                  <div style={{
                    background: '#EAF3DE', border: '1px solid #C0DD97',
                    borderRadius: 8, padding: '10px 12px',
                    fontSize: 13, color: '#3B6D11', lineHeight: 1.5,
                  }}>
                    <strong>📝 Note de Pierre :</strong> {ep.notePersonnalisee}
                  </div>
                )}

                {/* Lien vidéo */}
                {ex.videoYoutubeId && (
                  <button
                    onClick={() => window.open(`https://youtube.com/watch?v=${ex.videoYoutubeId}`, '_blank')}
                    style={{
                      width: '100%', padding: '10px', marginTop: 10,
                      background: '#FEE2E2', border: '1px solid #FECACA',
                      borderRadius: 10, fontSize: 13, fontWeight: 700,
                      color: '#991B1B', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    <i className="ti ti-brand-youtube" style={{ fontSize: 18 }} aria-hidden="true" />
                    Voir la vidéo
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function EspacePatient() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code');

  const [onglet, setOnglet] = useState<'progres' | 'bilans' | 'rdv' | 'programme'>('progres');

  if (!id) return <Navigate to="/patient" replace />;

  const acces = getAccesPatient(id);

  // Vérifie que le code de l'URL correspond bien à cet accès
  if (!acces || !acces.actif || isExpire(acces.dateExpiration) || acces.code !== code) {
    return <Navigate to="/patient" replace />;
  }

  // Enregistrer la connexion si premier accès dans cette session
  if (!acces.dernierAcces || Date.now() - new Date(acces.dernierAcces).getTime() > 60000) {
    mettreAJourDernierAcces(id);
  }

  const participant = loadParticipant(id);
  if (!participant) return <Navigate to="/patient" replace />;

  const seances = loadSeancesPatient(id);
  const contrat = loadContratActif(id);

  const prochaine = seances
    .filter(s => s.date >= new Date().toISOString().split('T')[0] && s.statut === 'planifiee')
    .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;

  const v = acces.visibilite;

  const onglets = [
    v.progression && { id: 'progres'   as const, label: '📈 Progrès' },
    v.bilans      && { id: 'bilans'    as const, label: '📋 Bilans' },
    v.rdv         && { id: 'rdv'       as const, label: '📅 RDV' },
    v.programme   && { id: 'programme' as const, label: '🏋️ Programme' },
  ].filter(Boolean) as { id: typeof onglet; label: string }[];

  return (
    <div style={{
      maxWidth: 600, margin: '0 auto',
      minHeight: '100vh', background: '#F4FAFA',
      fontFamily: "'Nunito', sans-serif",
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
            fontSize: 18, fontWeight: 700, color: 'white',
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

        {/* Prochain RDV */}
        {v.rdv && prochaine && (
          <div style={{
            marginTop: 14, background: 'rgba(43,191,191,0.2)',
            border: '1px solid rgba(43,191,191,0.3)',
            borderRadius: 10, padding: '10px 14px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 10, color: '#2BBFBF', fontWeight: 700, letterSpacing: '0.06em' }}>
                PROCHAIN RENDEZ-VOUS
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'white', marginTop: 2 }}>
                {formatDateLong(prochaine.date)}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                {formatHeure(prochaine.heureDebut)} · {contrat?.dureeMinutes ?? prochaine.dureeMinutes} min
              </div>
            </div>
            <i className="ti ti-calendar-event" style={{ fontSize: 28, color: '#2BBFBF' }} aria-hidden="true" />
          </div>
        )}
      </div>

      {/* ONGLETS */}
      <div style={{
        display: 'flex', background: 'white',
        borderBottom: '1px solid #E0EEEE',
        position: 'sticky', top: 0, zIndex: 10,
        overflowX: 'auto',
      }}>
        {onglets.map(o => (
          <button
            key={o.id}
            onClick={() => setOnglet(o.id)}
            style={{
              flex: 1, padding: '12px 8px',
              background: 'none', border: 'none',
              borderBottom: onglet === o.id ? '2px solid #2BBFBF' : '2px solid transparent',
              color: onglet === o.id ? '#2BBFBF' : '#8FA8A8',
              fontWeight: onglet === o.id ? 700 : 400,
              fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
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
            messagePierre={v.messagePierre}
          />
        )}
        {onglet === 'bilans' && <OngletBilansPatient bilans={participant.bilans} />}
        {onglet === 'rdv' && <OngletRDVPatient seances={seances} />}
        {onglet === 'programme' && <OngletProgrammePatient participant={participant} />}
      </div>

      {/* FOOTER */}
      <div style={{
        textAlign: 'center', padding: '20px',
        fontSize: 11, color: '#8FA8A8',
        borderTop: '1px solid #E0EEEE', background: 'white',
      }}>
        Espace personnel sécurisé · Horizon<br />
        Données visibles uniquement par vous et Pierre Clavier
      </div>
    </div>
  );
}
