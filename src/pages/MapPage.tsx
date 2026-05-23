import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useParticipants } from '../hooks/useParticipants';
import MapView from '../components/map/MapView';
import PageWrapper from '../components/layout/PageWrapper';
import { TAG_CONFIG, TAG_ORDER } from '../data/profiles';
import type { TagPatient } from '../types';
import { MapPin, AlertCircle, RefreshCw } from 'lucide-react';

export default function MapPage() {
  const { participants, geocodeParticipant } = useParticipants();
  const [geocoding, setGeocoding] = useState<Set<string>>(new Set());

  async function handleGeocode(id: string) {
    setGeocoding(prev => new Set(prev).add(id));
    geocodeParticipant(id);
    // Retire le spinner après 4 secondes (temps max de l'API)
    setTimeout(() => setGeocoding(prev => { const s = new Set(prev); s.delete(id); return s; }), 4000);
  }

  async function handleGeocodeAll() {
    unlocated.forEach(p => handleGeocode(p.id));
  }
  const [activeFilters, setActiveFilters] = useState<TagPatient[]>([]);

  function toggleFilter(tag: TagPatient) {
    setActiveFilters(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  }

  // Filtrage : un patient correspond si au moins un de ses tags est dans les filtres actifs
  const filtered = activeFilters.length === 0
    ? participants
    : participants.filter(p => (p.tags ?? []).some(t => activeFilters.includes(t)));

  const located = filtered.filter(p => p.coordonnees);
  const hidden = participants.filter(p => p.coordonnees).length - located.length;
  const unlocated = participants.filter(p => !p.coordonnees && p.adresseRue?.trim());
  const noAddress = participants.filter(p => !p.coordonnees && !p.adresseRue?.trim());

  return (
    <PageWrapper>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading font-bold text-dark text-2xl">🗺️ Carte des patients</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {located.length} patient{located.length !== 1 ? 's' : ''} localisé{located.length !== 1 ? 's' : ''}
            {hidden > 0 && ` · ${hidden} masqué${hidden !== 1 ? 's' : ''} par les filtres`}
            {noAddress.length > 0 && ` · ${noAddress.length} sans adresse`}
          </p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap mb-4">
        <button
          onClick={() => setActiveFilters([])}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeFilters.length === 0
              ? 'bg-primary text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:border-primary/50'
          }`}
        >
          Tous
        </button>
        {TAG_ORDER.map(tag => {
          const cfg = TAG_CONFIG[tag];
          const active = activeFilters.includes(tag);
          return (
            <button key={tag} onClick={() => toggleFilter(tag)}
              style={active ? { backgroundColor: cfg.color, borderColor: cfg.color } : undefined}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                active ? 'text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-primary/50'
              }`}>
              {cfg.emoji} {cfg.label}
            </button>
          );
        })}
      </div>

      {/* Carte principale */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-4"
        style={{ height: 'calc(100vh - 340px)', minHeight: 400 }}>
        <MapView participants={located} interactive height="100%" />
      </div>

      {/* Patients en attente de géocodage ou sans adresse */}
      {(unlocated.length > 0 || noAddress.length > 0) && (
        <div className="space-y-3">
          {unlocated.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-orange-700 font-medium text-sm">
                  <AlertCircle size={15} />
                  {unlocated.length} patient{unlocated.length > 1 ? 's' : ''} en attente de géolocalisation
                </div>
                {unlocated.length > 1 && (
                  <button
                    onClick={handleGeocodeAll}
                    className="flex items-center gap-1.5 text-xs bg-orange-100 hover:bg-orange-200 text-orange-700 px-3 py-1.5 rounded-lg font-medium transition-colors"
                  >
                    <RefreshCw size={12} />
                    Tout relancer
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {unlocated.map(p => (
                  <div key={p.id} className="flex items-center justify-between text-sm bg-white rounded-lg px-3 py-2">
                    <div>
                      <span className="font-medium text-gray-800">{p.prenom} {p.nom}</span>
                      {p.adresseRue && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          {p.adresseRue}{p.adresseCodePostal ? `, ${p.adresseCodePostal}` : ''}{p.adresseVille ? ` ${p.adresseVille}` : ''}
                        </div>
                      )}
                      {p.geocodeFailed && (
                        <div className="text-xs text-orange-500 mt-0.5">⚠ Adresse non trouvée — vérifier l'adresse</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleGeocode(p.id)}
                        disabled={geocoding.has(p.id)}
                        className="flex items-center gap-1 text-xs bg-primary text-white px-2.5 py-1.5 rounded-lg hover:bg-dark transition-colors disabled:opacity-60"
                      >
                        <RefreshCw size={11} className={geocoding.has(p.id) ? 'animate-spin' : ''} />
                        {geocoding.has(p.id) ? 'En cours…' : 'Localiser'}
                      </button>
                      <Link to={`/participant/${p.id}`}
                        className="text-gray-400 hover:text-primary text-xs transition-colors">
                        Fiche →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {noAddress.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2 text-gray-600 font-medium text-sm">
                <MapPin size={15} />
                {noAddress.length} patient{noAddress.length > 1 ? 's' : ''} sans adresse renseignée
              </div>
              <div className="space-y-1">
                {noAddress.map(p => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{p.prenom} {p.nom}</span>
                    <Link to={`/participant/${p.id}`}
                      className="text-primary text-xs hover:underline">
                      Compléter la fiche →
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </PageWrapper>
  );
}
