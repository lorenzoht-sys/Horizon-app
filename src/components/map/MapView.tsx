import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import type { Participant, TagPatient } from '../../types';
import { TAG_CONFIG, getPriorityTag } from '../../data/profiles';

// ── Génération du marqueur SVG personnalisé ───────────────────

function buildSegments(colors: string[]): string {
  const cx = 18, cy = 18, r = 15;
  const n = Math.min(colors.length, 4);
  if (n === 1) {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${colors[0]}" />`;
  }
  const step = (2 * Math.PI) / n;
  return colors.slice(0, n).map((color, i) => {
    const a1 = i * step - Math.PI / 2;
    const a2 = (i + 1) * step - Math.PI / 2;
    const x1 = (cx + r * Math.cos(a1)).toFixed(2);
    const y1 = (cy + r * Math.sin(a1)).toFixed(2);
    const x2 = (cx + r * Math.cos(a2)).toFixed(2);
    const y2 = (cy + r * Math.sin(a2)).toFixed(2);
    return `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 0,1 ${x2},${y2} Z" fill="${color}" />`;
  }).join('');
}

function createMarkerIcon(participant: Participant): L.DivIcon {
  const tags: TagPatient[] = participant.tags ?? [];
  const colors = tags.length > 0 ? tags.map(t => TAG_CONFIG[t].color) : ['#6B7280'];
  const initials = `${(participant.prenom[0] ?? '').toUpperCase()}${(participant.nom[0] ?? '').toUpperCase()}`;

  const html = `
    <svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg"
         style="overflow:hidden;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.35);border:2.5px solid white;display:block">
      ${buildSegments(colors)}
      <text x="18" y="23" text-anchor="middle" fill="white" font-weight="700" font-size="11"
            font-family="system-ui,-apple-system,sans-serif" style="pointer-events:none">${initials}</text>
    </svg>`;

  return L.divIcon({ className: '', html, iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -22] });
}

// ── Popup contenu ─────────────────────────────────────────────

function calcAge(dob: string): number {
  const today = new Date(), birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return age;
}

function daysSince(date: string): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

function PatientPopup({ p }: { p: Participant }) {
  const tags: TagPatient[] = p.tags ?? [];
  const priorityTag = getPriorityTag(tags);
  const color = priorityTag ? TAG_CONFIG[priorityTag].color : '#6B7280';
  const initials = `${(p.prenom[0] ?? '').toUpperCase()}${(p.nom[0] ?? '').toUpperCase()}`;
  const lastBilan = p.bilans.at(-1);
  const needsBilan = lastBilan ? daysSince(lastBilan.date) > 85 : true;

  return (
    <div className="min-w-[200px] font-sans">
      <div className="flex items-center gap-2 mb-2">
        <div style={{ backgroundColor: color }}
          className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          {initials}
        </div>
        <div>
          <div className="font-semibold text-gray-900 text-sm">{p.prenom} {p.nom}</div>
          <div className="text-xs text-gray-500">{calcAge(p.dateNaissance)} ans</div>
        </div>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.map(tag => (
            <span key={tag}
              className="inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full text-white"
              style={{ backgroundColor: TAG_CONFIG[tag].color }}>
              {TAG_CONFIG[tag].emoji} {TAG_CONFIG[tag].label}
            </span>
          ))}
        </div>
      )}

      <div className="text-xs text-gray-500 mb-1">
        📅 {lastBilan
          ? `Dernier bilan : ${new Date(lastBilan.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
          : 'Aucun bilan'}
      </div>

      {needsBilan && (
        <div className="text-xs font-medium text-orange-600 mb-2">⏰ Bilan à faire</div>
      )}

      <Link to={`/participant/${p.id}`}
        className="block text-center text-xs font-semibold bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">
        Voir la fiche →
      </Link>
    </div>
  );
}

// ── Zoom automatique sur les marqueurs ────────────────────────

function FitBounds({ participants }: { participants: Participant[] }) {
  const map = useMap();
  useEffect(() => {
    const located = participants.filter(p => p.coordonnees);
    if (located.length === 0) return;
    const bounds = L.latLngBounds(located.map(p => [p.coordonnees!.lat, p.coordonnees!.lng] as [number, number]));
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }
  }, [map, participants]);
  return null;
}

// ── Composant principal ───────────────────────────────────────

interface Props {
  participants: Participant[];
  interactive?: boolean;   // false = mini carte non interactive
  height?: string;
}

const FRANCE_CENTER: [number, number] = [46.603354, 1.888334];
const TILE_URL = 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export default function MapView({ participants, interactive = true, height = '100%' }: Props) {
  const located = participants.filter(p => p.coordonnees);

  return (
    <MapContainer
      center={FRANCE_CENTER}
      zoom={6}
      style={{ height, width: '100%' }}
      scrollWheelZoom={interactive}
      zoomControl={interactive}
      dragging={interactive}
      doubleClickZoom={interactive}
      attributionControl={interactive}
    >
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
      {located.length > 0 && <FitBounds participants={located} />}
      {located.map(p => (
        <Marker
          key={p.id}
          position={[p.coordonnees!.lat, p.coordonnees!.lng]}
          icon={createMarkerIcon(p)}
        >
          {interactive && (
            <Popup>
              <PatientPopup p={p} />
            </Popup>
          )}
        </Marker>
      ))}
    </MapContainer>
  );
}
