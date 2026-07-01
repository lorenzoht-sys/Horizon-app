import { useMemo, useState } from 'react';
import type { Seance, Participant } from '../../types';
import { heureEnMinutes, minutesEnHeure } from '../../utils/horaires';

export const FRISE_H_DEBUT = 8 * 60;
export const FRISE_H_FIN   = 19 * 60;
export const FRISE_PX_H    = 48;
export const FRISE_PLAGE   = FRISE_H_FIN - FRISE_H_DEBUT;
export const FRISE_TOTAL_H = (FRISE_PLAGE / 60) * FRISE_PX_H;
export function friseToY(min: number): number {
  return Math.round(((min - FRISE_H_DEBUT) / FRISE_PLAGE) * FRISE_TOTAL_H);
}

const H_DEBUT = FRISE_H_DEBUT;
const H_FIN   = FRISE_H_FIN;
const PLAGE   = FRISE_PLAGE;
const TOTAL_H = FRISE_TOTAL_H;
const toY     = friseToY;

interface Props {
  seancesDuJour: Seance[];
  participantMap: Map<string, Participant>;
  dureeNouveau: number;
  windowsPatient: { debut: string; fin: string }[];
  selectedHeure: string | null;
  onSelect: (heure: string | null) => void;
  canSelect: boolean;
  showHours?: boolean;
  onDrop?: (heure: string) => void;
  indisposPierre?: { debut: string; fin: string }[];
}

