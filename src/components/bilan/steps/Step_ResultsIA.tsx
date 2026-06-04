import { useState, useMemo } from 'react';
import type { Bilan, NotesBilan, Participant } from '../../../types';
import { NORMES_SCORING, calculerNote } from '../../../data/norms';
import { genererInterpretation } from '../../../utils/genererInterpretation';
import { Brain, Check, AlertTriangle } from 'lucide-react';
import { useConnexion } from '../../../hooks/useConnexion';

type BilanForm = Omit<Bilan, 'id'>;

interface Props {
  form: BilanForm;
  update: (patch: Partial<BilanForm>) => void;
  participant: Participant;
  previous: Bilan | null;
}

// ─── Notation automatique ─────────────────────────────────────────────────────

function calculerNotes(form: BilanForm): NotesBilan {
  const n: NotesBilan = {};

  const eqVals = [form.equilibre.droite, form.equilibre.gauche].filter((v): v is number => v !== null);
  if (eqVals.length > 0) {
    n.equilibre = calculerNote(eqVals.reduce((s, v) => s + v, 0) / eqVals.length, NORMES_SCORING.equilibreUnipodal);
  }

  if (form.chairStand30 !== null) n.force = calculerNote(form.chairStand30, NORMES_SCORING.chairStand30);

  const hgVals = [form.handGrip.droite, form.handGrip.gauche].filter((v): v is number => v !== null);
  if (hgVals.length > 0) {
    n.handGrip = calculerNote(hgVals.reduce((s, v) => s + v, 0) / hgVals.length, NORMES_SCORING.handGrip);
  }

  if (form.tug3m !== null) n.mobilite = calculerNote(form.tug3m, NORMES_SCORING.tug3m);
  if (form.souplesse.valeur !== null) n.souplesse = calculerNote(form.souplesse.valeur, NORMES_SCORING.souplesse);
  if (form.tm6.distanceMetres !== null) n.endurance = calculerNote(form.tm6.distanceMetres, NORMES_SCORING.tm6Distance);

  const mi = form.memoire.scoreImmediat, md = form.memoire.scoreDiffere;
  if (mi !== null || md !== null) n.memoire = calculerNote((mi ?? 0) + (md ?? 0), NORMES_SCORING.memoire);

  return n;
}

function calcAge(dateNaissance: string): number {
  const today = new Date(), birth = new Date(dateNaissance);
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return age;
}

// ─── Affichage note /5 ────────────────────────────────────────────────────────

const NOTE_COLORS: Record<number, string> = {
  1: '#EF4444', 2: '#F59E0B', 3: '#F59E0B', 4: '#3B6D11', 5: 'var(--color-teal)',
};
const NOTE_LABELS: Record<number, string> = {
  1: 'Très insuffisant', 2: 'Insuffisant', 3: 'Moyen', 4: 'Bien', 5: 'Excellent',
};
const NOTES_LABELS_TEST: Record<keyof NotesBilan, string> = {
  equilibre: 'Équilibre', force: 'Force MI', handGrip: 'Force mains',
  mobilite: 'Mobilité', souplesse: 'Souplesse', endurance: 'Endurance', memoire: 'Mémoire',
};

