import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { Seance, Participant } from '../../types';
import { heureEnMinutes, minutesEnHeure, arrondirAuPas, calerDansFenetre, heuresChevauchent } from '../../utils/horaires';

export const FRISE_H_DEBUT = 8 * 60;
export const FRISE_H_FIN   = 19 * 60;
// Hauteur d'une heure dans la frise, en pixels — configurable ici.
// Doublée par rapport à la valeur d'origine (48px) : à 48px/h, un pas de 15
// min ne représentait que 12px à l'écran, ce qui rendait le glisser-déposer
// imprécis (un petit mouvement de souris faisait sauter l'heure de beaucoup).
export const HAUTEUR_HEURE_PX = 96;
export const FRISE_PLAGE   = FRISE_H_FIN - FRISE_H_DEBUT;
export const FRISE_TOTAL_H = (FRISE_PLAGE / 60) * HAUTEUR_HEURE_PX;
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

// Aperçu affiché pendant le survol en glisser-déposer (voir calculerApercuDrag) :
// le créneau que prendrait la séance si on lâchait maintenant, façon Google
// Calendar, pour ne plus avoir à "viser" au pixel près.
interface ApercuDrag {
  debutMin: number;
  finMin: number;
  heureDebut: string;
  heureFin: string;
  horsDispo: boolean;
  conflitNom: string | null;
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
  const [dragApercu, setDragApercu] = useState<ApercuDrag | null>(null);
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

  // Chevauchements déjà présents (créés avant cette règle, ou par une autre
  // voie) : deux séances qui se chevauchent en heure sont toujours une
  // erreur — repérées ici pour être visuellement signalées et corrigées
  // manuellement (pas de correction automatique).
  const blocsEnConflit = useMemo(() => {
    const enConflit = new Set<number>();
    for (let i = 0; i < blocs.length; i++) {
      for (let j = i + 1; j < blocs.length; j++) {
        if (heuresChevauchent(blocs[i].heureDebut, blocs[i].heureFin, blocs[j].heureDebut, blocs[j].heureFin)) {
          enConflit.add(i);
          enConflit.add(j);
        }
      }
    }
    return enConflit;
  }, [blocs]);

  const heureMarks = useMemo(() => {
    const h: number[] = [];
    for (let m = H_DEBUT; m <= H_FIN; m += 60) h.push(m);
    return h;
  }, []);

  const selectedMin = selectedHeure ? heureEnMinutes(selectedHeure) : null;
  const canInteract = canSelect || selectedHeure !== null;

  // Fenêtres de disponibilité converties en minutes, pour caler le point
  // aimanté à l'intérieur de la fenêtre visée (voir calerDansFenetre).
  const fenetresMin = useMemo(
    () => windowsPatient.map(w => ({ debut: heureEnMinutes(w.debut), fin: heureEnMinutes(w.fin) })),
    [windowsPatient],
  );

  // Convertit une position Y en un début de créneau aimanté au pas et calé
  // dans la fenêtre de disponibilité visée (recale sur le dernier début
  // valide plutôt que de rejeter si l'arrondi déborde la fin de la fenêtre).
  // Renvoie null si le point ne tombe dans aucune fenêtre.
  function yVersMinutesCalees(y: number): number | null {
    const rawMin = H_DEBUT + (y / TOTAL_H) * PLAGE;
    const snapped = Math.max(H_DEBUT, Math.min(H_FIN - dureeNouveau, arrondirAuPas(rawMin)));
    return calerDansFenetre(snapped, dureeNouveau, fenetresMin);
  }

  // Aperçu en direct pendant le glisser-déposer : même snapping que
  // yVersMinutesCalees, mais ne rejette jamais (contrairement au drop réel)
  // — hors dispo, on affiche quand même l'heure visée avec un indicateur,
  // plutôt que de ne rien montrer.
  function calculerApercuDrag(y: number): ApercuDrag {
    const rawMin = H_DEBUT + (y / TOTAL_H) * PLAGE;
    const snapped = Math.max(H_DEBUT, Math.min(H_FIN - dureeNouveau, arrondirAuPas(rawMin)));
    const cale = calerDansFenetre(snapped, dureeNouveau, fenetresMin);
    const debutMin = cale ?? snapped;
    const finMin = debutMin + dureeNouveau;
    const heureDebut = minutesEnHeure(debutMin);
    const heureFin = minutesEnHeure(finMin);
    const conflit = blocs.find(s => heuresChevauchent(heureDebut, heureFin, s.heureDebut, s.heureFin));
    const conflitNom = conflit
      ? (() => { const p = participantMap.get(conflit.participantId); return p ? `${p.prenom} ${p.nom[0]}.` : 'une autre séance'; })()
      : null;
    return { debutMin, finMin, heureDebut, heureFin, horsDispo: cale === null, conflitNom };
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const clamped = yVersMinutesCalees(e.clientY - rect.top);
    if (clamped === null) return;
    const heure = minutesEnHeure(clamped);

    if (selectedHeure === heure) {
      onSelect(null);
    } else if (canSelect) {
      onSelect(heure);
    }
  }

