import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  etatInactivite, lireDerniereActivite, noterActivite, oublierActivite,
  DELAI_INACTIVITE_MS,
} from '../lib/inactivite';

export type EtatConnexion = 'inconnu' | 'connecte' | 'deconnecte';

const ID_TOAST_PREAVIS = 'preavis-inactivite';
// Écrire dans localStorage à chaque mouvement serait inutilement coûteux.
const INTERVALLE_ECRITURE_MS = 15_000;
const INTERVALLE_CONTROLE_MS = 20_000;
const EVENEMENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;

/**
 * Déconnecte le praticien après DELAI_INACTIVITE_MS sans interaction
 * (voir src/lib/inactivite.ts). `etat` vaut « inconnu » tant que la session
 * n'est pas vérifiée : on ne touche alors à rien, pour ne pas effacer la
 * trace d'une session en cours de restauration.
 */
export function useDeconnexionInactivite(etat: EtatConnexion, deconnecter: () => void) {
  const deconnecterRef = useRef(deconnecter);
  deconnecterRef.current = deconnecter;

  useEffect(() => {
    if (etat === 'inconnu') return;
    if (etat === 'deconnecte') {
      // Sans cela, la trace d'une ancienne session fermerait la suivante dès
      // la connexion.
      oublierActivite(localStorage);
      return;
    }

    const expirer = () => {
      oublierActivite(localStorage);
      toast.dismiss(ID_TOAST_PREAVIS);
      toast.info(`Vous avez été déconnecté après ${Math.round(DELAI_INACTIVITE_MS / 60_000)} minutes d’inactivité.`, { duration: 15_000 });
      deconnecterRef.current();
    };

    // Session restaurée (onglet rouvert) : la trace de la session précédente fait foi.
    const auDemarrage = Date.now();
    if (etatInactivite(lireDerniereActivite(localStorage, auDemarrage), auDemarrage) === 'expire') {
      expirer();
      return;
    }
    noterActivite(localStorage, lireDerniereActivite(localStorage, auDemarrage));

    let derniereEcriture = 0;
    const surActivite = () => {
      const maintenant = Date.now();
      if (maintenant - derniereEcriture < INTERVALLE_ECRITURE_MS) return;
      derniereEcriture = maintenant;
      noterActivite(localStorage, maintenant);
      toast.dismiss(ID_TOAST_PREAVIS);
    };
    for (const e of EVENEMENTS) window.addEventListener(e, surActivite, { passive: true });

    const controler = () => {
      const maintenant = Date.now();
      const situation = etatInactivite(lireDerniereActivite(localStorage, maintenant), maintenant);
      if (situation === 'expire') expirer();
      else if (situation === 'preavis') {
        toast.warning('Sans activité, vous serez déconnecté dans moins de 2 minutes.', { id: ID_TOAST_PREAVIS, duration: Infinity });
      }
    };
    const minuteur = window.setInterval(controler, INTERVALLE_CONTROLE_MS);
    // Au retour sur l'onglet (ordinateur sorti de veille), ne pas attendre le prochain tic.
    const surVisibilite = () => { if (document.visibilityState === 'visible') controler(); };
    document.addEventListener('visibilitychange', surVisibilite);

    return () => {
      for (const e of EVENEMENTS) window.removeEventListener(e, surActivite);
      window.clearInterval(minuteur);
      document.removeEventListener('visibilitychange', surVisibilite);
      toast.dismiss(ID_TOAST_PREAVIS);
    };
  }, [etat]);
}
