// api/_lib/cronTaches.ts
//
// Plomberie du point d'entrée cron unique (api/cron/rappels.ts). Les deux
// jobs quotidiens ont été fusionnés derrière un seul endpoint : le plan
// Vercel Hobby plafonne à 12 fonctions serverless, et l'ajout de
// api/cron/renouveler-contrats.ts faisait passer le projet à 13 (build
// staging en échec).
//
// Ce module ne contient AUCUNE logique métier : elle reste dans
// api/_lib/rappels.ts et api/_lib/renouvellementContrats.ts, inchangées.
// Il n'assure que deux choses :
//
//   1. L'isolation des échecs. Les traitements portés par un même endpoint
//      n'ont aucun lien entre eux : un contrat mal formé qui fait lever le
//      renouvellement ne doit jamais empêcher l'envoi des rappels du jour,
//      et inversement. Sans cette isolation, la fusion transformerait deux
//      pannes indépendantes en une seule panne totale — ce serait une
//      régression par rapport aux deux endpoints séparés.
//
//   2. La fenêtre horaire du renouvellement. Le point d'entrée fusionné
//      tourne TOUTES LES HEURES (cadence imposée par les rappels), alors
//      que le renouvellement doit rester QUOTIDIEN. C'est le code, et non
//      plus pg_cron, qui porte cette distinction.

/**
 * Heure UTC à laquelle le renouvellement des contrats s'exécute, une fois
 * par jour.
 *
 * Exprimée en UTC, et non en heure de Paris, pour reproduire exactement le
 * comportement d'avant la fusion : le job pg_cron `15 3 * * *`
 * (supabase/migrations/20260911_cron_renouveler_contrats.sql) était
 * interprété dans le fuseau de la base — UTC sur Supabase. Passer à une
 * heure civile Paris décalerait l'exécution d'une à deux heures selon la
 * saison, ce que la fusion n'est pas censée changer.
 *
 * Combinée au job `15 * * * *`, cette constante fait tomber le
 * renouvellement à 03h15 UTC — la minute exacte de l'ancien job.
 */
export const HEURE_RENOUVELLEMENT_UTC = 3;

/**
 * Vrai si l'exécution courante est celle qui doit porter le renouvellement
 * quotidien. Les 23 autres exécutions de la journée ne font que les
 * rappels.
 */
export function doitRenouvelerMaintenant(maintenant: Date): boolean {
  return maintenant.getUTCHours() === HEURE_RENOUVELLEMENT_UTC;
}

export interface Tache {
  nom: string;
  executer: () => Promise<unknown>;
}

export type ResultatTache =
  | { statut: 'ok'; resultat: unknown }
  | { statut: 'erreur'; erreur: string }
  | { statut: 'ignoree'; raison: string };

export interface BilanExecution {
  /** Noms des tâches réellement exécutées, dans leur ordre d'exécution. */
  ordre: string[];
  resultats: Record<string, ResultatTache>;
}

/**
 * Exécute les tâches l'une APRÈS l'autre (jamais en parallèle : elles
 * tapent la même base, et un ordre déterministe rend les logs Vercel
 * lisibles), chacune isolée des autres.
 *
 * Ne rejette jamais : une tâche qui lève est enregistrée en 'erreur' et
 * l'exécution continue avec la suivante. C'est le cœur du contrat de ce
 * module — voir api/_lib/cronTaches.test.ts.
 */
export async function executerTachesCron(taches: Tache[]): Promise<BilanExecution> {
  const ordre: string[] = [];
  const resultats: Record<string, ResultatTache> = {};

  for (const tache of taches) {
    ordre.push(tache.nom);
    try {
      resultats[tache.nom] = { statut: 'ok', resultat: await tache.executer() };
    } catch (err) {
      // Journalisé ici plutôt que remonté : l'appelant HTTP reçoit le
      // détail dans sa réponse JSON, mais les logs Vercel gardent la pile
      // complète, seule exploitable pour diagnostiquer.
      console.error(`[cron] Tâche "${tache.nom}" en échec :`, err);
      const detail = err instanceof Error ? err.message : String(err);
      resultats[tache.nom] = { statut: 'erreur', erreur: detail.slice(0, 500) };
    }
  }

  return { ordre, resultats };
}
