import { useCallback, useMemo, useState } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import * as DragAndDropAddon from 'react-big-calendar/lib/addons/dragAndDrop';
import type { DragFromOutsideItemArgs } from 'react-big-calendar/lib/addons/dragAndDrop';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import { toast } from 'sonner';
import { X, Loader } from 'lucide-react';
import { useAgenda } from '../hooks/useAgenda';
import { useParticipants } from '../hooks/useParticipants';
import { useContrats } from '../hooks/useContrats';
import BadgeSeancesRestantes from '../components/ui/BadgeSeancesRestantes';
import PageWrapper from '../components/layout/PageWrapper';
import {
  genererDatesSeances, datesManquantes, trouveChevauchements,
  calculerStatutSeancesSemaine, addMinutes,
} from '../utils/horaires';
import type { Seance, StatutSeance, TypeSeance, Participant, Contrat } from '../types';

// ============================================================================
// AGENDA UNIFIÉ — ÉTAPE 2 : création de séances par glisser
// ============================================================================
// Route /agenda-v2, toujours hors menu. PlanningGrilleView / AgendaPage /
// TourneePage ne sont PAS modifiés.
//
// Réutilisation de la logique métier existante, SANS LA MODIFIER :
//   - genererDatesSeances (utils/horaires) : même fonction que celle appelée
//     par creerDatesRecurrentes dans PlanningGrilleView.tsx — mais cette
//     dernière n'est pas exportée (fonction locale à un fichier qu'on ne
//     touche pas), donc on rappelle directement genererDatesSeances ici,
//     avec la vraie date déposée comme point de départ (au lieu de "today"
//     dans la version grille, qui n'a jamais de date réelle à disposition).
//   - datesManquantes : anti-doublon, appelée à l'identique.
//   - trouveChevauchement(s) : détection de conflit, appelée à l'identique.
//   - bulkCreerSeances (useAgenda) : appelée à l'identique — la traduction
//     d'erreurs (messageErreurSeance) y est déjà branchée, donc aucune
//     erreur Postgres brute ne peut fuiter ici non plus.
// Aucune de ces fonctions n'a été modifiée pour cette étape.
//
// ModalConfirmDrop (PlanningGrilleView.tsx) n'est pas exporté non plus : la
// modale ci-dessous est une nouvelle implémentation (même rôle, mêmes
// données), pas un import direct — comme pour le mapping couleur en étape 1.
//
// Glisser-déposer : withDragAndDropCalendar + onDropFromOutside (API HTML5
// native). Fonctionne à la souris. Le geste tactile équivalent (glisser
// depuis une liste externe) est CONNU pour ne pas fonctionner nativement sur
// mobile (cf. étape 0) — non traité ici, prévu séparément plus tard.
//
// Toujours lecture seule pour les séances déjà existantes : cliquer dessus
// ouvre encore la popup d'info de l'étape 1, rien n'est éditable/déplaçable
// ici (étape 3).
// ============================================================================

// L'import profond 'react-big-calendar/lib/addons/dragAndDrop' est un module
// CommonJS : selon les bundlers, l'interop ESM place la fonction réelle sur
// .default (dev) ou double-imbriquée sur .default.default (build de prod
// observé sur ce projet, esbuild/Rolldown) — on résout les deux cas plutôt
// que de dépendre d'un seul niveau d'interop.
const withDragAndDrop = (() => {
  const ns = DragAndDropAddon as unknown as { default: unknown };
  const candidate = ns.default as { default?: unknown } | undefined;
  if (typeof candidate === 'function') return candidate as typeof DragAndDropAddon.default;
  if (typeof candidate?.default === 'function') return candidate.default as typeof DragAndDropAddon.default;
  throw new Error("Impossible de résoudre l'export par défaut de react-big-calendar/addons/dragAndDrop");
})();

const DnDCalendar = withDragAndDrop<CalEvent>(Calendar);

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales: { fr },
});

const TODAY = new Date().toISOString().slice(0, 10);

