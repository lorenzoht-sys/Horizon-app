import type { StatutSeancesSemaine } from '../../utils/horaires';

const STYLES: Record<Exclude<StatutSeancesSemaine['etat'], 'sans_contrat'>, { bg: string; color: string }> = {
  complet: { bg: '#E9F9EE', color: '#1F9254' },
  a_planifier: { bg: '#FFF3E0', color: '#B45309' },
  semaine_non_due: { bg: '#F1F2F4', color: '#6B7280' },
  nb_non_defini: { bg: '#F1F2F4', color: '#6B7280' },
};

function libelle(statut: StatutSeancesSemaine): string | null {
  switch (statut.etat) {
    case 'sans_contrat': return null;
    case 'nb_non_defini': return 'Nb séances non défini';
    case 'semaine_non_due': return 'Pas de séance cette semaine';
    case 'complet': return '✓ complet';
    case 'a_planifier': return `${statut.restant} à planifier`;
  }
}

// Pastille compacte à afficher à côté du contrat actif d'un bénéficiaire
// (carte de sélection du planning, fiche bénéficiaire). Ne rend rien si le
// bénéficiaire n'a pas de contrat actif — ce cas est déjà signalé ailleurs
// (ex: "Sans contrat" / "Aucun contrat actif").
export default function BadgeSeancesRestantes({ statut, className = '' }: {
  statut: StatutSeancesSemaine;
  className?: string;
}) {
  const texte = libelle(statut);
  if (!texte) return null;
  const style = STYLES[statut.etat as Exclude<StatutSeancesSemaine['etat'], 'sans_contrat'>];
  return (
    <span
      className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full ${className}`}
      style={{ background: style.bg, color: style.color }}
    >
      {texte}
    </span>
  );
}
