import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { effacerEtatSession, ecrireEtatSession, lireEtatSession } from '../lib/etatSession';

/**
 * `useState` dont la valeur survit au démontage de l'interface (rotation du
 * téléphone, rechargement) — voir src/lib/etatSession.ts.
 *
 * `effacer()` retire la valeur et cesse d'écrire : à appeler quand le travail
 * est terminé (enregistré, abandonné explicitement), sinon il réapparaîtrait
 * à la prochaine ouverture de l'écran.
 */
export function useEtatSession<T>(cle: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>, () => void] {
  const [valeur, setValeur] = useState<T>(() => {
    const restauree = lireEtatSession<T>(cle);
    if (restauree !== null) return restauree;
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });
  const efface = useRef(false);

  useEffect(() => {
    if (!efface.current) ecrireEtatSession(cle, valeur);
  }, [cle, valeur]);

  const effacer = useCallback(() => {
    efface.current = true;
    effacerEtatSession(cle);
  }, [cle]);

  return [valeur, setValeur, effacer];
}
