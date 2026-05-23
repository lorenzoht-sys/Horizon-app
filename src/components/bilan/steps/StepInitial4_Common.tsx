import type { QuestionsCommunes } from '../../../types';
import { Section, ToggleField, Pills, Scale5, NumberField, TextareaField, InputField } from './InitialFields';

interface Props {
  commune: QuestionsCommunes;
  onUpdate: (patch: Partial<QuestionsCommunes>) => void;
}

export default function StepInitial4_Common({ commune, onUpdate }: Props) {
  const ali = commune.alimentation;
  const uali = (p: Partial<QuestionsCommunes['alimentation']>) =>
    onUpdate({ alimentation: { ...ali, ...p } });

  const som = commune.sommeilFatigue;
  const usom = (p: Partial<QuestionsCommunes['sommeilFatigue']>) =>
    onUpdate({ sommeilFatigue: { ...som, ...p } });

  const act = commune.activitePhysique;
  const uact = (p: Partial<QuestionsCommunes['activitePhysique']>) =>
    onUpdate({ activitePhysique: { ...act, ...p } });

  return (
    <div>
      <h2 className="text-lg font-heading font-semibold text-dark mb-6">Alimentation · Sommeil · Activité physique</h2>

      {/* ── Alimentation ── */}
      <Section title="Alimentation">
        <ToggleField
          label="Variation de poids récente (involontaire) ?"
          value={ali.variationPoidsRecente}
          onChange={v => uali({ variationPoidsRecente: v })}
        />
        {ali.variationPoidsRecente && (
          <div className="grid grid-cols-2 gap-4">
            <NumberField label="De combien de kg ?" value={ali.variationPoidsKg}
              onChange={v => uali({ variationPoidsKg: v })} unit="kg" max={50} />
            <NumberField label="Sur combien de mois ?" value={ali.variationPoidsMois}
              onChange={v => uali({ variationPoidsMois: v })} unit="mois" max={24} />
          </div>
        )}
        <Pills
          label="Nombre de repas par jour"
          value={ali.nombreRepasPJour}
          onChange={v => uali({ nombreRepasPJour: v })}
          options={[
            { value: '1', label: '1 repas' },
            { value: '2', label: '2 repas' },
            { value: '3', label: '3 repas' },
            { value: 'plus', label: 'Plus de 3' },
          ]}
        />
        <Pills
          label="Hydratation quotidienne"
          value={ali.hydratation}
          onChange={v => uali({ hydratation: v })}
          options={[
            { value: 'moins1L', label: '< 1 L' },
            { value: '1a1_5L', label: '1 à 1,5 L' },
            { value: 'plus1_5L', label: '> 1,5 L' },
          ]}
        />
      </Section>

      {/* ── Sommeil & fatigue ── */}
      <Section title="Sommeil & fatigue">
        <Scale5
          label="Qualité du sommeil"
          value={som.qualiteSommeil}
          onChange={v => usom({ qualiteSommeil: v })}
          hint="1 = très mauvaise · 5 = excellente"
        />
        <NumberField
          label="Heures de sommeil par nuit"
          value={som.heuresSommeilNuit}
          onChange={v => usom({ heuresSommeilNuit: v })}
          unit="heures" min={1} max={14}
        />
        <Scale5
          label="Fatigue quotidienne"
          value={som.fatigueQuotidienne}
          onChange={v => usom({ fatigueQuotidienne: v })}
          hint="1 = pas fatiguée · 5 = épuisée en permanence"
        />
        <ToggleField
          label="Fatigue rapide à l'effort ?"
          value={som.fatigueRapideEffort}
          onChange={v => usom({ fatigueRapideEffort: v })}
        />
        <div className="grid grid-cols-2 gap-4">
          <Scale5
            label="Énergie le matin"
            value={som.energieMatin}
            onChange={v => usom({ energieMatin: v })}
            hint="1 = très basse · 5 = très haute"
          />
          <Scale5
            label="Énergie le soir"
            value={som.energieSoir}
            onChange={v => usom({ energieSoir: v })}
            hint="1 = très basse · 5 = très haute"
          />
        </div>
      </Section>

      {/* ── Activité physique ── */}
      <Section title="Activité physique">
        <Pills
          label="Niveau d'activité actuel"
          value={act.niveauActuel}
          onChange={v => uact({ niveauActuel: v })}
          options={[
            { value: 'sedentaire', label: 'Sédentaire' },
            { value: 'leger', label: 'Léger' },
            { value: 'moderement_actif', label: 'Modérément actif' },
          ]}
        />
        <TextareaField
          label="Activités pratiquées actuellement"
          value={act.activitesActuelles}
          onChange={v => uact({ activitesActuelles: v })}
          placeholder="Ex : marche 30 min/jour, jardinage..."
          rows={2}
        />
        <TextareaField
          label="Activités pratiquées avant (avant la maladie / blessure)"
          value={act.activitesPrecedentes}
          onChange={v => uact({ activitesPrecedentes: v })}
          placeholder="Ex : natation, tennis, vélo..."
          rows={2}
        />
        <InputField
          label="Dernière activité régulière (date approximative)"
          value={act.derniereActiviteReguliere}
          onChange={v => uact({ derniereActiviteReguliere: v })}
          placeholder="Ex : il y a 6 mois, avant l'opération..."
        />
      </Section>
    </div>
  );
}
