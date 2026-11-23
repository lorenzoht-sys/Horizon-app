import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useDemarrage, type Bravo } from '../../hooks/useDemarrage';
import { destinationEtape, messageBravo, type Etape } from '../../lib/demarrage';
import { chargerSettingsPraticien } from '../../lib/settingsPraticien';
import { CarteDemarrage } from './CarteDemarrage';
import { AnneauProgression } from './AnneauProgression';
import { FenetreInstallation } from './FenetreInstallation';

// Guide de prise en main, posé en tête du tableau de bord (bureau) et de
// l'écran Aujourd'hui (téléphone). Ne rend rien tant que les comptages ne sont
// pas arrivés : mieux vaut une carte qui apparaît qu'une carte qui ment.

// `replie` (tableau de bord sur ordinateur, refonte du 23/11/2026) : le guide tient en une ligne
// (anneau, étape suivante, « Continuer ») et ne se déplie qu'à la demande. Déplié, il occupait le
// haut de l'écran et repoussait la journée du praticien sous la ligne de flottaison. Le guide
// terminé garde sa carte de félicitations, dépliée.
export function GuideDemarrage({ mobile = false, replie = false }: { mobile?: boolean; replie?: boolean }) {
  const navigate = useNavigate();
  const guide = useDemarrage();
  const [installation, setInstallation] = useState(false);
  const [deplie, setDeplie] = useState(false);
  const bravoMontre = useRef<Bravo | null>(null);

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
        <section aria-label="Prise en main" className="flex flex-wrap items-center gap-3.5 bg-white rounded-2xl px-4 py-3" style={{ border: '1px solid #E2EEEE', boxShadow: 'var(--shadow-sm)' }}>
          <AnneauProgression faites={faites} total={total} taille={40} epaisseur={5} />
          <p className="m-0 flex-1 min-w-[240px] text-sm">
            <strong>Prise en main · {faites} étape{faites > 1 ? 's' : ''} sur {total}.</strong>{' '}
            <span style={{ color: 'var(--color-ink-2)' }}>
              Étape suivante : {prochaine.titre.charAt(0).toLowerCase() + prochaine.titre.slice(1)}{prochaine.duree ? ` (${prochaine.duree})` : ''}.
            </span>
          </p>
          <button type="button" onClick={() => setDeplie(true)} className="text-sm font-semibold px-3 py-2 rounded-lg hover:bg-gray-50" style={{ color: 'var(--color-ink-2)' }}>
            Voir le guide
          </button>
          <button type="button" onClick={() => agir(prochaine)} className="text-sm font-bold px-4 py-2 rounded-[10px] bg-primary text-white hover:bg-dark transition-colors">
            {prochaine.action} →
          </button>
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
