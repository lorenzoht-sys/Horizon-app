import { useState, useMemo } from 'react';
import type { Programme, Ressenti, CategorieExercice } from '../../types';
import { loadExercices } from '../../data/exercices';
import YoutubePlayer from '../YoutubePlayer';
import { CheckCircle, Circle, Send, Play, X } from 'lucide-react';

interface Props {
  programme: Programme;
  participantPrenom: string;
  onToggleSuivi: (dateISO: string, exerciceId: string, fait: boolean, ressenti?: Ressenti, note?: string) => void;
}

const CAT: Record<CategorieExercice, { icon: string; label: string; color: string }> = {
  equilibre: { icon: '↕',  label: 'Équilibre', color: '#185FA5' },
  force:     { icon: '💪', label: 'Force',      color: '#3B6D11' },
  mobilite:  { icon: '🔄', label: 'Mobilité',   color: '#BA7517' },
  souplesse: { icon: '🤸', label: 'Souplesse',  color: '#993556' },
  endurance: { icon: '🚶', label: 'Endurance',  color: '#0F6E56' },
  memoire:   { icon: '🧠', label: 'Mémoire',    color: '#534AB7' },
};

const RESSENTI_OPTIONS: { value: Ressenti; label: string; emoji: string; color: string }[] = [
  { value: 'bien',      label: 'Bien',      emoji: '😊', color: 'bg-success/10 border-success text-success' },
  { value: 'moyen',     label: 'Moyen',     emoji: '😐', color: 'bg-warning/10 border-warning text-warning' },
  { value: 'difficile', label: 'Difficile', emoji: '😓', color: 'bg-orange-100 border-orange-400 text-orange-600' },
  { value: 'douleur',   label: 'Douleur',   emoji: '😣', color: 'bg-danger/10 border-danger text-danger' },
];

const JOURS_FR  = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const JOURS_ABR = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function getTodayISO() { return new Date().toISOString().slice(0, 10); }

function getSuiviPourJour(programme: Programme, dateISO: string, exerciceId: string) {
  for (const semaine of programme.suiviSemaines) {
    const found = semaine.jours[dateISO]?.find(j => j.exerciceId === exerciceId);
    if (found) return found;
  }
  return null;
}

