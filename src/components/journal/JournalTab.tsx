import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useJournalSeance } from '../../hooks/useJournalSeance';
import NoteSeanceModal from './NoteSeanceModal';
import { RESSENTI_CONFIG } from './NoteSeanceModal';
import type { Participant, RessentiSeance } from '../../types';

const ALERTE_LABELS: Record<string, string> = {
  douleurSignalee:        '⚠️ Douleur',
  fatiguePlusQueHabitude: '😓 Fatigue',
  progressionNotable:     '🎉 Progression',
  pointARevoir:           '📌 À revoir',
};

interface Props {
  participant: Participant;
}

export default function JournalTab({ participant }: Props) {
  const { notesParPatient } = useJournalSeance();
  const [showModal, setShowModal] = useState(false);
  const notes = notesParPatient(participant.id);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading font-semibold text-dark">📓 Journal des séances</h2>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 bg-primary text-white px-3 py-2 rounded-xl text-xs font-semibold hover:bg-dark transition-colors"
        >
          <Plus size={13} />
          Note rapide
        </button>
      </div>

      {notes.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <div className="text-3xl mb-2">📝</div>
          <p className="text-sm font-medium">Aucune note de séance</p>
          <p className="text-xs mt-1">Notez l'essentiel après chaque séance</p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 inline-flex items-center gap-1.5 border border-primary text-primary px-4 py-2 rounded-xl text-xs font-semibold hover:bg-primary/5 transition-colors"
          >
            <Plus size={13} />
            Ajouter la première note
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map(note => {
            const r = note.ressenti ? RESSENTI_CONFIG[note.ressenti as RessentiSeance] : null;
            const alertesActives = Object.entries(note.alertes).filter(([, v]) => v);
            const dateLabel = new Date(note.date + 'T12:00').toLocaleDateString('fr-FR', {
              weekday: 'short', day: 'numeric', month: 'short',
            });
            return (
              <div key={note.id} className="border border-gray-100 rounded-xl p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start gap-3">
                  {r && (
                    <span className="text-xl flex-shrink-0 mt-0.5">{r.emoji}</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-600 capitalize">
                        {dateLabel} · {note.heureDebut}
                      </span>
                      {r && (
                        <span
                          className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: `${r.color}18`, color: r.color }}
                        >
                          {r.label}
                        </span>
                      )}
                    </div>
                    {note.note && (
                      <p className="text-sm text-dark mt-1.5 leading-relaxed">"{note.note}"</p>
                    )}
                    {alertesActives.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {alertesActives.map(([key]) => (
                          <span key={key} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                            {ALERTE_LABELS[key] ?? key}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <NoteSeanceModal
          participantId={participant.id}
          participantNom={`${participant.prenom} ${participant.nom}`}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
