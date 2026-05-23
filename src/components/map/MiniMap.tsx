import { useNavigate } from 'react-router-dom';
import type { Participant } from '../../types';
import MapView from './MapView';
import { Map } from 'lucide-react';

interface Props {
  participants: Participant[];
}

export default function MiniMap({ participants }: Props) {
  const navigate = useNavigate();
  const located = participants.filter(p => p.coordonnees);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Map size={16} className="text-primary" />
          <span className="text-sm font-semibold text-dark">Mes patients</span>
        </div>
        <span className="text-xs text-gray-400">{located.length} localisé{located.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Carte non interactive */}
      <div
        className="rounded-xl overflow-hidden cursor-pointer relative"
        style={{ height: 180 }}
        onClick={() => navigate('/map')}
        title="Ouvrir la carte complète"
      >
        <MapView participants={participants} interactive={false} height="180px" />
        {/* Overlay transparent pour capturer les clics sans interférer avec Leaflet */}
        <div className="absolute inset-0 z-[1000]" style={{ pointerEvents: 'all', cursor: 'pointer' }} />
      </div>

      <button
        onClick={() => navigate('/map')}
        className="mt-3 w-full text-sm text-primary font-medium hover:underline text-center"
      >
        Ouvrir la carte complète →
      </button>
    </div>
  );
}
