import { useState, useEffect, useRef } from 'react';
import { X, Users, Check, Mic, MicOff } from 'lucide-react';
import { toast } from 'sonner';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import type { CoursCollectif, ParticipationCoursCollectif, Participant, StatutPresenceCours, StatutCoursCollectif } from '../../types';

// Même échelle que retours_seance / EspacePatient.tsx (NIVEAUX_EFFORT,
// NIVEAUX_BIEN_ETRE) — mêmes valeurs et libellés, mais saisie desktop par
// le praticien plutôt que le composant mobile du bénéficiaire (styles
// inline propres à l'app patient, non réutilisables tels quels ici).
const NIVEAUX_EFFORT: { label: string; valeur: number; couleur: string }[] = [
  { label: 'Très facile', valeur: 2, couleur: '#16A34A' },
  { label: 'Facile', valeur: 4, couleur: '#65A84E' },
  { label: 'Modéré', valeur: 6, couleur: '#CA8A04' },
  { label: 'Difficile', valeur: 8, couleur: '#EA580C' },
  { label: 'Très difficile', valeur: 10, couleur: '#DC2626' },
];

const NIVEAUX_BIEN_ETRE: { label: string; valeur: number; couleur: string }[] = [
  { label: 'Très bien', valeur: 1, couleur: '#16A34A' },
  { label: 'Bien', valeur: 2, couleur: '#65A84E' },
  { label: 'Correct', valeur: 3, couleur: '#CA8A04' },
  { label: 'Fatigué', valeur: 4, couleur: '#EA580C' },
  { label: 'Épuisé', valeur: 5, couleur: '#DC2626' },
];

const LABEL_PRESENCE: Record<StatutPresenceCours, string> = {
  present: 'Présent', absent: 'Absent', excuse: 'Excusé',
};

const STATUT_COURS_BADGE: Record<StatutCoursCollectif, { label: string; class: string }> = {
  planifie: { label: 'Planifié', class: 'bg-blue-100 text-blue-700' },
  realise: { label: 'Réalisé', class: 'bg-green-100 text-green-700' },
  annule: { label: 'Annulé', class: 'bg-gray-100 text-gray-500' },
};

type PatchParticipation = {
  statutPresence: StatutPresenceCours;
  ressentiBorg: number | null;
  ressentiBienetre: number | null;
  /** Absent tant que la note n'a pas changé ; null = note effacée. */
  notes?: string | null;
};

interface LigneProps {
  participation: ParticipationCoursCollectif;
  participant: Participant | undefined;
  onSauvegarder: (patch: PatchParticipation) => Promise<boolean>;
}

