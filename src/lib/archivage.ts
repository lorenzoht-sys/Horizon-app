// Séparation des bénéficiaires actifs / archivés — UNE seule règle pour tout le projet.
//
// « Archivé » = ancien bénéficiaire, plus suivi actuellement, dossier conservé
// (participants.archive, voir types/index.ts). Ce n'est pas un masquage : un archivé
// n'apparaît jamais dans la liste des actifs, et ne peut pas y être remélangé par un
// filtre d'affichage. Un champ absent (`undefined`) vaut « actif », comme la colonne
// SQL (NOT NULL DEFAULT false).

export function estArchive(p: { archive?: boolean | null }): boolean {
  return p.archive === true;
}

/** Partition complète : chaque bénéficiaire est dans exactement une des deux listes. */
export function separerParArchivage<T extends { archive?: boolean | null }>(
  liste: readonly T[],
): { actifs: T[]; archives: T[] } {
  const actifs: T[] = [];
  const archives: T[] = [];
  for (const p of liste) (estArchive(p) ? archives : actifs).push(p);
  return { actifs, archives };
}

/** Filtre de recherche par nom, commun au tableau de bord et à la page des archivés. */
export function filtrerParNom<T extends { prenom: string; nom: string }>(
  liste: readonly T[],
  recherche: string,
): T[] {
  const q = recherche.trim().toLowerCase();
  if (!q) return [...liste];
  return liste.filter(p => `${p.prenom} ${p.nom}`.toLowerCase().includes(q));
}

/**
 * Retire les contrats des bénéficiaires archivés — pour les ALERTES du praticien (contrat à
 * renouveler, contrat sans jours, bandeau « à planifier »…) : un archivé n'est plus suivi, ces
 * alertes ne demandent aucune action de sa part.
 *
 * Le contrat lui-même n'est pas modifié : il garde son statut (l'archivage et la fin de
 * contrat sont deux décisions distinctes). Un contrat dont le bénéficiaire est introuvable
 * (liste en cours de chargement, fiche supprimée) est conservé : on ne masque que ce que l'on
 * SAIT archivé.
 */
export function contratsDesBeneficiairesActifs<C extends { participantId: string }>(
  contrats: readonly C[],
  participants: readonly { id: string; archive?: boolean | null }[],
): C[] {
  const archives = new Set(participants.filter(estArchive).map(p => p.id));
  return contrats.filter(c => !archives.has(c.participantId));
}
