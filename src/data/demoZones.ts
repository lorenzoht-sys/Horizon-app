import type { ZoneGeographique } from '../types';

// Zones géographiques demo — 3 zones autour de Nantes
// Zone 1 : Nantes & proches (demo-1,2,3,4)
// Zone 2 : Nord Loire (demo-5,6,7)
// Zone 3 : Périphérie (demo-8,9,10)

export const DEMO_ZONES: ZoneGeographique[] = [
  {
    id: 'zone-demo-1',
    nom: 'Nantes & proches',
    couleur: '#1A5F9E',
    participantIds: ['demo-1', 'demo-2', 'demo-3', 'demo-4'],
    centroide: { lat: 47.193, lng: -1.559 },
    joursAssignes: ['lun', 'mer'],
  },
  {
    id: 'zone-demo-2',
    nom: 'Nord Loire',
    couleur: '#2BBFBF',
    participantIds: ['demo-5', 'demo-6', 'demo-7'],
    centroide: { lat: 47.322, lng: -1.402 },
    joursAssignes: ['mar', 'jeu'],
  },
  {
    id: 'zone-demo-3',
    nom: 'Périphérie',
    couleur: '#F59E0B',
    participantIds: ['demo-8', 'demo-9', 'demo-10'],
    centroide: { lat: 47.150, lng: -1.693 },
    joursAssignes: ['ven'],
  },
];
