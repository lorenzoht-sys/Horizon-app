import { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useZones } from '../hooks/useZones';
import { useParticipants } from '../hooks/useParticipants';
import PageWrapper from '../components/layout/PageWrapper';
import { MapPin, Save, RefreshCw, Pencil, Check, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { JourSemaine, ZoneGeographique } from '../types';
import { Link } from 'react-router-dom';

// Fix carte blanche sur chunk lazy (ZonesPage est lazy-loadé dans App.tsx)
function MapResizer() {
  const map = useMap();
  useEffect(() => { map.invalidateSize(); }, [map]);
  return null;
}

// Fix Leaflet icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const JOURS: { val: JourSemaine; label: string }[] = [
  { val: 'lun', label: 'L' }, { val: 'mar', label: 'M' },
  { val: 'mer', label: 'Me' }, { val: 'jeu', label: 'J' },
  { val: 'ven', label: 'V' }, { val: 'sam', label: 'S' },
];

function makePatientIcon(couleur: string, initiale: string) {
  return L.divIcon({
    className: '',
    html: `<div style="background:${couleur};color:white;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;border:2px solid white;box-shadow:0 2px 5px rgba(0,0,0,0.3)">${initiale}</div>`,
    iconSize: [26, 26], iconAnchor: [13, 13],
  });
}

function makeCentroideIcon(couleur: string) {
  return L.divIcon({
    className: '',
    html: `<div style="background:${couleur};opacity:0.6;border-radius:50%;width:16px;height:16px;border:3px solid ${couleur};box-shadow:0 0 0 2px white"></div>`,
    iconSize: [16, 16], iconAnchor: [8, 8],
  });
}

// ── Trajet estimé (haversine nearest-neighbor, 40 km/h) ───────────────────────

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function trajetEstimeMin(patients: { coordonnees?: { lat: number; lng: number } }[], centroide: { lat: number; lng: number }): number {
  const coords = patients.map(p => p.coordonnees).filter((c): c is { lat: number; lng: number } => !!c);
  if (coords.length <= 1) return 0;
  const restants = [...coords];
  let pos = centroide;
  let totalKm = 0;
  while (restants.length > 0) {
    let minDist = Infinity, bestIdx = 0;
    for (let i = 0; i < restants.length; i++) {
      const d = haversineKm(pos, restants[i]);
      if (d < minDist) { minDist = d; bestIdx = i; }
    }
    totalKm += minDist;
    pos = restants.splice(bestIdx, 1)[0];
  }
  return Math.round(totalKm * 1.5); // 40 km/h
}

// ── Composant édition nom zone ─────────────────────────────────────────────────

