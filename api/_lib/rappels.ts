// api/_lib/rappels.ts
//
// Logique pure (sans accès réseau/DB) du cron de rappels patients. Extraite
// de api/cron/rappels.ts pour être testable unitairement (vitest) sans
// Supabase ni web-push.
//
// Confidentialité : les messages ci-dessous sont volontairement neutres et
// ne contiennent aucune donnée médicale (diagnostic, score, pathologie...).

export interface PrefsRappel {
  rappelSeanceActif: boolean;
  rappelSeanceDelaiHeures: number;
  rappelJourSeanceActif: boolean;
  rappelJourSeanceHeure: string; // "HH:MM:SS" (colonne TIME)
}

export const PREFS_PAR_DEFAUT: PrefsRappel = {
  rappelSeanceActif: true,
  rappelSeanceDelaiHeures: 2,
  rappelJourSeanceActif: true,
  rappelJourSeanceHeure: '08:00:00',
};

export interface RowPrefs {
  rappel_seance_actif?: boolean | null;
  rappel_seance_delai_heures?: number | null;
  rappel_jour_seance_actif?: boolean | null;
  rappel_jour_seance_heure?: string | null;
}

/**
 * Résout les préférences effectives d'un patient : surcharge par patient >
 * réglages globaux du praticien > défauts codés en dur.
 */
export function resoudrePrefs(parPatient: RowPrefs | null | undefined, global: RowPrefs | null | undefined): PrefsRappel {
  return {
    rappelSeanceActif: parPatient?.rappel_seance_actif ?? global?.rappel_seance_actif ?? PREFS_PAR_DEFAUT.rappelSeanceActif,
    rappelSeanceDelaiHeures: parPatient?.rappel_seance_delai_heures ?? global?.rappel_seance_delai_heures ?? PREFS_PAR_DEFAUT.rappelSeanceDelaiHeures,
    rappelJourSeanceActif: parPatient?.rappel_jour_seance_actif ?? global?.rappel_jour_seance_actif ?? PREFS_PAR_DEFAUT.rappelJourSeanceActif,
    rappelJourSeanceHeure: parPatient?.rappel_jour_seance_heure ?? global?.rappel_jour_seance_heure ?? PREFS_PAR_DEFAUT.rappelJourSeanceHeure,
  };
}

/**
 * Calcule le décalage (en minutes) entre l'heure de Paris et UTC pour
 * l'instant donné (gère automatiquement CET/CEST).
 */
function decalageParisMinutes(date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  const heure = parts.hour === '24' ? '00' : parts.hour;
  const asUTC = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(heure), Number(parts.minute), Number(parts.second));
  return Math.round((asUTC - date.getTime()) / 60_000);
}

/**
 * Convertit une date (YYYY-MM-DD) + heure (HH:MM ou HH:MM:SS) civiles
 * Europe/Paris — telles que stockées dans seances.date / seances.heure_debut
 * — en instant UTC.
 */
export function dateHeureParisVersUTC(dateISO: string, heure: string): Date {
  const [annee, mois, jour] = dateISO.split('-').map(Number);
  const [h, m] = heure.split(':').map(Number);
  const approx = new Date(Date.UTC(annee, mois - 1, jour, h, m, 0));
  const decalageMin = decalageParisMinutes(approx);
  return new Date(approx.getTime() - decalageMin * 60_000);
}

/**
 * Une séance doit être rappelée si elle commence dans (0, délai configuré]
 * heures à partir de maintenant.
 */
export function seanceDansLaFenetreDeRappel(maintenant: Date, dateHeureSeance: Date, prefs: PrefsRappel): boolean {
  if (!prefs.rappelSeanceActif) return false;
  const deltaMs = dateHeureSeance.getTime() - maintenant.getTime();
  const delaiMs = prefs.rappelSeanceDelaiHeures * 3_600_000;
  return deltaMs > 0 && deltaMs <= delaiMs;
}

/**
 * Heure civile Europe/Paris (HH:MM) de l'instant donné — gère
 * automatiquement CET/CEST.
 */
export function heureParisCivile(date: Date): string {
  const dtf = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    hour12: false,
    hour: '2-digit', minute: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  const heure = parts.hour === '24' ? '00' : parts.hour;
  return `${heure}:${parts.minute}`;
}

/**
 * Un patient doit recevoir le rappel "jour de séance" si le rappel est
 * activé, que l'heure civile Paris actuelle a atteint l'heure configurée, et
 * qu'aucun rappel "jour de séance" n'a déjà été envoyé aujourd'hui (au plus
 * un par jour, quel que soit le nombre de séances ce jour-là).
 */
export function doitEnvoyerRappelJourSeance(
  maintenant: Date,
  prefs: PrefsRappel,
  dejaEnvoyeAujourdhui: boolean,
): boolean {
  if (!prefs.rappelJourSeanceActif) return false;
  if (dejaEnvoyeAujourdhui) return false;
  return heureParisCivile(maintenant) >= prefs.rappelJourSeanceHeure.slice(0, 5);
}

// Messages neutres (RGPD/confidentialité santé) — voir RAPPORT_RAPPELS.md.
export const MESSAGE_RAPPEL_SEANCE = { titre: 'Horizon', corps: 'Vous avez une séance aujourd’hui.' };
export const MESSAGE_RAPPEL_JOUR_SEANCE = { titre: 'Horizon', corps: 'Vous avez une séance d’exercices aujourd’hui.' };
