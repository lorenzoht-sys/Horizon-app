import { describe, it, expect } from 'vitest';
import { validerNouveauContrat, type DonneesValidationContrat } from './contratValidation.js';

function donnees(overrides: Partial<DonneesValidationContrat> = {}): DonneesValidationContrat {
  return {
    modeDuree: 'duree',
    dureeIndeterminee: false,
    dateFin: '2027-01-01',
    joursFixe: ['lun', 'mer', 'ven'],
    nbSeancesSemaine: 3,
    ...overrides,
  };
}

describe('validerNouveauContrat', () => {
  it('accepte un contrat valide avec une date de fin précise', () => {
    expect(validerNouveauContrat(donnees())).toBeNull();
  });

  it('accepte un contrat valide sans date de fin', () => {
    expect(validerNouveauContrat(donnees({ dureeIndeterminee: true, dateFin: '' }))).toBeNull();
  });

  it('refuse une date de fin vide quand "sans date de fin" n\'est pas sélectionné (les deux modes ne sont jamais ambigus)', () => {
    const erreur = validerNouveauContrat(donnees({ dureeIndeterminee: false, dateFin: '' }));
    expect(erreur).not.toBeNull();
  });

  it('n\'exige aucune date de fin quand "sans date de fin" est sélectionné, même si une date traîne encore dans le formulaire', () => {
    // dateFin renseigné ET dureeIndeterminee=true : le mode "sans date de
    // fin" l'emporte sans ambiguïté, dateFin est simplement ignoré.
    expect(validerNouveauContrat(donnees({ dureeIndeterminee: true, dateFin: '2026-01-01' }))).toBeNull();
  });

  it('refuse un contrat sans aucun jour de séance sélectionné', () => {
    const erreur = validerNouveauContrat(donnees({ joursFixe: [] }));
    expect(erreur).not.toBeNull();
  });

  it('refuse un nombre de jours différent de la fréquence choisie', () => {
    const erreur = validerNouveauContrat(donnees({ joursFixe: ['lun', 'mer'], nbSeancesSemaine: 3 }));
    expect(erreur).not.toBeNull();
  });

  it('accepte le mode "nombre de séances" indépendamment de dateFin', () => {
    expect(validerNouveauContrat(donnees({ modeDuree: 'seances', dateFin: '' }))).toBeNull();
  });
});
