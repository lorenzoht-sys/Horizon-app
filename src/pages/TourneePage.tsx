import { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useParticipants } from '../hooks/useParticipants';
import { useAgenda } from '../hooks/useAgenda';
import { useContrats } from '../hooks/useContrats';
import PageWrapper from '../components/layout/PageWrapper';
import { UserPlus, MapPin, Clock, Navigation, CalendarPlus, AlertCircle, CheckCircle, XCircle, NotebookPen } from 'lucide-react';
import NoteSeanceModal from '../components/journal/NoteSeanceModal';
import { toast } from 'sonner';
import type { Participant, Seance, IndisponibilitePierre, JourSemaine } from '../types';
import { geocodeAdresse } from '../utils/geocodeAdresse';
import { Link, useNavigate } from 'react-router-dom';
import { useIndispos } from '../hooks/useIndispos';
import { useZones } from '../hooks/useZones';
import { supabase } from '../lib/supabase';

const ModalPlanificateur = lazy(() => import('../components/planning/ModalPlanificateur'));
const ModalInsererPatient = lazy(() => import('../components/planning/ModalInsererPatient'));

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

function minutesAttente(de: string, a: string): number {
  const [h1, m1] = de.split(':').map(Number);
  const [h2, m2] = a.split(':').map(Number);
  return (h2 * 60 + m2) - (h1 * 60 + m1);
}

const DEPART_FALLBACK = { lat: 47.2184, lng: -1.5536 };

// ── Composant principal ────────────────────────────────────────────────────────

