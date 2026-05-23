import type { Participant, Programme, Exercice } from '../types';
import PrintableProgrammePage1 from './PrintableProgrammePage1';
import PrintableProgrammePage2 from './PrintableProgrammePage2';

interface Props {
  participant: Participant;
  programme: Programme;
  exercices: Exercice[];
}

export default function PrintableProgramme({ participant, programme, exercices }: Props) {
  return (
    <>
      <PrintableProgrammePage1 participant={participant} programme={programme} exercices={exercices} />
      <PrintableProgrammePage2 participant={participant} programme={programme} exercices={exercices} />
    </>
  );
}
