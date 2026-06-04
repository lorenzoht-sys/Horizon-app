import { useState } from 'react';
import type { Exercice, CategorieExercice, ProfilHandicap } from '../types';
import { Plus, Play, X } from 'lucide-react';
import YoutubePlayer from '../components/YoutubePlayer';

const CAT: Record<CategorieExercice, { icon: string; label: string; color: string }> = {
  equilibre: { icon: '↕',  label: 'Équilibre', color: '#185FA5' },
  force:     { icon: '💪', label: 'Force',      color: '#3B6D11' },
  mobilite:  { icon: '🔄', label: 'Mobilité',   color: '#BA7517' },
  souplesse: { icon: '🤸', label: 'Souplesse',  color: '#993556' },
  endurance: { icon: '🚶', label: 'Endurance',  color: '#0F6E56' },
  memoire:   { icon: '🧠', label: 'Mémoire',    color: '#534AB7' },
};

// Ré-exports pour compatibilité
export const CATEGORIE_LABELS = Object.fromEntries(
  Object.entries(CAT).map(([k, v]) => [k, v.icon + ' ' + v.label])
) as Record<CategorieExercice, string>;

export const CATEGORIE_COLORS: Record<CategorieExercice, string> = {
  equilibre: 'bg-blue-100 text-blue-700',
  force:     'bg-green-100 text-green-700',
  mobilite:  'bg-yellow-100 text-yellow-700',
  souplesse: 'bg-orange-100 text-orange-700',
  endurance: 'bg-red-100 text-red-700',
  memoire:   'bg-purple-100 text-purple-700',
};

const COULEURS_PROFILS: Record<ProfilHandicap, string> = {
  fauteuil_roulant: '#1A5F9E',
  avc_hemiplegie:   '#8B5CF6',
  parkinson:        '#F59E0B',
  sep:              '#1D9E75',
};

const LABELS_PROFILS: Record<ProfilHandicap, string> = {
  fauteuil_roulant: 'Fauteuil',
  avc_hemiplegie:   'AVC',
  parkinson:        'Parkinson',
  sep:              'SEP',
};

interface Props {
  exercice: Exercice;
  onAdd?: (exercice: Exercice) => void;
  compact?: boolean;
  profilHandicap?: ProfilHandicap;
  incompatible?: boolean;
}

