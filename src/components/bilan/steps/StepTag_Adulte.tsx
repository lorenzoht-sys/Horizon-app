import type { TagPatient, BilanInitialData, QuestionsAdulteActif } from '../../../types';
import { Section, ToggleField, Pills, EVASlider, NumberField, InputField, DateField, TextareaField } from './InitialFields';
import { emptyAdulteActif } from './initialFactories';

interface Props {
  data: BilanInitialData;
  onUpdate: (patch: Partial<BilanInitialData>) => void;
  activeTags: TagPatient[];
}

export default function StepTag_Adulte({ data, onUpdate, activeTags }: Props) {
  const aa: QuestionsAdulteActif = { ...emptyAdulteActif(), ...data.adulteActif };
  const upd = (p: Partial<QuestionsAdulteActif>) =>
    onUpdate({ adulteActif: { ...emptyAdulteActif(), ...data.adulteActif, ...p } });

  const ub = (p: Partial<QuestionsAdulteActif['blessure']>) => upd({ blessure: { ...aa.blessure, ...p } });
  const upc = (p: Partial<QuestionsAdulteActif['priseEnCharge']>) => upd({ priseEnCharge: { ...aa.priseEnCharge, ...p } });
  const uea = (p: Partial<QuestionsAdulteActif['etatActuel']>) => upd({ etatActuel: { ...aa.etatActuel, ...p } });
  const ups = (p: Partial<QuestionsAdulteActif['profilSportif']>) => upd({ profilSportif: { ...aa.profilSportif, ...p } });

  // EVA au repos masquée si post_op est actif (déjà couvert dans cette étape)
  const hasPostOp = activeTags.includes('post_op');

  return (
    <div>
      <h2 className="text-lg font-heading font-semibold text-dark mb-6">🏃 Adulte actif — Reprise après blessure</h2>

      {/* La blessure */}
      <Section title="La blessure">
        <Pills label="Type de blessure" value={aa.blessure.type}
          onChange={v => ub({ type: v })}
          options={[
            { value: 'musculaire', label: 'Musculaire' },
            { value: 'ligamentaire', label: 'Ligamentaire' },
            { value: 'tendineuse', label: 'Tendineuse' },
            { value: 'fracture', label: 'Fracture' },
            { value: 'autre', label: 'Autre' },
          ]} />
        {aa.blessure.type === 'autre' && (
          <InputField label="Précisez la blessure" value={aa.blessure.typeDetail}
            onChange={v => ub({ typeDetail: v })} placeholder="Ex : déchirure labrum..." />
        )}
        <InputField label="Localisation" value={aa.blessure.localisation}
          onChange={v => ub({ localisation: v })} placeholder="Ex : genou droit, cheville gauche..." />
        <DateField label="Date de la blessure" value={aa.blessure.dateBlessure}
          onChange={v => ub({ dateBlessure: v })} />
        <Pills label="Mécanisme" value={aa.blessure.mecanisme}
          onChange={v => ub({ mecanisme: v })}
          options={[
            { value: 'traumatique', label: 'Traumatique (choc)' },
            { value: 'surmenage', label: 'Surmenage progressif' },
            { value: 'autre', label: 'Autre' },
          ]} />
        <ToggleField label="Imagerie réalisée (radio, IRM…) ?" value={aa.blessure.imagerieRealisee}
          onChange={v => ub({ imagerieRealisee: v })} />
        {aa.blessure.imagerieRealisee && (
          <InputField label="Résultat de l'imagerie" value={aa.blessure.imagerieResultat}
            onChange={v => ub({ imagerieResultat: v })} placeholder="Ex : rupture LCA partielle..." />
        )}
      </Section>

      {/* Prise en charge */}
      <Section title="Prise en charge">
        <ToggleField label="Suivi kinésithérapie ?" value={aa.priseEnCharge.suiviKine}
          onChange={v => upc({ suiviKine: v })} />
        {aa.priseEnCharge.suiviKine && (
          <InputField label="Fréquence des séances kiné" value={aa.priseEnCharge.suiviKineFrequence}
            onChange={v => upc({ suiviKineFrequence: v })} placeholder="Ex : 2 séances / semaine" />
        )}
        <ToggleField label="Médecin du sport consulté ?" value={aa.priseEnCharge.medecinSportConsulte}
          onChange={v => upc({ medecinSportConsulte: v })} />
        <ToggleField label="Arrêt de travail ?" value={aa.priseEnCharge.arretTravail}
          onChange={v => upc({ arretTravail: v })} />
        <ToggleField label="Arrêt sportif ?" value={aa.priseEnCharge.arretSportif}
          onChange={v => upc({ arretSportif: v })} />
        {aa.priseEnCharge.arretSportif && (
          <InputField label="Durée de l'arrêt sportif" value={aa.priseEnCharge.arretSportifDuree}
            onChange={v => upc({ arretSportifDuree: v })} placeholder="Ex : 6 semaines" />
        )}
      </Section>

      {/* État actuel */}
      <Section title="État actuel">
        {!hasPostOp && (
          <EVASlider label="Douleur au repos (EVA 0-10)" value={aa.etatActuel.douleurReposEVA}
            onChange={v => uea({ douleurReposEVA: v })} />
        )}
        <EVASlider label="Douleur à l'effort (EVA 0-10)" value={aa.etatActuel.douleurEffortEVA}
          onChange={v => uea({ douleurEffortEVA: v })} />
        <Pills label="Appareillage actuel" value={aa.etatActuel.appareillage}
          onChange={v => uea({ appareillage: v })}
          options={[
            { value: 'aucun', label: 'Aucun' },
            { value: 'orthese', label: 'Orthèse' },
            { value: 'strapping', label: 'Strapping' },
            { value: 'autre', label: 'Autre' },
          ]} />
        <ToggleField label="Récidive ?" value={aa.etatActuel.recidive}
          onChange={v => uea({ recidive: v })} />
        {aa.etatActuel.recidive && (
          <NumberField label="Nombre de récidives" value={aa.etatActuel.nombreRecidives}
            unit="fois" onChange={v => uea({ nombreRecidives: v })} />
        )}
      </Section>

      {/* Profil sportif */}
      <Section title="Profil sportif">
        <TextareaField label="Sports pratiqués" value={aa.profilSportif.sportsPratiques}
          onChange={v => ups({ sportsPratiques: v })} placeholder="Ex : football, natation, cyclisme..." rows={2} />
        <Pills label="Niveau sportif" value={aa.profilSportif.niveau}
          onChange={v => ups({ niveau: v })}
          options={[
            { value: 'loisir', label: 'Loisir' },
            { value: 'competition', label: 'Compétition' },
            { value: 'professionnel', label: 'Professionnel' },
          ]} />
        <InputField label="Fréquence d'entraînement (optionnel)" value={aa.profilSportif.frequenceEntrainement}
          onChange={v => ups({ frequenceEntrainement: v })} placeholder="Ex : 3 séances / semaine" />
        <Pills label="Objectif de retour" value={aa.profilSportif.objectifRetour}
          onChange={v => ups({ objectifRetour: v })}
          options={[
            { value: 'meme_sport', label: 'Même sport' },
            { value: 'autre_sport', label: 'Autre sport' },
            { value: 'activite_generale', label: 'Activité générale' },
          ]} />
        <InputField label="Délai souhaité" value={aa.profilSportif.delaiSouhaite}
          onChange={v => ups({ delaiSouhaite: v })} placeholder="Ex : dans 3 mois" />
      </Section>
    </div>
  );
}
