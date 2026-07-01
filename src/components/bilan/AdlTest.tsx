import type { AdlData, IadlData } from '../../types';

const ADL_ITEMS: { key: keyof AdlData; label: string }[] = [
  { key: 'bain',          label: 'Bain / douche' },
  { key: 'habillage',     label: 'Habillage' },
  { key: 'toilette',      label: 'Hygiène (toilette)' },
  { key: 'transfert',     label: 'Transfert / déplacement' },
  { key: 'continence',    label: 'Continence' },
  { key: 'alimentation',  label: 'Alimentation' },
];

const IADL_ITEMS: { key: keyof IadlData; label: string }[] = [
  { key: 'telephone',     label: 'Utiliser le téléphone' },
  { key: 'courses',       label: 'Faire les courses' },
  { key: 'cuisine',       label: 'Préparer les repas' },
  { key: 'menage',        label: 'Entretien du logement' },
  { key: 'linge',         label: 'Lessive / linge' },
  { key: 'transport',     label: 'Utiliser les transports' },
  { key: 'medicaments',   label: 'Gestion des médicaments' },
  { key: 'argent',        label: 'Gestion des finances' },
];

export const EMPTY_ADL: AdlData = {
  bain: false, habillage: false, toilette: false,
  transfert: false, continence: false, alimentation: false,
};

export const EMPTY_IADL: IadlData = {
  telephone: false, courses: false, cuisine: false, menage: false,
  linge: false, transport: false, medicaments: false, argent: false,
};

interface Props {
  adl: AdlData | null | undefined;
  iadl: IadlData | null | undefined;
  onAdlChange: (v: AdlData) => void;
  onIadlChange: (v: IadlData) => void;
}

function ScoreBadge({ score, max, label }: { score: number; max: number; label: string }) {
  const pct = score / max;
  const color = pct >= 0.85 ? 'text-green-700' : pct >= 0.5 ? 'text-orange-600' : 'text-red-600';
  return (
    <div className={`text-sm font-semibold ${color}`}>
      {label} : {score}/{max}
    </div>
  );
}

export default function AdlTest({ adl, iadl, onAdlChange, onIadlChange }: Props) {
  const adlData = adl ?? EMPTY_ADL;
  const iadlData = iadl ?? EMPTY_IADL;
  const adlScore = Object.values(adlData).filter(Boolean).length;
  const iadlScore = Object.values(iadlData).filter(Boolean).length;

  function toggleAdl(key: keyof AdlData) {
    onAdlChange({ ...adlData, [key]: !adlData[key] });
  }

  function toggleIadl(key: keyof IadlData) {
    onIadlChange({ ...iadlData, [key]: !iadlData[key] });
  }

  return (
    <div className="space-y-5">
      {/* ADL */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">ADL — Activités de base</p>
          <ScoreBadge score={adlScore} max={6} label="ADL" />
        </div>
        <div className="space-y-1.5">
          {ADL_ITEMS.map(item => {
            const checked = adlData[item.key];
            return (
              <label
                key={item.key}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                  checked ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  checked ? 'bg-green-600 border-green-600' : 'border-gray-300'
                }`}>
                  {checked && <span className="text-white text-xs font-bold">✓</span>}
                </div>
                <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleAdl(item.key)} />
                <span className={`text-sm font-medium ${checked ? 'text-green-800' : 'text-gray-700'}`}>{item.label}</span>
                <span className={`ml-auto text-xs font-semibold ${checked ? 'text-green-600' : 'text-gray-400'}`}>
                  {checked ? 'Autonome' : 'Aidé'}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* IADL */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">IADL — Activités instrumentales</p>
          <ScoreBadge score={iadlScore} max={8} label="IADL" />
        </div>
        <div className="space-y-1.5">
          {IADL_ITEMS.map(item => {
            const checked = iadlData[item.key];
            return (
              <label
                key={item.key}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                  checked ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  checked ? 'bg-green-600 border-green-600' : 'border-gray-300'
                }`}>
                  {checked && <span className="text-white text-xs font-bold">✓</span>}
                </div>
                <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleIadl(item.key)} />
                <span className={`text-sm font-medium ${checked ? 'text-green-800' : 'text-gray-700'}`}>{item.label}</span>
                <span className={`ml-auto text-xs font-semibold ${checked ? 'text-green-600' : 'text-gray-400'}`}>
                  {checked ? 'Autonome' : 'Dépendant'}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Score combiné */}
      <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
        <span className="text-xs text-gray-500 font-medium">Score total ADL + IADL</span>
        <div>
          <span className="text-2xl font-bold text-dark">{adlScore + iadlScore}</span>
          <span className="text-sm text-gray-400"> / 14</span>
        </div>
      </div>
    </div>
  );
}
