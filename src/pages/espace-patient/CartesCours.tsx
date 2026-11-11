import { useState } from 'react';
import type { Seance } from '../../types';
import { historiqueCours, reponseEncoreOuverte, debutCoursParis, LIBELLE_PRESENCE_PATIENT, type CoursPatientRecord, type PresenceCoursPatient, type ReponseAnnonceeCours } from '../../lib/coursPatient';
import { niveauEffort, niveauBienEtre } from '../../lib/ressentiCours';
import { libellesSignalementAbsence } from '../../lib/libellesSignalementAbsence';
import { patientAnnoncerPresence, patientSignalerAbsence } from '../../lib/patientApi';
import { C, fmt, fmtCourt, fmtHeure } from './communs';

export const MESSAGE_ECHEC_ANNONCE = "Votre réponse n'a pas pu être enregistrée. Réessayez.";

// « Je viens » / « Je ne viens pas », modifiable jusqu'au DÉBUT du cours. Distinct de la présence
// que constate le praticien le jour du cours. Mise à jour immédiate, retour en arrière si
// l'enregistrement échoue ; si le serveur dit que le cours a commencé (409), les boutons
// disparaissent. Le serveur fait foi : rien de ce qui s'affiche ici n'autorise quoi que ce soit.
export function BoutonsPresence({ cours, token, maintenantMs, sombre, onReponse }: {
  cours: CoursPatientRecord;
  token: string;
  maintenantMs: number;
  /** Fond sombre (carte « prochain cours ») ou clair. */
  sombre: boolean;
  onReponse: (coursId: string, reponse: ReponseAnnonceeCours | null) => void;
}) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistre, setEnregistre] = useState(false);
  const [verrouille, setVerrouille] = useState(false);
  const ouverte = !verrouille && reponseEncoreOuverte(cours, maintenantMs);

  async function repondre(reponse: ReponseAnnonceeCours) {
    if (envoi || !ouverte || cours.presenceAnnoncee === reponse) return;
    const precedente = cours.presenceAnnoncee;
    setEnvoi(true);
    setErreur(null);
    setEnregistre(false);
    onReponse(cours.coursId, reponse); // mise à jour immédiate
    const r = await patientAnnoncerPresence(token, cours.coursId, reponse);
    setEnvoi(false);
    if (r.ok) { setEnregistre(true); return; }
    onReponse(cours.coursId, precedente); // retour en arrière : ce qui est affiché doit être ce qui est enregistré
    if (r.status === 409) setVerrouille(true);
    setErreur(r.error ?? MESSAGE_ECHEC_ANNONCE);
  }

  const discret = sombre ? 'rgba(255,255,255,0.6)' : C.muted;

  if (!ouverte) {
    const texte = cours.presenceAnnoncee === 'vient'
      ? 'Vous avez répondu : je viens.'
      : cours.presenceAnnoncee === 'ne_vient_pas'
        ? 'Vous avez répondu : je ne viens pas.'
        : "Vous n'avez pas répondu.";
    return (
      <div data-testid="presence-fermee" style={{ marginTop: 12, fontSize: 12, color: discret }}>
        {texte}
        {erreur && <div role="alert" data-testid="erreur-presence" style={{ marginTop: 4, color: sombre ? '#FCA5A5' : '#B42318' }}>{erreur}</div>}
      </div>
    );
  }

  function styleBouton(reponse: ReponseAnnonceeCours): React.CSSProperties {
    const choisi = cours.presenceAnnoncee === reponse;
    const base: React.CSSProperties = {
      flex: 1, minHeight: 44, padding: '10px 12px', borderRadius: 12, fontSize: 14, fontWeight: 700,
      cursor: envoi ? 'wait' : 'pointer', opacity: envoi && !choisi ? 0.6 : 1,
    };
    if (choisi) {
      const fond = reponse === 'vient' ? '#16A34A' : '#B42318';
      return { ...base, background: fond, color: 'white', border: '1px solid ' + fond };
    }
    return sombre
      ? { ...base, background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.35)' }
      : { ...base, background: 'white', color: C.text, border: '1px solid ' + C.border };
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 12, color: discret, marginBottom: 8 }}>Serez-vous présent(e) à ce cours ?</div>
      <div role="group" aria-label="Votre présence à ce cours" style={{ display: 'flex', gap: 8 }}>
        <button type="button" data-testid="bouton-vient" aria-pressed={cours.presenceAnnoncee === 'vient'} disabled={envoi}
          onClick={() => repondre('vient')} style={styleBouton('vient')}>
          Je viens
        </button>
        <button type="button" data-testid="bouton-ne-vient-pas" aria-pressed={cours.presenceAnnoncee === 'ne_vient_pas'} disabled={envoi}
          onClick={() => repondre('ne_vient_pas')} style={styleBouton('ne_vient_pas')}>
          Je ne viens pas
        </button>
      </div>
      {erreur && (
        <div role="alert" data-testid="erreur-presence" style={{ marginTop: 8, fontSize: 12, color: sombre ? '#FCA5A5' : '#B42318' }}>{erreur}</div>
      )}
      {!erreur && enregistre && (
        <div aria-live="polite" data-testid="presence-enregistree" style={{ marginTop: 8, fontSize: 12, color: sombre ? '#86EFAC' : '#166534' }}>
          ✓ Réponse enregistrée
        </div>
      )}
      {!erreur && !enregistre && (
        <div style={{ marginTop: 8, fontSize: 11, color: discret }}>
          {cours.presenceAnnoncee ? 'Vous pouvez encore changer d\u2019avis jusqu\u2019au début du cours.' : 'Vous pouvez répondre jusqu\u2019au début du cours.'}
        </div>
      )}
    </div>
  );
}

