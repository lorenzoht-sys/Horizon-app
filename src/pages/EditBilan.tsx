import { useParams, useNavigate, Link } from 'react-router-dom';
import { useParticipants } from '../hooks/useParticipants';
import { supprimerBrouillon, type BrouillonBilan } from '../hooks/useBrouillonBilan';
import BilanStepper from '../components/bilan/BilanStepper';
import PageWrapper from '../components/layout/PageWrapper';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import type { Bilan } from '../types';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

type BilanForm = Omit<Bilan, 'id'>;

export default function EditBilan() {
  const { id, bilanId } = useParams<{ id: string; bilanId: string }>();
  const { participants, updateBilan } = useParticipants();
  const navigate = useNavigate();

  const participant = participants.find(p => p.id === id);
  const bilan       = participant?.bilans.find(b => b.id === bilanId);

  if (!participant || !bilan) return (
    <PageWrapper>
      <div className="text-center py-20 text-gray-400">Bilan introuvable</div>
    </PageWrapper>
  );

  // Crée un "brouillon" fictif à partir du bilan existant pour pré-remplir BilanStepper
  const brouillonInitial: BrouillonBilan = {
    id:                  uuidv4(),
    participantId:       participant.id,
    dateCreation:        bilan.date,
    dateDerniereModif:   new Date().toISOString(),
    etapeActuelle:       0,
    data:                (({ id: _id, ...rest }) => rest)(bilan) as Partial<BilanForm>,
    completionPct:       100,
    estTermine:          false,
  };

  // Participant virtuel sans le bilan en cours → corrige isInitial / trimestre
  const participantSansBilan = {
    ...participant,
    bilans: participant.bilans.filter(b => b.id !== bilanId),
  };

  async function handleSave(updatedData: BilanForm) {
    await updateBilan(participant!.id, bilanId!, updatedData);
    supprimerBrouillon(participant!.id); // nettoie tout brouillon auto-sauvegardé
    toast.success('Bilan mis à jour ✅');
    navigate(`/participant/${participant!.id}`);
  }

  return (
    <PageWrapper>
      <Link to={`/participant/${id}`} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-primary mb-6 transition-colors">
        <ArrowLeft size={15} /> Retour au profil
      </Link>

      {/* Bandeau d'avertissement mode édition */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
        <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-800">
            Modification du bilan du {new Date(bilan.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <p className="text-xs text-amber-600 mt-0.5">
            Les modifications seront sauvegardées directement en base. L'interprétation IA sera conservée.
          </p>
        </div>
      </div>

      <div className="mb-6">
        <h1 className="font-heading font-bold text-dark text-2xl">Modifier le bilan</h1>
        <p className="text-gray-500 text-sm mt-1">
          {participant.prenom} {participant.nom} —{' '}
          {bilan.type === 'initial' ? 'Bilan initial' : `Bilan T${bilan.trimestre}`}
        </p>
      </div>

      <BilanStepper
        participant={participantSansBilan}
        onSave={handleSave}
        onCancel={() => navigate(`/participant/${id}`)}
        brouillon={brouillonInitial}
      />
    </PageWrapper>
  );
}
