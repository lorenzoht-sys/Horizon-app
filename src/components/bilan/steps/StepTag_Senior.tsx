import type { TagPatient, BilanInitialData, QuestionsSenior } from '../../../types';
import { Section, ToggleField, Pills, Scale5, NumberField, InputField, TextareaField } from './InitialFields';
import { emptySenior } from './initialFactories';

interface Props {
  data: BilanInitialData;
  onUpdate: (patch: Partial<BilanInitialData>) => void;
  activeTags: TagPatient[];
}

export default function StepTag_Senior({ data, onUpdate, activeTags }: Props) {
  const s: QuestionsSenior = { ...emptySenior(), ...data.senior };
  const upd = (p: Partial<QuestionsSenior>) =>
    onUpdate({ senior: { ...emptySenior(), ...data.senior, ...p } });

  const ua = (p: Partial<QuestionsSenior['autonomie']>) => upd({ autonomie: { ...s.autonomie, ...p } });
  const uc = (p: Partial<QuestionsSenior['chutes']>) => upd({ chutes: { ...s.chutes, ...p } });
  const usa = (p: Partial<QuestionsSenior['sante']>) => upd({ sante: { ...s.sante, ...p } });
  const ucog = (p: Partial<QuestionsSenior['cognitionHumeur']>) => upd({ cognitionHumeur: { ...s.cognitionHumeur, ...p } });

  // Déduplication : certains champs sont masqués si d'autres tags prioritaires sont actifs
  const hasPostOp = activeTags.includes('post_op');
  const hasChronique = activeTags.includes('chronique');

  return (
    <div>
      <h2 className="text-lg font-heading font-semibold text-dark mb-6">🧓 Sénior</h2>

      {/* Autonomie */}
      <Section title="Autonomie">
        <Pills label="Situation de vie" value={s.autonomie.situationVie}
          onChange={v => ua({ situationVie: v })}
          options={[
            { value: 'seul', label: 'Seul(e)' },
            { value: 'famille', label: 'En famille' },
            { value: 'ehpad', label: 'EHPAD' },
            { value: 'autre', label: 'Autre' },
          ]} />
        <ToggleField label="Aide à domicile ?" value={s.autonomie.aideDomicile}
          onChange={v => ua({ aideDomicile: v })} />
        {s.autonomie.aideDomicile && (
          <NumberField label="Heures d'aide par semaine" value={s.autonomie.aideDomicileHeures}
            unit="h/sem" onChange={v => ua({ aideDomicileHeures: v })} max={40} />
        )}
        {!hasPostOp && (
          <Pills label="Aide à la marche" value={s.autonomie.aideMarche}
            onChange={v => ua({ aideMarche: v })}
            options={[
              { value: 'aucune', label: 'Aucune' },
              { value: 'canne', label: 'Canne' },
              { value: 'deambulateur', label: 'Déambulateur' },
              { value: 'autre', label: 'Autre' },
            ]} />
        )}
        <ToggleField label="Conduit un véhicule ?" value={s.autonomie.conduit}
          onChange={v => ua({ conduit: v })} />
      </Section>

      {/* Chutes */}
      <Section title="Antécédents de chutes">
        <ToggleField label="Chute(s) dans les 12 derniers mois ?" value={s.chutes.antecedentChute12mois}
          onChange={v => uc({ antecedentChute12mois: v })} />
        {s.chutes.antecedentChute12mois && (
          <>
            <NumberField label="Nombre de chutes" value={s.chutes.nombreChutes}
              unit="chute(s)" onChange={v => uc({ nombreChutes: v })} />
            <ToggleField label="Avec conséquences (blessure, hospitalisation) ?"
              value={s.chutes.chutesAvecConsequences} onChange={v => uc({ chutesAvecConsequences: v })} />
          </>
        )}
        <Scale5 label="Peur de tomber" value={s.chutes.peurTomber}
          onChange={v => uc({ peurTomber: v })}
          hint="1 = aucune peur · 5 = peur intense qui limite les activités" />
        <ToggleField label="Aménagement du domicile réalisé ?" value={s.chutes.amenagementDomicile}
          onChange={v => uc({ amenagementDomicile: v })} />
      </Section>

      {/* Santé */}
      <Section title="Santé générale">
        <TextareaField label="Pathologies connues" value={s.sante.pathologiesConnues}
          onChange={v => usa({ pathologiesConnues: v })}
          placeholder="Ex : HTA, arthrose genou droit..." rows={2} />
        {!hasChronique && (
          <>
            <ToggleField label="Traitements médicamenteux ?" value={s.sante.traitementsMedicamenteux}
              onChange={v => usa({ traitementsMedicamenteux: v })} />
            {s.sante.traitementsMedicamenteux && (
              <InputField label="Détail des traitements" value={s.sante.traitementsDetail}
                onChange={v => usa({ traitementsDetail: v })} placeholder="Ex : Amlodipine, Doliprane..." />
            )}
          </>
        )}
        <ToggleField label="Troubles de la vision (lunettes) ?" value={s.sante.troublesVision}
          onChange={v => usa({ troublesVision: v })} />
        <ToggleField label="Troubles auditifs (appareil auditif) ?" value={s.sante.troublesAuditifs}
          onChange={v => usa({ troublesAuditifs: v })} />
        <ToggleField label="Troubles du sommeil ?" value={s.sante.troublesSommeil}
          onChange={v => usa({ troublesSommeil: v })} />
        <Pills label="Continence" value={s.sante.continence}
          onChange={v => usa({ continence: v })}
          options={[
            { value: 'aucun', label: 'Aucun problème' },
            { value: 'urgences', label: 'Urgences mictionnelles' },
            { value: 'incontinence', label: 'Incontinence' },
          ]} />
      </Section>

      {/* Cognition & motivation */}
      <Section title="Cognition & motivation">
        <ToggleField label="Plaintes mémoire ?" value={s.cognitionHumeur.plaintesMemoire}
          onChange={v => ucog({ plaintesMemoire: v })} />
        <ToggleField label="Suivi psychologique ?" value={s.cognitionHumeur.suiviPsychologique}
          onChange={v => ucog({ suiviPsychologique: v })} />
        <Scale5 label="Motivation à pratiquer l'APA" value={s.cognitionHumeur.motivationPratiquer}
          onChange={v => ucog({ motivationPratiquer: v })}
          hint="1 = peu motivé · 5 = très motivé" />
      </Section>
    </div>
  );
}
