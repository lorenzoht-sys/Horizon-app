import { useState } from 'react';
import { toast } from 'sonner';
import type { ProgrammeSeanceV2 } from '../../types';
import { patientSauvegarderSeance, patientEnvoyerRetour } from '../../lib/patientApi';
import { C } from './communs';

// ── Mode séance ──────────────────────────────────────────────────────────────

export interface SeanceActive {
  seance: ProgrammeSeanceV2;
  progId: string;
  progNom: string;
}

export interface ExState {
  id: string;
  realise: boolean | null;
  commentaire: string;
}

export function ModeSeance({
  seanceActive,
  token,
  objectifSeancesAutonomes,
  seancesAutonomesRealisees,
  onTermine,
}: {
  seanceActive: SeanceActive;
  token: string;
  objectifSeancesAutonomes?: number;
  seancesAutonomesRealisees: number;
  onTermine: () => void;
}) {
  const { seance, progId } = seanceActive;
  const exercices = [...seance.exercices].sort((a, b) => a.ordre - b.ordre);

  const [idx, setIdx] = useState(0);
  const [states, setStates] = useState<ExState[]>(
    exercices.map(ex => ({ id: ex.id, realise: null, commentaire: '' }))
  );
  const [showComment, setShowComment] = useState(false);
  const [showFin, setShowFin] = useState(false);
  const [commentaireGlobal, setCommentaireGlobal] = useState('');
  const [saving, setSaving] = useState(false);
  const [erreurSauvegarde, setErreurSauvegarde] = useState<string | null>(null);
  const [startTime] = useState(() => Date.now());
  const [showRetour, setShowRetour] = useState(false);
  const [savedSeanceId, setSavedSeanceId] = useState<string | null>(null);
  const [borgRpe, setBorgRpe] = useState<number | null>(null);
  const [bienEtre, setBienEtre] = useState<number | null>(null);
  const [sendingRetour, setSendingRetour] = useState(false);
  const [erreurRetour, setErreurRetour] = useState(false);

  const ex = exercices[idx];
  const exState = states[idx];
  const realises = states.filter(s => s.realise === true).length;
  const passes  = states.filter(s => s.realise === false).length;

  function marquer(realise: boolean) {
    const newStates = states.map((s, i) => i === idx ? { ...s, realise } : s);
    setStates(newStates);
    setShowComment(false);
    if (idx < exercices.length - 1) {
      setIdx(idx + 1);
    } else {
      setShowFin(true);
    }
  }

  function updateComment(c: string) {
    setStates(prev => prev.map((s, i) => i === idx ? { ...s, commentaire: c } : s));
  }

  async function sauvegarder() {
    setSaving(true);
    setErreurSauvegarde(null);
    try {
      const total = exercices.length;
      const statut = realises === total ? 'terminee' : 'partielle';
      const dureeMins = Math.max(1, Math.round((Date.now() - startTime) / 60000));

      const result = await patientSauvegarderSeance(token, {
        programmeId: progId,
        seanceId: seance.id,
        dateSeance: new Date().toISOString().split('T')[0],
        statut,
        commentairePatient: commentaireGlobal.trim() || null,
        dureeMinutes: dureeMins,
        exercices: states.map(es => ({
          id: es.id,
          realise: es.realise ?? false,
          commentaire: es.commentaire.trim() || undefined,
        })),
      });

      if (!result.ok) {
        setErreurSauvegarde(result.error ?? "L'enregistrement a échoué (problème de connexion). Vos réponses n'ont pas été perdues : réessayez.");
        setSaving(false);
        return;
      }
      if (objectifSeancesAutonomes) {
        const nb = Math.min(seancesAutonomesRealisees + 1, objectifSeancesAutonomes);
        toast.success(`Séance autonome enregistrée : ${nb}/${objectifSeancesAutonomes}, continuez !`);
      }
      setSavedSeanceId(result.seancePatientId ?? null);
      setShowRetour(true); // Proposer le formulaire de ressenti — séance déjà enregistrée
    } finally {
      setSaving(false);
    }
  }

  // ── Formulaire retour post-séance (Borg RPE + bien-être) ────────────────────
  // Apparaît après la sauvegarde réussie. Optionnel : "Passer" ferme sans enregistrer.

  const NIVEAUX_EFFORT = [
    { label: 'Très facile', borg: 2,  couleur: '#16A34A' },
    { label: 'Facile',      borg: 4,  couleur: '#65A84E' },
    { label: 'Modéré',      borg: 6,  couleur: '#CA8A04' },
    { label: 'Difficile',   borg: 8,  couleur: '#EA580C' },
    { label: 'Très difficile', borg: 10, couleur: '#DC2626' },
  ] as const;

  const NIVEAUX_BIEN_ETRE = [
    { label: 'Très bien',  val: 1, couleur: '#16A34A' },
    { label: 'Bien',       val: 2, couleur: '#65A84E' },
    { label: 'Correct',    val: 3, couleur: '#CA8A04' },
    { label: 'Fatigué',    val: 4, couleur: '#EA580C' },
    { label: 'Épuisé',     val: 5, couleur: '#DC2626' },
  ] as const;

  async function soumettreRetour() {
    if (borgRpe === null || bienEtre === null) return;
    setSendingRetour(true);
    setErreurRetour(false);
    const ok = await patientEnvoyerRetour(token, { seanceId: savedSeanceId, borgRpe, bienEtre });
    setSendingRetour(false);
    if (!ok) { setErreurRetour(true); return; }
    onTermine();
  }

  if (showRetour) {
    const btnStyle = (couleur: string, selected: boolean): React.CSSProperties => ({
      flex: '1 1 0',
      minWidth: 58,
      padding: '14px 6px',
      border: `2.5px solid ${selected ? couleur : '#E0EEEE'}`,
      borderRadius: 14,
      background: selected ? couleur + '18' : 'white',
      color: selected ? couleur : C.text,
      fontWeight: selected ? 700 : 500,
      fontSize: 12,
      lineHeight: 1.3,
      cursor: 'pointer',
      textAlign: 'center',
      transition: 'all 0.15s ease',
    });

    return (
      <div style={{
        position: 'fixed', inset: 0, background: C.bg, zIndex: 200,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '32px 20px',
        maxWidth: 600, margin: '0 auto', fontFamily: 'var(--font-sans)',
      }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: C.dark, marginBottom: 4, textAlign: 'center' }}>
          Votre ressenti après la séance
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 32, textAlign: 'center' }}>
          Deux questions, environ 10 secondes.
        </div>

        {/* Question 1 — Effort */}
        <div style={{ width: '100%', marginBottom: 28 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 12 }}>
            Comment était l'effort ?
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {NIVEAUX_EFFORT.map(n => (
              <button key={n.borg} onClick={() => setBorgRpe(n.borg)} style={btnStyle(n.couleur, borgRpe === n.borg)}>
                {n.label}
              </button>
            ))}
          </div>
        </div>

        {/* Question 2 — Bien-être */}
        <div style={{ width: '100%', marginBottom: 36 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 12 }}>
            Comment vous sentez-vous ?
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {NIVEAUX_BIEN_ETRE.map(n => (
              <button key={n.val} onClick={() => setBienEtre(n.val)} style={btnStyle(n.couleur, bienEtre === n.val)}>
                {n.label}
              </button>
            ))}
          </div>
        </div>

        {erreurRetour && (
          <div style={{ width: '100%', background: '#FFF5F5', border: '1px solid #FECACA', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#B91C1C', marginBottom: 16, lineHeight: 1.5, textAlign: 'center' }}>
            😕 L'enregistrement a échoué (problème de connexion). Réessayez.
          </div>
        )}

        <button
          onClick={soumettreRetour}
          disabled={borgRpe === null || bienEtre === null || sendingRetour}
          style={{
            width: '100%', padding: '18px',
            background: (borgRpe !== null && bienEtre !== null && !sendingRetour) ? C.teal : C.gray,
            color: 'white', border: 'none', borderRadius: 16,
            fontSize: 16, fontWeight: 800,
            cursor: (borgRpe !== null && bienEtre !== null) ? 'pointer' : 'not-allowed',
            marginBottom: 12, transition: 'background 0.2s',
          }}
        >
          {sendingRetour ? 'Enregistrement…' : 'Valider'}
        </button>

        <button
          onClick={onTermine}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: C.muted, padding: 8 }}
        >
          Passer
        </button>
      </div>
    );
  }

  // ── Écran de fin ────────────────────────────────────────────────────────────
  if (showFin) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: C.bg, zIndex: 200,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '32px 24px',
        maxWidth: 600, margin: '0 auto',
        fontFamily: 'var(--font-sans)',
      }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: C.dark, marginBottom: 6, textAlign: 'center' }}>
          Séance terminée !
        </div>
        <div style={{ fontSize: 14, color: C.muted, marginBottom: 24, textAlign: 'center' }}>
          {seance.nom} · {progId && seanceActive.progNom}
        </div>

        {/* Barre de résultat */}
        <div style={{ width: '100%', marginBottom: 16 }}>
          <div style={{ height: 8, background: '#E0EEEE', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ height: '100%', background: C.teal, borderRadius: 10, width: `${(realises / exercices.length) * 100}%`, transition: 'width 0.6s ease' }} />
          </div>
          <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: C.dark }}>
            {realises}/{exercices.length} exercices réalisés
          </div>
        </div>

        {passes > 0 && (
          <div style={{ width: '100%', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 13, color: C.green }}>✅ {realises} exercice{realises > 1 ? 's' : ''} réalisé{realises > 1 ? 's' : ''}</div>
            <div style={{ fontSize: 13, color: C.orange }}>⏭️ {passes} exercice{passes > 1 ? 's' : ''} passé{passes > 1 ? 's' : ''}</div>
          </div>
        )}

        {objectifSeancesAutonomes && (
          <div style={{ width: '100%', marginBottom: 20, background: '#F0FBFB', border: '1px solid rgba(43,191,191,0.25)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 13, color: C.dark }}>
              🏃 En validant, cette séance comptera dans votre progression autonome :{' '}
              <strong>{Math.min(seancesAutonomesRealisees + 1, objectifSeancesAutonomes)}/{objectifSeancesAutonomes}</strong>
            </div>
          </div>
        )}

        {/* Commentaire global */}
        <div style={{ width: '100%', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.dark, marginBottom: 8 }}>
            Un mot sur votre séance ? <span style={{ color: C.muted, fontWeight: 400 }}>(optionnel)</span>
          </div>
          <textarea
            value={commentaireGlobal}
            onChange={e => setCommentaireGlobal(e.target.value.slice(0, 300))}
            rows={3}
            placeholder="Comment s'est passée cette séance ?"
            style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', fontSize: 14, resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none', background: 'white' }}
          />
        </div>

        {erreurSauvegarde && (
          <div style={{ width: '100%', background: '#FFF5F5', border: '1px solid #FECACA', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#B91C1C', marginBottom: 12, lineHeight: 1.5 }}>
            😕 {erreurSauvegarde}
          </div>
        )}

        <button
          onClick={sauvegarder}
          disabled={saving}
          style={{ width: '100%', padding: '18px', background: saving ? C.muted : C.teal, color: 'white', border: 'none', borderRadius: 16, fontSize: 16, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', marginBottom: 12 }}
        >
          {saving ? '⏳ Enregistrement…' : '💾 Valider et enregistrer'}
        </button>

        <button
          onClick={onTermine}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: C.muted, padding: 8 }}
        >
          ← Retour au programme
        </button>
      </div>
    );
  }

  // ── Exercice en cours ────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, background: C.bg, zIndex: 200,
      display: 'flex', flexDirection: 'column',
      maxWidth: 600, margin: '0 auto',
      fontFamily: 'var(--font-sans)',
    }}>
      {/* Header */}
      <div style={{ background: C.dark, padding: '14px 18px', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <button
            onClick={onTermine}
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}
          >
            ✕ Quitter
          </button>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'white', textAlign: 'center', flex: 1, padding: '0 8px' }}>{seance.nom}</div>
          <div style={{ fontSize: 13, color: C.teal, fontWeight: 700 }}>{realises}/{exercices.length} ✅</div>
        </div>
        {/* Progression */}
        <div style={{ height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: C.teal, borderRadius: 10, width: `${(idx / exercices.length) * 100}%`, transition: 'width 0.3s ease' }} />
        </div>
      </div>

      {/* Corps scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 0' }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            {idx + 1} sur {exercices.length}
          </span>
        </div>

        {/* Carte exercice */}
        <div style={{ background: 'white', borderRadius: 20, padding: '22px 20px', marginBottom: 16, boxShadow: '0 4px 20px rgba(13,43,43,0.07)' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.dark, marginBottom: 4 }}>{ex.nom}</div>
          {ex.categorie && (
            <div style={{ fontSize: 11, color: C.teal, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>
              {ex.categorie}
            </div>
          )}

          {/* Compteurs */}
          {(ex.series != null || ex.repetitions != null || ex.dureeSecondes != null) && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              {ex.series != null && (
                <div style={{ flex: 1, background: '#E8F8F8', borderRadius: 14, padding: '14px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 30, fontWeight: 800, color: C.teal }}>{ex.series}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>série{ex.series > 1 ? 's' : ''}</div>
                </div>
              )}
              {ex.repetitions != null && (
                <div style={{ flex: 1, background: '#E8F8F8', borderRadius: 14, padding: '14px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 30, fontWeight: 800, color: C.teal }}>{ex.repetitions}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>répétitions</div>
                </div>
              )}
              {ex.dureeSecondes != null && (
                <div style={{ flex: 1, background: '#E8F8F8', borderRadius: 14, padding: '14px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 30, fontWeight: 800, color: C.teal }}>{ex.dureeSecondes}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>secondes</div>
                </div>
              )}
            </div>
          )}

          {ex.description && (
            <div style={{ fontSize: 14, color: '#4A6080', lineHeight: 1.7, marginBottom: 12 }}>
              {ex.description}
            </div>
          )}

          {ex.conseilSecurite && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12, padding: '12px 14px', fontSize: 13, color: '#92400E', lineHeight: 1.5 }}>
              💡 {ex.conseilSecurite}
            </div>
          )}
        </div>

        {/* Commentaire optionnel */}
        {showComment ? (
          <textarea
            autoFocus
            value={exState.commentaire}
            onChange={e => updateComment(e.target.value.slice(0, 200))}
            rows={3}
            placeholder="Comment ça s'est passé ? Douleur ? Difficulté ?"
            style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', fontSize: 14, resize: 'none', marginBottom: 12, boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none', background: 'white' }}
          />
        ) : (
          <button
            onClick={() => setShowComment(true)}
            style={{ width: '100%', background: 'white', border: `1px dashed ${C.border}`, borderRadius: 12, padding: '12px 16px', fontSize: 13, color: C.muted, textAlign: 'left', cursor: 'pointer', marginBottom: 12 }}
          >
            💬 Ajouter un commentaire...
          </button>
        )}
      </div>

      {/* Boutons d'action */}
      <div style={{ padding: '14px 20px 32px', background: 'white', borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
        <button
          onClick={() => marquer(true)}
          style={{ width: '100%', padding: '18px', background: C.teal, color: 'white', border: 'none', borderRadius: 16, fontSize: 16, fontWeight: 800, cursor: 'pointer', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
        >
          ✅ J'ai fait cet exercice
        </button>
        <button
          onClick={() => marquer(false)}
          style={{ width: '100%', padding: '13px', background: 'white', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 14, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
        >
          ⏭️ Passer cet exercice
        </button>
      </div>
    </div>
  );
}
