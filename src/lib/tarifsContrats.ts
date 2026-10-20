// Bug 07 (PLAN-BETA.md) : résolution du tarif applicable à une séance parmi
// les versions datées d'un contrat (tarifs_contrats). Fonction pure, sans
// dépendance Supabase — le chargement des versions vit dans
// src/hooks/useTarifsContrat.ts, qui appelle celle-ci une fois les versions
// récupérées. Seul point du projet qui décide « quel tarif s'applique à
// cette date » : StatsPage.tsx (factures) et SectionTarifContrat.tsx
// (affichage praticien) passent tous les deux par ici plutôt que de
// dupliquer la logique.

import type { TarifContrat } from '../types';

/** Montant facturé pour une séance sous cette version de tarif. */
export function totalFactureSeance(tarif: TarifContrat): number {
  return tarif.tarifSeance + tarif.fraisDeplacement;
}

/**
 * Version de tarif applicable à une date de séance, parmi les versions d'un
 * même contrat. Une version est applicable si dateSeance est dans sa
 * période : dateSeance >= dateDebutValidite ET (dateFinValidite absente OU
 * dateSeance <= dateFinValidite).
 *
 * Ne suppose pas que `versions` est trié. Ne retombe jamais sur "la version
 * la plus proche" par défaut : si aucune version ne couvre réellement la
 * date (séance antérieure à toute version connue, ou trou dans
 * l'historique), renvoie null — un montant facturé ne se devine pas,
 * l'appelant décide explicitement du repli (voir StatsPage.tsx, qui retombe
 * sur le tarif par défaut du praticien).
 *
 * dateSeance et les dates de validité sont des chaînes ISO 'YYYY-MM-DD' :
 * la comparaison lexicographique suffit, même convention que le reste du
 * projet (ex. filtrage par période dans StatsPage.tsx).
 */
export function trouverTarifApplicable(versions: TarifContrat[], dateSeance: string): TarifContrat | null {
  const applicable = versions.find(v =>
    dateSeance >= v.dateDebutValidite && (!v.dateFinValidite || dateSeance <= v.dateFinValidite)
  );
  return applicable ?? null;
}

// ── Changement de tarif : date d'effet choisie, dates en heure de Paris (2026-10-20) ──────────────
//
// Avant : la nouvelle version partait toujours « d'aujourd'hui », calculé en UTC (toISOString). Une hausse
// saisie le 5 octobre pour le 1er laissait les séances du 1er au 4 à l'ancien tarif, et entre minuit et 2 h
// (heure de Paris) « aujourd'hui » valait encore la veille. Le praticien choisit désormais la date d'effet
// (par défaut aujourd'hui, à Paris) ; la base reste seule juge des versions verrouillées par une facture
// validée (trigger tarifs_utilises_inalterables).

/** Date civile à Paris (AAAA-MM-JJ). */
export function dateCivileParis(instant: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/** Veille d'une date AAAA-MM-JJ, en arithmétique de calendrier pure (aucun fuseau horaire en jeu). */
export function jourPrecedent(iso: string): string {
  const [a, m, j] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j - 1));
  return d.toISOString().slice(0, 10);
}

function formatJour(iso: string): string {
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a}`;
}

export type PlanChangementTarif =
  | { erreur: string }
  | {
      /** Version en vigueur à clore la veille de la date d'effet. */
      fermer: { id: string; dateFin: string } | null;
      /** Version en vigueur à remplacer : elle commence le jour même de la date d'effet. */
      remplacer: string | null;
      /** Début de la nouvelle version. */
      dateDebut: string;
    };

/**
 * Ce qu'il faut faire pour ouvrir une nouvelle version de tarif à `dateEffet`, sans jamais modifier le
 * montant d'une version existante :
 *   - date d'effet après le début de la version en vigueur : on la clôt la veille ;
 *   - même jour que son début : on la remplace (elle n'a encore servi à aucune séance antérieure) ;
 *   - avant son début : refusé, il faudrait réécrire l'historique.
 */
export function planChangementTarif(versionActuelle: TarifContrat | null, dateEffet: string): PlanChangementTarif {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateEffet)) return { erreur: 'Date d\'effet invalide' };
  if (!versionActuelle) return { fermer: null, remplacer: null, dateDebut: dateEffet };
  if (dateEffet < versionActuelle.dateDebutValidite) {
    return { erreur: `La date d'effet ne peut pas précéder le début du tarif en vigueur (${formatJour(versionActuelle.dateDebutValidite)})` };
  }
  if (dateEffet === versionActuelle.dateDebutValidite) return { fermer: null, remplacer: versionActuelle.id, dateDebut: dateEffet };
  return { fermer: { id: versionActuelle.id, dateFin: jourPrecedent(dateEffet) }, remplacer: null, dateDebut: dateEffet };
}

/** Traduit les refus de la base (version verrouillée par une facture validée) en phrase utile au praticien. */
export function messageErreurTarif(message: string): string {
  if (/après la dernière séance facturée|créer une nouvelle version|suppression interdite/.test(message)) {
    return 'Des séances à partir de cette date figurent déjà sur une facture validée : choisissez une date d\'effet postérieure à la dernière séance facturée.';
  }
  return message;
}
