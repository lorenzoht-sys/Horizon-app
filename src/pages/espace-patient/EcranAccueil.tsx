import { useState, useEffect } from 'react';
import type { Participant, Seance, Bilan, Programme, ProgrammeV2 } from '../../types';
import { prochainsCours, jourLocal, type CoursPatientRecord, type ReponseAnnonceeCours } from '../../lib/coursPatient';
import { BannierePWA } from './BannierePWA';
import { BoutonSignalementAbsence, CarteAutresCoursAVenir, CarteMesCours, CarteProchainCours } from './CartesCours';
import { SectionRappels } from './SectionRappels';
import { C, fmt, fmtCourt, fmtHeure, fmtMoisAnnee, loadPraticien } from './communs';

// ── Cours collectifs (lecture seule) ──────────────────────────────────────────
// Les données arrivent de /api/patient/me, déjà filtrées côté serveur : jamais de note du
// praticien, jamais de facturation, et une présence SEULEMENT sur un cours réalisé.

// L'heure change pendant que la page est ouverte : à l'heure du cours, les boutons doivent
// disparaître sans que le bénéficiaire ait à recharger. (Le serveur refuse de toute façon.)
export function useMaintenant(pasMs: number = 30_000): number {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setMaintenant(Date.now()), pasMs);
    return () => clearInterval(id);
  }, [pasMs]);
  return maintenant;
}

// ── ÉCRAN 1 — Accueil ─────────────────────────────────────────────────────────

export function EcranAccueil({
  participant, praticienPrenom, seances, coursCollectifs, onAnnonce, onSignalementAbsence, bilans, programmes, programmesV2, token,
}: {
  participant: Participant;
  praticienPrenom: string | null;
  seances: Seance[];
  coursCollectifs: CoursPatientRecord[];
  /** Met à jour la réponse annoncée d'un cours (null : retour en arrière après un échec d'enregistrement). */
  onAnnonce: (coursId: string, reponse: ReponseAnnonceeCours | null) => void;
  /** Met à jour absenceSignaleeLe d'une séance (null : retour en arrière après un échec). */
  onSignalementAbsence: (seanceId: string, valeur: string | null) => void;
  bilans: Bilan[];
  programmes: Programme[];
  programmesV2: ProgrammeV2[];
  token: string;
}) {
  const praticien = loadPraticien();
  const today = new Date().toISOString().split('T')[0];

  const maintenant = useMaintenant();

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
  const messagePraticien = dernierBilan?.messageClient;
  // Repli sur l'ancienne cle : une ligne pas encore migree ne porte que
  // `messagePierre`, et la lire comme absente l'afficherait par defaut.
  const messageAutorise =
    participant.visibiliteBeneficiaire?.messagePraticien
    ?? participant.visibiliteBeneficiaire?.messagePierre
    ?? true;

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
          <BoutonSignalementAbsence seance={prochaine} token={token} maintenantMs={maintenant} praticienPrenom={praticienPrenom} onSignalement={onSignalementAbsence} />
        </div>
      )}

      {/* Prochain cours collectif */}
      {(() => {
        // Les 4 prochains cours : le premier en grand, les suivants dans une carte à part.
        const [prochain, ...autres] = prochainsCours(coursCollectifs, jourLocal());
        return (
          <>
            {prochain && <CarteProchainCours cours={prochain} token={token} maintenantMs={maintenant} onReponse={onAnnonce} />}
            {autres.length > 0 && <CarteAutresCoursAVenir cours={autres} token={token} maintenantMs={maintenant} onReponse={onAnnonce} />}
          </>
        );
      })()}

      {/* Historique des cours collectifs : présence, effort perçu, bien-être */}
      <CarteMesCours cours={coursCollectifs} />

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

      {/* Message du praticien */}
      {messagePraticien && messageAutorise && (
        <div style={{
          background: 'rgba(43,191,191,0.08)',
          border: '1px solid rgba(43,191,191,0.25)',
          borderRadius: 18, padding: '16px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.teal, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
            Message de {praticien.nom.split(' ')[0]}
          </div>
          <div style={{ fontSize: 14, color: C.text, lineHeight: 1.7, fontStyle: 'italic' }}>
            💬 "{messagePraticien}"
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
      <SectionRappels token={token} />
    </div>
  );
}
