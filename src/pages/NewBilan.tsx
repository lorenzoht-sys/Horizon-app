import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useParticipants } from '../hooks/useParticipants';
import {
  getBrouillon, supprimerBrouillon, sauvegarderBrouillon,
  loadBrouillonFromSupabase, type BrouillonBilan,
} from '../hooks/useBrouillonBilan';
import BilanStepper from '../components/bilan/BilanStepper';
import ModalRepriseBrouillon from '../components/bilan/ModalRepriseBrouillon';
import PageWrapper from '../components/layout/PageWrapper';
import { ArrowLeft } from 'lucide-react';
import type { Bilan } from '../types';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';

export default function NewBilan() {
  const { id } = useParams<{ id: string }>();
  const { participants, addBilan } = useParticipants();
  const navigate = useNavigate();

  // Lecture localStorage (synchrone, prioritaire)
  const [brouillonSauve, setBrouillonSauve] = useState<BrouillonBilan | null>(() =>
    id ? getBrouillon(id) : null
  );
  const [showModal, setShowModal]                         = useState(() => Boolean(id && getBrouillon(id)));
  const [brouillonPourReprise, setBrouillonPourReprise]   = useState<BrouillonBilan | null>(null);
  const [checkingCloud, setCheckingCloud]                 = useState(false);

  // Si pas de brouillon localStorage → vérifier Supabase (cross-device recovery)
  useEffect(() => {
    if (!id || brouillonSauve || !supabase) return;
    setCheckingCloud(true);
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const cloudDraft = await loadBrouillonFromSupabase(id, user.id);
        if (cloudDraft) {
          // Restaurer dans localStorage pour les saves suivantes
          sauvegarderBrouillon(id, cloudDraft.etapeActuelle, cloudDraft.data);
          setBrouillonSauve(cloudDraft);
          setShowModal(true);
        }
      } catch { /* non bloquant */ } finally {
        setCheckingCloud(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const participant = participants.find(p => p.id === id);
  if (!participant) return (
    <PageWrapper>
      <div className="text-center py-20 text-gray-400">Participant introuvable</div>
    </PageWrapper>
  );

  if (checkingCloud) return (
    <PageWrapper>
      <div className="text-center py-20">
        <div className="text-gray-400 text-sm">☁️ Vérification d'un brouillon sauvegardé…</div>
      </div>
    </PageWrapper>
  );

  async function handleSave(bilan: Omit<Bilan, 'id'>) {
    const saved = await addBilan(participant!.id, bilan);
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