const LABEL_TYPE: Record<TypeSeance, string> = {
  seance: 'Séance',
  bilan: 'Bilan',
  bilan_initial: 'Bilan initial',
};

const LABEL_STATUT: Record<StatutSeance, string> = {
  planifiee: '📅 Planifiée',
  realisee: '✅ Réalisée',
  annulee: '❌ Annulée',
  reportee: '🔄 Reportée',
};

// Reproduit exactement getCouleurEvenement de AgendaPage.tsx.
function getCouleurEvenement(seance: Seance): string {
  if (seance.statut === 'annulee') return '#EF4444';
  if (seance.statut === 'reportee') return '#F59E0B';
  if (seance.statut === 'realisee') return '#3B6D11';
  if (seance.type === 'bilan' || seance.type === 'bilan_initial') return '#8B5CF6';
  return seance.date === TODAY ? '#1A5F9E' : '#5B9BD5';
}

function heureToDate(date: string, heure: string): Date {
  const [h, m] = heure.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

// Jour de semaine JS (Date.getDay(), 0=dim) → clé attendue par
// genererDatesSeances. Équivalent local de CLE_JOUR_PAR_DOW (PlanningGrilleView.tsx,
// non exporté).
const CLE_JOUR_PAR_DOW: Record<number, string> = { 0: 'dim', 1: 'lun', 2: 'mar', 3: 'mer', 4: 'jeu', 5: 'ven', 6: 'sam' };

interface CalEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: Seance;
}

// ── Popup lecture seule (identique étape 1) ──────────────────────────────────

