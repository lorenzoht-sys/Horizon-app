import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Plus, Trash2, Activity } from 'lucide-react';
import { toast } from 'sonner';
import PageWrapper from '../components/layout/PageWrapper';
import { useProgrammesModeles, type ProgrammeModeleFormData } from '../hooks/useProgrammesModeles';
import type { ProgrammeModele, JourProgramme } from '../types';
import { JOURS_PROGRAMME as JP } from '../types';
import {
  ProgrammeWizardModal, EMPTY_WIZARD, JOUR_COURT, btnPrimary,
  type WizardData, type FormSeance,
} from '../components/programme/ProgrammeWizard';

// Miroir de progV2ToWizard (ProgrammePage.tsx) — même wizard partagé, source
// différente. ModeleExercice n'a pas de exerciceId/niveau (colonnes absentes
// de programme_modele_exercices, voir migration 20260717) : laissés vides,
// le wizard les traite comme des exercices saisis manuellement.
function progModeleToWizard(modele: ProgrammeModele): WizardData {
  const seances: FormSeance[] = modele.seances
    .sort((a, b) => a.ordre - b.ordre)
    .map(s => ({
      tempId: s.id,
      nom: s.nom,
      exercices: s.exercices
        .sort((a, b) => a.ordre - b.ordre)
        .map(ex => ({
          tempId: ex.id,
          nom: ex.nom,
          categorie: ex.categorie ?? 'Équilibre',
          description: ex.description ?? '',
          conseilSecurite: ex.conseilSecurite ?? '',
          mode: (ex.dureeSecondes != null && ex.series == null)
            ? 'total' as const
            : ex.dureeSecondes != null
            ? 'duree' as const
            : 'reps' as const,
          series: ex.series ?? 3,
          repetitions: ex.repetitions ?? 10,
          dureeSecondes: ex.dureeSecondes ?? 30,
        })),
    }));

  const planning: Partial<Record<JourProgramme, string | null>> = {};
  for (const p of modele.planning) {
    planning[p.jour] = p.seanceId;
  }

  return {
    nom: modele.nom,
    type: modele.type,
    objectif: modele.objectif ?? '',
    objectifSeancesAutonomes: modele.objectifSeancesAutonomes != null ? String(modele.objectifSeancesAutonomes) : '',
    messageMotivation: modele.messageMotivation ?? '',
    seances,
    planning,
  };
}

function wizardToFormData(data: WizardData): ProgrammeModeleFormData {
  const objectifSeancesAutonomes = data.objectifSeancesAutonomes.trim()
    ? Number(data.objectifSeancesAutonomes)
    : undefined;
  return {
    nom: data.nom,
    objectif: data.objectif || undefined,
    objectifSeancesAutonomes: objectifSeancesAutonomes != null && objectifSeancesAutonomes > 0 ? objectifSeancesAutonomes : undefined,
    messageMotivation: data.messageMotivation || undefined,
    type: data.type,
    seances: data.seances.map(s => ({
      tempId: s.tempId,
      nom: s.nom,
      exercices: s.exercices.map(ex => ({
        nom: ex.nom,
        categorie: ex.categorie || undefined,
        description: ex.description || undefined,
        conseilSecurite: ex.conseilSecurite || undefined,
        series: ex.mode !== 'total' ? ex.series : undefined,
        repetitions: ex.mode === 'reps' ? ex.repetitions : undefined,
        dureeSecondes: (ex.mode === 'duree' || ex.mode === 'total') ? ex.dureeSecondes : undefined,
      })),
    })),
    planning: data.planning,
  };
}

const btnSmall: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: '#F1F5F9',
  color: '#374151',
  border: '1px solid #E5E7EB',
  borderRadius: 8,
  padding: '5px 10px',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
};

