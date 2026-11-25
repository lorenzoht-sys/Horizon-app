import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useDemarrage, type Bravo } from '../../hooks/useDemarrage';
import { destinationEtape, messageBravo, type Etape } from '../../lib/demarrage';
import { chargerSettingsPraticien } from '../../lib/settingsPraticien';
import { CarteDemarrage } from './CarteDemarrage';
import { AnneauProgression } from './AnneauProgression';
import { FenetreInstallation } from './FenetreInstallation';
import { BookOpen } from 'lucide-react';

// Le bouton « Voir le guide » en premiers pas : une lueur qui pulse doucement autour, et un reflet
// qui le traverse toutes les quelques secondes. La ligne elle-même respire à peine. Rien ne bouge
// si l'utilisateur a demandé à réduire les animations.
const STYLE_APPEL = `
  .guide-brille { animation: guide-lueur 2s ease-in-out infinite; }
  .guide-brille::after { content: ''; position: absolute; inset: 0; transform: translateX(-120%);
    background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%);
    animation: guide-reflet 3.6s ease-in-out infinite 0.8s; }
  .guide-appel { animation: guide-ligne 2s ease-in-out infinite; }
  @keyframes guide-lueur {
    0% { box-shadow: 0 4px 16px rgba(43,184,154,0.45), 0 0 0 0 rgba(43,184,154,0.6); }
    70% { box-shadow: 0 6px 26px rgba(43,184,154,0.7), 0 0 0 12px rgba(43,184,154,0); }
    100% { box-shadow: 0 4px 16px rgba(43,184,154,0.45), 0 0 0 0 rgba(43,184,154,0); }
  }
  @keyframes guide-reflet { 0% { transform: translateX(-120%); } 35%, 100% { transform: translateX(120%); } }
  @keyframes guide-ligne {
    0%, 100% { box-shadow: var(--shadow-sm), 0 0 0 0 rgba(43,184,154,0); }
    50% { box-shadow: var(--shadow-sm), 0 0 28px 2px rgba(43,184,154,0.28); }
  }
  @media (prefers-reduced-motion: reduce) {
    .guide-brille, .guide-appel, .guide-brille::after { animation: none; }
  }
`;

// Guide de prise en main, posé en tête du tableau de bord (bureau) et de
// l'écran Aujourd'hui (téléphone). Ne rend rien tant que les comptages ne sont
// pas arrivés : mieux vaut une carte qui apparaît qu'une carte qui ment.

// `replie` (tableau de bord sur ordinateur, refonte du 23/11/2026) : le guide tient en une ligne
// (anneau, étape suivante, « Continuer ») et ne se déplie qu'à la demande. Déplié, il occupait le
// haut de l'écran et repoussait la journée du praticien sous la ligne de flottaison. Le guide
// terminé garde sa carte de félicitations, dépliée.
//
// Premiers pas (25/11/2026, voir enPremiersPas) : la ligne reste, mais « Voir le guide » devient le
// bouton principal et brille, pour que le premier réflexe soit d'ouvrir le guide. Choix de Lorenzo
// après l'essai d'un grand bandeau déplié d'office (« trop terne et trop voyant »). Les écrans qui
// adaptent aussi leur contenu à ce mode (tableau de bord, Aujourd'hui) lisent le guide eux-mêmes
// et le passent à GuideDemarrageVue : un seul chargement des comptages.
export type EtatGuide = ReturnType<typeof useDemarrage>;

const cleOuvertureAuto = (id: string) => `horizon:demarrage:ouvert-auto:${id}`;

export function GuideDemarrage(props: { mobile?: boolean; replie?: boolean }) {
  const guide = useDemarrage();
  return <GuideDemarrageVue guide={guide} {...props} />;
}