function PopupInfoSeance({ seance, nomBeneficiaire, onClose }: {
  seance: Seance;
  nomBeneficiaire: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-5 py-4 rounded-t-2xl" style={{ backgroundColor: getCouleurEvenement(seance) }}>
          <div className="flex items-start justify-between">
            <div className="text-white">
              <div className="text-xs font-medium opacity-80">{LABEL_TYPE[seance.type]}</div>
              <div className="font-heading font-bold text-lg leading-tight">{nomBeneficiaire}</div>
              <div className="text-sm opacity-80 mt-0.5">
                {new Date(seance.date + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                {' · '}{seance.heureDebut} → {seance.heureFin}
              </div>
            </div>
            <button onClick={onClose} className="text-white/70 hover:text-white transition-colors mt-0.5">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="p-5 space-y-3">
          <div className="bg-gray-50 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500 mb-0.5">Statut</p>
            <p className="text-sm font-semibold text-dark">{LABEL_STATUT[seance.statut]}</p>
          </div>
          {seance.adresse && (
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500 mb-0.5">Adresse</p>
              <p className="text-sm text-dark">{seance.adresse}</p>
            </div>
          )}
          <p className="text-xs text-gray-400 text-center pt-1">
            Lecture seule pour les séances existantes — déplacement/édition prévus à l'étape 3.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Confirmation de création (équivalent de ModalConfirmDrop, non exporté
//    depuis PlanningGrilleView.tsx — nouvelle implémentation, même logique
//    d'appel : genererDatesSeances, datesManquantes, trouveChevauchements) ──

interface DropPendant {
  participant: Participant;
  contrat: Contrat;
  date: Date; // vraie date déposée
}

function ModalConfirmerCreation({ info, seances, participantMap, onConfirm, onCancel }: {
  info: DropPendant;
  seances: Seance[];
  participantMap: Map<string, Participant>;
  onConfirm: (heureDebut: string, duree: number) => Promise<void>;
  onCancel: () => void;
}) {
  const { participant, contrat, date } = info;
  const [heureDebut, setHeureDebut] = useState(format(date, 'HH:mm'));
  const [duree, setDuree] = useState(contrat.dureeMinutes);
  const [loading, setLoading] = useState(false);

  const heureFin = addMinutes(heureDebut, duree);
  const jourKey = CLE_JOUR_PAR_DOW[date.getDay()];
  const dateDebutStr = format(date, 'yyyy-MM-dd');

  // Même génération que creerDatesRecurrentes (PlanningGrilleView.tsx), mais
  // ancrée sur la vraie date déposée plutôt que sur "aujourd'hui" — un
  // agenda daté connaît la date exacte visée, pas seulement "le jeudi".
  const datesGenerees = useMemo(
    () => genererDatesSeances(dateDebutStr, contrat.dateFin, jourKey, contrat.periodicite ?? 'semaine', contrat.dateDebut),
    [dateDebutStr, contrat, jourKey],
  );
  const dates = useMemo(
    () => datesManquantes(seances, participant.id, contrat.id, datesGenerees),
    [seances, participant.id, contrat.id, datesGenerees],
  );

  const conflits = useMemo(
    () => trouveChevauchements(seances, dates.map(d => ({ date: d, heureDebut, heureFin }))),
    [seances, dates, heureDebut, heureFin],
  );

  async function handleConfirmer() {
    if (conflits.length > 0 || dates.length === 0) return;
    setLoading(true);
    try {
      await onConfirm(heureDebut, duree);
    } catch {
      // Déjà signalé par un toast (message humain, voir messageErreurSeance
      // dans useAgenda) — on absorbe juste l'exception pour ne pas la
      // laisser remonter en rejet non géré ; la modale reste ouverte.
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 1010 }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-dark">Planifier la séance</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 p-1"><X size={16} /></button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="bg-gray-50 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500 mb-0.5">Bénéficiaire</p>
            <p className="text-sm font-semibold text-dark">{participant.prenom} {participant.nom}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500 mb-0.5">Jour (chaque semaine)</p>
              <p className="text-sm font-semibold text-dark">
                {date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <label className="block text-xs text-gray-500 mb-0.5">Heure de début</label>
              <input type="time" step={60} value={heureDebut} onChange={e => setHeureDebut(e.target.value)}
                className="w-full bg-transparent text-sm font-semibold text-dark focus:outline-none" />
              <p className="text-xs text-gray-400 mt-0.5">→ fin {heureFin}</p>
            </div>
          </div>

          {contrat.dureesSeances.length > 1 ? (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Durée de la séance</label>
              <select value={duree} onChange={e => setDuree(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary">
                {contrat.dureesSeances.map(d => <option key={d} value={d}>{d} min</option>)}
              </select>
            </div>
          ) : (
            <p className="text-xs text-gray-500">Durée : <span className="font-medium text-dark">{duree} min</span></p>
          )}

          {dates.length > 0 ? (
            <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-600">
                <span className="font-semibold text-primary">{dates.length} séance{dates.length > 1 ? 's' : ''}</span>
                {' '}à créer sur la durée du contrat
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date(dates[0] + 'T12:00').toLocaleDateString('fr-FR')} → {new Date(dates[dates.length - 1] + 'T12:00').toLocaleDateString('fr-FR')}
              </p>
              {datesGenerees.length > dates.length && (
                <p className="text-xs text-gray-400 mt-0.5">
                  ({datesGenerees.length - dates.length} déjà existante{datesGenerees.length - dates.length > 1 ? 's' : ''} pour ce contrat, ignorée{datesGenerees.length - dates.length > 1 ? 's' : ''})
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-orange-700 bg-orange-50 rounded-xl px-4 py-3">
              {datesGenerees.length === 0
                ? 'Aucune date disponible dans ce contrat.'
                : `${participant.prenom} a déjà une séance planifiée à chacune de ces dates pour ce contrat.`}
            </p>
          )}

          {conflits.length > 0 && (() => {
            const premier = conflits[0];
            const nomExistant = participantMap.get(premier.existante.participantId);
            const nomAffiche = nomExistant ? `${nomExistant.prenom} ${nomExistant.nom[0]}.` : 'un autre bénéficiaire';
            return (
              <div className="bg-red-light border border-red/20 rounded-xl px-4 py-3">
                <p className="text-xs font-semibold text-red">
                  Créneau indisponible — chevauche une séance existante avec {nomAffiche} le {new Date(premier.creneau.date + 'T12:00').toLocaleDateString('fr-FR')} ({premier.existante.heureDebut}–{premier.existante.heureFin}).
                </p>
                <p className="text-xs text-red mt-1">Modifiez l'heure ou la durée pour lever le conflit.</p>
              </div>
            );
          })()}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onCancel}
            className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Annuler
          </button>
          <button onClick={handleConfirmer} disabled={loading || dates.length === 0 || conflits.length > 0}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
              dates.length === 0 || conflits.length > 0 ? 'bg-red text-white cursor-not-allowed' : 'bg-primary text-white hover:bg-dark'
            }`}>
            {loading
              ? <><Loader size={14} className="animate-spin" />En cours…</>
              : conflits.length > 0
                ? 'Créneau occupé'
                : dates.length === 0
                  ? 'Rien à créer'
                  : `Confirmer (${dates.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page principale ────────────────────────────────────────────────────────────

export default function AgendaV2Page() {
  const { seances, bulkCreerSeances } = useAgenda();
  const { participants } = useParticipants();
  const { contratActifDeParticipant } = useContrats();

  const [seanceSelectionnee, setSeanceSelectionnee] = useState<Seance | null>(null);
  const [search, setSearch] = useState('');
  const [beneficiaireGlisse, setBeneficiaireGlisse] = useState<Participant | null>(null);
  const [dropPendant, setDropPendant] = useState<DropPendant | null>(null);

  const participantMap = useMemo(
    () => new Map(participants.map(p => [p.id, p])),
    [participants],
  );

  const patientsFiltres = useMemo(() => {
    const q = search.toLowerCase().trim();
    return [...participants]
      .filter(p => !q || `${p.prenom} ${p.nom}`.toLowerCase().includes(q))
      .sort((a, b) => a.nom.localeCompare(b.nom));
  }, [participants, search]);

  const events: CalEvent[] = useMemo(() => seances.map(s => {
    const p = participantMap.get(s.participantId);
    return {
      id: s.id,
      title: p ? `${p.prenom} ${p.nom}` : LABEL_TYPE[s.type],
      start: heureToDate(s.date, s.heureDebut),
      end: heureToDate(s.date, s.heureFin),
      resource: s,
    };
  }), [seances, participantMap]);

  const nomBeneficiaireSelectionne = seanceSelectionnee
    ? (() => { const p = participantMap.get(seanceSelectionnee.participantId); return p ? `${p.prenom} ${p.nom}` : LABEL_TYPE[seanceSelectionnee.type]; })()
    : '';

  // Événement fantôme affiché pendant le survol du calendrier par un
  // bénéficiaire glissé — doit être un vrai objet Seance pour que
  // eventPropGetter/getCouleurEvenement fonctionnent sans cas particulier.
  const dragFromOutsideItem = useCallback((): CalEvent => {
    const contrat = beneficiaireGlisse ? contratActifDeParticipant(beneficiaireGlisse.id) : undefined;
    const duree = contrat?.dureeMinutes ?? 45;
    const debut = new Date();
    const fin = new Date(debut.getTime() + duree * 60000);
    const seanceFantome: Seance = {
      id: 'apercu-externe',
      participantId: beneficiaireGlisse?.id ?? '',
      contratId: contrat?.id,
      date: format(debut, 'yyyy-MM-dd'),
      heureDebut: format(debut, 'HH:mm'),
      heureFin: format(fin, 'HH:mm'),
      dureeMinutes: duree,
      type: 'seance',
      statut: 'planifiee',
      adresse: '',
    };
    return {
      id: 'apercu-externe',
      title: beneficiaireGlisse ? `${beneficiaireGlisse.prenom} ${beneficiaireGlisse.nom}` : '…',
      start: debut,
      end: fin,
      resource: seanceFantome,
    };
  }, [beneficiaireGlisse, contratActifDeParticipant]);

  // Ne crée rien directement : ouvre la modale de confirmation, comme
  // ModalConfirmDrop dans PlanningGrilleView.tsx. L'aimantation au pas de 15
  // minutes est déjà assurée par les props step={15}/timeslots={4} du
  // calendrier (react-big-calendar snappe nativement la position de drop),
  // pas besoin de rappeler arrondirAuPas ici.
  const onDropFromOutside = useCallback(({ start }: DragFromOutsideItemArgs) => {
    if (!beneficiaireGlisse) return;
    const contrat = contratActifDeParticipant(beneficiaireGlisse.id);
    if (!contrat) {
      toast.error("Ce bénéficiaire n'a pas de contrat actif. Créez d'abord un contrat.");
      setBeneficiaireGlisse(null);
      return;
    }
    setDropPendant({ participant: beneficiaireGlisse, contrat, date: new Date(start) });
    setBeneficiaireGlisse(null);
  }, [beneficiaireGlisse, contratActifDeParticipant]);

  async function handleConfirmerCreation(heureDebut: string, duree: number) {
    if (!dropPendant) return;
    const { participant, contrat, date } = dropPendant;
    const jourKey = CLE_JOUR_PAR_DOW[date.getDay()];
    const dateDebutStr = format(date, 'yyyy-MM-dd');
    const datesGenerees = genererDatesSeances(dateDebutStr, contrat.dateFin, jourKey, contrat.periodicite ?? 'semaine', contrat.dateDebut);
    const dates = datesManquantes(seances, participant.id, contrat.id, datesGenerees);
    if (!dates.length) { toast.error('Aucune séance à créer (déjà planifiées ou aucune date disponible).'); setDropPendant(null); return; }

    const heureFin = addMinutes(heureDebut, duree);
    const adresse = [participant.adresseRue, participant.adresseCodePostal, participant.adresseVille].filter(Boolean).join(', ');

    const data: Omit<Seance, 'id'>[] = dates.map(d => ({
      participantId: participant.id,
      contratId: contrat.id,
      date: d,
      heureDebut,
      heureFin,
      dureeMinutes: duree,
      type: 'seance' as const,
      statut: 'planifiee' as const,
      adresse,
      coordonnees: participant.coordonnees ? { lat: participant.coordonnees.lat, lng: participant.coordonnees.lng } : undefined,
    }));

    // Chevauchement déjà vérifié dans la modale (bloque tant qu'un conflit
    // existe) — ignorerChevauchements évite un double contrôle redondant,
    // pas un contournement. bulkCreerSeances traduit déjà toute erreur
    // Postgres brute via messageErreurSeance (useAgenda.ts).
    await bulkCreerSeances(data, { ignorerChevauchements: true });
    toast.success(`${dates.length} séance${dates.length > 1 ? 's' : ''} planifiée${dates.length > 1 ? 's' : ''} pour ${participant.prenom}`);
    setDropPendant(null);
  }

  return (
    <PageWrapper>
      <div className="mb-4">
        <h1 className="font-heading font-bold text-2xl text-dark">Agenda (nouveau — étape 2)</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Création de séances par glisser-déposer. Vraies dates, vraies données. Déplacement/édition : étape 3.
        </p>
      </div>

      <div className="mb-4 bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5 text-xs text-dark">
        🚧 Route <code>/agenda-v2</code>, pas encore dans le menu. Glisser-déposer testé à la souris (bureau) — le geste tactile équivalent (glisser depuis la liste) est en attente, sera traité séparément. Disponibilités/indispos en fond toujours reportées à l'étape 5.
      </div>

      <div className="flex gap-4">
        {/* Colonne bénéficiaires — équivalent de la colonne de PlanningGrilleView.tsx
            (non exportée séparément là-bas, donc réécrite ici avec la même logique :
            recherche, contrat actif, BadgeSeancesRestantes). */}
        <div className="w-60 flex-shrink-0 flex flex-col gap-3">
          <input
            type="text" placeholder="Rechercher un bénéficiaire…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary" />
          <p className="text-[11px] text-gray-400 px-1">
            Glissez un bénéficiaire sur le calendrier pour planifier une séance à cette date.
          </p>
          <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: 600 }}>
            {patientsFiltres.map(p => {
              const contratActifP = contratActifDeParticipant(p.id) ?? null;
              const aContrat = contratActifP !== null;
              const statutSeances = calculerStatutSeancesSemaine(contratActifP, seances);
              return (
                <div key={p.id}
                  draggable={aContrat}
                  onDragStart={() => setBeneficiaireGlisse(p)}
                  onDragEnd={() => setBeneficiaireGlisse(null)}
                  className={`rounded-xl px-3 py-2.5 border transition-colors select-none ${
                    aContrat ? 'cursor-grab active:cursor-grabbing border-gray-200 bg-white hover:border-primary/40 hover:bg-gray-50' : 'cursor-default opacity-60 border-gray-200 bg-white'
                  }`}>
                  <p className="text-sm font-medium text-dark truncate">{p.prenom} {p.nom}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <p className={`text-xs ${aContrat ? 'text-green-600' : 'text-gray-400'}`}>
                      {aContrat ? 'Contrat actif' : 'Sans contrat'}
                    </p>
                    <BadgeSeancesRestantes statut={statutSeances} />
                  </div>
                </div>
              );
            })}
            {patientsFiltres.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">Aucun bénéficiaire trouvé</p>
            )}
          </div>
        </div>

        {/* Calendrier */}
        <div className="flex-1 min-w-0">
          {/* Légende couleurs — identique à AgendaPage.tsx */}
          <div className="flex flex-wrap gap-3 mb-3 text-xs text-gray-500">
            {[
              { couleur: '#1A5F9E', label: "Aujourd'hui" },
              { couleur: '#5B9BD5', label: 'Planifiée' },
              { couleur: '#3B6D11', label: 'Réalisée' },
              { couleur: '#F59E0B', label: 'Reportée' },
              { couleur: '#EF4444', label: 'Annulée' },
              { couleur: '#8B5CF6', label: 'Bilan' },
            ].map(({ couleur, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: couleur }} />
                {label}
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm" style={{ height: 660 }}>
            <DnDCalendar
              localizer={localizer}
              events={events}
              defaultView={Views.WEEK}
              views={[Views.MONTH, Views.WEEK, Views.DAY]}
              culture="fr"
              messages={{
                next: 'Suivant', previous: 'Précédent', today: "Aujourd'hui",
                month: 'Mois', week: 'Semaine', day: 'Jour',
                showMore: (n: number) => `+${n} de plus`,
              }}
              eventPropGetter={(event: CalEvent) => ({
                style: {
                  backgroundColor: getCouleurEvenement(event.resource),
                  opacity: event.resource.statut === 'annulee' ? 0.5 : 1,
                  borderRadius: 6,
                  border: 'none',
                  color: 'white',
                  fontSize: 12,
                },
              })}
              onSelectEvent={(event: CalEvent) => setSeanceSelectionnee(event.resource)}
              onDropFromOutside={onDropFromOutside}
              dragFromOutsideItem={dragFromOutsideItem}
              step={15}
              timeslots={4}
              min={new Date(0, 0, 0, 7, 0)}
              max={new Date(0, 0, 0, 21, 0)}
              formats={{
                dayHeaderFormat: (date: Date) => date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
              }}
              popup
            />
          </div>
        </div>
      </div>

      {seanceSelectionnee && (
        <PopupInfoSeance
          seance={seanceSelectionnee}
          nomBeneficiaire={nomBeneficiaireSelectionne}
          onClose={() => setSeanceSelectionnee(null)}
        />
      )}

      {dropPendant && (
        <ModalConfirmerCreation
          info={dropPendant}
          seances={seances}
          participantMap={participantMap}
          onConfirm={handleConfirmerCreation}
          onCancel={() => setDropPendant(null)}
        />
      )}
    </PageWrapper>
  );
}
