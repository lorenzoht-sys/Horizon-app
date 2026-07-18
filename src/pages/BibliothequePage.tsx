import { useState } from 'react';
import ExercicesPage from './ExercicesPage';
import ModelesProgrammePage from './ModelesProgrammePage';

type SousOnglet = 'exercices' | 'modeles';

const SOUS_ONGLETS: { id: SousOnglet; label: string }[] = [
  { id: 'exercices', label: 'Exercices' },
  { id: 'modeles', label: 'Modèles de programme' },
];

export default function BibliothequePage() {
  const [onglet, setOnglet] = useState<SousOnglet>('exercices');

  return (
    <div>
      <div className="max-w-7xl mx-auto px-4 pt-6">
        <div className="flex gap-1 border-b border-gray-200">
          {SOUS_ONGLETS.map(o => (
            <button
              key={o.id}
              onClick={() => setOnglet(o.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                onglet === o.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      {onglet === 'exercices' ? <ExercicesPage /> : <ModelesProgrammePage />}
    </div>
  );
}
