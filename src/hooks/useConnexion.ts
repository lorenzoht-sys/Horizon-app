import { useState, useEffect } from 'react';

export function useConnexion() {
  const [enLigne, setEnLigne] = useState(navigator.onLine);
  const [dernierEnLigne, setDernierEnLigne] = useState<Date | null>(null);

  useEffect(() => {
    const handleOnline = () => {
      setEnLigne(true);
      setDernierEnLigne(new Date());
    };
    const handleOffline = () => setEnLigne(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { enLigne, dernierEnLigne };
}
