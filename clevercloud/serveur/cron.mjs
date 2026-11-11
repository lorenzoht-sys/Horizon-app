// Planificateur interne (2026-11-09, socle Clever Cloud).
//
// Aujourd'hui, le job pg_cron « rappels-patients-horaire » (15 * * * *)
// appelle POST /api/cron/rappels via pg_net. Si l'add-on PostgreSQL de Clever
// Cloud ne propose pas pg_cron/pg_net, ce module prend le relais en appelant
// la MÊME route, avec le même en-tête x-cron-secret : aucune logique dupliquée.
//
// Désactivé par défaut (CRON_INTERNE=1 pour l'activer). En multi-instances,
// Clever Cloud lance le même code sur chaque instance : seule l'instance 0
// (INSTANCE_NUMBER) déclenche, sinon les rappels partiraient en double.
// Ne JAMAIS activer CRON_INTERNE tant que le job pg_cron tourne encore sur
// la même base : les deux déclencheurs s'additionneraient.

export const MINUTE_DECLENCHEMENT = 15;

/** Délai (ms) jusqu'au prochain passage à HH:15:00. */
export function delaiAvantProchainPassage(maintenant = new Date()) {
  const cible = new Date(maintenant);
  cible.setUTCSeconds(0, 0);
  cible.setUTCMinutes(MINUTE_DECLENCHEMENT);
  if (cible <= maintenant) cible.setUTCHours(cible.getUTCHours() + 1);
  return cible.getTime() - maintenant.getTime();
}

export function cronInterneActif(env = process.env) {
  return env.CRON_INTERNE === '1' && (env.INSTANCE_NUMBER ?? '0') === '0';
}

export function demarrerCronInterne({ port, env = process.env, appeler = fetch } = {}) {
  if (!cronInterneActif(env)) return null;
  if (!env.CRON_SECRET) {
    console.error('[cron] CRON_INTERNE=1 mais CRON_SECRET absent : planificateur non démarré.');
    return null;
  }
  let minuteur;
  const passer = async () => {
    try {
      const r = await appeler(`http://127.0.0.1:${port}/api/cron/rappels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cron-secret': env.CRON_SECRET },
        body: '{}',
      });
      console.log(`[cron] passage horaire : HTTP ${r.status}`);
    } catch (err) {
      console.error(`[cron] passage horaire en échec : ${err?.name ?? 'Erreur'}`);
    }
    minuteur = setTimeout(passer, delaiAvantProchainPassage());
  };
  minuteur = setTimeout(passer, delaiAvantProchainPassage());
  console.log('[cron] planificateur interne actif (instance 0).');
  return { arreter: () => clearTimeout(minuteur) };
}
