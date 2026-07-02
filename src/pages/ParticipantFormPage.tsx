import { useParams, useNavigate, Link } from 'react-router-dom';
import { useParticipants } from '../hooks/useParticipants';
import ParticipantFormStepper from '../components/participant/ParticipantFormStepper';
import PageWrapper from '../components/layout/PageWrapper';
import { ArrowLeft } from 'lucide-react';
import type { Participant } from '../types';
import { toast } from 'sonner';

export default function ParticipantFormPage() {
  const { id } = useParams<{ id: string }>();
  const { participants, addParticipant, updateParticipant } = useParticipants();
  const navigate = useNavigate();

  const isEdition = Boolean(id);
  const participant = id ? participants.find(p => p.id === id) : undefined;

  if (isEdition && !participant) {
    return (
      <PageWrapper>
        <div className="text-center py-20 text-gray-400">Participant introuvable</div>
      </PageWrapper>
    );
  }

  const draftKey = id ?? 'nouveau';
  const retourPath = id ? `/participant/${id}` : '/';

  async function handleSave(data: Omit<Participant, 'id' | 'token' | 'bilans'>) {
    try {
      if (id) {
        await updateParticipant(id, data);
        toast.success('Fiche mise à jour !');
        navigate(`/participant/${id}`);
      } else {
        const p = await addParticipant(data);
        toast.success(`${data.prenom} ${data.nom} ajouté(e) !`);
        navigate(`/participant/${p.id}`);
      }
    } catch (error: any) {
      toast.error(error?.message || "Erreur lors de l'enregistrement");
    }
  }

  return (
    <PageWrapper>
      <Link to={retourPath} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-primary mb-6 transition-colors">
        <ArrowLeft size={15} /> {id ? 'Retour au profil' : 'Retour'}
      </Link>

      <div className="mb-6">
        <h1 className="font-heading font-bold text-dark text-2xl">
          {participant ? `Modifier ${participant.prenom} ${participant.nom}` : 'Nouveau participant'}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {participant
            ? 'Mettez à jour les informations de la fiche bénéficiaire.'
            : 'Renseignez les informations du nouveau bénéficiaire, étape par étape.'}
        </p>
      </div>

      <ParticipantFormStepper
        initial={participant}
        draftKey={draftKey}
        onSave={handleSave}
        onCancel={() => navigate(retourPath)}
        isEdition={isEdition}
      />
    </PageWrapper>
  );
}