export default function FrisePlanningJour({
  seancesDuJour,
  participantMap,
  dureeNouveau,
  windowsPatient,
  selectedHeure,
  onSelect,
  canSelect,
  showHours = true,
  onDrop,
  indisposPierre,
}: Props) {
  const [dragOver, setDragOver] = useState(false);
  // Déduplique : même participantId + heureDebut + heureFin = un seul bloc visuel
  const blocs = useMemo(() => {
    const seen = new Set<string>();
    return seancesDuJour.filter(s => {
      const key = `${s.participantId}-${s.heureDebut}-${s.heureFin}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [seancesDuJour]);

  const heureMarks = useMemo(() => {
    const h: number[] = [];
    for (let m = H_DEBUT; m <= H_FIN; m += 60) h.push(m);
    return h;
  }, []);

  const selectedMin = selectedHeure ? heureEnMinutes(selectedHeure) : null;
  const canInteract = canSelect || selectedHeure !== null;

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const rawMin = H_DEBUT + (y / TOTAL_H) * PLAGE;
    const snapped = Math.round(rawMin / 15) * 15;
    const clamped = Math.max(H_DEBUT, Math.min(H_FIN - dureeNouveau, snapped));
    const heure = minutesEnHeure(clamped);

    const inWindow = windowsPatient.some(w => {
      const wD = heureEnMinutes(w.debut);
      const wF = heureEnMinutes(w.fin);
      return clamped >= wD && clamped + dureeNouveau <= wF;
    });
    if (!inWindow) return;

    if (selectedHeure === heure) {
      onSelect(null);
    } else if (canSelect) {
      onSelect(heure);
    }
  }

  function handleDropEvent(e: React.DragEvent<HTMLDivElement>) {
    setDragOver(false);
    if (!onDrop) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const rawMin = H_DEBUT + (y / TOTAL_H) * PLAGE;
    const snapped = Math.round(rawMin / 15) * 15;
    const clamped = Math.max(H_DEBUT, Math.min(H_FIN - dureeNouveau, snapped));
    const inWindow = windowsPatient.some(w => {
      const wD = heureEnMinutes(w.debut);
      const wF = heureEnMinutes(w.fin);
      return clamped >= wD && clamped + dureeNouveau <= wF;
    });
    if (inWindow) onDrop(minutesEnHeure(clamped));
  }

  return (
    <div className="flex gap-0 select-none">
      {/* Colonne heures (optionnelle) */}
      {showHours && (
        <div className="relative flex-shrink-0 w-9" style={{ height: TOTAL_H }}>
          {heureMarks.map(m => (
            <div
              key={m}
              className="absolute right-1.5 text-[10px] text-gray-400 leading-none"
              style={{ top: toY(m) - 4 }}
            >
              {`${m / 60}h`}
            </div>
          ))}
        </div>
      )}

      {/* Frise */}
      <div
        className={`relative flex-1 rounded-lg border overflow-hidden bg-white transition-colors ${
          dragOver && onDrop ? 'border-primary border-2' : 'border-gray-200'
        }`}
        style={{ height: TOTAL_H, cursor: canInteract ? 'pointer' : (onDrop ? 'copy' : 'default') }}
        onClick={handleClick}
        onDragOver={e => { if (onDrop) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDropEvent}
      >
        {/* Lignes horaires */}
        {heureMarks.map(m => (
          <div
            key={m}
            className={`absolute left-0 right-0 border-t ${m % (2 * 60) === 0 ? 'border-gray-200' : 'border-gray-100'}`}
            style={{ top: toY(m) }}
          />
        ))}

        {/* Zones disponibles patient (fond vert clair) */}
        {windowsPatient.map((w, i) => {
          const wD = Math.max(heureEnMinutes(w.debut), H_DEBUT);
          const wF = Math.min(heureEnMinutes(w.fin), H_FIN);
          if (wF <= wD) return null;
          return (
            <div
              key={i}
              className="absolute left-0 right-0 bg-green-50"
              style={{ top: toY(wD), height: toY(wF) - toY(wD) }}
            />
          );
        })}

        {/* Indisponibilités Pierre (hachuré rouge) */}
        {indisposPierre?.map((ind, i) => {
          const dMin = Math.max(heureEnMinutes(ind.debut), H_DEBUT);
          const fMin = Math.min(heureEnMinutes(ind.fin), H_FIN);
          if (fMin <= dMin) return null;
          return (
            <div key={i} className="absolute left-0 right-0 pointer-events-none z-[1]"
              style={{
                top: toY(dMin), height: toY(fMin) - toY(dMin),
                background: 'repeating-linear-gradient(45deg,#fee2e2,#fee2e2 3px,#fef2f2 3px,#fef2f2 9px)',
                opacity: 0.75,
              }} />
          );
        })}

        {/* Séances existantes */}
        {blocs.map((s, i) => {
          const dMin = heureEnMinutes(s.heureDebut);
          const fMin = heureEnMinutes(s.heureFin);
          if (dMin >= H_FIN || fMin <= H_DEBUT) return null;
          const top = toY(Math.max(dMin, H_DEBUT));
          const height = Math.max(toY(Math.min(fMin, H_FIN)) - top, 14);
          const p = participantMap.get(s.participantId);
          return (
            <div
              key={i}
              className="absolute left-0.5 right-0.5 rounded bg-slate-200 border border-slate-300 px-1.5 overflow-hidden pointer-events-none"
              style={{ top, height }}
            >
              {height >= 16 && (
                <p className="text-[10px] font-medium text-slate-700 truncate leading-tight mt-px">
                  {p ? `${p.prenom} ${p.nom[0]}.` : '—'}
                </p>
              )}
              {height >= 30 && (
                <p className="text-[9px] text-slate-500 truncate leading-tight">
                  {s.heureDebut}–{s.heureFin}{p?.adresseVille ? ` · ${p.adresseVille}` : ''}
                </p>
              )}
            </div>
          );
        })}

        {/* Créneau sélectionné */}
        {selectedMin !== null && (
          <div
            className="absolute left-0.5 right-0.5 rounded border-2 border-primary bg-primary/15 pointer-events-none z-10"
            style={{
              top: toY(selectedMin),
              height: Math.max(toY(selectedMin + dureeNouveau) - toY(selectedMin), 20),
            }}
          >
            <p className="text-[10px] font-semibold text-primary px-1 mt-px">
              {minutesEnHeure(selectedMin)} – {minutesEnHeure(selectedMin + dureeNouveau)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