function NomZoneEditable({ zone, onRename }: { zone: ZoneGeographique; onRename: (nom: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(zone.nom);

  function save() {
    if (val.trim()) onRename(val.trim());
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          autoFocus
          className="border border-primary rounded-lg px-2 py-1 text-sm font-semibold text-dark focus:outline-none w-36"
        />
        <button onClick={save} className="text-primary hover:text-dark transition-colors p-0.5">
          <Check size={14} />
        </button>
      </div>
    );
  }

  return (
    <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 group text-left">
      <span className="font-heading font-bold text-dark text-sm">{zone.nom}</span>
      <Pencil size={11} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

// ── Page principale ────────────────────────────────────────────────────────────

export default function ZonesPage() {
  const { participants } = useParticipants();
  const { zones, calculerZones, renommerZone, assignerJours, deplacerPatient } = useZones();
  const [nbZones, setNbZones] = useState(3);
  const [calcul, setCalcul] = useState(false);

  const avecCoords = useMemo(() => participants.filter(p => p.coordonnees && !p.geocodeFailed), [participants]);
  const sansCoords = useMemo(() => participants.filter(p => !p.coordonnees || p.geocodeFailed), [participants]);

  const mapCenter: [number, number] = useMemo(() => {
    if (avecCoords.length === 0) return [47.22, -1.55];
    const lat = avecCoords.reduce((s, p) => s + p.coordonnees!.lat, 0) / avecCoords.length;
    const lng = avecCoords.reduce((s, p) => s + p.coordonnees!.lng, 0) / avecCoords.length;
    return [lat, lng];
  }, [avecCoords]);

  function handleCalculer() {
    if (avecCoords.length < 2) { toast.error('Au moins 2 patients géolocalisés requis'); return; }
    setCalcul(true);
    setTimeout(() => {
      calculerZones(participants, Math.min(nbZones, avecCoords.length));
      setCalcul(false);
      toast.success('Zones calculées');
    }, 300);
  }

  function toggleJour(zoneId: string, jour: JourSemaine) {
    const zone = zones.find(z => z.id === zoneId);
    if (!zone) return;
    const next = zone.joursAssignes.includes(jour)
      ? zone.joursAssignes.filter(j => j !== jour)
      : [...zone.joursAssignes, jour];
    assignerJours(zoneId, next);
  }

  return (
    <PageWrapper>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading font-bold text-2xl text-dark">Mes zones géographiques</h1>
          <p className="text-sm text-gray-500 mt-1">
            Regroupez vos patients par secteur et assignez des jours de visite
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={nbZones}
            onChange={e => setNbZones(Number(e.target.value))}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary"
          >
            {[2, 3, 4, 5, 6].map(n => (
              <option key={n} value={n}>{n} zones</option>
            ))}
          </select>
          <button
            onClick={handleCalculer}
            disabled={calcul}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-dark transition-colors disabled:opacity-60"
          >
            <RefreshCw size={15} className={calcul ? 'animate-spin' : ''} />
            {zones.length === 0 ? 'Suggérer des zones' : 'Recalculer'}
          </button>
        </div>
      </div>

      {sansCoords.length > 0 && (
        <div className="mb-4 bg-warning/10 border border-warning/30 rounded-xl px-4 py-3 text-sm text-warning">
          ⚠️ {sansCoords.length} patient{sansCoords.length > 1 ? 's' : ''} sans adresse géolocalisée —
          non inclus dans les zones.{' '}
          <Link to="/" className="underline font-medium">Compléter les fiches →</Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── Carte ── */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" style={{ height: 520 }}>
          <MapContainer center={mapCenter} zoom={10} style={{ width: '100%', height: '100%' }}>
            <MapResizer />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Cercles de zone avec popup de survol */}
            {zones.map(zone => {
              const patientsZone = avecCoords.filter(p => zone.participantIds.includes(p.id));
              const trajet = trajetEstimeMin(patientsZone, zone.centroide);
              return (
                <Circle
                  key={`circle-${zone.id}`}
                  center={[zone.centroide.lat, zone.centroide.lng]}
                  radius={8000}
                  pathOptions={{ color: zone.couleur, fillColor: zone.couleur, fillOpacity: 0.06, weight: 1.5, dashArray: '4 4' }}
                  eventHandlers={{
                    mouseover: (e) => e.target.openPopup(),
                    mouseout:  (e) => e.target.closePopup(),
                  }}
                >
                  <Popup closeButton={false} autoPan={false}>
                    <div style={{ minWidth: 170 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4, color: zone.couleur }}>{zone.nom}</div>
                      <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>
                        {patientsZone.length} patient{patientsZone.length > 1 ? 's' : ''}
                        {zone.joursAssignes.length > 0 && <> · {zone.joursAssignes.join(', ')}</>}
                        {trajet > 0 && <> · ~{trajet} min</>}
                      </div>
                      {patientsZone.map(p => (
                        <div key={p.id} style={{ fontSize: 11, color: '#374151', marginBottom: 2 }}>
                          {p.prenom} {p.nom}{p.adresseVille ? ` · ${p.adresseVille}` : ''}
                        </div>
                      ))}
                    </div>
                  </Popup>
                </Circle>
              );
            })}

            {/* Centroïdes zones */}
            {zones.map(zone => (
              <Marker key={`centro-${zone.id}`} position={[zone.centroide.lat, zone.centroide.lng]} icon={makeCentroideIcon(zone.couleur)}>
                <Popup>{zone.nom}</Popup>
              </Marker>
            ))}

            {/* Marqueurs patients colorés par zone */}
            {avecCoords.map(p => {
              const zone = zones.find(z => z.participantIds.includes(p.id));
              const couleur = zone?.couleur ?? '#9CA3AF';
              const initiale = p.prenom.charAt(0).toUpperCase();
              return (
                <Marker
                  key={p.id}
                  position={[p.coordonnees!.lat, p.coordonnees!.lng]}
                  icon={makePatientIcon(couleur, initiale)}
                >
                  <Popup>
                    <strong>{p.prenom} {p.nom}</strong><br />
                    {zone ? <span style={{ color: zone.couleur }}>● {zone.nom}</span> : <span style={{ color: '#9CA3AF' }}>Non assigné</span>}<br />
                    {p.adresseVille}
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>

        {/* ── Panneau zones ── */}
        <div className="lg:col-span-2 space-y-3 overflow-y-auto" style={{ maxHeight: 520 }}>
          {zones.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <MapPin size={32} className="text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-600 font-medium mb-1">
                Aucune zone définie
              </p>
              <p className="text-xs text-gray-400">
                Cliquez sur <strong>Suggérer des zones</strong> pour regrouper automatiquement
                vos patients. Vous pourrez ensuite renommer et ajuster chaque zone.
              </p>
            </div>
          ) : zones.map(zone => {
            const patientsZone = avecCoords.filter(p => zone.participantIds.includes(p.id));
            return (
              <div key={zone.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">

                {/* Titre zone */}
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: zone.couleur }} />
                  <NomZoneEditable zone={zone} onRename={nom => renommerZone(zone.id, nom)} />
                  <span className="ml-auto text-xs text-gray-400 flex items-center gap-1">
                    <Users size={11} />{patientsZone.length}
                  </span>
                </div>

                {/* Jours assignés */}
                <div className="mb-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Jours de visite</p>
                  <div className="flex gap-1.5">
                    {JOURS.map(({ val, label }) => {
                      const actif = zone.joursAssignes.includes(val);
                      return (
                        <button
                          key={val}
                          onClick={() => toggleJour(zone.id, val)}
                          className="w-8 h-8 rounded-lg text-xs font-semibold border transition-colors"
                          style={actif ? { backgroundColor: zone.couleur, color: 'white', borderColor: zone.couleur } : undefined}
                          {...(!actif && { className: 'w-8 h-8 rounded-lg text-xs font-semibold border border-gray-200 text-gray-500 hover:border-gray-300 transition-colors' })}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Liste patients */}
                <div className="space-y-1">
                  {patientsZone.map(p => (
                    <div key={p.id} className="flex items-center gap-2 text-xs">
                      <MapPin size={10} className="text-gray-400 flex-shrink-0" />
                      <span className="flex-1 text-gray-700 truncate">{p.prenom} {p.nom}</span>
                      <select
                        value={zone.id}
                        onChange={e => deplacerPatient(p.id, e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-1 py-0.5 focus:outline-none focus:border-primary"
                      >
                        {zones.map(z => (
                          <option key={z.id} value={z.id}>{z.nom}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Patients sans zone */}
          {avecCoords.filter(p => !zones.some(z => z.participantIds.includes(p.id))).length > 0 && (
            <div className="bg-gray-50 rounded-2xl border border-dashed border-gray-300 p-4">
              <p className="text-xs font-semibold text-gray-400 mb-2">Non assignés</p>
              {avecCoords.filter(p => !zones.some(z => z.participantIds.includes(p.id))).map(p => (
                <div key={p.id} className="flex items-center gap-2 text-xs mb-1">
                  <span className="flex-1 text-gray-500">{p.prenom} {p.nom}</span>
                  <select onChange={e => e.target.value && deplacerPatient(p.id, e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-1 py-0.5 focus:outline-none" defaultValue="">
                    <option value="">Assigner →</option>
                    {zones.map(z => <option key={z.id} value={z.id}>{z.nom}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Légende */}
      {zones.length > 0 && (
        <div className="mt-4 flex items-center gap-6 text-xs text-gray-500">
          {zones.map(z => (
            <div key={z.id} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: z.couleur }} />
              <span>{z.nom}</span>
              {z.joursAssignes.length > 0 && (
                <span className="text-gray-400">· {z.joursAssignes.join(', ')}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Bouton sauvegarder */}
      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={() => toast.success('Zones enregistrées')}
          className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-dark transition-colors"
        >
          <Save size={15} />
          Enregistrer les zones
        </button>
        <Link to="/agenda/planifier" className="text-sm text-primary hover:text-dark transition-colors underline">
          Planifier ma semaine avec ces zones →
        </Link>
      </div>
    </PageWrapper>
  );
}