export default function TourneePage() {
  const { participants } = useParticipants();
  const { seances, seancesDuJour, changerStatut, creerSeance, bulkCreerSeances, retirerPlanifieesLocales } = useAgenda();
  const { contrats } = useContrats();
  const { indispos } = useIndispos();
  const { zones } = useZones();
  const navigate = useNavigate();

  const [praticienSettings, setPraticienSettings] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('settings_praticien') || '{}'); }
    catch { return {}; }
  });

  // App.tsx efface settings_praticien à chaque login → recharger l'adresse depuis Supabase.
  useEffect(() => {
    if (praticienSettings.adresseRue || praticienSettings.adresseVille) return;
    if (!supabase) return;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('praticiens')
        .select('adresse_rue, adresse_code_postal, adresse_ville')
        .eq('id', user.id)
        .single();
      if (!data) return;
      const patch = {
        adresseRue:        String(data.adresse_rue        ?? ''),
        adresseCodePostal: String(data.adresse_code_postal ?? ''),
        adresseVille:      String(data.adresse_ville       ?? ''),
      };
      const merged = { ...praticienSettings, ...patch };
      localStorage.setItem('settings_praticien', JSON.stringify(merged));
      setPraticienSettings(merged);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // une seule fois au montage — uniquement si l'adresse est absente

  // Se synchroniser si l'utilisateur modifie ses paramètres depuis SettingsPage.
  useEffect(() => {
    const handler = () => {
      try {
        const s = JSON.parse(localStorage.getItem('settings_praticien') || '{}');
        setPraticienSettings(s);
      } catch { /* ignore */ }
    };
    window.addEventListener('settings_praticien_updated', handler);
    return () => window.removeEventListener('settings_praticien_updated', handler);
  }, []);

  // Bandeau d'invitation à planifier : contrats actifs sans séances planifiées dans les 4 prochaines semaines
  const { afficherBandeau, nbContratsActifs } = useMemo(() => {
    const aujourd = new Date().toISOString().split('T')[0];
    const dans4Semaines = new Date();
    dans4Semaines.setDate(dans4Semaines.getDate() + 28);
    const dateMax = dans4Semaines.toISOString().split('T')[0];
    const actifs = contrats.filter(c => c.statut === 'actif' && !c.exclureTournee);
    const aDesSeances = seances.some(s =>
      s.statut === 'planifiee' && s.date >= aujourd && s.date <= dateMax &&
      actifs.some(c => c.id === s.contratId)
    );
    return { afficherBandeau: actifs.length > 0 && !aDesSeances, nbContratsActifs: actifs.length };
  }, [contrats, seances]);

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [noteModal, setNoteModal] = useState<typeof seancesEnrichies[number] | null>(null);
  const heureDepart = '08:00';
  const [etapes, setEtapes] = useState<EtapePatient[]>([]);
  const [showPlanificateur, setShowPlanificateur] = useState(false);
  const [showInserer, setShowInserer] = useState(false);

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
  const [departErreur, setDepartErreur] = useState(false);

  useEffect(() => {
    const { adresseRue, adresseCodePostal, adresseVille } = praticienSettings;
    if (!adresseRue && !adresseVille) { setDepartErreur(true); return; }
    setDepartErreur(false);
    geocodeAdresse(adresseRue ?? '', adresseCodePostal ?? '', adresseVille ?? '')
      .then(r => { if (r) { setDepart({ lat: r.lat, lng: r.lng }); setDepartAdresse(r.adresseNormalisee); } else setDepartErreur(true); });
  }, [praticienSettings.adresseRue, praticienSettings.adresseVille]);

  const jourChoisi = useMemo(() => jourDeLaDate(date), [date]);

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

  function handleOuvrirGoogleMaps() {
    if (etapes.length === 0) return;
    // Adresse textuelle en priorité, coordonnées GPS en fallback
    const resolveAddr = (patient: Participant) => {
      const txt = [patient.adresseRue, patient.adresseVille].filter(Boolean).join(', ');
      return txt || (patient.coordonnees ? `${patient.coordonnees.lat},${patient.coordonnees.lng}` : '');
    };
    const origin = encodeURIComponent(departAdresse || 'Mon domicile');
    const waypoints = etapes.slice(0, -1)
      .map(e => resolveAddr(e.patient)).filter(Boolean)
      .map(a => encodeURIComponent(a))
      .join('|');
    const destination = resolveAddr(etapes.at(-1)!.patient);
    if (!destination) return;
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${encodeURIComponent(destination)}${waypoints ? `&waypoints=${waypoints}` : ''}&travelmode=driving`;
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
    // s.adresse est '' quand la séance a été créée sans adresse stockée → fallback patient
    const resolved = seancesEnrichies.map(s => {
      const adresse = s.adresse
        || [s.patient?.adresseRue, s.patient?.adresseVille].filter(Boolean).join(', ')
        || (s.patient?.coordonnees ? `${s.patient.coordonnees.lat},${s.patient.coordonnees.lng}` : '');
      return { ...s, adresse };
    }).filter(s => s.adresse);
    if (!resolved.length) return;
    const origin = encodeURIComponent(departAdresse || 'Mon domicile');
    const dest = encodeURIComponent(resolved.at(-1)!.adresse);
    const wps = resolved.slice(0, -1).map(s => encodeURIComponent(s.adresse)).join('|');
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
            onChange={e => { setDate(e.target.value); setEtapes([]); }}
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary" />
          <Link to="/agenda" className="text-xs text-primary hover:underline">Voir l'agenda →</Link>
        </div>
      </div>

      {/* ── Bandeau invitation à planifier ─────────────────────── */}
      {afficherBandeau && (
        <div className="mb-5 flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-5 py-3">
          <AlertCircle size={16} className="text-blue-500 flex-shrink-0" />
          <span className="text-sm text-blue-800 flex-1">
            Vous avez {nbContratsActifs} contrat{nbContratsActifs > 1 ? 's' : ''} actif{nbContratsActifs > 1 ? 's' : ''} sans séances planifiées dans les 4 prochaines semaines.
          </span>
          <button
            onClick={() => setShowPlanificateur(true)}
            className="text-xs font-semibold text-blue-700 hover:text-blue-900 underline underline-offset-2 flex-shrink-0"
          >
            Planifier →
          </button>
        </div>
      )}

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
                        s.statut === 'annulee' ? 'bg-red-light text-red-600' :
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
              onClick={() => {
                if (departErreur) { toast.error('Configurez votre adresse de départ dans Paramètres'); return; }
                setShowPlanificateur(true);
              }}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors border-b border-gray-100"
            >
              <CalendarPlus size={15} className="text-primary flex-shrink-0" />
              <div className="text-left">
                <div>Générer le planning</div>
                <div className="text-xs text-gray-400 font-normal">Crée ou recrée l'ensemble du planning</div>
              </div>
            </button>

            <button
              onClick={() => setShowInserer(true)}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <UserPlus size={15} className="text-primary flex-shrink-0" />
              <div className="text-left">
                <div>Insérer un patient</div>
                <div className="text-xs text-gray-400 font-normal">Ajoute un nouveau patient dans votre planning existant</div>
              </div>
            </button>
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
            zones={zones}
            depart={depart}
            departAdresse={departAdresse}
            departErreur={departErreur}
            heureDebutJournee={heureDepart}
            bulkCreerSeances={async (data) => {
              // Retire les séances planifiees stale du state local avant d'insérer
              // les nouvelles (la table rase vient d'être faite côté DB par la route
              // /api/seances/supprimer-planifiees, mais le state React ne le sait pas encore).
              const contratIds = [...new Set(data.map(s => s.contratId).filter((id): id is string => id != null))];
              const aujourd = new Date().toISOString().split('T')[0];
              retirerPlanifieesLocales(contratIds, aujourd);
              await bulkCreerSeances(data);
            }}
          />
        </Suspense>
      )}

      {showInserer && (
        <Suspense fallback={null}>
          <ModalInsererPatient
            onClose={() => setShowInserer(false)}
            participants={participants}
            contrats={contrats}
            seances={seances}
            bulkCreerSeances={bulkCreerSeances}
          />
        </Suspense>
      )}
    </PageWrapper>
  );
}