  function handleDragOverEvent(e: React.DragEvent<HTMLDivElement>) {
    if (!onDrop) return;
    e.preventDefault();
    setDragOver(true);
    const rect = e.currentTarget.getBoundingClientRect();
    const apercu = calculerApercuDrag(e.clientY - rect.top);
    // Évite un re-render à chaque pixel de souris : seul un changement de
    // créneau ou de statut (conflit/hors dispo) doit rafraîchir l'étiquette.
    setDragApercu(prev => (
      prev && prev.debutMin === apercu.debutMin && prev.conflitNom === apercu.conflitNom && prev.horsDispo === apercu.horsDispo
    ) ? prev : apercu);
  }

  function handleDragLeaveEvent() {
    setDragOver(false);
    setDragApercu(null);
  }

  function handleDropEvent(e: React.DragEvent<HTMLDivElement>) {
    setDragOver(false);
    setDragApercu(null);
    if (!onDrop) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const apercu = calculerApercuDrag(e.clientY - rect.top);
    // Règle métier : un chevauchement avec une séance existante est toujours
    // une erreur (aucun cas légitime) — on bloque le dépôt et on explique
    // pourquoi, plutôt que de créer la séance ou de proposer un contournement.
    // Être hors disponibilité déclarée est en revanche autorisé : ça se
    // règle avec confirmation dans la modale (ModalConfirmDrop), pas ici.
    if (apercu.conflitNom) {
      toast.error(`Créneau déjà occupé par ${apercu.conflitNom} (${apercu.heureDebut}–${apercu.heureFin}) — dépôt annulé.`);
      return;
    }
    onDrop(apercu.heureDebut);
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
        onDragOver={handleDragOverEvent}
        onDragLeave={handleDragLeaveEvent}
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
          const enConflit = blocsEnConflit.has(i);
          return (
            <div
              key={i}
              className={`absolute left-0.5 right-0.5 rounded px-1.5 overflow-hidden pointer-events-none border ${
                enConflit ? 'bg-red-100 border-red-400' : 'bg-slate-200 border-slate-300'
              }`}
              style={{ top, height }}
              title={enConflit ? 'Chevauche une autre séance — à corriger manuellement' : undefined}
            >
              {height >= 16 && (
                <p className={`text-[10px] font-medium truncate leading-tight mt-px ${enConflit ? 'text-red-700' : 'text-slate-700'}`}>
                  {enConflit && '⚠ '}{p ? `${p.prenom} ${p.nom[0]}.` : '—'}
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

        {/* Aperçu en direct pendant le glisser-déposer — façon Google Calendar :
            le créneau qui serait pris si on lâchait maintenant, avec une
            étiquette collée au bloc plutôt qu'au curseur (pour ne pas
            recouvrir la zone de dépose visée). */}
        {dragOver && dragApercu && (() => {
          const couleur = dragApercu.conflitNom
            ? { bordure: 'border-red-500', fond: 'bg-red-500/15', badge: 'bg-red-500' }
            : dragApercu.horsDispo
              ? { bordure: 'border-orange-500', fond: 'bg-orange-500/10', badge: 'bg-orange-500' }
              : { bordure: 'border-primary', fond: 'bg-primary/15', badge: 'bg-primary' };
          const top = toY(dragApercu.debutMin);
          const height = Math.max(toY(dragApercu.finMin) - top, 20);
          return (
            <div
              className={`absolute left-0.5 right-0.5 rounded border-2 pointer-events-none z-20 overflow-hidden ${couleur.bordure} ${couleur.fond}`}
              style={{ top, height }}
            >
              {/* Étiquette collée en haut du bloc (plutôt que flottant
                  au-dessus, ce qui serait rogné par le conteneur en haut de
                  grille) — reste toujours visible quelle que soit la position. */}
              <span
                className={`block w-full truncate rounded-br px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm ${couleur.badge}`}
              >
                {dragApercu.heureDebut} → {dragApercu.heureFin}
                {dragApercu.conflitNom && ` · ⚠ ${dragApercu.conflitNom}`}
                {dragApercu.horsDispo && !dragApercu.conflitNom && ' · hors dispo'}
              </span>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
