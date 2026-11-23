import { participants } from '../donnees';
export function useParticipants() {
  return { participants, participantsActifs: participants, participantsArchives: [], loading: false, addParticipant: async () => null, archiverParticipant: async () => {}, updateParticipant: async () => {} } as never;
}
