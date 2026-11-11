import { useState } from 'react';
import { NotebookPen, Mic } from 'lucide-react';
import { type EntreeCours } from '../../lib/coursCollectifs';
import { cleEntree } from '../../lib/journalAlertes';
import CarteJournalSeance, { type JournalEntry } from '../../components/journal/CarteJournalSeance';
import type { CompteRenduSeance } from '../../types/seance';
import { SectionLabel } from './communs';

// ── CarteJournalFusion ────────────────────────────────────────────────────────

export function CarteJournalFusion({ compteRendus, coursRealises, onDicter }: {
  compteRendus: CompteRenduSeance[];
  /** Cours collectifs RÉALISÉS de ce bénéficiaire (présent, absent ou excusé). */
  coursRealises: EntreeCours[];
  onDicter: () => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Comptes rendus dictés ET cours collectifs réalisés, dans l'ordre chronologique inverse.
  const entries: JournalEntry[] = [
    ...compteRendus.map(cr => ({ type: 'dictee' as const, date: cr.dateSeance, data: cr })),
    ...coursRealises.map(e => ({ type: 'cours' as const, date: e.cours.date, data: e })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  function toggle(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Journal des séances</SectionLabel>
        <button
          onClick={onDicter}
          className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <Mic size={11} style={{ color: 'var(--color-teal)' }} /> Dicter
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <NotebookPen size={18} className="text-gray-400" />
          </div>
          <p className="text-[13px] text-gray-500 font-medium mb-1">Aucune séance dictée</p>
          <p className="text-[12px] text-gray-400 mb-3">Dictez un compte-rendu après chaque séance</p>
          <button
            onClick={onDicter}
            className="inline-flex items-center gap-1.5 border border-gray-200 text-gray-600 text-[12px] font-medium px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Mic size={12} style={{ color: 'var(--color-teal)' }} /> Dicter une séance
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.slice(0, 5).map((entry) => (
            <CarteJournalSeance
              key={cleEntree(entry)}
              entry={entry}
              expanded={expandedIds.has(cleEntree(entry))}
              onToggle={() => toggle(cleEntree(entry))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