function NoteBadge({ note }: { note: number }) {
  const color = NOTE_COLORS[note] ?? '#9CA3AF';
  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-white font-extrabold text-base"
        style={{ background: color }}
      >
        {note}
      </div>
      <span className="text-xs font-semibold" style={{ color }}>{NOTE_LABELS[note]}</span>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function Step_ResultsIA({ form, update, participant, previous }: Props) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { enLigne } = useConnexion();

  const notes = useMemo(() => calculerNotes(form), [form]);
  const interpretation = form.interpretationIA ?? null;
  const hasAnyNote = Object.values(notes).some(v => v !== undefined);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const previousNotes = previous ? calculerNotes(previous as unknown as BilanForm) : null;
      const resultat = await genererInterpretation(
        {
          participant: {
            prenom: participant.prenom,
            nom: participant.nom,
            age: calcAge(participant.dateNaissance),
            profil: participant.contexteClinic || participant.pathologie || 'Non renseigné',
          },
          notes,
          valeurs: {
            equilibreD: form.equilibre.droite,
            equilibreG: form.equilibre.gauche,
            chairStand: form.chairStand30,
            handGripD: form.handGrip.droite,
            handGripG: form.handGrip.gauche,
            tug: form.tug3m,
            souplesse: form.souplesse.valeur,
            tm6Distance: form.tm6.distanceMetres,
            memoireImmediat: form.memoire.scoreImmediat,
            memoireDiffere: form.memoire.scoreDiffere,
          },
          douleur: null,
          fatigue: null,
          bilanPrecedentNotes: previousNotes,
        }
      );
      update({
        notesBilan: notes,
        interpretationIA: resultat,
        messageClient: resultat.messageClient || form.messageClient,
        notesProfessionnelles: form.notesProfessionnelles
          ? form.notesProfessionnelles
          : resultat.textePro,
      });
    } catch (e: any) {
      setError(e?.message ?? 'Erreur lors de la génération');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-heading font-semibold text-dark">Résultats & Interprétation IA</h2>

      {/* ── Tableau des notes /5 ── */}
      {hasAnyNote ? (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Notes calculées automatiquement</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(Object.entries(notes) as [keyof NotesBilan, number | undefined][])
              .filter(([, v]) => v !== undefined)
              .map(([key, note]) => (
                <div key={key}
                  className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3">
                  <span className="text-sm font-medium text-gray-600">{NOTES_LABELS_TEST[key]}</span>
                  <NoteBadge note={note!} />
                </div>
              ))}
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-400 text-center">
          Aucun test renseigné — revenez à l'étape précédente pour saisir les résultats.
        </div>
      )}

      {/* ── Bouton génération IA ── */}
      <div className="border border-blue-100 rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-4">
          <div className="flex items-center gap-2.5 mb-1.5">
            <Brain size={18} className="text-primary" />
            <h3 className="font-semibold text-dark text-sm">Interprétation automatique par Claude AI</h3>
          </div>
          <p className="text-xs text-gray-500">
            L'IA analyse les résultats et génère une interprétation professionnelle.
            Vous pourrez la modifier avant enregistrement.
          </p>
        </div>
        <div className="p-4 space-y-3">
          {error && (
            <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!enLigne && (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <AlertTriangle size={14} className="flex-shrink-0" />
              <span>⚠️ Connexion requise pour l'interprétation IA</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || !hasAnyNote || !enLigne}
            className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2.5 transition-colors ${
              generating || !hasAnyNote || !enLigne
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-primary text-white hover:bg-dark'
            }`}
          >
            {generating ? (
              <>
                <span className="animate-spin text-lg">⏳</span>
                Génération en cours…
              </>
            ) : (
              <>
                <Brain size={16} />
                {interpretation ? 'Regénérer l\'interprétation' : 'Générer l\'interprétation IA'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Résultats IA ── */}
      {interpretation && (
        <div className="space-y-4">
          {/* Points forts */}
          {interpretation.pointsForts.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-center gap-2 font-bold text-green-800 text-sm mb-2">
                <Check size={15} /> Points forts
              </div>
              {interpretation.pointsForts.map((p, i) => (
                <p key={i} className="text-sm text-green-700 leading-relaxed">• {p}</p>
              ))}
            </div>
          )}

          {/* Points à travailler */}
          {interpretation.pointsATravail.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-2 font-bold text-amber-800 text-sm mb-2">
                🎯 Points à travailler
              </div>
              {interpretation.pointsATravail.map((p, i) => (
                <p key={i} className="text-sm text-amber-700 leading-relaxed">• {p}</p>
              ))}
            </div>
          )}

          {/* Recommandations */}
          {interpretation.recommandations.length > 0 && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <div className="font-bold text-blue-800 text-sm mb-2">💡 Recommandations</div>
              {interpretation.recommandations.map((r, i) => (
                <p key={i} className="text-sm text-blue-700 leading-relaxed">{i + 1}. {r}</p>
              ))}
            </div>
          )}

          {/* Texte pro éditable */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Interprétation professionnelle <span className="text-gray-400 font-normal">(modifiable)</span>
            </label>
            <textarea
              value={interpretation.textePro}
              onChange={e => update({ interpretationIA: { ...interpretation, textePro: e.target.value } })}
              rows={5}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">Ce texte va dans votre dossier professionnel.</p>
          </div>

          {/* Message client éditable */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Message pour le patient <span className="text-gray-400 font-normal">(modifiable)</span>
            </label>
            <textarea
              value={interpretation.messageClient}
              onChange={e => update({
                interpretationIA: { ...interpretation, messageClient: e.target.value },
                messageClient: e.target.value,
              })}
              rows={3}
              className="w-full border border-secondary/40 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-secondary resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">Ce message sera visible dans l'espace client du patient.</p>
          </div>
        </div>
      )}
    </div>
  );
}
