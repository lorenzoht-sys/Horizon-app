import type { CreneauHoraire } from '../../../types';
import { CLS_LABEL } from './communs';

// ─── ORGANISATION : CRÉNEAUX HORAIRES PAR JOUR ──────────────────────────────────

export function CreneauxParJourForm({
  jours,
  value,
  onChange,
}: {
  jours: string[];
  value: Record<string, CreneauHoraire[]>;
  onChange: (v: Record<string, CreneauHoraire[]>) => void;
}) {
  const addCreneau = (jour: string) => {
    const creneaux = value[jour] ?? [];
    onChange({ ...value, [jour]: [...creneaux, { debut: '07:00', fin: '12:00' }] });
  };
  const updCreneau = (jour: string, idx: number, patch: Partial<CreneauHoraire>) => {
    const creneaux = (value[jour] ?? []).map((c, i) => (i === idx ? { ...c, ...patch } : c));
    onChange({ ...value, [jour]: creneaux });
  };
  const removeCreneau = (jour: string, idx: number) => {
    const creneaux = (value[jour] ?? []).filter((_, i) => i !== idx);
    onChange({ ...value, [jour]: creneaux });
  };

  if (jours.length === 0) {
    return <p className="text-xs text-gray-400">Sélectionnez d'abord un ou plusieurs jours disponibles.</p>;
  }

  return (
    <div className="space-y-3">
      {jours.map(jour => {
        const creneaux = value[jour] ?? [];
        return (
          <div key={jour}>
            <label className={CLS_LABEL}>{JOURS_LABELS_COMPLET[jour] ?? jour}</label>
            {creneaux.map((c, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <span className="text-sm text-gray-500">De</span>
                <select
                  value={c.debut}
                  onChange={e => updCreneau(jour, i, { debut: e.target.value })}
                  className="border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-primary"
                >
                  {OPTIONS_HEURES.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <span className="text-sm text-gray-500">à</span>
                <select
                  value={c.fin}
                  onChange={e => updCreneau(jour, i, { fin: e.target.value })}
                  className="border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-primary"
                >
                  {OPTIONS_HEURES.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <button type="button" onClick={() => removeCreneau(jour, i)} aria-label="Supprimer"
                  className="text-gray-400 hover:text-red-500 p-1 text-base leading-none">✕</button>
              </div>
            ))}
            <button type="button" onClick={() => addCreneau(jour)}
              className="flex items-center gap-1.5 text-primary text-sm font-medium border border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 px-3 py-1.5 rounded-xl transition-colors">
              + Ajouter un créneau
            </button>
          </div>
        );
      })}
    </div>
  );
}
export const JOURS_LABELS_COMPLET: Record<string, string> = {
  Lun: 'Lundi', Mar: 'Mardi', Mer: 'Mercredi', Jeu: 'Jeudi', Ven: 'Vendredi', Sam: 'Samedi', Dim: 'Dimanche',
};
export const OPTIONS_HEURES = (() => {
  const heures: string[] = [];
  for (let m = 7 * 60; m <= 20 * 60; m += 30) {
    heures.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return heures;
})();