export default function ExerciceCard({ exercice, onAdd, compact, profilHandicap, incompatible }: Props) {
  const [showVideo, setShowVideo] = useState(false);
  const cat = CAT[exercice.categorie];

  const adaptation = profilHandicap ? exercice.adaptations?.[profilHandicap] : undefined;
  const estSpecifique = profilHandicap != null
    && !(exercice.profilsCompatibles?.includes('tous') ?? true)
    && (exercice.profilsCompatibles?.includes(profilHandicap) ?? false);

  const badgeCouleur = profilHandicap ? COULEURS_PROFILS[profilHandicap] : 'var(--color-ink)';

  if (incompatible) {
    return (
      <div style={{
        background: '#F9FAFB',
        border: '1px solid #E5E7EB',
        borderRadius: 12,
        padding: '12px 16px',
        marginBottom: 8,
        opacity: 0.55,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#6B7280' }}>{exercice.nom}</span>
          <span style={{
            fontSize: 10, color: '#EF4444', background: '#FEE2E2',
            padding: '2px 8px', borderRadius: 20, fontWeight: 600, whiteSpace: 'nowrap',
          }}>
            ✕ Non recommandé
          </span>
        </div>
        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>
          {cat.icon} {cat.label}
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{
        background: '#ffffff',
        border: `1px solid ${estSpecifique ? 'var(--color-teal)' : '#E8F4FD'}`,
        borderRadius: 12,
        padding: '12px 16px',
        marginBottom: 8,
        cursor: 'default',
      }}>

        {/* Miniature vidéo (non-compact) */}
        {!compact && exercice.videoYoutubeId && (
          <div
            className="relative mb-3 rounded-lg overflow-hidden cursor-pointer group"
            onClick={() => setShowVideo(true)}
          >
            <img
              src={`https://img.youtube.com/vi/${exercice.videoYoutubeId}/hqdefault.jpg`}
              alt={exercice.nom}
              className="w-full object-cover rounded-lg"
              style={{ maxHeight: 130 }}
            />
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/40 transition-colors">
              <span className="bg-white/90 text-dark rounded-full p-2">
                <Play size={16} fill="currentColor" />
              </span>
            </div>
          </div>
        )}

        {/* EN-TÊTE */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0D2B4B', lineHeight: 1.3 }}>
            {exercice.nom}
          </span>
          {onAdd ? (
            <button
              onClick={() => onAdd(exercice)}
              className="flex-shrink-0 bg-primary text-white rounded-lg hover:bg-dark transition-colors"
              style={{ padding: '4px 8px', marginLeft: 10 }}
              title="Ajouter au programme"
            >
              <Plus size={13} />
            </button>
          ) : (
            <span style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap', marginLeft: 10 }}>
              {exercice.dureeEstimeeMinutes} min
            </span>
          )}
        </div>

        {/* Catégorie + badge adapté */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: adaptation ? 8 : (compact ? 0 : 8) }}>
          <span style={{ fontSize: 12, color: cat.color }}>
            {cat.icon} {cat.label}
          </span>
          {estSpecifique && profilHandicap && (
            <span style={{
              fontSize: 10,
              background: badgeCouleur,
              color: 'white',
              padding: '2px 8px', borderRadius: 20, fontWeight: 700, whiteSpace: 'nowrap',
            }}>
              ♿ {LABELS_PROFILS[profilHandicap]}
            </span>
          )}
        </div>

        {/* Encart adaptation */}
        {adaptation && (
          <div style={{
            background: '#FFFBEB', border: '1px solid #FCD34D',
            borderRadius: 8, padding: '7px 10px',
            fontSize: 11, color: '#78350F', lineHeight: 1.5,
            marginBottom: compact ? 0 : 8,
          }}>
            <strong>Adaptation :</strong> {adaptation}
          </div>
        )}

        {/* Contenu étendu (non-compact) */}
        {!compact && (
          <>
            <hr style={{ border: 'none', borderTop: '1px solid #E8F4FD', margin: '0 0 10px' }} />

            <p style={{ fontSize: 13, color: '#333', margin: '0 0 4px', lineHeight: 1.5 }}>
              {exercice.description}
            </p>

            {exercice.consigneSecurite && (
              <p style={{ fontSize: 12, color: '#993C1D', margin: '0 0 6px', display: 'flex', gap: 5, alignItems: 'flex-start' }}>
                <span>⚠️</span><span>{exercice.consigneSecurite}</span>
              </p>
            )}

            {exercice.videoYoutubeId && (
              <span
                onClick={() => setShowVideo(true)}
                style={{ fontSize: 12, color: 'var(--color-teal)', cursor: 'pointer', display: 'inline-block', marginTop: 4 }}
              >
                ▶ Voir la démonstration
              </span>
            )}

            {/* Badge référence scientifique */}
            {exercice.reference && (
              <div style={{
                marginTop: 8,
                paddingTop: 7,
                borderTop: '1px solid #E8F4FD',
                fontSize: 10,
                color: '#6B7280',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}>
                <span>📚</span>
                <span>{exercice.reference}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal vidéo */}
      {showVideo && exercice.videoYoutubeId && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold">{exercice.nom}</h3>
              <button onClick={() => setShowVideo(false)} className="text-white/70 hover:text-white p-1">
                <X size={24} />
              </button>
            </div>
            <YoutubePlayer videoId={exercice.videoYoutubeId} />
          </div>
        </div>
      )}
    </>
  );
}
