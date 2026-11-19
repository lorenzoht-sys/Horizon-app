import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useDemarrage } from '../../hooks/useDemarrage';
import { destinationEtape, type Etape } from '../../lib/demarrage';
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

  if (!guide.visible || !guide.etapes || !guide.progression) return null;

  function agir(etape: Etape) {
    const dest = destinationEtape(etape.id, { mobile, dernierBeneficiaireId: guide.dernierBeneficiaireId });
    if (dest.type === 'installation') setInstallation(true);
    else navigate(dest.url);
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
        mobile={mobile}
        onAction={agir}
        onMasquer={masquer}
      />
      <FenetreInstallation
        ouverte={installation}
        onFermer={() => setInstallation(false)}
        onInstallee={() => {
          setInstallation(false);
          void guide.declarerApplicationInstallee();
          toast.success('Application installée : étape validée.');
        }}
      />
    </>
  );
}
