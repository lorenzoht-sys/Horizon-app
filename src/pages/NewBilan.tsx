import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useParticipants } from '../hooks/useParticipants';
import { getBrouillon, supprimerBrouillon, type BrouillonBilan } from '../hooks/useBrouillonBilan';
import BilanStepper from '../components/bilan/BilanStepper';
import ModalRepriseBrouillon from '../components/bilan/ModalRepriseBrouillon';
import PageWrapper from '../components/layout/PageWrapper';
import { ArrowLeft } from 'lucide-react';
import type { Bilan } from '../types';
import toast from 'react-hot-toast';

export default function NewBilan() {
  const { id } = useParams<{ id: string }>();
  const { participants, addBilan } = useParticipants();
  const navigate = useNavigate();

  // Lecture synchrone localStorage — une seule fois au mount
  const [brouillonSauve] = useState<BrouillonBilan | null>(() =>
    id ? getBrouillon(id) : null
  );
  const [showModal, setShowModal]                         = useState(() => Boolean(brouillonSauve));
  const [brouillonPourReprise, setBrouillonPourReprise]   = useState<BrouillonBilan | null>(null);

  const participant = participants.find(p => p.id === id);
  if (!participant) return (
    <PageWrapper>
      <div className="text-center py-20 text-gray-400">Participant introuvable</div>
    </PageWrapper>
  );

  function handleSave(bilan: Omit<Bilan, 'id'>) {
    const saved = addBilan(participant!.id, bilan);
    supprimerBrouillon(participant!.id);
    toast.success('Bilan enregistré !');
    navigate(`/participant/${participant!.id}/bilan/${saved.id}`);
  }

  // ── Modal de reprise ──────────────────────────────────────────────────────
  if (showModal && brouillonSauve) {
    return (
      <PageWrapper>
        <Link to={`/participant/${id}`} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-primary mb-6 transition-colors">
          <ArrowLeft size={15} /> Retour au profil
        </Link>
        <div className="flex justify-center py-8">
          <ModalRepriseBrouillon
            brouillon={brouillonSauve}
            participantNom={`${participant.prenom} ${participant.nom}`}
            onReprendre={() => { setBrouillonPourReprise(brouillonSauve); setShowModal(false); }}
            onRecommencer={() => { supprimerBrouillon(participant.id); setShowModal(false); }}
          />
        </div>
      </PageWrapper>
    );
  }

  // ── Formulaire ────────────────────────────────────────────────────────────
  return (
    <PageWrapper>
      <Link to={`/participant/${id}`} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-primary mb-6 transition-colors">
        <ArrowLeft size={15} /> Retour au profil
      </Link>

      <div className="mb-6">
        <h1 className="font-heading font-bold text-dark text-2xl">Nouveau bilan</h1>
        <p className="text-gray-500 text-sm mt-1">
          {participant.prenom} {participant.nom} — Bilan n° {participant.bilans.length + 1}
          {brouillonPourReprise && (
            <span className="ml-2 text-amber-600 font-medium">· Reprise du brouillon</span>
          )}
        </p>
      </div>

      <BilanStepper
        participant={participant}
        onSave={handleSave}
        onCancel={() => navigate(`/participant/${id}`)}
        brouillon={brouillonPourReprise}
      />
    </PageWrapper>
  );
}
