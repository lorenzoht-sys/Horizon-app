import type { OrganisationSeances, JourSemaine } from '../../../types';

interface Props {
  data: OrganisationSeances;
  onUpdate: (patch: Partial<OrganisationSeances>) => void;
}

const JOURS: { value: JourSemaine; label: string }[] = [
  { value: 'lun', label: 'Lun' },
  { value: 'mar', label: 'Mar' },
  { value: 'mer', label: 'Mer' },
  { value: 'jeu', label: 'Jeu' },
  { value: 'ven', label: 'Ven' },
  { value: 'sam', label: 'Sam' },
];

const CRENEAUX: { id: OrganisationSeances['creneau']; label: string; desc: string }[] = [
  { id: 'matin', label: 'Matin', desc: '8h - 12h' },
  { id: 'apres-midi', label: 'Après-midi', desc: '13h30 - 18h' },
  { id: 'flexible', label: 'Flexible', desc: 'Peu importe' },
];

const DUREES = [30, 45, 60, 90];

export default function StepInitial_Organisation({ data, onUpdate }: Props) {
  function toggleJour(jour: JourSemaine) {
    const jours = data.joursDisponibles.includes(jour)
      ? data.joursDisponibles.filter(j => j !== jour)
      : [...data.joursDisponibles, jour];
    onUpdate({ joursDisponibles: jours });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-heading font-semibold text-dark mb-1">Organisation des séances</h2>
        <p className="text-sm text-gray-500">Ces informations serviront à établir le contrat de suivi.</p>
      </div>

      {/* Jours disponibles */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
          Jour(s) disponible(s) *
        </label>
        <div className="flex gap-2 flex-wrap">
          {JOURS.map(j => {
            const selected = data.joursDisponibles.includes(j.value);
            return (
              <button
                key={j.value}
                type="button"
                onClick={() => toggleJour(j.value)}
                className="px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors"
                style={{
                  borderColor: selected ? '#1A5F9E' : '#E2EEF9',
                  background: selected ? '#1A5F9E' : 'white',
                  color: selected ? 'white' : '#4A6080',
                }}
              >
                {j.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Créneau préféré */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
          Créneau préféré *
        </label>
        <div className="grid grid-cols-3 gap-3">
          {CRENEAUX.map(c => {
            const selected = data.creneau === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onUpdate({ creneau: c.id })}
                className="p-3 rounded-xl border-2 text-center transition-colors"
                style={{
                  borderColor: selected ? '#1A5F9E' : '#E2EEF9',
                  background: selected ? '#E6F1FB' : 'white',
                }}
              >
                <div className="font-bold text-sm text-dark">{c.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{c.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Heure souhaitée */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
          Heure souhaitée (optionnel)
        </label>
        <div className="flex items-center gap-3">
          <input
            type="time"
            value={data.heureSouhaitee ?? ''}
            onChange={e => onUpdate({ heureSouhaitee: e.target.value || undefined })}
            min="08:00"
            max="19:00"
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary bg-gray-50"
          />
          <span className="text-xs text-gray-400">Pierre pourra ajuster selon ses disponibilités</span>
        </div>
      </div>

      {/* Durée de séance */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
          Durée habituelle d'une séance
        </label>
        <div className="flex gap-2">
          {DUREES.map(d => {
            const selected = data.dureeSeanceMinutes === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => onUpdate({ dureeSeanceMinutes: d })}
                className="px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors"
                style={{
                  borderColor: selected ? '#1A5F9E' : '#E2EEF9',
                  background: selected ? '#1A5F9E' : 'white',
                  color: selected ? 'white' : '#4A6080',
                }}
              >
                {d} min
              </button>
            );
          })}
        </div>
      </div>

      {/* Contraintes */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
          Contraintes particulières (optionnel)
        </label>
        <textarea
          value={data.contraintes ?? ''}
          onChange={e => onUpdate({ contraintes: e.target.value || undefined })}
          placeholder="Ex : Jamais avant 9h, accompagné par sa femme le lundi…"
          rows={3}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary bg-gray-50 resize-none"
        />
      </div>
    </div>
  );
}
