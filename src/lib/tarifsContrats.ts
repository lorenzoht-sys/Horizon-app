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
