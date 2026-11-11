import { useState } from 'react';
import { toast } from 'sonner';
import type { Participant, Programme, ProgrammeV2, ProgrammeSeanceV2, JourProgramme } from '../../types';
import { JOURS_PROGRAMME } from '../../types';
import { loadExercices } from '../../lib/bibliothequeExercices';
import { exportProgrammePDF } from '../../utils/exportPDF';
import { ModeSeance, type SeanceActive } from './ModeSeance';
import { C, type SeancePatientRecord, fmtCourt, loadPraticien } from './communs';

export function fmtHistoDate(iso: string): string {
  return new Date(iso + 'T12:00').toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

// ── Helpers planning V2 ───────────────────────────────────────────────────────

export const JOURS_JS_TO_FR: JourProgramme[] = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export const JOUR_COURT_FR: Record<JourProgramme, string> = {
  lundi: 'Lun', mardi: 'Mar', mercredi: 'Mer', jeudi: 'Jeu',
  vendredi: 'Ven', samedi: 'Sam', dimanche: 'Dim',
};

export function getTodayJour(): JourProgramme {
  return JOURS_JS_TO_FR[new Date().getDay()];
}

export function getSeancesAujourdHuiV2(prog: ProgrammeV2): ProgrammeSeanceV2[] {
  const today = getTodayJour();
  const seanceIds = prog.planning.filter(p => p.jour === today).map(p => p.seanceId);
  return prog.seances.filter(s => seanceIds.includes(s.id));
}

export function getJoursActifsV2(prog: ProgrammeV2): JourProgramme[] {
  const active = new Set(prog.planning.map(p => p.jour));
  return JOURS_PROGRAMME.filter(j => active.has(j));
}

// ── Carte exercice patient ────────────────────────────────────────────────────

export function CarteExercicePatient({ ex, index }: { ex: ProgrammeV2['seances'][0]['exercices'][0]; index: number }) {
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

export function EcranProgramme({ participant, programmes, programmesV2, historiqueSeances, seancesAutonomesCount, token }: {
  participant: Participant;
  programmes: Programme[];
  programmesV2: ProgrammeV2[];
  historiqueSeances: SeancePatientRecord[];
  seancesAutonomesCount: Record<string, number>;
  token: string;
}) {
  const [selectedProgId, setSelectedProgId] = useState<string | null>(null);
  const [modeSeance, setModeSeance] = useState<SeanceActive | null>(null);
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

  // PDF programme — V1 (fallback ci-dessous) ou V2 (vue détail), même
  // fonction : exportProgrammePDF normalise selon la forme reçue.
  async function telechargerProgrammePDF(programme: Programme | ProgrammeV2) {
    setPdfLoading(true);
    try {
      await exportProgrammePDF(
        { programme, exercices: exercicesCatalog, participant, settings: { prenom: praticien.nom, nom: '', email: '', telephone: '', societe: praticien.societe } },
        `programme-${participant.prenom.toLowerCase()}.pdf`
      );
    } catch (err) {
      console.error('Erreur export PDF programme:', err);
      toast.error('Impossible de générer le PDF du programme. Réessayez.');
    } finally { setPdfLoading(false); }
  }

  // Mode séance plein écran
  if (modeSeance) {
    const progActif = programmesV2.find(p => p.id === modeSeance.progId);
    return (
      <ModeSeance
        seanceActive={modeSeance}
        token={token}
        objectifSeancesAutonomes={progActif?.objectifSeancesAutonomes}
        seancesAutonomesRealisees={seancesAutonomesCount[modeSeance.progId] ?? 0}
        onTermine={() => setModeSeance(null)}
      />
    );
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
          {selectedProg.objectifSeancesAutonomes && (() => {
            const nb = seancesAutonomesCount[selectedProg.id] ?? 0;
            const pct = Math.min(100, Math.round((nb / selectedProg.objectifSeancesAutonomes) * 100));
            return (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 6 }}>
                  <span>🏃 Séances autonomes</span>
                  <span style={{ fontWeight: 700, color: C.teal }}>{nb} / {selectedProg.objectifSeancesAutonomes}</span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: C.teal, borderRadius: 6, transition: 'width 0.5s ease' }} />
                </div>
              </div>
            );
          })()}
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

        <button onClick={() => telechargerProgrammePDF(selectedProg)} disabled={pdfLoading} style={{ width: '100%', marginTop: 14, padding: '16px', background: pdfLoading ? C.muted : C.dark, color: 'white', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: pdfLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52 }}>
          {pdfLoading ? '⏳ Génération…' : '📄 Télécharger ce programme en PDF'}
        </button>
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
          ) : seancesAujourdHui.map(s => {
            const dureeEstimee = s.exercices.length * 5;
            return (
              <div key={s.id} style={{ background: 'white', border: '2px solid rgba(43,191,191,0.35)', borderRadius: 18, padding: '18px 16px', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{ fontSize: 22 }}>🏋️</span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>{s.nom} · {s.progNom}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                      {s.exercices.length} exercice{s.exercices.length > 1 ? 's' : ''} · ~{dureeEstimee} min
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setModeSeance({ seance: s, progId: s.progId, progNom: s.progNom })}
                  style={{ width: '100%', padding: '16px', background: C.teal, color: 'white', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 10 }}
                >
                  ▶️ COMMENCER LA SÉANCE
                </button>
                <button
                  onClick={() => setSelectedProgId(s.progId)}
                  style={{ width: '100%', padding: '11px', background: 'none', border: `1px solid ${C.border}`, borderRadius: 12, fontSize: 13, color: C.muted, cursor: 'pointer' }}
                >
                  Voir les exercices
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Dernières séances */}
      {historiqueSeances.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
            Vos dernières séances
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {historiqueSeances.map(sp => {
              const prog = programmesV2.find(p => p.id === sp.programmeId);
              const seance = prog?.seances.find(s => s.id === sp.seanceId);
              const emoji = sp.statut === 'terminee' ? '✅' : sp.statut === 'partielle' ? '⚠️' : '🔄';
              return (
                <div key={sp.id} style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>
                        {fmtHistoDate(sp.dateSeance)}
                        {seance && <span style={{ fontWeight: 400, color: C.muted, marginLeft: 6 }}>· {seance.nom}</span>}
                        {sp.nbTotal > 0 && (
                          <span style={{ fontWeight: 600, color: sp.nbRealises === sp.nbTotal ? C.green : C.orange, marginLeft: 6 }}>
                            · {sp.nbRealises}/{sp.nbTotal}
                          </span>
                        )}
                      </div>
                      {sp.commentairePatient && (
                        <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic', marginTop: 3 }}>
                          "{sp.commentairePatient}"
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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
              const niveauNum = ep.niveau === 'debutant' ? '1' : ep.niveau === 'intermediaire' ? '2' : '3';
              const niveauCfg = ex.niveau_config?.[niveauNum];
              const niveauEmoji = ep.niveau === 'debutant' ? '🟢' : ep.niveau === 'intermediaire' ? '🟡' : '🔴';
              const niveauLabel = ep.niveau === 'debutant' ? 'Facile' : ep.niveau === 'intermediaire' ? 'Modéré' : 'Intense';
              const niveauBg = ep.niveau === 'debutant' ? '#D1FAE5' : ep.niveau === 'intermediaire' ? '#FEF3C7' : '#FEE2E2';
              const niveauColor = ep.niveau === 'debutant' ? '#065F46' : ep.niveau === 'intermediaire' ? '#92400E' : '#991B1B';
              return (
                <div key={ep.exerciceId} style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ background: C.bg, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                      {index + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>{ex.nom}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                        <div style={{ fontSize: 12, color: C.teal, fontWeight: 600 }}>{ex.categorie}</div>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: niveauBg, color: niveauColor, fontWeight: 700 }}>
                          {niveauEmoji} {niveauLabel}{niveauCfg ? ` — ${niveauCfg.description}` : ''}
                        </span>
                      </div>
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
          <button onClick={() => telechargerProgrammePDF(programmeV1!)} disabled={pdfLoading} style={{ width: '100%', padding: '16px', background: pdfLoading ? C.muted : C.dark, color: 'white', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: pdfLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52 }}>
            {pdfLoading ? '⏳ Génération…' : '📄 Télécharger mon programme PDF'}
          </button>
        </div>
      )}
    </div>
  );
}