export const MESSAGE_ECHEC_SIGNALEMENT = "Votre signalement n'a pas pu être enregistré. Réessayez.";
export const MESSAGE_TROP_DE_TENTATIVES = 'Trop de tentatives pour le moment — merci de réessayer dans quelques minutes.';

// « Prévenir mon praticien de mon absence » / rétractation, pour la prochaine séance
// individuelle planifiée — même patron que BoutonsPresence (cours
// collectifs) : mise à jour immédiate, retour en arrière si l'enregistrement
// échoue, bouton qui disparaît si le serveur dit que c'est trop tard (409).
// Ne change JAMAIS `statut` : ce n'est qu'un signal pour le praticien, voir
// api/_lib/absenceSignalee.ts.
// Libellé : l'ancien « 🚫 Je ne serai pas disponible » a été lu par une
// patiente comme un message du praticien annonçant qu'il ne viendrait pas
// (retour terrain, 2026-10). Le libellé nomme désormais l'action du
// bénéficiaire et son destinataire, par son prénom quand on le connaît
// (src/lib/libellesSignalementAbsence.ts).
export function BoutonSignalementAbsence({ seance, token, maintenantMs, praticienPrenom, onSignalement }: {
  seance: Seance;
  token: string;
  maintenantMs: number;
  praticienPrenom: string | null;
  /** Met à jour absenceSignaleeLe localement (null : retour en arrière après un échec). */
  onSignalement: (seanceId: string, valeur: string | null) => void;
}) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistre, setEnregistre] = useState(false);
  const [verrouille, setVerrouille] = useState(false);

  const debut = debutCoursParis(seance.date, seance.heureDebut);
  const ouvert = !verrouille && seance.statut === 'planifiee' && debut !== null && maintenantMs < debut;
  if (!ouvert) return null;

  const signale = !!seance.absenceSignaleeLe;
  const libelles = libellesSignalementAbsence(praticienPrenom);

  async function basculer() {
    if (envoi) return;
    const precedent = seance.absenceSignaleeLe ?? null;
    const nouvelleValeur = signale ? null : new Date().toISOString();
    setEnvoi(true);
    setErreur(null);
    setEnregistre(false);
    onSignalement(seance.id, nouvelleValeur); // mise à jour immédiate
    const r = await patientSignalerAbsence(token, !signale);
    setEnvoi(false);
    if (r.ok) { setEnregistre(true); return; }
    onSignalement(seance.id, precedent); // retour en arrière : ce qui est affiché doit être ce qui est enregistré
    if (r.status === 409) { setVerrouille(true); return; }
    if (r.status === 429) { setErreur(MESSAGE_TROP_DE_TENTATIVES); return; }
    setErreur(r.error ?? MESSAGE_ECHEC_SIGNALEMENT);
  }

  return (
    <div style={{ marginTop: 14 }}>
      <button type="button" data-testid="bouton-signalement-absence" aria-pressed={signale} disabled={envoi}
        onClick={basculer}
        style={{
          width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 12, fontSize: 14, fontWeight: 700,
          cursor: envoi ? 'wait' : 'pointer', opacity: envoi ? 0.6 : 1,
          background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.35)',
        }}>
        {signale ? libelles.annuler : libelles.bouton}
      </button>
      {erreur && (
        <div role="alert" data-testid="erreur-signalement-absence" style={{ marginTop: 8, fontSize: 12, color: '#FCA5A5' }}>{erreur}</div>
      )}
      {!erreur && enregistre && (
        <div aria-live="polite" data-testid="signalement-absence-enregistre" style={{ marginTop: 8, fontSize: 12, color: '#86EFAC' }}>
          {signale ? libelles.confirmation : '✓ Signalement annulé'}
        </div>
      )}
    </div>
  );
}

