import type { TagPatient, BilanInitialData, QuestionsChronique } from '../../../types';
import { Section, ToggleField, Pills, NumberField, InputField, TextareaField, AlertBanner } from './InitialFields';
import { emptyChronique } from './initialFactories';

interface Props {
  data: BilanInitialData;
  onUpdate: (patch: Partial<BilanInitialData>) => void;
  activeTags: TagPatient[];
}

export default function StepTag_Chronique({ data, onUpdate, activeTags: _ }: Props) {
  const c: QuestionsChronique = { ...emptyChronique(), ...data.chronique };
  const upd = (p: Partial<QuestionsChronique>) =>
    onUpdate({ chronique: { ...emptyChronique(), ...data.chronique, ...p } });

  const upath = (p: Partial<QuestionsChronique['pathologie']>) => upd({ pathologie: { ...c.pathologie, ...p } });
  const utrt = (p: Partial<QuestionsChronique['traitementsContre']>) => upd({ traitementsContre: { ...c.traitementsContre, ...p } });
  const ute = (p: Partial<QuestionsChronique['toleranceEffort']>) => upd({ toleranceEffort: { ...c.toleranceEffort, ...p } });
  const umv = (p: Partial<QuestionsChronique['modeVie']>) => upd({ modeVie: { ...c.modeVie, ...p } });

  return (
    <div>
      <h2 className="text-lg font-heading font-semibold text-dark mb-6">💊 Pathologie chronique</h2>

      {/* Pathologie */}
      <Section title="La pathologie">
        <Pills label="Nature de la pathologie" value={c.pathologie.nature}
          onChange={v => upath({ nature: v })}
          options={[
            { value: 'cardiaque', label: 'Cardiaque' },
            { value: 'bpco', label: 'BPCO' },
            { value: 'diabete', label: 'Diabète' },
            { value: 'obesite', label: 'Obésité' },
            { value: 'cancer', label: 'Cancer' },
            { value: 'neurologique', label: 'Neurologique' },
            { value: 'autre', label: 'Autre' },
          ]} />
        {c.pathologie.nature === 'autre' && (
          <InputField label="Précisez la pathologie" value={c.pathologie.natureDetail}
            onChange={v => upath({ natureDetail: v })} placeholder="Ex : lupus, sclérose en plaques..." />
        )}
        <NumberField label="Ancienneté" value={c.pathologie.ancienneteAnnees}
          unit="an(s)" onChange={v => upath({ ancienneteAnnees: v })} max={80} />
        <InputField label="Médecin référent (optionnel)" value={c.pathologie.medecinReferent}
          onChange={v => upath({ medecinReferent: v })} placeholder="Ex : Dr Martin — cardiologue" />
      </Section>

      {/* Traitements & contre-indications */}
      <Section title="Traitements & contre-indications">
        <ToggleField label="Traitement médical en cours ?" value={c.traitementsContre.traitementEnCours}
          onChange={v => utrt({ traitementEnCours: v })} />
        {c.traitementsContre.traitementEnCours && (
          <TextareaField label="Détail des traitements" value={c.traitementsContre.traitementsDetail}
            onChange={v => utrt({ traitementsDetail: v })} placeholder="Ex : Bisoprolol, Metformine..." rows={2} />
        )}
        <ToggleField label="Contre-indications à l'effort ?" value={c.traitementsContre.contreIndicationsEffort}
          onChange={v => utrt({ contreIndicationsEffort: v })} />
        {c.traitementsContre.contreIndicationsEffort && (
          <>
            <AlertBanner message="Contre-indications à l'effort signalées — adapter le programme." />
            <InputField label="Précisez les contre-indications" value={c.traitementsContre.contreIndicationsDetail}
              onChange={v => utrt({ contreIndicationsDetail: v })} placeholder="Ex : pas d'effort > 80% FC max" />
          </>
        )}
        {(c.pathologie.nature === 'cardiaque' || c.traitementsContre.contreIndicationsEffort) && (
          <NumberField label="FC maximale autorisée" value={c.traitementsContre.fcMaxAutorisee}
            unit="bpm" onChange={v => utrt({ fcMaxAutorisee: v })} min={60} max={220} />
        )}
        {c.pathologie.nature === 'diabete' && (
          <ToggleField label="Glycémie à surveiller à l'effort ?" value={c.traitementsContre.glycemieASurveiller}
            onChange={v => utrt({ glycemieASurveiller: v })} />
        )}
        {c.pathologie.nature === 'bpco' && (
          <ToggleField label="Oxygène à l'effort ?" value={c.traitementsContre.oxygenneEffort}
            onChange={v => utrt({ oxygenneEffort: v })} />
        )}
      </Section>

      {/* Tolérance à l'effort */}
      <Section title="Tolérance à l'effort">
        <ToggleField label="Dyspnée au repos ?" value={c.toleranceEffort.dyspneeRepos}
          onChange={v => ute({ dyspneeRepos: v })} />
        <ToggleField label="Dyspnée à l'effort ?" value={c.toleranceEffort.dyspneeEffort}
          onChange={v => ute({ dyspneeEffort: v })} />
        {c.toleranceEffort.dyspneeEffort && (
          <InputField label="À quel niveau d'effort ?" value={c.toleranceEffort.dyspneeNiveau}
            onChange={v => ute({ dyspneeNiveau: v })} placeholder="Ex : à la montée d'escaliers..." />
        )}
        <ToggleField label="Douleurs thoraciques ?" value={c.toleranceEffort.douleursThoraciques}
          onChange={v => ute({ douleursThoraciques: v })} />
        {c.toleranceEffort.douleursThoraciques && (
          <AlertBanner message="Douleurs thoraciques signalées — consulter un médecin avant tout effort." />
        )}
        <div className="grid grid-cols-2 gap-4">
          <NumberField label="FC au repos" value={c.toleranceEffort.fcRepos}
            unit="bpm" onChange={v => ute({ fcRepos: v })} min={40} max={120} />
          <NumberField label="SpO₂" value={c.toleranceEffort.spo2}
            unit="%" onChange={v => ute({ spo2: v })} min={70} max={100} />
        </div>
        <InputField label="Tension artérielle (optionnel)" value={c.toleranceEffort.tensionArterielle}
          onChange={v => ute({ tensionArterielle: v })} placeholder="Ex : 130/80" />
      </Section>

      {/* Mode de vie */}
      <Section title="Mode de vie">
        <ToggleField label="Tabagisme actuel ?" value={c.modeVie.tabagisme}
          onChange={v => umv({ tabagisme: v })} />
        {c.modeVie.tabagisme && (
          <>
            <ToggleField label="Sevrage tabagique en cours ?" value={c.modeVie.tabagismeSevre}
              onChange={v => umv({ tabagismeSevre: v })} />
            <InputField label="Depuis quand fumez-vous ?" value={c.modeVie.tabagismeDepuis}
              onChange={v => umv({ tabagismeDepuis: v })} placeholder="Ex : depuis 20 ans" />
          </>
        )}
        <Pills label="Activité physique avant la maladie" value={c.modeVie.activiteAvantMaladie}
          onChange={v => umv({ activiteAvantMaladie: v })}
          options={[
            { value: 'sedentaire', label: 'Sédentaire' },
            { value: 'actif', label: 'Actif' },
            { value: 'sportif', label: 'Sportif' },
          ]} />
      </Section>
    </div>
  );
}
