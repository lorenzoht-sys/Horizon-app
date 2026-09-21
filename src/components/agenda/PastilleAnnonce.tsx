import type { PresenceAnnoncee, StatutCoursCollectif } from '../../types';

// Ce que le BÉNÉFICIAIRE a annoncé avant un cours (« Je viens » / « Je ne viens pas »), vu
// par le praticien. Distinct de la présence CONSTATÉE, que le praticien saisit le jour du
// cours : quelqu'un peut annoncer « je viens » et ne pas venir, ou l'inverse.
//
// Couleurs inline : ce composant s'affiche pareil quelle que soit la palette Tailwind.
//
//  - cours à venir : les TROIS états, « sans réponse » compris — c'est ce qui permet de
//    repérer les indécis à relancer, et d'anticiper (matériel, salle) ;
//  - cours réalisé : seulement une réponse effectivement donnée (« avait annoncé »),
//    pour comparer avec la présence constatée ; « sans réponse » n'y dirait plus rien ;
//  - cours annulé : rien.

const STYLES = {
  vient: { fond: '#DCFCE7', texte: '#166534' },
  ne_vient_pas: { fond: '#FEF0EF', texte: '#B42318' },
  sans_reponse: { fond: '#FEF5E7', texte: '#92400E' },
  historique: { fond: '#F3F4F6', texte: '#4B5563' },
} as const;

interface Props {
  presenceAnnoncee: PresenceAnnoncee | undefined;
  statutCours: StatutCoursCollectif;
}

export default function PastilleAnnonce({ presenceAnnoncee, statutCours }: Props) {
  if (statutCours === 'annule') return null;

  let libelle: string;
  let style: { fond: string; texte: string };

  if (statutCours === 'planifie') {
    if (presenceAnnoncee === 'vient') { libelle = 'Annoncé : vient'; style = STYLES.vient; }
    else if (presenceAnnoncee === 'ne_vient_pas') { libelle = 'Annoncé : ne vient pas'; style = STYLES.ne_vient_pas; }
    else { libelle = 'Sans réponse'; style = STYLES.sans_reponse; }
  } else {
    if (!presenceAnnoncee) return null;
    libelle = presenceAnnoncee === 'vient' ? 'Avait annoncé : vient' : 'Avait annoncé : ne vient pas';
    style = STYLES.historique;
  }

  return (
    <span
      data-testid="annonce-presence"
      title="Réponse donnée par le bénéficiaire depuis son espace, avant le cours"
      className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: style.fond, color: style.texte }}
    >
      {libelle}
    </span>
  );
}
