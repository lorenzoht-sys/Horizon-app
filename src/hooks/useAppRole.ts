// Rôle applicatif du compte connecté (étape 4 des rôles).
//
// ── Ce hook ne protège RIEN ─────────────────────────────────────────────
// Il sert à ne pas afficher une entrée de menu inutile, et rien d'autre.
// Toute décision d'autorisation est prise côté serveur par `exigerAdmin()`
// (api/_lib/adminAuth.ts), qui relit le rôle en base à chaque appel. Un
// utilisateur qui forcerait `estAdmin` dans son navigateur, ou qui taperait
// /admin/comptes à la main, obtiendrait une page vide et des 403 : il n'y a
// aucune donnée à protéger dans ce hook.
//
// ── Pourquoi la RPC et pas une lecture de table ─────────────────────────
// `app_role_courant()` est SECURITY DEFINER et lit `user_roles` sans
// déclencher ses policies. Une lecture directe de la table fonctionnerait
// aussi (la policy autorise sa propre ligne), mais passer par la fonction
// garde un seul chemin de lecture du rôle dans tout le projet.

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type AppRole = 'admin' | 'praticien' | null;

export function useAppRole(): { role: AppRole; estAdmin: boolean; chargement: boolean } {
  const [role, setRole] = useState<AppRole>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    let annule = false;

    (async () => {
      if (!supabase) {
        if (!annule) setChargement(false);
        return;
      }
      const { data, error } = await supabase.rpc('app_role_courant');
      if (annule) return;
      // En cas d'erreur on retombe sur `null`, jamais sur 'admin' : le mode
      // dégradé doit être le moins capable, pas le plus.
      setRole(error ? null : ((data as AppRole) ?? null));
      setChargement(false);
    })();

    return () => { annule = true; };
  }, []);

  return { role, estAdmin: role === 'admin', chargement };
}
