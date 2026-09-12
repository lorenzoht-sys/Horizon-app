// Validation pure du formulaire de création de contrat (ContratNouveauPage.tsx)
// — extraite pour être testable sans rendu React, même séparation que
// src/lib/planificationManuelle.ts.
//
// Les deux modes de durée ("sans date de fin" / "jusqu'à une date précise")
// sont mutuellement exclusifs par construction dans le formulaire (deux
// boutons, jamais une case à cocher à côté d'un champ toujours visible) :
// cette fonction ne revalide donc pas l'exclusivité elle-même, seulement
// que le champ requis par le mode choisi est bien renseigné.

export interface DonneesValidationContrat {
  modeDuree: 'duree' | 'seances';
  /** Ignoré (jamais requis) si true — voir note ci-dessus sur l'exclusivité. */
  dureeIndeterminee: boolean;
  dateFin: string;
  /** Jours de séance sélectionnés (obligatoire, quel que soit le mode). */
  joursFixe: string[];
  nbSeancesSemaine: number;
}

// Renvoie un message d'erreur en français (prêt à afficher) ou null si le
// formulaire est valide.
export function validerNouveauContrat(d: DonneesValidationContrat): string | null {
  if (d.modeDuree === 'duree' && !d.dureeIndeterminee && !d.dateFin) {
    return 'Choisissez une date de fin, ou sélectionnez "Sans date de fin".';
  }

  if (d.joursFixe.length === 0) {
    return 'Sélectionnez au moins un jour de séance.';
  }

  if (d.joursFixe.length !== d.nbSeancesSemaine) {
    return `Sélectionnez exactement ${d.nbSeancesSemaine} jour${d.nbSeancesSemaine > 1 ? 's' : ''} de séance (fréquence choisie).`;
  }

  return null;
}