function ModeleCard({ modele, onEdit, onDelete }: {
  modele: ProgrammeModele;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const jourActifs = JP.filter(j => modele.planning.some(p => p.jour === j));
  const totalEx = modele.seances.reduce((sum, s) => sum + s.exercices.length, 0);

  return (
    <div style={{
      background: 'white',
      border: '1px solid #E0EEEE',
      borderRadius: 16,
      padding: '16px 18px',
      marginBottom: 12,
    }}>
      <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#0D2B2B' }}>📋 {modele.nom}</span>
        <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
          {jourActifs.length > 0 ? jourActifs.map(j => JOUR_COURT[j]).join(' · ') : 'Pas de planning'}
          {totalEx > 0 && ` · ${totalEx} exercice${totalEx > 1 ? 's' : ''}`}
        </div>
        {modele.objectif && (
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>🎯 {modele.objectif}</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
        <button onClick={onEdit} style={{ ...btnSmall, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
          ✏️ Modifier
        </button>
        {confirmDelete ? (
          <>
            <button onClick={onDelete} style={{ ...btnSmall, background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA' }}>
              Confirmer la suppression
            </button>
            <button onClick={() => setConfirmDelete(false)} style={btnSmall}>Annuler</button>
          </>
        ) : (
          <button onClick={() => setConfirmDelete(true)} style={btnSmall}>
            <Trash2 size={11} /> Supprimer
          </button>
        )}
      </div>
    </div>
  );
}

export default function ModelesProgrammePage() {
  const { modeles, loading, createModele, updateModele, deleteModele } = useProgrammesModeles();

  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [wizardData, setWizardData] = useState<WizardData>(EMPTY_WIZARD);
  const [saving, setSaving] = useState(false);
  const [editingModeleId, setEditingModeleId] = useState<string | null>(null);

  function updateWizard(patch: Partial<WizardData>) {
    setWizardData(prev => ({ ...prev, ...patch }));
  }

  function openWizard() {
    setWizardData(EMPTY_WIZARD);
    setEditingModeleId(null);
    setStep(1);
    setShowWizard(true);
  }

  function openEditWizard(modele: ProgrammeModele) {
    setWizardData(progModeleToWizard(modele));
    setEditingModeleId(modele.id);
    setStep(1);
    setShowWizard(true);
  }

  function closeWizard() {
    setShowWizard(false);
    setEditingModeleId(null);
    setStep(1);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = wizardToFormData(wizardData);

      if (editingModeleId) {
        const ok = await updateModele(editingModeleId, payload);
        if (ok) {
          toast.success('Modèle mis à jour !');
          closeWizard();
        } else {
          toast.error('Erreur lors de la mise à jour du modèle');
        }
      } else {
        const ok = await createModele(payload);
        if (ok) {
          toast.success('Modèle créé !');
          closeWizard();
        } else {
          toast.error('Erreur lors de la création du modèle');
        }
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageWrapper>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0D2B2B', marginBottom: 2 }}>
            Mes modèles de programme
          </h1>
          <p style={{ fontSize: 13, color: '#94A3B8' }}>
            {modeles.length} modèle{modeles.length > 1 ? 's' : ''} réutilisable{modeles.length > 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={openWizard} style={btnPrimary}>
          <Plus size={14} /> Créer un modèle
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94A3B8', fontSize: 14 }}>Chargement…</div>
      ) : modeles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'white', border: '1px dashed #E0EEEE', borderRadius: 18 }}>
          <Activity size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.2 }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0D2B2B', marginBottom: 8 }}>Aucun modèle</div>
          <div style={{ fontSize: 13, color: '#94A3B8', marginBottom: 20, lineHeight: 1.6 }}>
            Créez un premier modèle de programme réutilisable,<br />pour les problèmes récurrents que vous rencontrez.
          </div>
          <button onClick={openWizard} style={btnPrimary}><Plus size={14} /> Créer un modèle</button>
        </div>
      ) : (
        modeles.map(modele => (
          <ModeleCard
            key={modele.id}
            modele={modele}
            onEdit={() => openEditWizard(modele)}
            onDelete={() => deleteModele(modele.id).then(() => toast.success('Modèle supprimé'))}
          />
        ))
      )}

      {showWizard && (
        <ProgrammeWizardModal
          step={step}
          onStepChange={setStep}
          data={wizardData}
          onChange={updateWizard}
          onClose={closeWizard}
          onSave={handleSave}
          saving={saving}
          isEditing={!!editingModeleId}
          estModele
        />
      )}
    </PageWrapper>
  );
}
