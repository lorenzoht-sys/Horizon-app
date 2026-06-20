import type { TestEtalon } from '../types';

// Catalogue figé en V1 : pas de création libre par le praticien.
// Aucun test n'est visible côté patient sans activation explicite par le
// praticien pour ce patient (voir tests_etalons_activations).

const CONSIGNE_SECURITE_COMMUNE =
  "Arrêtez immédiatement en cas de douleur, vertige ou essoufflement anormal. " +
  "Faites ce test à votre rythme, sans chercher à battre un record.";

export const TESTS_ETALONS: TestEtalon[] = [
  {
    id: 'leve-chaise-30s',
    nom: 'Lever de chaise — 30 secondes',
    dureeSecondes: 30,
    unite: 'répétitions',
    consigne:
      "Assis(e) sur une chaise stable, sans accoudoirs si possible, levez-vous " +
      "complètement puis rasseyez-vous, le plus de fois possible pendant 30 secondes. " +
      "Comptez vos répétitions.",
    consigneSecurite: CONSIGNE_SECURITE_COMMUNE,
  },
  {
    id: 'montees-genoux-20s',
    nom: 'Montées de genoux — 20 secondes',
    dureeSecondes: 20,
    unite: 'répétitions',
    consigne:
      "Debout, en tenant un appui stable si besoin, montez alternativement les genoux " +
      "le plus de fois possible pendant 20 secondes (1 montée = 1 genou levé).",
    consigneSecurite: CONSIGNE_SECURITE_COMMUNE,
  },
  {
    id: 'pas-sur-place-20s',
    nom: 'Pas sur place — 20 secondes',
    dureeSecondes: 20,
    unite: 'pas',
    consigne:
      "Debout, marchez sur place à un rythme confortable pendant 20 secondes. " +
      "Comptez le nombre de pas.",
    consigneSecurite: CONSIGNE_SECURITE_COMMUNE,
  },
];

export function getTestEtalon(id: string): TestEtalon | undefined {
  return TESTS_ETALONS.find(t => t.id === id);
}
