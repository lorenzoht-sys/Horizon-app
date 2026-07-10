import { ChevronDown, ChevronUp } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import type { CompteRenduSeance, ExerciceRealise } from '../../types/seance';
import type { NoteSeance } from '../../types';
import { RESSENTI_CONFIG, ALERTES_CONFIG } from './NoteSeanceModal';
import { entreeAUneAlerte, type JournalEntry } from '../../lib/journalAlertes';

export type { JournalEntry };

// tailwind.config.js redéfinit `red` et `amber` comme couleurs plates
// (extend.colors) : les classes numérotées type `amber-600`/`red-200` ne
// génèrent aucun CSS dans ce projet (cf. commit 040a9d7). On utilise donc
// uniquement les couleurs plates du thème (bg-amber-light, text-red, etc.),
// jamais `amber-*`/`red-*` avec un chiffre.

export const PROGRESSION_CONFIG: Record<string, { emoji: string; label: string; color: string }> = {
  'en progrès': { emoji: '📈', label: 'En progrès', color: '#22C55E' },
  'stable':     { emoji: '➡️', label: 'Stable',     color: '#6B7280' },
  'régression': { emoji: '📉', label: 'Régression', color: '#EF4444' },
};

export const HUMEUR_EMOJI: Record<string, string> = {
  'très bien': '😊', bien: '🙂', moyen: '😐', fatigué: '😓',
};

function formatDateCourte(date: string): string {
  return new Date(date + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function ligneExercice(ex: ExerciceRealise): string {
  const parts: string[] = [];
  if (ex.series != null) parts.push(`${ex.series} séries`);
  if (ex.repetitions != null) parts.push(`${ex.repetitions} rép.`);
  if (ex.dureeSecondes != null) parts.push(`${ex.dureeSecondes} s`);
  return parts.join(' · ');
}

interface Props {
  entry: JournalEntry;
  expanded: boolean;
  onToggle: () => void;
}

export default function CarteJournalSeance({ entry, expanded, onToggle }: Props) {
  const alerte = entreeAUneAlerte(entry);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={onToggle}
      onKeyDown={handleKeyDown}
      className="bg-white rounded-xl border border-gray-200/60 px-3 py-2.5 hover:bg-gray-50/50 transition-colors cursor-pointer"
    >
      {/* ── Vue repliée : l'essentiel ─────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-[12px] font-semibold text-gray-700 capitalize">
            {formatDateCourte(entry.date)}
          </span>
          {entry.type === 'dictee' && entry.data.dureeMinutes && (
            <span className="text-[11px] text-gray-400">{entry.data.dureeMinutes} min</span>
          )}
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium whitespace-nowrap">
            {entry.type === 'dictee' ? '🎙️ Dictée' : '✏️ Manuelle'}
          </span>
          {entry.type === 'dictee' && entry.data.humeurPatient && (
            <span className="text-[13px]">{HUMEUR_EMOJI[entry.data.humeurPatient]}</span>
          )}
          {entry.type === 'note' && entry.data.ressenti && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white whitespace-nowrap"
              style={{ background: RESSENTI_CONFIG[entry.data.ressenti].color }}
            >
              {RESSENTI_CONFIG[entry.data.ressenti].emoji} {RESSENTI_CONFIG[entry.data.ressenti].label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {alerte && (
            <span className="w-2 h-2 rounded-full bg-red" title="Point à surveiller" aria-label="Alerte" />
          )}
          {expanded
            ? <ChevronUp size={14} className="text-gray-400" />
            : <ChevronDown size={14} className="text-gray-400" />}
        </div>
      </div>

      {entry.type === 'dictee' && entry.data.exercicesRealises.length > 0 && (
        <p className="text-[12px] text-gray-500 mt-1">
          🏋️ {entry.data.exercicesRealises.map(e => e.nom).filter(Boolean).join(' · ')}
        </p>
      )}

      {/* ── Vue dépliée : tout le reste ───────────────────────────── */}
      {expanded && (
        entry.type === 'dictee' ? (
          <DetailDictee cr={entry.data} />
        ) : (
          <DetailNote note={entry.data} />
        )
      )}
    </div>
  );
}

function DetailDictee({ cr }: { cr: CompteRenduSeance }) {
  const prog = cr.progression ? PROGRESSION_CONFIG[cr.progression] : null;
  return (
    <div className="mt-2 pt-2 border-t border-gray-100 space-y-2">
      {cr.observations && (
        <p className="text-[13px] text-gray-600 leading-relaxed">{cr.observations}</p>
      )}

      {cr.exercicesRealises.length > 0 && (
        <div className="space-y-1">
          {cr.exercicesRealises.map((ex, i) => (
            <div key={i} className="text-[12px] text-gray-600">
              <span className="font-medium text-gray-700">{ex.nom || 'Exercice'}</span>
              {ligneExercice(ex) && <span className="text-gray-400"> — {ligneExercice(ex)}</span>}
              {ex.commentaire && <p className="text-gray-500 italic mt-0.5">{ex.commentaire}</p>}
            </div>
          ))}
        </div>
      )}

      {prog && (
        <p className="text-[12px] font-medium" style={{ color: prog.color }}>
          {prog.emoji} Progression : {prog.label}
        </p>
      )}

      {cr.douleursSignalees && (
        <p className="text-[12px] text-red bg-red-light border border-red/20 rounded-lg px-2.5 py-1.5">
          ⚠️ Douleurs signalées : {cr.douleursSignalees}
        </p>
      )}

      {cr.pointsAttention && (
        <p className="text-[12px] text-amber bg-amber-light border border-amber/20 rounded-lg px-2.5 py-1.5">
          ⚠️ {cr.pointsAttention}
        </p>
      )}

      {cr.prochaineSeanceNotes && (
        <p className="text-[12px] text-gray-500">📌 Prochaine séance : {cr.prochaineSeanceNotes}</p>
      )}
    </div>
  );
}

function DetailNote({ note }: { note: NoteSeance }) {
  const alertesActives = ALERTES_CONFIG.filter(a => note.alertes[a.key]);
  return (
    <div className="mt-2 pt-2 border-t border-gray-100 space-y-2">
      {note.note && (
        <p className="text-[13px] text-gray-600 leading-relaxed">{note.note}</p>
      )}

      {alertesActives.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {alertesActives.map(a => (
            <span
              key={a.key}
              className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-light text-amber border border-amber/20"
            >
              {a.emoji} {a.label}
            </span>
          ))}
        </div>
      )}

      {note.douleurEVA != null && (
        <p className="text-[12px] text-gray-600">🩹 Douleur (EVA) : {note.douleurEVA}/10</p>
      )}
    </div>
  );
}