export function GuideDemarrageVue({ guide, mobile = false, replie = false }: { guide: EtatGuide; mobile?: boolean; replie?: boolean }) {
  const navigate = useNavigate();
  const [installation, setInstallation] = useState(false);
  const [deplie, setDeplie] = useState(false);
  const bravoMontre = useRef<Bravo | null>(null);

  // Première arrivée sur le tableau de bord (25/11/2026, demande de Lorenzo) : le guide s'ouvre
  // de lui-même, c'est la suite logique de l'écran d'accueil. Une seule fois par appareil ; aux
  // visites suivantes, la ligne et son bouton « Voir le guide » qui brille prennent le relais.
  const { praticienId, premiersPas } = guide;
  useEffect(() => {
    if (!replie || !premiersPas || !praticienId) return;
    const cle = cleOuvertureAuto(praticienId);
    try {
      if (localStorage.getItem(cle)) return;
      localStorage.setItem(cle, '1');
    } catch { /* stockage indisponible (navigation privée) : on ouvre quand même */ }
    setDeplie(true);
  }, [replie, premiersPas, praticienId]);

  // Une étape vient d'être réussie : une seule notification, sobre. L'anneau
  // avance en même temps (faitesAvant), c'est assez pour se sentir progresser.
  const { bravo, progression, visible } = guide;
  useEffect(() => {
    // Guide masqué : le praticien a dit qu'il n'en voulait plus, on ne le relance pas.
    if (!visible || !bravo || bravoMontre.current === bravo || !progression) return;
    bravoMontre.current = bravo;
    const message = messageBravo(bravo.nouvelles, progression.prochaine);
    if (message) toast.success(message.titre, { description: message.description });
  }, [visible, bravo, progression]);

  if (!guide.visible || !guide.etapes || !guide.progression) return null;

  function agir(etape: Etape) {
    const dest = destinationEtape(etape.id, { mobile, dernierBeneficiaireId: guide.dernierBeneficiaireId });
    if (dest.type === 'installation') setInstallation(true);
    // L'étape voyage avec la navigation : l'encart compagnon la reprend sur la page d'arrivée.
    else navigate(dest.url, { state: { demarrage: etape.id } });
  }

  function masquer() {
    void guide.masquer();
    toast('Guide masqué', { description: 'Vous le retrouverez dans Paramètres.' });
  }

  const { prochaine, termine, faites, total } = guide.progression;
  const enLigne = replie && !deplie && !termine && prochaine !== null;

  return (
    <>
      {enLigne ? (
        <section aria-label="Prise en main"
          className={`flex flex-wrap items-center gap-3.5 bg-white rounded-2xl px-4 py-3 ${guide.premiersPas ? 'guide-appel' : ''}`}
          style={{ border: guide.premiersPas ? '1.5px solid rgba(43,184,154,0.45)' : '1px solid #E2EEEE', boxShadow: 'var(--shadow-sm)' }}>
          {guide.premiersPas && <style>{STYLE_APPEL}</style>}
          <AnneauProgression faites={faites} total={total} taille={40} epaisseur={5} />
          <p className="m-0 flex-1 min-w-[240px] text-sm">
            <strong>Prise en main · {faites} étape{faites > 1 ? 's' : ''} sur {total}.</strong>{' '}
            <span style={{ color: 'var(--color-ink-2)' }}>
              {guide.premiersPas
                ? 'Commencez ici : le guide vous montre chaque étape, pas à pas.'
                : <>Étape suivante : {prochaine.titre.charAt(0).toLowerCase() + prochaine.titre.slice(1)}{prochaine.duree ? ` (${prochaine.duree})` : ''}.</>}
            </span>
          </p>
          {guide.premiersPas ? (
            <>
              <button type="button" onClick={() => agir(prochaine)} className="text-sm font-semibold px-3 py-2 rounded-lg hover:bg-gray-50" style={{ color: 'var(--color-ink-2)' }}>
                {prochaine.action}
              </button>
              <button type="button" onClick={() => setDeplie(true)} data-testid="voir-le-guide"
                className="guide-brille relative overflow-hidden inline-flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-[10px] bg-primary text-white hover:bg-dark transition-colors">
                <BookOpen size={16} aria-hidden="true" /> Voir le guide
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setDeplie(true)} className="text-sm font-semibold px-3 py-2 rounded-lg hover:bg-gray-50" style={{ color: 'var(--color-ink-2)' }}>
                Voir le guide
              </button>
              <button type="button" onClick={() => agir(prochaine)} className="text-sm font-bold px-4 py-2 rounded-[10px] bg-primary text-white hover:bg-dark transition-colors">
                {prochaine.action} →
              </button>
            </>
          )}
        </section>
      ) : (
      <CarteDemarrage
        etapes={guide.etapes}
        progression={guide.progression}
        prenom={chargerSettingsPraticien().prenom || null}
        manquesFacturation={guide.manquesFacturation}
        faitesAvant={guide.bravo?.faitesAvant}
        mobile={mobile}
        onAction={agir}
        onMasquer={masquer}
        onReduire={replie ? () => setDeplie(false) : undefined}
      />
      )}
      <FenetreInstallation
        ouverte={installation}
        onFermer={() => setInstallation(false)}
        onInstallee={() => {
          setInstallation(false);
          // Le « bravo » vient du recalcul, comme pour les autres étapes : un seul chemin.
          void guide.declarerApplicationInstallee().then(() => guide.rafraichir());
        }}
      />
    </>
  );
}
