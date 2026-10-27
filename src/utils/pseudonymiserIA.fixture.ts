// Bénéficiaire FICTIF, complet, partagé par les tests de pseudonymisation
// (lot A, 2026-10-27). Chaque champ identifiant a une valeur distinctive pour
// qu'un test puisse vérifier qu'elle n'apparaît dans aucun prompt.
import type { Bilan, Participant } from '../types';

export const IDENTIFIANTS_FICTIFS = {
  prenom: 'E2E',
  nom: 'Pseudotest',
  dateNaissance: '1948-03-14',
  dateNaissanceFr: '14/03/1948',
  nomNaissance: 'Naissancefictif',
  villeNaissance: 'Villefictive',
  email: 'e2e.pseudotest@exemple.invalid',
  telephone: '0611223344',
  adresseRue: '12 rue Imaginaire',
  medecinTraitant: 'Dr Medecinfictif',
  personneContact: 'Contactfictif 0699887766',
  codeAcces: 'ACCES-FICTIF-42',
  codePortail: 'PORTAIL-4321',
  iban: 'FR7612345678901234567890123',
  bic: 'FICTFRPPXXX',
  token: 'token-fictif-abcdef',
} as const;

export function bilanFictif(overrides: Partial<Bilan> = {}): Bilan {
  return {
    id: 'b-1', date: '2026-09-01', type: 'initial',
    tug3m: 12, chairStand30: 9,
    handGrip: { droite: 22, gauche: 20 },
    equilibre: { droite: 5, gauche: 4 },
    souplesse: { valeur: -3 },
    tm6: { distance: 320 },
    memoire: { scoreImmediat: 4, scoreDiffere: 3 },
    ...overrides,
  } as unknown as Bilan;
}

export function beneficiaireFictif(overrides: Partial<Participant> = {}): Participant {
  const id = IDENTIFIANTS_FICTIFS;
  return {
    id: 'p-fictif', prenom: id.prenom, nom: id.nom, dateNaissance: id.dateNaissance, dateCreation: '2026-01-01',
    email: id.email, telephone: id.telephone, nomNaissance: id.nomNaissance, villeNaissance: id.villeNaissance,
    codePostalNaissance: '99999', medecinTraitant: id.medecinTraitant,
    adresseRue: id.adresseRue, adresseCodePostal: '99000', adresseVille: 'Villedomicile',
    codePortail: id.codePortail, personneContact: id.personneContact, codeAcces: id.codeAcces,
    token: id.token, iban: id.iban, bic: id.bic,
    pathologie: 'Lombalgie chronique', antecedentsMedicaux: 'HTA', allergies: 'Pénicilline',
    taille: 165, poids: 70,
    bilans: [bilanFictif()],
    ...overrides,
  } as Participant;
}

/** Toutes les valeurs qui ne doivent jamais apparaître dans un prompt. */
export function valeursInterdites(): string[] {
  return Object.values(IDENTIFIANTS_FICTIFS);
}

/** Vérifie qu'un prompt ne contient aucun identifiant du bénéficiaire fictif.
 *  Le prénom « E2E » est cherché comme mot entier (pas dans « E2EE »). */
export function identifiantsPresents(prompt: string): string[] {
  return valeursInterdites().filter(v =>
    v === IDENTIFIANTS_FICTIFS.prenom ? /(?<![\p{L}\p{N}])E2E(?![\p{L}\p{N}])/u.test(prompt) : prompt.includes(v));
}
