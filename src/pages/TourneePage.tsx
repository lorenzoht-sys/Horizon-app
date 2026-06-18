import { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useParticipants } from '../hooks/useParticipants';
import { useAgenda, addMinutes } from '../hooks/useAgenda';
import { useContrats } from '../hooks/useContrats';
import PageWrapper from '../components/layout/PageWrapper';
import { Route, MapPin, Clock, Navigation, CalendarPlus, Home, AlertCircle, Loader, CheckCircle, XCircle, ChevronDown, ChevronUp, NotebookPen } from 'lucide-react';
import NoteSeanceModal from '../components/journal/NoteSeanceModal';
import { toast } from 'sonner';
import type { Participant, Seance, IndisponibilitePierre, JourSemaine, CreneauPreference } from '../types';
import { geocodeAdresse } from '../utils/geocodeAdresse';
import { Link, useNavigate } from 'react-router-dom';
import { useIndispos } from '../hooks/useIndispos';
import { useZones } from '../hooks/useZones';
import { getAuthHeader } from '../lib/supabase';

const ModalPlanificateur = lazy(() => import('../components/planning/ModalPlanificateur'));

// ── Fix icônes Leaflet ─────────────────────────────────────────────────────────

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function makeNumberIcon(n: number) {
  return L.divIcon({
    className: '',
    html: `<div style="background:#1A5F9E;color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${n}</div>`,
    iconSize: [28, 28], iconAnchor: [14, 14],
  });
}

function makeDepartIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="background:#0D2B4B;color:white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:16px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4)">🏠</div>`,
    iconSize: [32, 32], iconAnchor: [16, 16],
  });
}

// Force Leaflet à recalculer les dimensions (fix carte blanche après montage)
function MapResizer() {
  const map = useMap();
  useEffect(() => { map.invalidateSize(); }, [map]);
  return null;
}

// ── Créneaux horaires ──────────────────────────────────────────────────────────

const SLOT_DEBUT: Record<CreneauPreference, string> = {
  'matin':     '08:00',
  'apres-midi': '13:30',
  'soiree':    '18:00',
};
const SLOT_FIN: Record<CreneauPreference, string> = {
  'matin':     '12:00',
  'apres-midi': '18:00',
  'soiree':    '21:00',
};
const SLOT_LABEL: Record<CreneauPreference, string> = {
  'matin':     'Matin (8h-12h)',
  'apres-midi': 'Après-midi (13h30-18h)',
  'soiree':    'Soirée (18h-21h)',
};

// Priorité pour le tri : matin=0, apres-midi=1, soirée=2
function prioriteCreneau(p: Participant): number {
  if (!p.disponibilites?.creneauxPreference.length) return 0;
  const pref = p.disponibilites.creneauxPreference;
  if (pref.includes('matin')) return 0;
  if (pref.includes('apres-midi')) return 1;
  return 2;
}

// Trouver le prochain créneau valide d'un patient à partir d'une heure donnée
// Retourne impossible:true si tous ses créneaux sont passés → patient à exclure
function prochainSlotPatient(heure: string, patient: Participant): {
  heureDebut: string;
  attendu: boolean;
  impossible: boolean;
  raison?: string;
} {
  if (!patient.disponibilites?.creneauxPreference.length) {
    return { heureDebut: heure, attendu: false, impossible: false };
  }

  const creneaux = [...patient.disponibilites.creneauxPreference].sort(
    (a, b) => SLOT_DEBUT[a].localeCompare(SLOT_DEBUT[b])
  );

  for (const creneau of creneaux) {
    const debut = SLOT_DEBUT[creneau];
    const fin   = SLOT_FIN[creneau];
    if (heure < debut) {
      // Pierre arrive trop tôt → attendre le début du créneau
      return {
        heureDebut: debut,
        attendu: true,
        impossible: false,
        raison: `${patient.prenom} n'est disponible qu'à partir de ${debut} (${SLOT_LABEL[creneau]})`,
      };
    }
    if (heure < fin) {
      // Dans le créneau → OK
      return { heureDebut: heure, attendu: false, impossible: false };
    }
    // Ce créneau est dépassé → vérifier le suivant
  }

  // Tous les créneaux de la journée sont passés → impossible
  const dernierCreneau = creneaux[creneaux.length - 1];
  return {
    heureDebut: heure,
    attendu: false,
    impossible: true,
    raison: `Plus de créneau disponible (dernier créneau terminé à ${SLOT_FIN[dernierCreneau]})`,
  };
}

// ── Haversine ─────────────────────────────────────────────────────────────────

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// ── Nearest neighbor dans un groupe ───────────────────────────────────────────

type LatLng = { lat: number; lng: number };
type TravelFn = (from: LatLng, to: LatLng) => number;

function nearestNeighbor(start: LatLng, patients: Participant[], getTravelSec: TravelFn): Participant[] {
  const restants = [...patients];
  const visite: Participant[] = [];
  let pos = start;
  while (restants.length > 0) {
    let idx = 0, minSec = Infinity;
    for (let i = 0; i < restants.length; i++) {
      const c = restants[i].coordonnees;
      if (!c) continue;
      const s = getTravelSec(pos, c);
      if (s < minSec) { minSec = s; idx = i; }
    }
    const [next] = restants.splice(idx, 1);
    visite.push(next);
    if (next.coordonnees) pos = next.coordonnees;
  }
  return visite;
}

// Optimisation : grouper par créneau (matin → après-midi → soirée),
// puis nearest-neighbor dans chaque groupe
function optimiserTournee(depart: LatLng, patients: Participant[], getTravelSec: TravelFn): Participant[] {
  const groupes = [0, 1, 2].map(prio => patients.filter(p => prioriteCreneau(p) === prio));
  const result: Participant[] = [];
  let pos = depart;
  for (const groupe of groupes) {
    if (!groupe.length) continue;
    const optimise = nearestNeighbor(pos, groupe, getTravelSec);
    result.push(...optimise);
    const dernier = optimise[optimise.length - 1];
    if (dernier?.coordonnees) pos = dernier.coordonnees;
  }
  return result;
}

// ── Types itinéraire ──────────────────────────────────────────────────────────

interface Interruption {
  kind: 'pause' | 'attente';
  de: string;
  a: string;
  label: string;
  indispo?: IndisponibilitePierre;
}

interface EtapePatient {
  patient: Participant;
  heureArrivee: string;   // début de la séance (après toutes les interruptions)
  heureDepart: string;    // fin de la séance
  dureeTrajetMinutes: number;
  distanceKm: number;
  interruptions: Interruption[]; // pauses + attentes AVANT cette séance
}

// ── Calcul itinéraire respectant créneaux + indispos ──────────────────────────

interface ResultatItineraire {
  etapes: EtapePatient[];
  impossibles: { patient: Participant; raison: string }[];
}

function calculerItineraire(
  depart: LatLng,
  tournee: Participant[],
  heureDepart: string,
  indispos: IndisponibilitePierre[],
  getPatientDuree: (patientId: string) => number,
  getTravelMin: TravelFn,
  getDistKm: TravelFn,
): ResultatItineraire {
  const etapes: EtapePatient[] = [];
  const impossibles: { patient: Participant; raison: string }[] = [];
  let pos = depart;
  let heure = heureDepart;

  for (const patient of tournee) {
    const c = patient.coordonnees!;
    const trajet = Math.max(1, Math.round(getTravelMin(pos, c)));

    let heureDebut = addMinutes(heure, trajet);
    const interruptions: Interruption[] = [];
    const pausesVues = new Set<string>();
    let patientImpossible = false;

    // Boucle de résolution des contraintes (max 10 itérations sécurité)
    let changed = true;
    let guard = 0;
    while (changed && guard < 10) {
      changed = false;
      guard++;

      // 1. Indisponibilités Pierre
      for (const indispo of indispos) {
        if (heureDebut >= indispo.heureDebut && heureDebut < indispo.heureFin) {
          if (!pausesVues.has(indispo.id)) {
            interruptions.push({
              kind: 'pause',
              de: indispo.heureDebut,
              a: indispo.heureFin,
              label: indispo.label || 'Pause',
              indispo,
            });
            pausesVues.add(indispo.id);
          }
          heureDebut = indispo.heureFin;
          changed = true;
          break;
        }
      }
      if (changed) continue;

      // 2. Créneau patient
      const slot = prochainSlotPatient(heureDebut, patient);

      if (slot.impossible) {
        // Plus aucun créneau disponible ce jour → exclure ce patient
        patientImpossible = true;
        impossibles.push({ patient, raison: slot.raison ?? 'Plus de créneau disponible aujourd\'hui' });
        break;
      }

      if (slot.attendu) {
        interruptions.push({
          kind: 'attente',
          de: heureDebut,
          a: slot.heureDebut,
          label: slot.raison ?? `Attente — ${patient.prenom} disponible à ${slot.heureDebut}`,
        });
        heureDebut = slot.heureDebut;
        changed = true;
      }
    }

    if (patientImpossible) {
      // Ne pas avancer heure ni pos — le patient est sauté
      continue;
    }

    const duree = getPatientDuree(patient.id);
    const heureFin = addMinutes(heureDebut, duree);

    etapes.push({
      patient,
      heureArrivee: heureDebut,
      heureDepart: heureFin,
      dureeTrajetMinutes: trajet,
      distanceKm: Math.round(getDistKm(pos, c) * 10) / 10,
      interruptions,
    });

    heure = heureFin;
    pos = c;
  }

  return { etapes, impossibles };
}

// ── Utilitaires divers ────────────────────────────────────────────────────────

const JS_TO_JOUR: Record<number, JourSemaine | 'dim'> = {
  0: 'dim', 1: 'lun', 2: 'mar', 3: 'mer', 4: 'jeu', 5: 'ven', 6: 'sam',
};
const LABELS_JOUR: Record<JourSemaine | 'dim', string> = {
  lun: 'Lundi', mar: 'Mardi', mer: 'Mercredi', jeu: 'Jeudi',
  ven: 'Vendredi', sam: 'Samedi', dim: 'Dimanche',
};

function jourDeLaDate(dateStr: string): JourSemaine | 'dim' {
  const [y, m, d] = dateStr.split('-').map(Number);
  return JS_TO_JOUR[new Date(y, m - 1, d).getDay()];
}

function estDisponible(p: Participant, jour: JourSemaine | 'dim'): boolean {
  if (!p.disponibilites) return true;
  if (jour === 'dim') return false;
  return p.disponibilites.joursDisponibles.includes(jour as JourSemaine);
}


function minutesAttente(de: string, a: string): number {
  const [h1, m1] = de.split(':').map(Number);
  const [h2, m2] = a.split(':').map(Number);
  return (h2 * 60 + m2) - (h1 * 60 + m1);
}

const DEPART_FALLBACK = { lat: 47.2184, lng: -1.5536 };

// ── Composant principal ────────────────────────────────────────────────────────

export default function TourneePage() {
  const { participants } = useParticipants();
  const { seances, seancesDuJour, changerStatut, creerSeance, bulkCreerSeances, modifierSeance } = useAgenda();
  const { contrats } = useContrats();
  const { indispos, indisposDuJour } = useIndispos();
  const { zones } = useZones();
  const navigate = useNavigate();

  const avecCoords = useMemo(
    () => participants.filter(p => p.coordonnees && !p.geocodeFailed),
    [participants]
  );

  const praticienSettings = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('settings_praticien') || '{}'); }
    catch { return {}; }
  }, []);

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [showAdHoc, setShowAdHoc] = useState(false);
  const [noteModal, setNoteModal] = useState<typeof seancesEnrichies[number] | null>(null);
  const [heureDepart, setHeureDepart] = useState('08:00');
  const [selectionIds, setSelectionIds] = useState<Set<string>>(new Set());
  const [, setTournee] = useState<Participant[]>([]);
  const [etapes, setEtapes] = useState<EtapePatient[]>([]);
  const [impossibles, setImpossibles] = useState<{ patient: Participant; raison: string }[]>([]);
  const [orsLoading, setOrsLoading] = useState(false);
  const [orsFallback, setOrsFallback] = useState(false);
  const [showPlanificateur, setShowPlanificateur] = useState(false);

  // Séances du jour depuis les contrats
  const seancesDuJourData = useMemo(() => seancesDuJour(date), [seances, date]);
  const seancesEnrichies = useMemo(() =>
    seancesDuJourData.map(s => ({
      ...s,
      patient: participants.find(p => p.id === s.participantId),
      contrat: contrats.find(c => c.id === s.contratId),
    })).filter(s => s.patient),
    [seancesDuJourData, participants, contrats]
  );

  const totalTrajetEstime = useMemo(() => {
    if (seancesEnrichies.length <= 1) return 0;
    let total = 0;
    for (let i = 1; i < seancesEnrichies.length; i++) {
      const prev = seancesEnrichies[i - 1].patient?.coordonnees;
      const curr = seancesEnrichies[i].patient?.coordonnees;
      if (prev && curr) {
        const R = 6371;
        const dLat = ((curr.lat - prev.lat) * Math.PI) / 180;
        const dLon = ((curr.lng - prev.lng) * Math.PI) / 180;
        const x = Math.sin(dLat/2)**2 + Math.cos(prev.lat*Math.PI/180)*Math.cos(curr.lat*Math.PI/180)*Math.sin(dLon/2)**2;
        const dist = R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
        total += Math.max(2, Math.round(dist * 2));
      }
    }
    return total;
  }, [seancesEnrichies]);

  const [depart, setDepart] = useState<{ lat: number; lng: number }>(DEPART_FALLBACK);
  const [departAdresse, setDepartAdresse] = useState('');
  const [departLoading, setDepartLoading] = useState(false);
  const [departErreur, setDepartErreur] = useState(false);

  useEffect(() => {
    const { adresseRue, adresseCodePostal, adresseVille } = praticienSettings;
    if (!adresseRue && !adresseVille) { setDepartErreur(true); return; }
    setDepartLoading(true);
    setDepartErreur(false);
    geocodeAdresse(adresseRue ?? '', adresseCodePostal ?? '', adresseVille ?? '')
      .then(r => { if (r) { setDepart({ lat: r.lat, lng: r.lng }); setDepartAdresse(r.adresseNormalisee); } else setDepartErreur(true); })
      .finally(() => setDepartLoading(false));
  }, [praticienSettings.adresseRue, praticienSettings.adresseVille]);

  const jourChoisi = useMemo(() => jourDeLaDate(date), [date]);
  const indisposJour = useMemo(() => indisposDuJour(jourChoisi), [indisposDuJour, jourChoisi]);

  const { disponibles, nonDisponibles } = useMemo(() => {
    const d: Participant[] = [], nd: Participant[] = [];
    for (const p of avecCoords) (estDisponible(p, jourChoisi) ? d : nd).push(p);
    return { disponibles: d, nonDisponibles: nd };
  }, [avecCoords, jourChoisi]);

  // Patients déjà dans les séances du jour → exclus de la section ad hoc
  const participantIdsAujourdhui = useMemo(
    () => new Set(seancesEnrichies.map(s => s.participantId)),
    [seancesEnrichies]
  );
  const disponiblesHorsJour = useMemo(
    () => disponibles.filter(p => !participantIdsAujourdhui.has(p.id)),
    [disponibles, participantIdsAujourdhui]
  );

  // IDs des patients dont la zone couvre le jour sélectionné
  const patientsZoneDuJourIds = useMemo(() => {
    if (jourChoisi === 'dim') return new Set<string>();
    const ids = new Set<string>();
    zones
      .filter(z => z.joursAssignes.includes(jourChoisi as JourSemaine))
      .forEach(z => z.participantIds.forEach(id => ids.add(id)));
    return ids;
  }, [zones, jourChoisi]);

  // Patients zone du jour en tête, puis les autres
  const disponiblesHorsJourTries = useMemo(() => [
    ...disponiblesHorsJour.filter(p => patientsZoneDuJourIds.has(p.id)),
    ...disponiblesHorsJour.filter(p => !patientsZoneDuJourIds.has(p.id)),
  ], [disponiblesHorsJour, patientsZoneDuJourIds]);

  // Carte : contrats (par défaut) OU résultats de l'optimiseur
  const mapPatients = useMemo(() =>
    etapes.length > 0
      ? etapes.map(e => e.patient)
      : seancesEnrichies.map(s => s.patient!).filter(p => !!p.coordonnees),
    [etapes, seancesEnrichies]
  );

  const mapCenter: [number, number] = mapPatients.length > 0 && mapPatients[0].coordonnees
    ? [mapPatients[0].coordonnees.lat, mapPatients[0].coordonnees.lng]
    : [depart.lat, depart.lng];

  const polylinePoints: [number, number][] = [
    [depart.lat, depart.lng],
    ...mapPatients.filter(p => p.coordonnees).map(p => [p.coordonnees!.lat, p.coordonnees!.lng] as [number, number]),
  ];

  function toggleSelection(id: string) {
    setSelectionIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  async function handleOptimiser() {
    const selectionnes = avecCoords.filter(p => selectionIds.has(p.id));
    if (!selectionnes.length) { toast.error('Sélectionnez au moins un patient'); return; }
    if (departErreur) { toast.error('Renseignez votre adresse dans les Paramètres'); return; }

    const horsDispos = selectionnes.filter(p => !estDisponible(p, jourChoisi));
    if (horsDispos.length) {
      toast(`⚠️ ${horsDispos.map(p => p.prenom).join(', ')} : non disponible${horsDispos.length > 1 ? 's' : ''} ce jour`, { duration: 4000 });
    }

    // ── Matrice de trajets réels (ORS) ────────────────────────────────────────
    const coordKey = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
    const points: LatLng[] = [depart, ...selectionnes.map(p => p.coordonnees!)];

    let getTravelSec: TravelFn = (a, b) => distanceKm(a, b) * 126; // Haversine fallback (≈ km × 2 min)
    let getTravelMin: TravelFn = (a, b) => Math.max(1, distanceKm(a, b) * 2.1);
    let getDistKm: TravelFn    = (a, b) => distanceKm(a, b);
    let usedFallback = false;

    setOrsLoading(true);
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch('/api/tournee/matrice-trajets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ coordonnees: points }),
      });

      if (res.ok) {
        const matrix: { durees: number[][]; distances: number[][]; fallback: boolean } = await res.json();
        usedFallback = matrix.fallback;

        const indexMap = new Map(points.map((p, i) => [coordKey(p), i]));
        const lookup = (mat: number[][], a: LatLng, b: LatLng): number => {
          const ia = indexMap.get(coordKey(a));
          const ib = indexMap.get(coordKey(b));
          return (ia !== undefined && ib !== undefined) ? mat[ia][ib] : 0;
        };

        if (!matrix.fallback) {
          getTravelSec = (a, b) => lookup(matrix.durees, a, b);
          getTravelMin = (a, b) => Math.max(1, Math.round(lookup(matrix.durees, a, b) / 60));
          getDistKm    = (a, b) => Math.round(lookup(matrix.distances, a, b)) / 1000;
        }
      } else {
        usedFallback = true;
      }
    } catch {
      usedFallback = true;
    } finally {
      setOrsLoading(false);
    }

    setOrsFallback(usedFallback);

    // ── Optimisation ──────────────────────────────────────────────────────────
    const optimise = optimiserTournee(depart, selectionnes, getTravelSec);
    const getPatientDuree = (id: string) =>
      contrats.find(c => c.participantId === id && c.statut === 'actif')?.dureeMinutes ?? 45;
    const { etapes: it, impossibles: imp } = calculerItineraire(
      depart, optimise, heureDepart, indisposJour, getPatientDuree, getTravelMin, getDistKm,
    );
    setTournee(optimise);
    setEtapes(it);
    setImpossibles(imp);

    if (usedFallback) {
      toast(`⚠️ Temps de trajet estimés · Vérifiez votre connexion ou configurez ORS_API_KEY`, { duration: 6000 });
    }
    if (imp.length > 0) {
      toast.error(
        `${imp.map(i => i.patient.prenom).join(', ')} : créneau dépassé — retirés de la tournée`,
        { duration: 6000 }
      );
    }
    const nbInterruptions = it.reduce((acc, e) => acc + e.interruptions.length, 0);
    if (it.length > 0) {
      toast.success(`${it.length} patient${it.length > 1 ? 's' : ''} planifié${it.length > 1 ? 's' : ''}${nbInterruptions ? ` · ${nbInterruptions} pause(s) intégrée(s)` : ''}`);
    }
  }

  function handleOuvrirGoogleMaps() {
    if (etapes.length === 0) return;
    const origin = encodeURIComponent(departAdresse || 'Mon domicile');
    const waypoints = etapes.slice(0, -1)
      .map(e => encodeURIComponent([e.patient.adresseRue, e.patient.adresseVille].filter(Boolean).join(', ')))
      .join('|');
    const destination = encodeURIComponent(
      [etapes.at(-1)!.patient.adresseRue, etapes.at(-1)!.patient.adresseVille].filter(Boolean).join(', ')
    );
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints ? `&waypoints=${waypoints}` : ''}&travelmode=driving`;
    window.open(url, '_blank');
  }

  function handleAjouterAgenda() {
    if (!etapes.length) return;
    etapes.forEach(et => {
      const s: Omit<Seance, 'id'> = {
        participantId: et.patient.id, date,
        heureDebut: et.heureArrivee, heureFin: et.heureDepart,
        dureeMinutes: contrats.find(c => c.participantId === et.patient.id && c.statut === 'actif')?.dureeMinutes ?? 45,
        type: 'seance', statut: 'planifiee',
        adresse: [et.patient.adresseRue, et.patient.adresseCodePostal, et.patient.adresseVille].filter(Boolean).join(', '),
        coordonnees: et.patient.coordonnees ? { lat: et.patient.coordonnees.lat, lng: et.patient.coordonnees.lng } : undefined,
      };
      creerSeance(s);
    });
    toast.success(`${etapes.length} séance${etapes.length > 1 ? 's' : ''} ajoutée${etapes.length > 1 ? 's' : ''} à l'agenda`);
  }

  const totalTrajetMin = etapes.length > 0
    ? etapes.reduce((acc, e) => acc + e.dureeTrajetMinutes, 0)
    : totalTrajetEstime;

  function ouvrirMapsContrats() {
    const avecAdresse = seancesEnrichies.filter(s => s.adresse);
    if (!avecAdresse.length) return;
    const origin = encodeURIComponent(departAdresse || 'Mon domicile');
    const dest = encodeURIComponent(avecAdresse.at(-1)!.adresse);
    const wps = avecAdresse.slice(0, -1).map(s => encodeURIComponent(s.adresse)).join('|');
    window.open(`https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${wps ? `&waypoints=${wps}` : ''}&travelmode=driving`, '_blank');
  }

  const heureDebutJour = seancesEnrichies[0]?.heureDebut ?? (etapes[0]?.heureArrivee ?? '--');
  const heureFinJour = seancesEnrichies.at(-1)?.heureFin ?? (etapes.at(-1)?.heureDepart ?? '--');

  return (
    <PageWrapper>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="font-heading font-bold text-2xl text-dark">Tournée du jour</h1>
          <p className="text-sm text-gray-500 mt-0.5">Séances depuis vos contrats · patients à optimiser géographiquement</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="date" value={date}
            onChange={e => { setDate(e.target.value); setTournee([]); setEtapes([]); setImpossibles([]); setShowAdHoc(false); }}
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary" />
          <Link to="/agenda" className="text-xs text-primary hover:underline">Voir l'agenda →</Link>
        </div>
      </div>

      {/* ── Stats ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm mb-5 flex items-center gap-6 flex-wrap">
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide">Patients</div>
          <div className="text-2xl font-heading font-bold text-dark">{seancesEnrichies.length}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide">Trajet estimé</div>
          <div className="text-2xl font-heading font-bold text-dark">{totalTrajetMin} min</div>
        </div>
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide">Journée</div>
          <div className="text-2xl font-heading font-bold text-dark">{heureDebutJour} → {heureFinJour}</div>
        </div>
        <div className="ml-auto flex gap-2">
          {etapes.length > 0 && (
            <button onClick={handleAjouterAgenda}
              className="flex items-center gap-2 border border-success text-success px-4 py-2 rounded-xl text-sm font-medium hover:bg-success/5 transition-colors">
              <CalendarPlus size={15} />
              Ajouter à l'agenda ({etapes.length})
            </button>
          )}
          {(seancesEnrichies.some(s => s.patient?.coordonnees) || etapes.length > 0) && (
            <button
              onClick={etapes.length > 0 ? handleOuvrirGoogleMaps : ouvrirMapsContrats}
              className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-dark transition-colors">
              🗺️ Ouvrir dans Maps
            </button>
          )}
        </div>
      </div>

      {/* ── Grille principale : gauche + droite ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ══ COLONNE GAUCHE : sessions + ad hoc ══════════════════ */}
        <div className="space-y-3">

          {/* Séances planifiées du jour */}
          {seancesEnrichies.length > 0 ? seancesEnrichies.map((s, idx) => {
            const p = s.patient!;
            const seancesAvant = seances.filter(x => x.contratId === s.contratId && x.date < s.date).length;
            const realiseeHistorique = Math.max(0, (s.contrat?.nombreSeancesRealisees ?? 0) - seances.filter(x => x.contratId === s.contratId && x.statut === 'realisee').length);
            const rang = realiseeHistorique + seancesAvant + 1;
            const totalContrat = s.contrat?.nombreSeancesTotal ?? 0;

            return (
              <div key={s.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-dark">{p.prenom} {p.nom}</span>
                      {totalContrat > 0 && rang > 0 && (
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                          Séance {rang}/{totalContrat}
                        </span>
                      )}
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        s.statut === 'realisee' ? 'bg-green-100 text-green-700' :
                        s.statut === 'annulee' ? 'bg-red-100 text-red-600' :
                        s.statut === 'reportee' ? 'bg-orange-100 text-orange-600' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {s.statut === 'planifiee' ? 'Planifiée' : s.statut === 'realisee' ? '✅ Réalisée' : s.statut === 'annulee' ? '❌ Annulée' : '🔄 Reportée'}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 mt-0.5">
                      {s.heureDebut} → {s.heureFin} · {p.adresseVille}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => setNoteModal(s)}
                      className="text-gray-400 hover:text-secondary transition-colors p-1"
                      title="Note de séance"
                    >
                      <NotebookPen size={15} />
                    </button>
                    {s.statut !== 'realisee' && (
                      <button
                        onClick={() => { changerStatut(s.id, 'realisee'); toast.success(`${p.prenom} — séance réalisée ✅`); }}
                        className="flex items-center gap-1 text-xs bg-green-50 border border-green-200 text-green-700 px-2.5 py-1.5 rounded-lg hover:bg-green-100 transition-colors font-medium"
                      >
                        <CheckCircle size={13} />
                        Réalisée
                      </button>
                    )}
                    {s.statut !== 'annulee' && s.statut !== 'realisee' && (
                      <button
                        onClick={() => { changerStatut(s.id, 'annulee'); toast.success('Séance annulée'); }}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1"
                        title="Annuler"
                      >
                        <XCircle size={15} />
                      </button>
                    )}
                    {s.adresse && (
                      <button
                        onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.adresse)}`, '_blank')}
                        className="text-gray-400 hover:text-primary transition-colors p-1"
                        title="Voir sur Maps"
                      >
                        <MapPin size={15} />
                      </button>
                    )}
                    <button onClick={() => navigate(`/participant/${p.id}`)} className="text-gray-400 hover:text-primary transition-colors p-1" title="Fiche patient">
                      <Navigation size={15} />
                    </button>
                  </div>
                </div>
                {totalContrat > 0 && (
                  <div className="mt-2 ml-11">
                    <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-secondary transition-all"
                        style={{ width: `${Math.min(100, Math.round((s.contrat?.nombreSeancesRealisees ?? rang) / totalContrat * 100))}%` }} />
                    </div>
                  </div>
                )}
              </div>
            );
          }) : (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center shadow-sm">
              <div className="text-3xl mb-2">📅</div>
              <p className="text-sm text-gray-500">Aucune séance planifiée pour ce jour</p>
              <p className="text-xs text-gray-400 mt-1">Les séances viennent des contrats actifs</p>
            </div>
          )}

          {/* ── Patients hors contrat (ad hoc) ─────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Planificateur de semaine */}
            <button
              onClick={() => setShowPlanificateur(true)}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors border-b border-gray-100"
            >
              <CalendarPlus size={15} className="text-primary" />
              Planifier la semaine
            </button>

            <button
              onClick={() => setShowAdHoc(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Route size={15} className="text-primary" />
                Optimiser / ajouter des patients
                {disponiblesHorsJour.length > 0 && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{disponiblesHorsJour.length} disponibles</span>
                )}
              </span>
              {showAdHoc ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showAdHoc && (
              <div className="border-t border-gray-100 p-4 space-y-4">
                {/* Point de départ */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    <Home size={11} className="inline mr-1" />Point de départ
                  </label>
                  {departLoading ? (
                    <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-xl px-3 py-2">
                      <Loader size={12} className="animate-spin" />Localisation…
                    </div>
                  ) : departErreur ? (
                    <div className="bg-warning/10 border border-warning/30 rounded-xl px-3 py-2">
                      <p className="text-xs font-semibold text-warning flex items-center gap-1 mb-1">
                        <AlertCircle size={12} />Adresse non configurée
                      </p>
                      <Link to="/settings" className="text-xs text-primary underline">Paramètres →</Link>
                    </div>
                  ) : (
                    <div className="bg-dark/5 rounded-xl px-3 py-2 text-xs text-dark font-medium">
                      📍 {departAdresse || [praticienSettings.adresseRue, praticienSettings.adresseVille].filter(Boolean).join(', ')}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Heure de départ</label>
                  <input type="time" value={heureDepart} onChange={e => setHeureDepart(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary" />
                </div>

                {indisposJour.length > 0 && (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5">
                    <p className="text-xs font-semibold text-orange-700 mb-1">🚫 Vos indisponibilités — {LABELS_JOUR[jourChoisi]}</p>
                    {indisposJour.map(i => (
                      <div key={i.id} className="text-xs text-orange-600">{i.heureDebut} → {i.heureFin}{i.label ? ` · ${i.label}` : ''}</div>
                    ))}
                  </div>
                )}

                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {disponiblesHorsJourTries.length > 0 && (
                    <div className="text-xs font-semibold text-green-700 flex items-center gap-1 mb-1.5">
                      <CheckCircle size={11} />Disponibles ({disponiblesHorsJourTries.length})
                    </div>
                  )}

                  {/* ── Patients de la zone du jour (en tête) ── */}
                  {patientsZoneDuJourIds.size > 0 && disponiblesHorsJourTries.some(p => patientsZoneDuJourIds.has(p.id)) && (
                    <div className="text-xs text-primary/70 font-medium flex items-center gap-1 mb-1">
                      <MapPin size={10} />Zone du jour
                    </div>
                  )}
                  {disponiblesHorsJourTries.filter(p => patientsZoneDuJourIds.has(p.id)).map(p => (
                    <label key={p.id} className="flex items-start gap-2.5 cursor-pointer p-2 rounded-xl hover:bg-gray-50 transition-colors">
                      <input type="checkbox" checked={selectionIds.has(p.id)} onChange={() => toggleSelection(p.id)}
                        className="w-4 h-4 accent-primary mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-dark truncate">{p.prenom} {p.nom}</div>
                        {p.disponibilites && (
                          <div className="text-xs text-green-700">
                            {p.disponibilites.creneauxPreference.map(c =>
                              c === 'matin' ? '☀️ Matin' : c === 'apres-midi' ? '🌤 Après-midi' : '🌙 Soirée'
                            ).join(' · ')} · {p.disponibilites.dureeSeanceMinutes} min
                          </div>
                        )}
                      </div>
                    </label>
                  ))}

                  {/* ── Autres patients disponibles ── */}
                  {patientsZoneDuJourIds.size > 0 && disponiblesHorsJourTries.some(p => !patientsZoneDuJourIds.has(p.id)) && (
                    <div className="text-xs text-gray-400 border-t border-gray-100 pt-1.5 mt-1.5 mb-1">Autres</div>
                  )}
                  {disponiblesHorsJourTries.filter(p => !patientsZoneDuJourIds.has(p.id)).map(p => (
                    <label key={p.id} className="flex items-start gap-2.5 cursor-pointer p-2 rounded-xl hover:bg-gray-50 transition-colors">
                      <input type="checkbox" checked={selectionIds.has(p.id)} onChange={() => toggleSelection(p.id)}
                        className="w-4 h-4 accent-primary mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-dark truncate">{p.prenom} {p.nom}</div>
                        {p.disponibilites && (
                          <div className="text-xs text-green-700">
                            {p.disponibilites.creneauxPreference.map(c =>
                              c === 'matin' ? '☀️ Matin' : c === 'apres-midi' ? '🌤 Après-midi' : '🌙 Soirée'
                            ).join(' · ')} · {p.disponibilites.dureeSeanceMinutes} min
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                  {nonDisponibles.length > 0 && (
                    <>
                      <div className="text-xs font-semibold text-gray-400 flex items-center gap-1 mt-2 mb-1.5">
                        <XCircle size={11} />Non disponibles ({nonDisponibles.length})
                      </div>
                      {nonDisponibles.map(p => (
                        <label key={p.id} className="flex items-start gap-2.5 cursor-pointer p-2 rounded-xl hover:bg-gray-50 opacity-50">
                          <input type="checkbox" checked={selectionIds.has(p.id)} onChange={() => toggleSelection(p.id)}
                            className="w-4 h-4 accent-primary mt-0.5 flex-shrink-0" />
                          <div className="text-sm font-medium text-gray-500 line-through truncate">{p.prenom} {p.nom}</div>
                        </label>
                      ))}
                    </>
                  )}
                </div>

                {disponiblesHorsJourTries.length > 0 && (
                  <div className="flex gap-2">
                    <button onClick={() => setSelectionIds(new Set(disponiblesHorsJourTries.map(p => p.id)))}
                      className="flex-1 text-xs py-1.5 border border-green-200 text-green-700 rounded-lg hover:bg-green-50 font-medium">
                      Tous les disponibles
                    </button>
                    <button onClick={() => setSelectionIds(new Set())}
                      className="text-xs py-1.5 px-3 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50">
                      Aucun
                    </button>
                  </div>
                )}

                <button onClick={handleOptimiser} disabled={selectionIds.size === 0 || orsLoading}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {orsLoading
                    ? <><Loader size={15} className="animate-spin" />Calcul des trajets…</>
                    : <><Route size={15} />Optimiser la tournée</>}
                </button>

                {orsFallback && etapes.length > 0 && (
                  <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-700">
                    <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                    <span>Temps de trajet estimés (vol d'oiseau) — ORS indisponible</span>
                  </div>
                )}

                {impossibles.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-red-700 mb-1.5">
                      <XCircle size={12} />{impossibles.length} patient{impossibles.length > 1 ? 's' : ''} retiré{impossibles.length > 1 ? 's' : ''}
                    </div>
                    {impossibles.map(({ patient, raison }) => (
                      <div key={patient.id} className="text-xs text-red-600">
                        <span className="font-semibold">{patient.prenom}</span> — {raison}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ══ COLONNE DROITE : carte + itinéraire ══════════════════ */}
        <div className="lg:col-span-2 space-y-4">

          {/* Carte */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" style={{ height: 420 }}>
            <MapContainer center={mapCenter} zoom={11} style={{ width: '100%', height: '100%' }}>
              <MapResizer />
              <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {!departErreur && (
                <Marker position={[depart.lat, depart.lng]} icon={makeDepartIcon()}>
                  <Popup><strong>🏠 Départ</strong><br />{departAdresse}</Popup>
                </Marker>
              )}
              {polylinePoints.length > 1 && <Polyline positions={polylinePoints} color="#1A5F9E" weight={3} dashArray="8 4" />}
              {mapPatients.map((p, i) => p.coordonnees && (
                <Marker key={p.id} position={[p.coordonnees.lat, p.coordonnees.lng]} icon={makeNumberIcon(i + 1)}>
                  <Popup>
                    <strong>{p.prenom} {p.nom}</strong><br />
                    {etapes[i] ? `${etapes[i].heureArrivee} → ${etapes[i].heureDepart}` : seancesEnrichies[i] ? `${seancesEnrichies[i].heureDebut} → ${seancesEnrichies[i].heureFin}` : ''}
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          {/* Itinéraire optimiseur (si lancé) */}
          {etapes.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold text-dark text-sm">
                    {LABELS_JOUR[jourChoisi]} {new Date(date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">Patients regroupés par créneau, trajet optimisé</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><Clock size={12} />{totalTrajetMin} min</span>
                  <span className="flex items-center gap-1"><Navigation size={12} />{Math.round((etapes.reduce((a, e) => a + e.distanceKm, 0)) * 10) / 10} km</span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-dark/10 flex items-center justify-center flex-shrink-0">🏠</div>
                  <div>
                    <div className="text-sm font-medium text-dark">Départ — {heureDepart}</div>
                    {departAdresse && <div className="text-xs text-gray-400">{departAdresse}</div>}
                  </div>
                </div>

                {etapes.map((etape, idx) => (
                  <div key={etape.patient.id}>
                    <div className="flex items-center gap-2 text-xs text-gray-400 pl-3.5 py-1">
                      <div className="w-px h-3 bg-gray-200 ml-0.5" />
                      🚗 {etape.dureeTrajetMinutes} min · {etape.distanceKm} km
                    </div>
                    {etape.interruptions.map((inter, iIdx) => (
                      <div key={iIdx}>
                        {inter.kind === 'pause' ? (
                          <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 mb-1">
                            <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 text-sm">☕</div>
                            <div>
                              <div className="text-xs font-semibold text-orange-700">{inter.label}</div>
                              <div className="text-xs text-orange-500">{inter.de} → {inter.a}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 mb-1">
                            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-sm">⏱</div>
                            <div>
                              <div className="text-xs font-semibold text-blue-700">Attente — {minutesAttente(inter.de, inter.a)} min</div>
                              <div className="text-xs text-blue-500">{inter.label}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold flex-shrink-0">{idx + 1}</div>
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-dark">{etape.patient.prenom} {etape.patient.nom}</div>
                        <div className="text-xs text-gray-500">
                          {etape.heureArrivee} → {etape.heureDepart} · {etape.patient.disponibilites?.dureeSeanceMinutes ?? 45} min
                          {etape.patient.adresseVille && ` · ${etape.patient.adresseVille}`}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {etapes.length === 0 && seancesEnrichies.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm text-center">
              <div className="text-4xl mb-3">🗺️</div>
              <p className="text-sm text-gray-500">Aucune séance pour ce jour</p>
              <p className="text-xs text-gray-400 mt-1">Ajoutez des patients via la section ci-contre</p>
            </div>
          )}
        </div>
      </div>
      {noteModal && (() => {
        const p = noteModal.patient!;
        return (
          <NoteSeanceModal
            participantId={p.id}
            participantNom={`${p.prenom} ${p.nom}`}
            seance={{ id: noteModal.id, date: noteModal.date, heureDebut: noteModal.heureDebut }}
            onClose={() => setNoteModal(null)}
            onMarquerRealisee={() => { changerStatut(noteModal.id, 'realisee'); toast.success(`${p.prenom} — séance réalisée ✅`); }}
          />
        );
      })()}

      {showPlanificateur && (
        <Suspense fallback={null}>
          <ModalPlanificateur
            onClose={() => setShowPlanificateur(false)}
            participants={participants}
            contrats={contrats}
            seances={seances}
            indispos={indispos}
            depart={depart}
            departAdresse={departAdresse}
            heureDebutJournee={heureDepart}
            bulkCreerSeances={async (data) => { await bulkCreerSeances(data); }}
            modifierSeance={async (id, updates) => { await modifierSeance(id, updates); }}
          />
        </Suspense>
      )}
    </PageWrapper>
  );
}
