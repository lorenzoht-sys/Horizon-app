import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useParticipants } from '../../../hooks/useParticipants';
import BilanStepper from '../../../components/bilan/BilanStepper';
import ModalSelectionTests from '../../../components/bilan/ModalSelectionTests';
import type { Bilan } from '../../../types';
import { idSeanceDepuisRecherche, validerSeanceDuBilan } from '../../../lib/liaisonSeanceBilan';
import ModalRepriseBrouillon from '../../../components/bilan/ModalRepriseBrouillon';
import { getBrouillon, supprimerBrouillon } from '../../../hooks/useBrouillonBilan';
import { C, EcranChargement } from './communs';

// ── Nouveau bilan mobile ───────────────────────────────────────────────────────

// Deux écrans, deux URL : le choix du bénéficiaire (/?onglet=saisie&mode=bilan)
// et le bilan lui-même (/participant/:id/bilan/new — la même que le desktop,
// pour qu'une rotation affiche le même bilan).

export function ChoixBeneficiaireBilanMobile({ onBack, onChoisir }: { onBack: () => void; onChoisir: (participantId: string) => void }) {
  const { participants } = useParticipants();
  const [participantId, setParticipantId] = useState('');
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--color-ink-2)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 };

  return (
    <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 12px)', paddingLeft: 16, paddingRight: 16, paddingBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 22, color: C.text }} />
        </button>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Nouveau bilan</div>
      </div>

      <label style={label}>Sélectionner le bénéficiaire</label>
      <select value={participantId} onChange={e => setParticipantId(e.target.value)}
        style={{ width: '100%', padding: '12px 14px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 15, background: 'white', color: C.text, outline: 'none', marginBottom: 20 }}>
        <option value="">Choisir un bénéficiaire...</option>
        {participants.map(p => (
          <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>
        ))}
      </select>

      <button
        onClick={() => { if (participantId) onChoisir(participantId); }}
        disabled={!participantId}
        style={{ width: '100%', padding: 16, background: participantId ? C.primary : '#D0DCDC', color: 'white', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: participantId ? 'pointer' : 'not-allowed' }}>
        Commencer le bilan →
      </button>
    </div>
  );
}

export function BilanMobile({ participantId, onTermine }: { participantId: string; onTermine: () => void }) {
  // Lecture ET écritures sur la même instance du hook : la sélection des tests
  // doit se refléter aussitôt dans `participant`.
  const { participants, loading, addBilan, updateParticipant } = useParticipants();
  const [testsIgnores, setTestsIgnores] = useState(false);
  const { search: rechercheBilan } = useLocation();
  const [brouillonSauve] = useState(() => getBrouillon(participantId));
  const [reprise, setReprise] = useState<'a_decider' | 'reprendre' | 'recommencer'>(() => (brouillonSauve ? 'a_decider' : 'recommencer'));
  const participant = participants.find(p => p.id === participantId);

  if (!participant) return <EcranChargement loading={loading} texteIntrouvable="Bénéficiaire introuvable" onBack={onTermine} />;

  // Brouillon existant — saisie interrompue, ou retour en portrait après une
  // rotation. Ce bilan repartait d'un formulaire vide, dont la PREMIÈRE frappe
  // écrasait le brouillon sauvegardé. Même choix que le bilan desktop.
  if (brouillonSauve && reprise === 'a_decider') {
    return (
      <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 12px)', paddingLeft: 16, paddingRight: 16, paddingBottom: 16 }}>
        <ModalRepriseBrouillon
          brouillon={brouillonSauve}
          participantNom={`${participant.prenom} ${participant.nom}`}
          onReprendre={() => setReprise('reprendre')}
          onRecommencer={() => { supprimerBrouillon(participant.id); setReprise('recommencer'); }}
          onFermer={onTermine}
        />
      </div>
    );
  }

  const premierBilanSansTests = participant.bilans.length === 0 && (!participant.testsActifs || participant.testsActifs.length === 0);
  if (premierBilanSansTests && !testsIgnores) {
    return (
      <ModalSelectionTests
        participant={participant}
        onValider={async tests => { await updateParticipant(participant.id, { testsActifs: tests }); }}
        // « Annuler » ne faisait rien : le praticien restait bloqué sur la
        // modale. Même comportement que le bilan desktop (NewBilan) :
        // continuer avec tous les tests.
        onCancel={() => setTestsIgnores(true)}
      />
    );
  }

  return (
    <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 12px)', paddingLeft: 16, paddingRight: 16, paddingBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onTermine} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 22, color: C.text }} />
        </button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Bilan — {participant.prenom} {participant.nom}</div>
          <div style={{ fontSize: 12, color: C.muted }}>Bilan n° {participant.bilans.length + 1}</div>
        </div>
      </div>
      <BilanStepper
        participant={participant}
        onSave={async (bilan: Omit<Bilan, 'id'>) => {
          await addBilan(participant.id, bilan);
          await validerSeanceDuBilan(idSeanceDepuisRecherche(rechercheBilan), participant.id);
          toast.success('Bilan enregistré ✅');
          onTermine();
        }}
        onCancel={onTermine}
        brouillon={reprise === 'reprendre' ? brouillonSauve : null}
      />
    </div>
  );
}
