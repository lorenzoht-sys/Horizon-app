import { useState } from 'react';
import { X, Mic, MicOff } from 'lucide-react';
import type { NoteSeance, RessentiSeance } from '../../types';
import { useJournalSeance } from '../../hooks/useJournalSeance';
import toast from 'react-hot-toast';

interface Props {
  participantId: string;
  participantNom: string;
  seance?: { id: string; date: string; heureDebut: string };
  onClose: () => void;
  onSaved?: () => void;
  onMarquerRealisee?: () => void;
}

export const RESSENTI_CONFIG: Record<RessentiSeance, { emoji: string; label: string; color: string }> = {
  excellent: { emoji: '🌟', label: 'Excellent',        color: '#F59E0B' },
  bien:      { emoji: '😊', label: 'Bien',             color: '#22C55E' },
  moyen:     { emoji: '😐', label: 'Moyen',            color: '#6B7280' },
  difficile: { emoji: '😓', label: 'Difficile',        color: '#F97316' },
  arret:     { emoji: '🛑', label: 'Arrêt anticipé',   color: '#EF4444' },
};

const RESSENTIS = (Object.keys(RESSENTI_CONFIG) as RessentiSeance[]).map(k => ({ value: k, ...RESSENTI_CONFIG[k] }));

const ALERTES_CONFIG = [
  { key: 'douleurSignalee'       as const, emoji: '⚠️', label: 'Douleur signalée' },
  { key: 'fatiguePlusQueHabitude'as const, emoji: '😓', label: "Fatigue plus que d'habitude" },
  { key: 'progressionNotable'    as const, emoji: '🎉', label: 'Progression notable' },
  { key: 'pointARevoir'          as const, emoji: '📌', label: 'Point à revoir' },
];

export default function NoteSeanceModal({ participantId, participantNom, seance, onClose, onSaved, onMarquerRealisee }: Props) {
  const { ajouterNote } = useJournalSeance();

  const today = new Date().toISOString().slice(0, 10);
  const now   = new Date().toTimeString().slice(0, 5);

  const [ressenti, setRessenti] = useState<RessentiSeance | null>(null);
  const [note, setNote]         = useState('');
  const [alertes, setAlertes]   = useState({
    douleurSignalee: false,
    fatiguePlusQueHabitude: false,
    progressionNotable: false,
    pointARevoir: false,
  });
  const [enEcoute, setEnEcoute] = useState(false);

  const dateLabel = (() => {
    const d = seance
      ? new Date(seance.date + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
      : new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    return seance?.heureDebut ? `${d} · ${seance.heureDebut}` : d;
  })();

  function toggleAlerte(key: keyof typeof alertes) {
    setAlertes(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function demarrerDictee() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast('Dictée vocale non supportée sur ce navigateur'); return; }
    const recognition = new SR();
    recognition.lang = 'fr-FR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart  = () => setEnEcoute(true);
    recognition.onend    = () => setEnEcoute(false);
    recognition.onresult = (e: any) => {
      const texte = e.results[0][0].transcript;
      setNote(prev => prev ? `${prev} ${texte}` : texte);
    };
    recognition.onerror = () => setEnEcoute(false);
    recognition.start();
  }

  function handleSave() {
    const data: Omit<NoteSeance, 'id'> = {
      seanceId:    seance?.id ?? '',
      participantId,
      date:        seance?.date     ?? today,
      heureDebut:  seance?.heureDebut ?? now,
      ressenti,
      note,
      alertes,
    };
    ajouterNote(data);
    if (seance?.id) onMarquerRealisee?.();
    toast.success('Note enregistrée ✅');
    onSaved?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1200] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-heading font-bold text-dark text-base">📝 Note de séance</h2>
            <p className="text-sm text-gray-400 mt-0.5">{participantNom} · {dateLabel}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-dark transition-colors mt-0.5 p-1">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">

          {/* Ressenti */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Comment s'est passée la séance ?
            </p>
            <div className="flex flex-wrap gap-2">
              {RESSENTIS.map(r => (
                <button
                  key={r.value}
                  onClick={() => setRessenti(prev => prev === r.value ? null : r.value)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-all"
                  style={ressenti === r.value
                    ? { background: r.color, color: 'white', borderColor: r.color }
                    : { background: 'white', color: '#4A6080', borderColor: '#E2EEF9' }
                  }
                >
                  {r.emoji} {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-gray-100" />

          {/* Alertes */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Points rapides (optionnel)
            </p>
            <div className="space-y-2.5">
              {ALERTES_CONFIG.map(({ key, emoji, label }) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer group select-none">
                  <div
                    onClick={() => toggleAlerte(key)}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer ${
                      alertes[key] ? 'bg-primary border-primary' : 'border-gray-300 group-hover:border-primary'
                    }`}
                  >
                    {alertes[key] && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-gray-700">{emoji} {label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="h-px bg-gray-100" />

          {/* Note libre + dictée */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Note libre</p>
              <button
                onClick={demarrerDictee}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border transition-all"
                style={{
                  background:   enEcoute ? '#EF4444' : '#E6F1FB',
                  borderColor:  enEcoute ? '#EF4444' : '#BFDBFE',
                  color:        enEcoute ? 'white'   : '#1A5F9E',
                }}
              >
                {enEcoute
                  ? <><MicOff size={12} /> Écoute…</>
                  : <><Mic size={12} /> Dicter</>
                }
              </button>
            </div>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
              placeholder="Observations, points notables, suivi à prévoir…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary resize-none"
            />
          </div>

          {/* Bouton sauvegarder */}
          <button
            onClick={handleSave}
            className="w-full flex items-center justify-center gap-2 bg-primary text-white rounded-xl py-3 text-sm font-semibold hover:bg-dark transition-colors"
          >
            💾 Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