export function CarteProchainCours({ cours, token, maintenantMs, onReponse }: {
  cours: CoursPatientRecord; token: string; maintenantMs: number;
  onReponse: (coursId: string, reponse: ReponseAnnonceeCours | null) => void;
}) {
  return (
    <div style={{ background: C.dark, borderRadius: 18, padding: '18px 16px' }} data-testid="prochain-cours">
      <div style={{ fontSize: 11, fontWeight: 700, color: C.teal, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
        Votre prochain cours collectif
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'white', textTransform: 'capitalize', marginBottom: 4 }}>
        👥 {fmt(cours.date)}
      </div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
        {fmtHeure(cours.heureDebut)} · {cours.dureeMinutes} min · {cours.titre}
      </div>
      <BoutonsPresence cours={cours} token={token} maintenantMs={maintenantMs} sombre onReponse={onReponse} />
    </div>
  );
}

// Les cours à venir SUIVANTS (jusqu'à 3 après le prochain) : un groupe hebdomadaire peut
// vouloir répondre plusieurs semaines à l'avance.
export function CarteAutresCoursAVenir({ cours, token, maintenantMs, onReponse }: {
  cours: CoursPatientRecord[]; token: string; maintenantMs: number;
  onReponse: (coursId: string, reponse: ReponseAnnonceeCours | null) => void;
}) {
  return (
    <div style={{ background: 'white', border: '1px solid ' + C.border, borderRadius: 18, padding: '18px 16px' }} data-testid="autres-cours">
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
        Vos autres cours à venir
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {cours.map(c => (
          <div key={c.coursId} data-testid="cours-a-venir">
            <div style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>👥 {c.titre}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              {/* La majuscule ne vaut que pour la date : sur toute la ligne, « min » devenait « Min ». */}
              <span style={{ textTransform: 'capitalize' }}>{fmt(c.date)}</span> · {fmtHeure(c.heureDebut)} · {c.dureeMinutes} min
            </div>
            <BoutonsPresence cours={c} token={token} maintenantMs={maintenantMs} sombre={false} onReponse={onReponse} />
          </div>
        ))}
      </div>
    </div>
  );
}

export const COULEURS_PRESENCE_PATIENT: Record<PresenceCoursPatient, { fond: string; texte: string }> = {
  present: { fond: '#DCFCE7', texte: '#166534' },
  absent:  { fond: '#FEF0EF', texte: '#B42318' },
  excuse:  { fond: '#FEF5E7', texte: '#92400E' },
};

export const NB_COURS_VISIBLES = 5;

export function CarteMesCours({ cours }: { cours: CoursPatientRecord[] }) {
  const [toutVoir, setToutVoir] = useState(false);
  const historique = historiqueCours(cours);
  if (historique.length === 0) return null;
  const visibles = toutVoir ? historique : historique.slice(0, NB_COURS_VISIBLES);

  return (
    <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 18, padding: '18px 16px' }} data-testid="mes-cours">
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
        Vos cours collectifs
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {visibles.map(c => {
          const effort = niveauEffort(c.ressentiBorg);
          const bienEtre = niveauBienEtre(c.ressentiBienetre);
          const annule = c.statut === 'annule';
          const pastille = annule
            ? { libelle: 'Cours annulé', fond: '#F3F4F6', texte: '#6B7280' }
            : c.presence
              ? { libelle: LIBELLE_PRESENCE_PATIENT[c.presence], ...COULEURS_PRESENCE_PATIENT[c.presence] }
              : null;
          return (
            <div key={c.coursId} data-testid="cours-historique">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: annule ? C.muted : C.dark }}>👥 {c.titre}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{fmtCourt(c.date)} · {fmtHeure(c.heureDebut)}</div>
                </div>
                {pastille && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 8, background: pastille.fond, color: pastille.texte, whiteSpace: 'nowrap' }}>
                    {pastille.libelle}
                  </span>
                )}
              </div>
              {(effort || bienEtre) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {effort && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'white', background: effort.couleur, padding: '2px 8px', borderRadius: 999 }}>
                      Effort : {effort.label}
                    </span>
                  )}
                  {bienEtre && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'white', background: bienEtre.couleur, padding: '2px 8px', borderRadius: 999 }}>
                      Bien-être : {bienEtre.label}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {historique.length > NB_COURS_VISIBLES && (
        <button
          type="button"
          onClick={() => setToutVoir(v => !v)}
          style={{ marginTop: 14, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: C.teal }}
        >
          {toutVoir ? 'Voir moins' : `Voir tout (${historique.length})`}
        </button>
      )}
    </div>
  );
}
