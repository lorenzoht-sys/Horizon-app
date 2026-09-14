// Ce que le bénéficiaire voit, dit d'un coup d'œil.
//
// Le partage est caché par défaut et se coche résultat par résultat, sur
// chaque bilan. Une grille de cases à cocher dit ce qu'on PEUT partager, pas ce
// qui EST partagé : pour le savoir il fallait lire cinq cases une à une, sur
// chaque bilan. Le 2026-09-14, Pierre a découvert que ses bénéficiaires ne
// voyaient pas leurs progrès alors qu'il croyait les partager depuis le début.
//
// Ce bandeau répond à la seule question qui compte avant de fermer la page :
// est-ce que quelqu'un voit quelque chose, et quoi.

import { Eye, EyeOff } from 'lucide-react';
import type { Bilan } from '../../types';
import { etatPartageBilan, resumePartageBilan } from '../../lib/partageBeneficiaire';

function Pastille({ label, visible }: { label: string; visible: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{
        background: visible ? '#E1F5EE' : '#F3F4F6',
        color: visible ? '#0F6E56' : '#6B7280',
        border: `1px solid ${visible ? '#0F6E5633' : '#E5E7EB'}`,
      }}
    >
      {visible ? <Eye size={12} /> : <EyeOff size={12} />}
      {label}
    </span>
  );
}

/**
 * Bandeau d'état pour UN bilan.
 *
 * Les résultats non mesurés ne sont pas listés : ils n'ont pas de case à
 * cocher, et les afficher comme « non partagés » désignerait une action
 * impossible.
 */
export function EtatPartageBilan({ bilan }: { bilan: Bilan }) {
  const etats = etatPartageBilan(bilan).filter(e => e.renseigne);
  const { partages, masques } = resumePartageBilan(bilan);

  if (etats.length === 0) {
    return (
      <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-2.5 text-xs text-gray-500">
        Aucun résultat mesuré dans ce bilan — rien à partager pour l'instant.
      </div>
    );
  }

  const aucunPartage = partages === 0;

  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{
        background: aucunPartage ? '#FAEEDA' : '#F9FAFB',
        border: `1px solid ${aucunPartage ? '#BA751733' : '#E5E7EB'}`,
      }}
    >
      <div className="text-xs font-semibold mb-2" style={{ color: aucunPartage ? '#BA7517' : '#374151' }}>
        {aucunPartage
          ? `Le bénéficiaire ne voit aucun résultat de ce bilan (${masques} masqué${masques > 1 ? 's' : ''})`
          : `Le bénéficiaire voit ${partages} résultat${partages > 1 ? 's' : ''} sur ${etats.length}`}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {etats.map(e => <Pastille key={e.cle} label={e.label} visible={e.partage} />)}
      </div>
    </div>
  );
}

/**
 * Bandeau d'état pour les deux questionnaires de la fiche (sédentarité,
 * fatigue), qui se partagent ailleurs que les résultats de bilan — d'où un
 * composant distinct plutôt qu'un cas particulier du précédent.
 */
export function EtatPartageQuestionnaires({
  sedentaritePartagee, fatiguePartagee,
}: { sedentaritePartagee: boolean; fatiguePartagee: boolean }) {
  const partages = Number(sedentaritePartagee) + Number(fatiguePartagee);
  const aucunPartage = partages === 0;

  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{
        background: aucunPartage ? '#FAEEDA' : '#F9FAFB',
        border: `1px solid ${aucunPartage ? '#BA751733' : '#E5E7EB'}`,
      }}
    >
      <div className="text-xs font-semibold mb-2" style={{ color: aucunPartage ? '#BA7517' : '#374151' }}>
        {aucunPartage
          ? 'Le bénéficiaire ne voit aucun de ces deux questionnaires'
          : `Le bénéficiaire voit ${partages} questionnaire${partages > 1 ? 's' : ''} sur 2`}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Pastille label="Niveau d'activité" visible={sedentaritePartagee} />
        <Pastille label="Fatigue" visible={fatiguePartagee} />
      </div>
    </div>
  );
}
