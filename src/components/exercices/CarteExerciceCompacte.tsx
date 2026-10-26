import type { Exercice, FamilleExercice } from '../../types';
import { famillesDe, positionDe } from '../../data/exercicesMouvApa';
import { LIBELLE_FAMILLE, LIBELLE_MATERIEL_COURT, LIBELLE_POSITION_EXERCICE } from '../../lib/libellesBibliotheque';

// Carte compacte de la bibliothèque (refonte du 2026-10-26). Avant, chaque carte affichait tout le
// contenu (description, consignes, respiration…) : 2 à 3 exercices par écran de téléphone pour 195
// exercices. La carte ne garde que ce qui sert à choisir ; le détail s'ouvre au clic (FicheExerciceModal).

const COULEUR_FAMILLE: Record<FamilleExercice, string> = {
  renforcement: '#3B6D11', cardio: '#0F6E56', mobilite: '#BA7517', souplesse: '#993556', equilibre: '#185FA5',
  coordination: '#534AB7', cognitif: '#534AB7', pilates: '#0D7C86', respiration: '#0F6E56', recuperation: '#6B7280',
};

interface Props {
  exercice: Exercice;
  onOuvrir: () => void;
  /** Exercice spécifique au profil filtré (mis en avant). */
  specifique?: boolean;
  /** Adaptation rédigée pour le profil filtré. */
  adaptation?: boolean;
  incompatible?: boolean;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export default function CarteExerciceCompacte({
  exercice, onOuvrir, specifique, adaptation, incompatible, draggable, onDragStart, onDragEnd,
}: Props) {
  const familles = famillesDe(exercice);
  const principale = familles[0];
  const position = positionDe(exercice);
  const materiels = (exercice.materiels ?? []).filter(m => m !== 'aucun');
  const couleur = principale ? COULEUR_FAMILLE[principale] : '#6B7280';

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Voir l'exercice ${exercice.nom}`}
      onClick={onOuvrir}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOuvrir(); } }}
      draggable={draggable}
      onDragStart={draggable ? e => { e.stopPropagation(); onDragStart?.(); } : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      className={`group text-left bg-white rounded-xl border px-3.5 py-3 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        incompatible ? 'opacity-60 border-gray-200 bg-gray-50' : specifique ? 'border-teal-400 hover:border-teal-500' : 'border-gray-100 hover:border-primary/40 shadow-sm'
      }`}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: couleur }}>
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: couleur }} aria-hidden="true" />
        <span className="truncate">{principale ? LIBELLE_FAMILLE[principale] : 'Exercice'}</span>
        <span className="ml-auto text-gray-400 font-normal whitespace-nowrap">{exercice.dureeEstimeeMinutes} min</span>
      </div>

      <div className={`mt-1 text-sm font-bold leading-snug line-clamp-2 ${incompatible ? 'text-gray-500' : 'text-dark group-hover:text-primary'}`}>
        {exercice.nom}
      </div>

      <div className="flex flex-wrap gap-1 mt-2">
        {incompatible && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-50 text-red-600">Non recommandé</span>
        )}
        {specifique && !incompatible && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-50 text-teal-700">Adapté au profil</span>
        )}
        {adaptation && !incompatible && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">Adaptation</span>
        )}
        {exercice.custom && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">Perso</span>
        )}
        {position && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{LIBELLE_POSITION_EXERCICE[position]}</span>
        )}
        {materiels.slice(0, 2).map(m => (
          <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-800">{LIBELLE_MATERIEL_COURT[m]}</span>
        ))}
        {materiels.length > 2 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-800">+{materiels.length - 2}</span>
        )}
        {exercice.videoYoutubeId && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">▶ Vidéo</span>
        )}
      </div>
    </div>
  );
}
