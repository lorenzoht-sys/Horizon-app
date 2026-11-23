import { AUJ } from '../donnees';
export function useCoursCollectifs() {
  return { coursCollectifs: [{ id: 'c1', date: AUJ, heureDebut: '17:30', titre: 'Gym douce', statut: 'planifie' }], participationsDuCours: () => [1, 2, 3, 4, 5, 6], modifierStatutCours: async () => true, modifierCours: async () => true, mettreAJourParticipation: async () => true } as never;
}
