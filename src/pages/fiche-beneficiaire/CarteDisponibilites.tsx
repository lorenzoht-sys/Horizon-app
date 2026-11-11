import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import type { Participant } from '../../types';

// ── CarteDisponibilites ───────────────────────────────────────────────────────

export const JOURS_DISPO_LIST = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const;

export const HEURES_DISPO = (() => {
  const h: string[] = [];
  for (let m = 7 * 60; m <= 20 * 60; m += 30)
    h.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  return h;
})();

export function CarteDisponibilites({
  participant,
  onSave,
}: {
  participant: Participant;
  onSave: (data: Partial<Participant>) => Promise<void>;
}) {
  const org = participant.anamnese?.organisation ?? {};
  const jours: string[] = org.joursDisponibles ?? [];
  const creneauxParJour: Record<string, { debut: string; fin: string }[]> = org.creneauxParJour ?? {};

  const [editing, setEditing] = useState(false);
  const [editJours, setEditJours] = useState<string[]>([]);
  const [editCreneaux, setEditCreneaux] = useState<Record<string, { debut: string; fin: string }[]>>({});

  function handleStartEdit() {
    setEditJours([...jours]);
    setEditCreneaux(JSON.parse(JSON.stringify(creneauxParJour)));
    setEditing(true);
  }

  function toggleJour(jour: string) {
    const dejaCoche = editJours.includes(jour);
    setEditJours(prev => dejaCoche ? prev.filter(j => j !== jour) : [...prev, jour]);
    setEditCreneaux(prev => {
      if (dejaCoche) {
        // Jour décoché : on retire son entrée plutôt que de la laisser en
        // créneau fantôme (jamais lu tant que le jour reste décoché, mais
        // pollue les données enregistrées).
        const { [jour]: _retire, ...reste } = prev;
        return reste;
      }
      if (!prev[jour]) return { ...prev, [jour]: [{ debut: '09:00', fin: '12:00' }] };
      return prev;
    });
  }

  async function handleSave() {
    const newOrg = { ...org, joursDisponibles: editJours, creneauxParJour: editCreneaux };
    try {
      await onSave({ anamnese: { ...participant.anamnese, organisation: newOrg } });
      setEditing(false);
    } catch (err) {
      console.error('Erreur sauvegarde disponibilités:', err);
      toast.error('Erreur lors de la sauvegarde, réessayez');
    }
  }

  if (!editing) {
    const hasData = jours.length > 0;
    return (
      <div className="bg-white rounded-xl border border-gray-200/60 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">Disponibilités · Tournée</div>
          <button onClick={handleStartEdit}
            className="text-[12px] text-primary hover:underline font-medium flex items-center gap-0.5">
            <Pencil size={10} className="mr-0.5" />{hasData ? 'Modifier' : 'Saisir'}
          </button>
        </div>
        {hasData ? (
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1">
              {JOURS_DISPO_LIST.filter(j => jours.includes(j)).map(j => (
                <span key={j} className="text-[11px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-md">{j}</span>
              ))}
            </div>
            {jours.some(j => (creneauxParJour[j]?.length ?? 0) > 0) && (
              <div className="text-[12px] text-gray-400 leading-relaxed">
                {jours.filter(j => (creneauxParJour[j]?.length ?? 0) > 0).map(j =>
                  `${j} : ${creneauxParJour[j].map((c: { debut: string; fin: string }) => `${c.debut}–${c.fin}`).join(', ')}`
                ).join(' · ')}
              </div>
            )}
          </div>
        ) : (
          <p className="text-[12px] text-gray-400 italic">Aucune disponibilité — cliquez "Saisir" pour renseigner les jours et créneaux utilisés dans la tournée.</p>
        )}
      </div>
    );
  }

  // ── Mode édition ───────────────────────────────────────────────────────────
  const joursOrdres = [...editJours].sort(
    (a, b) => JOURS_DISPO_LIST.indexOf(a as typeof JOURS_DISPO_LIST[number]) - JOURS_DISPO_LIST.indexOf(b as typeof JOURS_DISPO_LIST[number])
  );

  return (
    <div className="bg-white rounded-xl border border-primary/40 p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-3">Disponibilités · Tournée</div>

      {/* Jours */}
      <div className="mb-3">
        <div className="text-[12px] font-medium text-gray-600 mb-1.5">Jours disponibles</div>
        <div className="flex gap-1.5 flex-wrap">
          {JOURS_DISPO_LIST.map(j => {
            const actif = editJours.includes(j);
            return (
              <button key={j} type="button" onClick={() => toggleJour(j)}
                className={`text-[12px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                  actif ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}>
                {j}
              </button>
            );
          })}
        </div>
      </div>

      {/* Créneaux par jour */}
      {joursOrdres.length > 0 && (
        <div className="mb-3 space-y-2">
          <div className="text-[12px] font-medium text-gray-600">Créneaux horaires</div>
          {joursOrdres.map(jour => {
            const slots = editCreneaux[jour] ?? [{ debut: '09:00', fin: '12:00' }];
            return (
              <div key={jour} className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-semibold text-gray-500 w-7 flex-shrink-0">{jour}</span>
                {slots.map((slot: { debut: string; fin: string }, i: number) => (
                  <div key={i} className="flex items-center gap-1">
                    <select value={slot.debut}
                      onChange={e => {
                        const next = slots.map((s: { debut: string; fin: string }, si: number) => si === i ? { ...s, debut: e.target.value } : s);
                        setEditCreneaux(prev => ({ ...prev, [jour]: next }));
                      }}
                      className="border border-gray-200 rounded-lg px-1.5 py-1 text-[12px] focus:outline-none focus:border-primary">
                      {HEURES_DISPO.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                    <span className="text-[11px] text-gray-400">→</span>
                    <select value={slot.fin}
                      onChange={e => {
                        const next = slots.map((s: { debut: string; fin: string }, si: number) => si === i ? { ...s, fin: e.target.value } : s);
                        setEditCreneaux(prev => ({ ...prev, [jour]: next }));
                      }}
                      className="border border-gray-200 rounded-lg px-1.5 py-1 text-[12px] focus:outline-none focus:border-primary">
                      {HEURES_DISPO.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={handleSave}
          className="flex-1 bg-primary text-white text-[12px] font-semibold py-1.5 rounded-lg hover:bg-dark transition-colors">
          Enregistrer
        </button>
        <button onClick={() => setEditing(false)}
          className="px-3 border border-gray-200 text-gray-500 text-[12px] rounded-lg hover:bg-gray-50 transition-colors">
          Annuler
        </button>
      </div>
    </div>
  );
}
