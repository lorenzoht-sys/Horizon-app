// Initialisation de Leaflet, importée par les seuls écrans qui affichent une
// carte (components/map/MapView.tsx, pages/ZonesPage.tsx).
//
// Jusqu'au 2026-11-17, ce code et la feuille de style de Leaflet étaient
// dans src/main.tsx : la bibliothèque (≈ 150 Ko) entrait dans le paquet
// initial, téléchargé par tous les visiteurs, patients compris, alors que
// seuls la carte des bénéficiaires et l'écran des zones s'en servent
// (nettoyage, lot 1). Ces écrans sont chargés à la demande : Leaflet aussi.

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Icônes de marqueur par défaut avec Vite (bug connu : Leaflet devine leur
// chemin à partir de sa feuille de style, ce qui échoue une fois empaqueté).
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});