function LigneParticipant({ participation, participant, onSauvegarder }: LigneProps) {
  const [statutPresence, setStatutPresence] = useState<StatutPresenceCours>(participation.statutPresence);
  const [ressentiBorg, setRessentiBorg] = useState<number | null>(participation.ressentiBorg ?? null);
  const [ressentiBienetre, setRessentiBienetre] = useState<number | null>(participation.ressentiBienetre ?? null);
  const [notes, setNotes] = useState(participation.notes ?? '');
  const [saving, setSaving] = useState(false);

  // Dictée : le texte dicté s'ajoute à ce qui était déjà écrit au moment où on
  // appuie sur « Dicter » (le hook repart de zéro à chaque enregistrement).
  const { isRecording, finalTranscript, interimTranscript, isSupported, startRecording, stopRecording, reset: resetDictee } = useSpeechRecognition();
  const baseDictee = useRef('');
  useEffect(() => {
    const dicte = (finalTranscript + interimTranscript).trim();
    if (!dicte) return;
    const base = baseDictee.current.trimEnd();
    setNotes(base ? `${base} ${dicte}` : dicte);
  }, [finalTranscript, interimTranscript]);

  function basculerDictee() {
    if (isRecording) { stopRecording(); return; }
    resetDictee();
    baseDictee.current = notes;
    startRecording();
  }

  const notesModifiees = notes.trim() !== (participation.notes ?? '').trim();
  const modifie =
    statutPresence !== participation.statutPresence ||
    ressentiBorg !== (participation.ressentiBorg ?? null) ||
    ressentiBienetre !== (participation.ressentiBienetre ?? null) ||
    notesModifiees;

  async function sauvegarder() {
    if (isRecording) stopRecording();
    setSaving(true);
    // `notes` n'est envoyée que si elle a changé : enregistrer une présence ne
    // doit pas dépendre de la colonne notes (migration 20260921_participations_
    // cours_collectifs_notes.sql).
    const ok = await onSauvegarder({
      statutPresence, ressentiBorg, ressentiBienetre,
      ...(notesModifiees ? { notes: notes.trim() === '' ? null : notes.trim() } : {}),
    });
    setSaving(false);
    if (ok) toast.success(`${participant ? participant.prenom : 'Participant'} : mis à jour`);
  }

  return (
    <div className="border border-gray-100 rounded-xl p-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-sm font-medium text-dark">
          {participant ? `${participant.prenom} ${participant.nom}` : 'Participant introuvable'}
        </span>
        <div className="flex gap-1">
          {(['present', 'absent', 'excuse'] as StatutPresenceCours[]).map(s => (
            <button
              key={s}
              onClick={() => setStatutPresence(s)}
              className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                statutPresence === s
                  ? s === 'present' ? 'bg-green-600 text-white' : s === 'absent' ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {LABEL_PRESENCE[s]}
            </button>
          ))}
        </div>
      </div>

      {statutPresence === 'present' && (
        <div className="space-y-2 mt-2">
          <div>
            <span className="text-xs text-gray-400">Effort perçu (optionnel)</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {NIVEAUX_EFFORT.map(n => (
                <button
                  key={n.valeur}
                  onClick={() => setRessentiBorg(ressentiBorg === n.valeur ? null : n.valeur)}
                  style={{ backgroundColor: ressentiBorg === n.valeur ? n.couleur : undefined }}
                  className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                    ressentiBorg === n.valeur ? 'text-white border-transparent' : 'text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {n.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-xs text-gray-400">Bien-être ressenti (optionnel)</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {NIVEAUX_BIEN_ETRE.map(n => (
                <button
                  key={n.valeur}
                  onClick={() => setRessentiBienetre(ressentiBienetre === n.valeur ? null : n.valeur)}
                  style={{ backgroundColor: ressentiBienetre === n.valeur ? n.couleur : undefined }}
                  className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                    ressentiBienetre === n.valeur ? 'text-white border-transparent' : 'text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {n.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Note du praticien : visible de lui seul (jamais du bénéficiaire ni de la
          structure), y compris pour un absent — la raison d'une absence s'y note. */}
      <div className="mt-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Note (visible de vous seul)</span>
          {isSupported && (
            <button
              type="button"
              onClick={basculerDictee}
              aria-label={isRecording ? 'Arrêter la dictée' : 'Dicter la note'}
              className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg border transition-colors ${
                isRecording ? 'bg-red-50 border-red-200 text-red-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {isRecording ? <><MicOff size={12} /> Arrêter</> : <><Mic size={12} /> Dicter</>}
            </button>
          )}
        </div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          readOnly={isRecording}
          rows={2}
          placeholder={isRecording ? 'Dictée en cours…' : 'Observations, douleur signalée, exercice adapté, raison de l\'absence…'}
          aria-label={`Note sur ${participant ? participant.prenom : 'ce participant'}`}
          className="w-full mt-1 border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-primary resize-none"
        />
      </div>

      {modifie && (
        <button
          onClick={sauvegarder} disabled={saving}
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-primary text-white hover:bg-dark transition-colors disabled:opacity-50"
        >
          <Check size={13} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      )}
    </div>
  );
}

interface Props {
  cours: CoursCollectif;
  participations: ParticipationCoursCollectif[];
  participants: Participant[];
  /** undefined si programmeCommunId absent OU si le modèle appartient à un
   *  autre praticien de l'organisation — programmes_modeles n'a pas de
   *  couche organisation (limitation v1 documentée, migration
   *  20260917_cours_collectifs.sql). On ne distingue pas les deux cas :
   *  dans les deux, il n'y a simplement rien à afficher. */
  programmeNom?: string;
  onMettreAJourParticipation: (participationId: string, patch: PatchParticipation) => Promise<boolean>;
  onModifierStatutCours: (statut: StatutCoursCollectif) => Promise<boolean>;
  onClose: () => void;
}

export default function ModalPresenceCoursCollectif({ cours, participations, participants, programmeNom, onMettreAJourParticipation, onModifierStatutCours, onClose }: Props) {
  const participantMap = new Map(participants.map(p => [p.id, p]));
  const badge = STATUT_COURS_BADGE[cours.statut];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-base font-bold text-dark flex items-center gap-2">
            <Users size={18} /> {cours.titre}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="flex items-center gap-2 mb-4">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badge.class}`}>{badge.label}</span>
          <span className="text-xs text-gray-500">
            {new Date(cours.date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} · {cours.heureDebut}
          </span>
          {cours.programmeCommunId && (
            <span className="text-xs text-gray-500">· {programmeNom ?? 'Programme non accessible'}</span>
          )}
        </div>

        <div className="space-y-2">
          {participations.map(p => (
            <LigneParticipant
              key={p.id}
              participation={p}
              participant={participantMap.get(p.participantId)}
              onSauvegarder={patch => onMettreAJourParticipation(p.id, patch)}
            />
          ))}
          {participations.length === 0 && (
            <div className="text-sm text-gray-400 text-center py-4">Aucun participant inscrit à ce cours.</div>
          )}
        </div>

        {cours.statut !== 'annule' && (
          <div className="flex gap-2 mt-5">
            {cours.statut === 'planifie' && (
              <button
                onClick={() => onModifierStatutCours('realise')}
                className="flex-1 bg-primary text-white rounded-xl py-2.5 font-semibold text-sm hover:bg-dark transition-colors"
              >
                Marquer comme réalisé
              </button>
            )}
            {cours.statut === 'realise' && (
              <button
                onClick={() => onModifierStatutCours('planifie')}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Revenir à "planifié"
              </button>
            )}
            <button
              onClick={() => onModifierStatutCours('annule')}
              className="py-2.5 px-4 rounded-xl text-sm font-medium border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
            >
              Annuler le cours
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
