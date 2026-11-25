import type { AutonomieData } from '../../../types';
import { OPTIONS_AIDES_MOBILITE, aidesMobiliteDepuis, resumeAidesMobilite } from '../../../lib/formulaireBeneficiaire';
import { ChoixMultiple } from './Champs';
import { ListeOrdonnee } from './ListeOrdonnee';
import { CLS_LABEL } from './communs';

// Aides à la mobilité (25/11/2026) : choix multiple classé, à la place du
// choix unique « Aide à la marche ». Stockage dans anamnese.autonomie (jsonb),
// sans migration : `aidesMobilite` (liste ordonnée) + `aideMarche` (résumé
// texte, lu par le PDF Dossier et les fiches plus anciennes).

export function AidesMobiliteForm({
  value,
  onChange,
}: {
  value: AutonomieData;
  onChange: (patch: Pick<AutonomieData, 'aidesMobilite' | 'aideMarche'>) => void;
}) {
  // Liste brute pour la saisie : elle garde la ligne « Autre » vide le temps
  // de la remplir ; la liste nettoyée sert au classement et au résumé.
  const brute = Array.isArray(value.aidesMobilite) ? value.aidesMobilite : aidesMobiliteDepuis(value);
  const aides = brute.filter(a => a.trim() !== '');
  const aucune = aides.length === 0 && value.aideMarche === 'Aucune';

  const ecrire = (liste: string[], sansAide: boolean) =>
    onChange({ aidesMobilite: liste, aideMarche: resumeAidesMobilite(liste.filter(a => a.trim() !== ''), sansAide) });

  return (
    <div className="space-y-3">
      <div>
        <label className={CLS_LABEL}>Aides à la mobilité</label>
        <button
          type="button"
          onClick={() => ecrire([], !aucune)}
          className={`mb-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
            aucune ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600 hover:border-primary/50 hover:bg-gray-50'
          }`}
        >
          Aucune aide
        </button>
        <ChoixMultiple
          label=""
          options={OPTIONS_AIDES_MOBILITE}
          value={brute}
          onChange={v => ecrire(v, false)}
          avecChampLibre
          placeholderCustom="Autre aide (préciser)..."
        />
      </div>
      <ListeOrdonnee
        titre="De la plus utilisée à la moins utilisée"
        aide="Utilisez les flèches pour classer les aides selon leur fréquence d'utilisation."
        value={aides}
        onChange={v => ecrire(v, false)}
        etiquettePremier="principale"
      />
    </div>
  );
}
