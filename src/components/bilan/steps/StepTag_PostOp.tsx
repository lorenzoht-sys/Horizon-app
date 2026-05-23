import type { BilanInitialData, QuestionsPostOp } from '../../../types';
import { Section, ToggleField, Pills, EVASlider, NumberField, InputField, DateField, AlertBanner } from './InitialFields';
import { emptyPostOp } from './initialFactories';

interface Props {
  data: BilanInitialData;
  onUpdate: (patch: Partial<BilanInitialData>) => void;
}

export default function StepTag_PostOp({ data, onUpdate }: Props) {
  const p: QuestionsPostOp = { ...emptyPostOp(), ...data.postOperatoire };
  const upd = (patch: Partial<QuestionsPostOp>) =>
    onUpdate({ postOperatoire: { ...emptyPostOp(), ...data.postOperatoire, ...patch } });

  const ui = (patch: Partial<QuestionsPostOp['intervention']>) => upd({ intervention: { ...p.intervention, ...patch } });
  const uam = (patch: Partial<QuestionsPostOp['autorisationMedicale']>) => upd({ autorisationMedicale: { ...p.autorisationMedicale, ...patch } });
  const uea = (patch: Partial<QuestionsPostOp['etatActuel']>) => upd({ etatActuel: { ...p.etatActuel, ...patch } });
  const uobj = (patch: Partial<QuestionsPostOp['objectifs']>) => upd({ objectifs: { ...p.objectifs, ...patch } });

  return (
    <div>
      <h2 className="text-lg font-heading font-semibold text-dark mb-6">🏥 Post-opératoire</h2>

      {/* Intervention */}
      <Section title="L'intervention chirurgicale">
        <Pills label="Type d'opération" value={p.intervention.typeOperation}
          onChange={v => ui({ typeOperation: v })}
          options={[
            { value: 'PTH', label: 'PTH (hanche)' },
            { value: 'PTG', label: 'PTG (genou)' },
            { value: 'ligaments', label: 'Ligaments' },
            { value: 'rachis', label: 'Rachis' },
            { value: 'epaule', label: 'Épaule' },
            { value: 'autre', label: 'Autre' },
          ]} />
        {p.intervention.typeOperation === 'autre' && (
          <InputField label="Précisez l'opération" value={p.intervention.typeOperationDetail}
            onChange={v => ui({ typeOperationDetail: v })} placeholder="Ex : arthroscopie cheville..." />
        )}
        <DateField label="Date de l'intervention" value={p.intervention.dateIntervention}
          onChange={v => ui({ dateIntervention: v })} />
        <Pills label="Côté opéré" value={p.intervention.coteOpere}
          onChange={v => ui({ coteOpere: v })}
          options={[
            { value: 'droit', label: 'Droit' },
            { value: 'gauche', label: 'Gauche' },
            { value: 'bilateral', label: 'Bilatéral' },
          ]} />
        <ToggleField label="Complications post-opératoires ?" value={p.intervention.complications}
          onChange={v => ui({ complications: v })} />
        {p.intervention.complications && (
          <InputField label="Précisez les complications" value={p.intervention.complicationsDetail}
            onChange={v => ui({ complicationsDetail: v })} placeholder="Ex : infection, phlébite..." />
        )}
        <InputField label="Chirurgien / Établissement (optionnel)" value={p.intervention.chirurgienEtablissement}
          onChange={v => ui({ chirurgienEtablissement: v })} placeholder="Ex : Dr Dupont — CHU Nantes" />
      </Section>

      {/* Autorisation médicale */}
      <Section title="Autorisation médicale">
        <ToggleField label="Compte-rendu opératoire disponible ?" value={p.autorisationMedicale.compteRenduDisponible}
          onChange={v => uam({ compteRenduDisponible: v })} />
        <ToggleField label="Autorisation médicale pour l'APA ?" value={p.autorisationMedicale.autorisationAPA}
          onChange={v => uam({ autorisationAPA: v })} />
        {p.autorisationMedicale.autorisationAPA === false && (
          <AlertBanner message="Autorisation médicale non obtenue — à obtenir avant de démarrer les séances." />
        )}
        {p.autorisationMedicale.autorisationAPA && (
          <InputField label="Restrictions prescrites (optionnel)" value={p.autorisationMedicale.restrictionsPrescrites}
            onChange={v => uam({ restrictionsPrescrites: v })} placeholder="Ex : pas de flexion > 90° genou..." />
        )}
        <ToggleField label="Kinésithérapie en parallèle ?" value={p.autorisationMedicale.kinesiParallele}
          onChange={v => uam({ kinesiParallele: v })} />
        {p.autorisationMedicale.kinesiParallele && (
          <InputField label="Fréquence des séances kiné" value={p.autorisationMedicale.kinesiFrequence}
            onChange={v => uam({ kinesiFrequence: v })} placeholder="Ex : 3 fois/semaine" />
        )}
      </Section>

      {/* État actuel */}
      <Section title="État actuel">
        <NumberField label="Semaines depuis l'opération" value={p.etatActuel.semainesDepuisOp}
          unit="sem." onChange={v => uea({ semainesDepuisOp: v })} max={104} />
        <EVASlider label="Douleur au repos (EVA 0-10)" value={p.etatActuel.douleurEVA}
          onChange={v => uea({ douleurEVA: v })} />
        {p.etatActuel.douleurEVA !== null && p.etatActuel.douleurEVA >= 7 && (
          <AlertBanner message={`Douleur élevée (EVA ${p.etatActuel.douleurEVA}/10) — adapter l'intensité.`} />
        )}
        <Pills label="Appareillage actuel" value={p.etatActuel.appareillage}
          onChange={v => uea({ appareillage: v })}
          options={[
            { value: 'aucun', label: 'Aucun' },
            { value: 'attelle', label: 'Attelle' },
            { value: 'bequilles', label: 'Béquilles' },
            { value: 'autre', label: 'Autre' },
          ]} />
        <Pills label="Autonomie dans les activités du quotidien" value={p.etatActuel.autonomie}
          onChange={v => uea({ autonomie: v })}
          options={[
            { value: 'totale', label: 'Totale' },
            { value: 'partielle', label: 'Partielle' },
            { value: 'aidee', label: 'Aidée' },
          ]} />
        <ToggleField label="Gonflement / inflammation persistant ?" value={p.etatActuel.gonflementInflammation}
          onChange={v => uea({ gonflementInflammation: v })} />
      </Section>

      {/* Objectifs */}
      <Section title="Objectifs">
        <Pills label="Objectif principal" value={p.objectifs.objectifPrincipal}
          onChange={v => uobj({ objectifPrincipal: v })}
          options={[
            { value: 'retour_sport', label: 'Retour au sport' },
            { value: 'reprise_travail', label: 'Reprise travail' },
            { value: 'autonomie', label: 'Autonomie' },
            { value: 'autre', label: 'Autre' },
          ]} />
        {p.objectifs.objectifPrincipal && (
          <InputField label="Précisez si nécessaire" value={p.objectifs.objectifDetail}
            onChange={v => uobj({ objectifDetail: v })} placeholder="Ex : reprendre le tennis..." />
        )}
        <DateField label="Date de retour souhaitée (optionnel)" value={p.objectifs.dateRetourSouhaitee}
          onChange={v => uobj({ dateRetourSouhaitee: v })} />
      </Section>
    </div>
  );
}
