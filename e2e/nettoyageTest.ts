import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Nettoyage direct en base pour les tests desktop qui créent des données
// sur des bénéficiaires PARTAGÉS (Camille Martin, Julien Bernard — utilisés
// par de nombreux autres tests) : contrairement à un test qui crée son
// propre bénéficiaire dédié, on ne peut pas "tout supprimer" en confiance,
// seulement LA ligne précise créée par ce run.
//
// Réutilise la même clé service_role que tests/security/rls.spec.ts (elle
// contourne RLS, exactement ce qu'il faut pour un nettoyage garanti — pas
// pour une assertion fonctionnelle, qui doit toujours passer par une vraie
// session, RLS incluse).
//
// Renvoie `null` si les variables ne sont pas configurées (poste local sans
// .env.test.local complet, par exemple) : le nettoyage est alors ignoré
// plutôt que de faire échouer des tests qui n'en ont pas besoin pour
// s'exécuter — même philosophie que skipUnlessE2E (helpers.ts).
let client: SupabaseClient | null | undefined;

export function clientAdminTest(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_TEST_URL;
  const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    client = null;
    return client;
  }
  client = createClient(url, serviceKey, {
    auth: { persistSession: false },
    // Ce client ne fait que des appels REST (select/delete) pour le nettoyage,
    // jamais de canal realtime. Sans `transport` explicite, le constructeur
    // appelle getWebSocketConstructor(), qui LÈVE une exception sur Node < 22
    // (pas de WebSocket natif) — c'est le cas du runner CI (Node 20). Un stub
    // jamais instancié suffit puisqu'aucun canal n'est ouvert.
    realtime: { transport: class {} as unknown as typeof WebSocket },
  });
  return client;
}
