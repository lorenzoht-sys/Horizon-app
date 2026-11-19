import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useDemarrage, type Bravo } from '../../hooks/useDemarrage';
import { destinationEtape, messageBravo, type Etape } from '../../lib/demarrage';
import { chargerSettingsPraticien } from '../../lib/settingsPraticien';
import { CarteDemarrage } from './CarteDemarrage';
import { FenetreInstallation } from './FenetreInstallation';

// Guide de prise en main, posé en tête du tableau de bord (bureau) et de
// l'écran Aujourd'hui (téléphone). Ne rend rien tant que les comptages ne sont
// pas arrivés : mieux vaut une carte qui apparaît qu'une carte qui ment.

export function GuideDemarrage({ mobile = false }: { mobile?: boolean }) {
  const navigate = useNavigate();
  const guide = useDemarrage();
  const [installation, setInstallation] = useState(false);
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

  return (
    <>
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
