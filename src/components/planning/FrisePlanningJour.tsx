import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { Seance, Participant } from '../../types';
import { heureEnMinutes, minutesEnHeure, arrondirAuPas, calerDansFenetre, heuresChevauchent, regrouperParCreneau } from '../../utils/horaires';

// Type MIME custom utilisé comme discriminant dans le dataTransfer natif du
// glisser-déposer : distingue le geste « créer une séance » (bénéficiaire
// glissé depuis la colonne de gauche) du geste « déplacer une séance déjà
// posée » (bloc existant de la grille), pour que onDrop sache lequel traiter.
export const DRAG_MIME_TYPE = 'application/x-mouvtrack-seance-drag';

export type DragPayload =
  | { type: 'nouvelle' }
  | { type: 'existante'; seanceId: string };

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
  onDrop?: (heure: string, payload: DragPayload) => void;
  indisposPierre?: { debut: string; fin: string }[];
  // Interactivité des séances déjà posées (déplacement + édition) — optionnels
  // et non fournis par ModalInsererPatient, qui garde ses blocs purement
  // visuels (pas de régression sur son usage existant : draggable/onClick
  // restent conditionnés à la présence de ces callbacks, voir rendu plus bas).
  seanceEnDeplacement?: { id: string; dureeMinutes: number } | null;
  onSeanceClick?: (seance: Seance, totalOccurrences: number) => void;
  onSeanceDragStart?: (seance: Seance, totalOccurrences: number) => void;
  onSeanceDragEnd?: () => void;
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
  seanceEnDeplacement,
  onSeanceClick,
  onSeanceDragStart,
  onSeanceDragEnd,
}: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [dragApercu, setDragApercu] = useState<ApercuDrag | null>(null);

  // Regroupe par même créneau récurrent (participantId + heureDebut + heureFin) :
  // un contrat hebdomadaire génère une ligne par semaine en base, mais elles
  // tombent toutes sur le même jour/heure dans cette vue « motif de semaine » —
  // un seul bloc visuel les représente. Le bloc reste néanmoins un objet
  // Seance bien précis (un id réel) : on choisit comme représentant la
  // prochaine occurrence à venir (celle que l'utilisateur veut concrètement
  // déplacer/éditer), ou à défaut la plus récente déjà passée. totalOccurrences
  // permet de prévenir l'utilisateur quand une action ne portera que sur cette
  // seule occurrence parmi plusieurs (voir onSeanceClick / onSeanceDragStart).
  const blocs = useMemo(() => regrouperParCreneau(seancesDuJour), [seancesDuJour]);

  // Chevauchements déjà présents (créés avant cette règle, ou par une autre
  // voie) : deux séances qui se chevauchent en heure sont toujours une
  // erreur — repérées ici pour être visuellement signalées et corrigées
  // manuellement (pas de correction automatique).
  const blocsEnConflit = useMemo(() => {
    const enConflit = new Set<number>();
    for (let i = 0; i < blocs.length; i++) {
      for (let j = i + 1; j < blocs.length; j++) {
        if (heuresChevauchent(blocs[i].seance.heureDebut, blocs[i].seance.heureFin, blocs[j].seance.heureDebut, blocs[j].seance.heureFin)) {
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
    // En déplacement d'une séance existante, on utilise SA propre durée (pas
    // celle du contrat actuellement sélectionné dans la colonne de gauche),
    // et on l'exclut de la détection de conflit — sinon elle se
    // chevaucherait toujours avec elle-même sur son créneau d'origine.
    const duree = seanceEnDeplacement?.dureeMinutes ?? dureeNouveau;
    const rawMin = H_DEBUT + (y / TOTAL_H) * PLAGE;
    const snapped = Math.max(H_DEBUT, Math.min(H_FIN - duree, arrondirAuPas(rawMin)));
    const cale = calerDansFenetre(snapped, duree, fenetresMin);
    const debutMin = cale ?? snapped;
    const finMin = debutMin + duree;
    const heureDebut = minutesEnHeure(debutMin);
    const heureFin = minutesEnHeure(finMin);
    const conflit = blocs.find(b =>
      b.seance.id !== seanceEnDeplacement?.id && heuresChevauchent(heureDebut, heureFin, b.seance.heureDebut, b.seance.heureFin)
    );
    const conflitNom = conflit
      ? (() => { const p = participantMap.get(conflit.seance.participantId); return p ? `${p.prenom} ${p.nom[0]}.` : 'une autre séance'; })()
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
    // Distingue « créer » (bénéficiaire glissé depuis la colonne de gauche)
    // de « déplacer » (séance existante) via le flag posé dans le
    // dataTransfer au dragstart — seul endroit où sa valeur est fiable à lire
    // (les navigateurs bloquent la lecture des données pendant le dragover,
    // seuls les types y sont visibles ; la valeur elle-même n'est garantie
    // lisible qu'au drop).
    const raw = e.dataTransfer.getData(DRAG_MIME_TYPE);
    let payload: DragPayload = { type: 'nouvelle' };
    if (raw) {
      try { payload = JSON.parse(raw) as DragPayload; } catch { /* garde 'nouvelle' par défaut */ }
    }
    onDrop(apercu.heureDebut, payload);
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
        {blocs.map((b, i) => {
          const s = b.seance;
          const dMin = heureEnMinutes(s.heureDebut);
          const fMin = heureEnMinutes(s.heureFin);
          if (dMin >= H_FIN || fMin <= H_DEBUT) return null;
          const top = toY(Math.max(dMin, H_DEBUT));
          const height = Math.max(toY(Math.min(fMin, H_FIN)) - top, 14);
          const p = participantMap.get(s.participantId);
          const enConflit = blocsEnConflit.has(i);
          // draggable/onClick restent conditionnés à la présence des callbacks
          // (non fournis par ModalInsererPatient) — pointer-events-none n'est
          // conservé QUE dans ce cas-là, pour ne rien changer à son
          // comportement actuel (clic qui traverse jusqu'à la frise).
          const interactif = !!(onSeanceClick || onSeanceDragStart);
          const enDeplacement = seanceEnDeplacement?.id === s.id;
          return (
            <div
              key={s.id}
              draggable={!!onSeanceDragStart}
              onDragStart={onSeanceDragStart ? (e) => {
                e.stopPropagation();
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData(DRAG_MIME_TYPE, JSON.stringify({ type: 'existante', seanceId: s.id } satisfies DragPayload));
                onSeanceDragStart(s, b.totalOccurrences);
              } : undefined}
              onDragEnd={onSeanceDragEnd}
              onClick={onSeanceClick ? (e) => { e.stopPropagation(); onSeanceClick(s, b.totalOccurrences); } : undefined}
              className={`absolute left-0.5 right-0.5 rounded px-1.5 overflow-hidden border transition-opacity ${
                enConflit ? 'bg-red-light border-red' : 'bg-slate-200 border-slate-300'
              } ${interactif ? 'cursor-pointer hover:ring-2 hover:ring-primary/50' : 'pointer-events-none'} ${
                enDeplacement ? 'opacity-30' : ''
              }`}
              style={{ top, height }}
              title={enConflit ? 'Chevauche une autre séance — à corriger manuellement' : (interactif ? 'Cliquer pour modifier, glisser pour déplacer' : undefined)}
            >
              {height >= 16 && (
                <p className={`text-[10px] font-medium truncate leading-tight mt-px ${enConflit ? 'text-red' : 'text-slate-700'}`}>
                  {enConflit && '⚠ '}{p ? `${p.prenom} ${p.nom[0]}.` : '—'}
                  {b.totalOccurrences > 1 && <span className="ml-1 opacity-60">↻{b.totalOccurrences}</span>}
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
            ? { bordure: 'border-red', fond: 'bg-red/15', badge: 'bg-red' }
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