export default function ClientProgramme({ programme, participantPrenom, onToggleSuivi }: Props) {
  const todayISO    = getTodayISO();
  const todayDayNum = new Date().getDay() === 0 ? 7 : new Date().getDay();
  const exercices   = useMemo(() => loadExercices(), []);

  const [ressentis,  setRessentis]  = useState<Record<string, Ressenti>>({});
  const [sent,       setSent]       = useState(false);
  const [videoModal, setVideoModal] = useState<{ id: string; nom: string } | null>(null);

  const exercicesDuJour = programme.exercices
    .filter(ep => ep.frequenceParSemaine.includes(todayDayNum))
    .sort((a, b) => a.ordre - b.ordre);

  function handleToggle(exerciceId: string) {
    const current = getSuiviPourJour(programme, todayISO, exerciceId);
    onToggleSuivi(todayISO, exerciceId, !current?.fait, ressentis[exerciceId]);
  }

  function handleRessenti(exerciceId: string, r: Ressenti) {
    setRessentis(prev => ({ ...prev, [exerciceId]: r }));
    const current = getSuiviPourJour(programme, todayISO, exerciceId);
    if (current?.fait) onToggleSuivi(todayISO, exerciceId, true, r);
  }

  const nombreFait = exercicesDuJour.filter(ep =>
    getSuiviPourJour(programme, todayISO, ep.exerciceId)?.fait
  ).length;

  return (
    <div className="max-w-lg mx-auto px-4 py-6">

      {/* Header programme */}
      <div className="bg-gradient-to-br from-primary to-dark rounded-2xl p-5 mb-6 text-white">
        <div className="text-sm opacity-80 mb-1">👋 Bonjour {participantPrenom} !</div>
        <h2 className="font-heading font-bold text-xl mb-1">{programme.titre}</h2>
        {programme.messageMotivation && (
          <p className="text-sm opacity-90 italic mt-2">💬 "{programme.messageMotivation}"</p>
        )}
      </div>

      {/* Carte du jour */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-heading font-bold text-dark text-lg">
              Aujourd'hui — {JOURS_FR[new Date().getDay()]}
            </h3>
            <p className="text-sm text-gray-500">
              {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
            </p>
          </div>
          {exercicesDuJour.length > 0 && (
            <div className={`text-sm font-bold px-3 py-1 rounded-full ${nombreFait === exercicesDuJour.length ? 'bg-success/10 text-success' : 'bg-gray-100 text-gray-500'}`}>
              {nombreFait}/{exercicesDuJour.length}
            </div>
          )}
        </div>

        {exercicesDuJour.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <div className="text-4xl mb-2">🌟</div>
            <p className="font-medium text-dark">Pas d'exercices aujourd'hui</p>
            <p className="text-sm mt-1">Profitez-en pour vous reposer !</p>
          </div>
        ) : (
          <div className="space-y-3">
            {exercicesDuJour.map((ep, idx) => {
              const ex    = exercices.find(e => e.id === ep.exerciceId);
              if (!ex) return null;
              const suivi = getSuiviPourJour(programme, todayISO, ep.exerciceId);
              const fait  = suivi?.fait ?? false;
              const cat   = CAT[ex.categorie];
              const series = `${ep.series} série${ep.series > 1 ? 's' : ''} · ${ep.repetitions ? ep.repetitions + ' rép.' : ep.dureeSecondes + 's'}`;

              return (
                <div
                  key={ep.exerciceId}
                  style={{
                    background: fait ? '#F0FDF4' : '#ffffff',
                    border: fait ? '1px solid #BBF7D0' : '1px solid #E8F4FD',
                    borderRadius: 12,
                    padding: '14px 16px',
                  }}
                >
                  {/* EN-TÊTE : titre + séries */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#0D2B4B', lineHeight: 1.3 }}>
                      {idx + 1}. {ex.nom}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#666', whiteSpace: 'nowrap', marginLeft: 12 }}>
                      {series}
                    </span>
                  </div>

                  {/* CATÉGORIE */}
                  <span style={{ fontSize: 12, color: cat.color, display: 'inline-block', marginBottom: 10 }}>
                    {cat.icon} {cat.label}
                  </span>

                  {/* SÉPARATEUR */}
                  <hr style={{ border: 'none', borderTop: '1px solid #E8F4FD', margin: '0 0 10px' }} />

                  {/* DESCRIPTION */}
                  <p style={{ fontSize: 14, color: '#333', margin: '0 0 4px', lineHeight: 1.5 }}>
                    {ex.description}
                  </p>

                  {/* ALERTE SÉCURITÉ */}
                  {ex.consigneSecurite && (
                    <p style={{ fontSize: 13, color: '#993C1D', margin: '0 0 6px', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <span>⚠️</span><span>{ex.consigneSecurite}</span>
                    </p>
                  )}

                  {/* CITATION PIERRE */}
                  {ep.notePersonnalisee && (
                    <p style={{ fontSize: 13, color: '#0F6E56', fontStyle: 'italic', margin: '0 0 10px' }}>
                      "{ep.notePersonnalisee}"
                    </p>
                  )}

                  {/* JOURS — texte souligné */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 14 }}>
                    {[1, 2, 3, 4, 5, 6, 7].map(d => {
                      const actif = ep.frequenceParSemaine.includes(d);
                      return (
                        <span key={d} style={{
                          fontSize: 11,
                          fontWeight: actif ? 600 : 400,
                          color: actif ? '#1A5F9E' : '#B4B2A9',
                          borderBottom: actif ? '2px solid #1A5F9E' : 'none',
                          padding: '2px 4px',
                        }}>
                          {JOURS_ABR[d]}
                        </span>
                      );
                    })}
                  </div>

                  {/* Bouton démonstration vidéo */}
                  {ex.videoYoutubeId && (
                    <button
                      onClick={() => setVideoModal({ id: ex.videoYoutubeId!, nom: ex.nom })}
                      className="w-full flex items-center justify-center gap-2 mb-3 py-3 rounded-xl border-2 border-secondary text-secondary text-base font-semibold hover:bg-secondary/10 transition-colors"
                      style={{ minHeight: 52 }}
                    >
                      <Play size={18} fill="currentColor" />
                      Voir la démonstration
                    </button>
                  )}

                  {/* Bouton J'ai fait */}
                  <button
                    onClick={() => handleToggle(ep.exerciceId)}
                    className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-base font-bold transition-all ${fait ? 'bg-success text-white' : 'bg-primary text-white hover:bg-dark'}`}
                    style={{ minHeight: 52 }}
                  >
                    {fait ? <CheckCircle size={20} /> : <Circle size={20} />}
                    {fait ? '✅ Exercice réalisé !' : "J'ai fait cet exercice"}
                  </button>

                  {/* Ressenti */}
                  {fait && (
                    <div className="mt-3">
                      <p className="text-sm font-semibold text-dark mb-2">Comment je me suis senti(e) :</p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {RESSENTI_OPTIONS.map(r => (
                          <button
                            key={r.value}
                            onClick={() => handleRessenti(ep.exerciceId, r.value)}
                            className={`flex flex-col items-center py-2 px-1 rounded-xl border-2 text-xs font-medium transition-all ${(suivi?.ressenti ?? ressentis[ep.exerciceId]) === r.value ? r.color + ' border-2' : 'border-gray-200 text-gray-500 bg-white'}`}
                          >
                            <span className="text-2xl mb-0.5">{r.emoji}</span>
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bouton envoyer à Pierre */}
      {exercicesDuJour.length > 0 && (
        <button
          onClick={() => { setSent(true); setTimeout(() => setSent(false), 3000); }}
          disabled={sent}
          className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-base font-bold transition-all ${sent ? 'bg-success text-white' : 'bg-secondary text-white hover:bg-teal-600'}`}
          style={{ minHeight: 56 }}
        >
          <Send size={18} />
          {sent ? '✅ Bilan envoyé à Pierre !' : '✉ Envoyer mon bilan à Pierre'}
        </button>
      )}

      <p className="text-center text-xs text-gray-400 mt-4">
        Suivi réalisé par Pierre Clavier — Mouv'APA
      </p>

      {/* Modal vidéo plein écran */}
      {videoModal && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-4">
            <p className="text-white font-semibold text-lg leading-tight pr-4">{videoModal.nom}</p>
            <button
              onClick={() => setVideoModal(null)}
              aria-label="Fermer la vidéo"
              className="flex-shrink-0 bg-white text-dark rounded-full w-14 h-14 flex items-center justify-center font-bold shadow-lg hover:bg-gray-100 transition-colors"
            >
              <X size={28} />
            </button>
          </div>
          <div className="flex-1 flex items-center px-4 pb-8">
            <div className="w-full"><YoutubePlayer videoId={videoModal.id} /></div>
          </div>
        </div>
      )}
    </div>
  );
}
