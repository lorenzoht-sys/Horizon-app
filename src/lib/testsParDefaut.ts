// Tests proposés par défaut à la création d'un bilan, selon l'âge
// (ModalSelectionTests.tsx). Sorti du composant le 2026-10-27 pour être
// testé : l'âge y était calculé en divisant par 365,25 jours, ce qui le
// faussait autour de l'anniversaire (voir src/lib/age.ts).
import type { Participant, TestKey } from '../types';
import { calculerAge } from './age';

export function computeDefauts(participant: Pick<Participant, 'dateNaissance'>, reference: Date = new Date()): TestKey[] {
  const age = calculerAge(participant.dateNaissance, reference);
  const defauts: TestKey[] = ['equilibre', 'chairStand', 'tug', 'tm6'];
  if (age !== null && age >= 70) {
    defauts.push('tinetti', 'memoire', 'berg', 'moca', 'adl');
  }
  return defauts;
}
