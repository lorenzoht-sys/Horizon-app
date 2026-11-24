import { useState } from 'react';
import { toast } from 'sonner';
import type { Seance } from '../types';
import { planConfirmationGroupee, type PlanConfirmation } from '../lib/confirmationGroupee';
import { useTarifsDesContrats } from './useTarifsContrat';

// État du « Tout confirmer », partagé par le tableau de bord et l'accueil mobile. `marquer` est la
// fonction du useAgenda de l'écran (même instance que la liste affichée, pour qu'elle se mette à jour).
// Les tarifs ne sont lus qu'à l'ouverture du dialogue.

export function useToutConfirmer({ seances, factures, marquer }: {
  seances: readonly Seance[];
  factures: readonly { contratId: string; periode: string; type: string; statut: string }[];
  marquer: (ids: readonly string[], onAvancement?: (faites: number) => void) => Promise<{ faites: number; echec: boolean }>;
}): {
  ouvert: boolean;
  plan: PlanConfirmation;
  enCours: boolean;
  avancement: number;
  ouvrir: () => void;
  fermer: () => void;
  confirmer: () => Promise<void>;
} {
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [avancement, setAvancement] = useState(0);
  const tarifs = useTarifsDesContrats(ouvert ? seances.map(s => s.contratId).filter((x): x is string => !!x) : []);
  const plan = planConfirmationGroupee(seances, factures, tarifs);

  async function confirmer() {
    const ids = plan.aConfirmer.map(s => s.id);
    if (ids.length === 0) return;
    setEnCours(true);
    setAvancement(0);
    const { faites, echec } = await marquer(ids, setAvancement);
    setEnCours(false);
    setOuvert(false);
    if (echec) toast.error(`${faites} séance${faites > 1 ? 's' : ''} confirmée${faites > 1 ? 's' : ''} sur ${ids.length} : réessayez pour les autres.`);
    else toast.success(`${faites} séance${faites > 1 ? 's' : ''} confirmée${faites > 1 ? 's' : ''} : vos factures du mois sont à jour.`);
  }

  return { ouvert, plan, enCours, avancement, ouvrir: () => setOuvert(true), fermer: () => setOuvert(false), confirmer };
}
