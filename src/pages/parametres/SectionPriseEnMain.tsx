import { useNavigate } from 'react-router-dom';
import { ArrowRight, Compass } from 'lucide-react';
import { useDemarrage } from '../../hooks/useDemarrage';
import { SectionTitle } from './communs';

// ── Prise en main : rouvrir le guide masqué depuis le tableau de bord ───────────

export function SectionPriseEnMain() {
  const navigate = useNavigate();
  const guide = useDemarrage();
  if (guide.chargement || !guide.progression) return null;
  const { faites, total, termine } = guide.progression;

  async function rouvrir() {
    await guide.reafficher();
    navigate('/');
  }

  return (
    <section>
      <SectionTitle title="Prise en main" />
      <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3">
        <span className="flex items-center gap-3 text-sm">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-teal-light">
            <Compass size={17} className="text-teal-dark" aria-hidden="true" />
          </span>
          <span>
            <span className="block font-semibold text-dark">Guide de démarrage</span>
            <span className="mt-0.5 block text-xs text-gray-500">
              {termine ? 'Toutes les étapes sont faites.' : `${faites} étape${faites > 1 ? 's' : ''} sur ${total} faite${faites > 1 ? 's' : ''}.`}
            </span>
          </span>
        </span>
        {guide.visible ? (
          <span className="text-xs font-medium text-gray-500">Affiché sur le tableau de bord</span>
        ) : (
          <button
            type="button"
            onClick={rouvrir}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-teal-dark transition-colors hover:bg-teal-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
          >
            Afficher <ArrowRight size={15} aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}
