import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, Lightbulb, X } from 'lucide-react';
import { etapeDepuisNavigation, guideEtape, reperesEtape, type IdEtape } from '../../lib/demarrage';
import { ICONE_ETAPE } from './iconeEtape';
import { TexteGeste } from './TexteGeste';

// Encart compagnon : quand le praticien part d'une étape du guide, les gestes à
// faire le suivent sur la page d'arrivée, au lieu de rester sur le tableau de
// bord qu'il vient de quitter. Il disparaît de lui-même à la navigation suivante
// (l'étape voyage dans l'état de navigation, que la page suivante n'a plus).
//
// Ordinateur large seulement (xl, 1280 px et plus) : en dessous, il recouvrirait
// le bouton « Suivant » des fenêtres de création (jusqu'à 640 px de large,
// centrées). Sur téléphone, la carte du guide montre déjà les gestes et les
// formulaires tiennent sur un écran.
//
// Déplié d'emblée seulement à partir de 1600 px : entre 1280 et 1600 px, il
// masquerait la colonne de droite des formulaires (mesuré sur la création de
// fiche, max-w-4xl). Il démarre alors replié sur une ligne, et s'ouvre d'un clic.
const LARGEUR_DEPLIE = '(min-width: 1600px)';

export function CompagnonEtape() {
  const location = useLocation();
  const id = etapeDepuisNavigation(location.state);
  if (!id || id === 'application') return null;
  // Clé = entrée d'historique : un nouveau départ depuis le guide rouvre l'encart.
  return <Encart key={location.key} id={id} />;
}

function Encart({ id }: { id: IdEtape }) {
  const reduit = useReducedMotion();
  const [ouvert, setOuvert] = useState(() => typeof window !== 'undefined' && window.matchMedia(LARGEUR_DEPLIE).matches);
  const [ferme, setFerme] = useState(false);
  const { titre, numero, total } = reperesEtape(id);
  const { gestes } = guideEtape(id, false);
  const Icone = ICONE_ETAPE[id];

  return (
    <AnimatePresence>
      {!ferme && (
        <motion.aside
          aria-label={`Guide de prise en main, étape ${numero} sur ${total}`}
          initial={reduit ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduit ? undefined : { opacity: 0, y: 16 }}
          transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1], delay: reduit ? 0 : 0.4 }}
          className="fixed bottom-5 right-5 hidden bg-white xl:block"
          // Au-dessus des fenêtres de création (z 1010, ModalCreerSeanceManuelle) :
          // c'est précisément là que les gestes servent.
          style={{ zIndex: 1100, width: 288, borderRadius: 16, border: '1px solid rgba(43,184,154,0.28)', boxShadow: 'var(--shadow-lg)' }}
        >
          <div
            className="flex items-center"
            style={{ gap: 10, padding: '11px 10px 11px 14px', cursor: ouvert ? 'default' : 'pointer' }}
            // Replié, toute la ligne déplie : la cible est plus facile à atteindre que le chevron seul.
            onClick={() => { if (!ouvert) setOuvert(true); }}
          >
            <span
              aria-hidden="true"
              className="flex flex-shrink-0 items-center justify-center rounded-lg"
              style={{ width: 30, height: 30, background: 'var(--color-teal-light)' }}
            >
              <Icone size={15} style={{ color: 'var(--color-teal-dark)' }} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-bold uppercase" style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--color-teal-dark)' }}>
                Prise en main · {numero}/{total}
              </div>
              <div className="font-heading font-bold" style={{ fontSize: 13.5, lineHeight: 1.3, color: 'var(--color-ink)' }}>{titre}</div>
            </div>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setOuvert(o => !o); }}
              aria-expanded={ouvert}
              aria-label={ouvert ? 'Replier les gestes' : 'Afficher les gestes'}
              className="rounded-md p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
            >
              <ChevronDown size={16} aria-hidden="true" style={{ transition: 'transform .2s', transform: ouvert ? 'none' : 'rotate(180deg)' }} />
            </button>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setFerme(true); }}
              aria-label="Fermer le guide sur cette page"
              className="rounded-md p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          {ouvert && (
            <div style={{ borderTop: '1px solid #EEF4F4', padding: '10px 14px 14px' }}>
              <div className="inline-flex items-center gap-1.5 text-teal-dark" style={{ fontSize: 11.5, fontWeight: 700 }}>
                <Lightbulb size={12} aria-hidden="true" /> Comment faire
              </div>
              <ol className="m-0 list-none p-0" style={{ marginTop: 7, display: 'grid', gap: 7 }}>
                {gestes.map((g, i) => (
                  <li key={i} className="flex items-start" style={{ gap: 8, fontSize: 12.5, lineHeight: 1.45, color: 'var(--color-ink)' }}>
                    <span
                      aria-hidden="true"
                      className="flex flex-shrink-0 items-center justify-center rounded-full tabular-nums"
                      style={{ width: 18, height: 18, fontSize: 10, fontWeight: 800, color: 'var(--color-teal-dark)', background: 'var(--color-teal-light)', marginTop: 1 }}
                    >
                      {i + 1}
                    </span>
                    <span><TexteGeste texte={g} /></span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
