import { describe, it, expect } from 'vitest';
import {
  versParticipantIA, reinsererIdentite, reinsererIdentiteDans, masquerIdentiteConnue,
  identiteDe, MARQUEURS, CHAMPS_PARTICIPANT_IA,
} from './pseudonymiserIA';
import { beneficiaireFictif, bilanFictif, identifiantsPresents, IDENTIFIANTS_FICTIFS } from './pseudonymiserIA.fixture';
import type { Participant } from '../types';

const REF = new Date(2026, 9, 27);

describe('identifiantsPresents (témoin des tests de non-fuite)', () => {
  it('détecte bien chaque identifiant, sinon les autres tests ne prouveraient rien', () => {
    const p = beneficiaireFictif();
    const brut = `${p.prenom} ${p.nom} ${p.dateNaissance} ${p.email} ${p.telephone} ${p.adresseRue} ${p.iban} ${p.codeAcces}`;
    expect(identifiantsPresents(brut)).toEqual(expect.arrayContaining(['E2E', 'Pseudotest', '1948-03-14', IDENTIFIANTS_FICTIFS.email, IDENTIFIANTS_FICTIFS.iban]));
    expect(identifiantsPresents('E2EE et rien d\'autre')).toEqual([]);
  });
});

describe('versParticipantIA — liste blanche', () => {
  it('ne contient aucun identifiant du bénéficiaire fictif complet', () => {
    const ia = versParticipantIA(beneficiaireFictif(), REF);
    expect(identifiantsPresents(JSON.stringify(ia))).toEqual([]);
  });

  it('remplace la date de naissance par l\'âge en années', () => {
    const ia = versParticipantIA(beneficiaireFictif(), REF);
    expect(ia.age).toBe(78);
    expect(ia).not.toHaveProperty('dateNaissance');
  });

  it('conserve les données cliniques utiles au prompt', () => {
    const ia = versParticipantIA(beneficiaireFictif(), REF);
    expect(ia.pathologie).toBe('Lombalgie chronique');
    expect(ia.allergies).toBe('Pénicilline');
    expect(ia.bilans).toHaveLength(1);
  });

  it('ne transmet pas un champ inconnu ajouté plus tard au participant', () => {
    const p = { ...beneficiaireFictif(), numeroSecu: '1480399999999', nouveauChamp: 'secret' } as unknown as Participant;
    const ia = versParticipantIA(p, REF) as unknown as Record<string, unknown>;
    expect(ia).not.toHaveProperty('numeroSecu');
    expect(ia).not.toHaveProperty('nouveauChamp');
    expect(Object.keys(ia).every(k => k === 'age' || (CHAMPS_PARTICIPANT_IA as readonly string[]).includes(k))).toBe(true);
  });

  it('masque le nom dans une interprétation IA et un titre de programme générés avant le chantier', () => {
    const p = beneficiaireFictif({
      bilans: [bilanFictif({ interpretationIA: {
        textePro: 'E2E Pseudotest progresse.', messageClient: 'Bonjour E2E,',
        pointsForts: [], pointsATravail: [], recommandations: [], genereParIA: true, dateGeneration: '',
      } })],
      programmes: [{ id: 'x', participantId: 'p', dateCreation: '', dateDebut: '', titre: 'Programme Équilibre E2E',
        objectif: '', messageMotivation: 'Courage E2E', exercices: [], actif: true, suiviSemaines: [] }],
    });
    expect(identifiantsPresents(JSON.stringify(versParticipantIA(p, REF)))).toEqual([]);
  });
});

describe('reinsererIdentite — marqueurs', () => {
  const id = identiteDe(beneficiaireFictif());

  it('remplace chaque marqueur par la bonne valeur', () => {
    expect(reinsererIdentite('## CR — {{BENEFICIAIRE}}', id)).toBe('## CR — E2E Pseudotest');
    expect(reinsererIdentite('Bonjour {{PRENOM}},', id)).toBe('Bonjour E2E,');
    expect(reinsererIdentite('{{NOM}}', id)).toBe('Pseudotest');
    expect(reinsererIdentite('{{DATE_NAISSANCE}}', id)).toBe(IDENTIFIANTS_FICTIFS.dateNaissanceFr);
  });

  it('tolère des espaces dans le marqueur', () => {
    expect(reinsererIdentite('Bravo {{ PRENOM }} !', id)).toBe('Bravo E2E !');
  });

  it('sans identité, retombe sur le libellé neutre plutôt que des accolades', () => {
    expect(reinsererIdentite('Bonjour {{PRENOM}}', null)).toBe('Bonjour le bénéficiaire');
  });

  it('date de naissance absente : « Non renseigné »', () => {
    expect(reinsererIdentite('{{DATE_NAISSANCE}}', { prenom: 'A', nom: 'B', dateNaissance: '' })).toBe('Non renseigné');
  });

  it('parcourt un objet JSON en profondeur sans toucher aux clés', () => {
    const r = reinsererIdentiteDans({ '{{NOM}}': '{{NOM}}', liste: ['{{PRENOM}}'], n: 3, vide: null }, id);
    expect(r).toEqual({ '{{NOM}}': 'Pseudotest', liste: ['E2E'], n: 3, vide: null });
  });

  it('aller-retour : masquer puis réinsérer rend le texte d\'origine', () => {
    const texte = 'Compte rendu de E2E Pseudotest, né le 14/03/1948. E2E va mieux.';
    const masque = masquerIdentiteConnue(texte, id);
    expect(identifiantsPresents(masque)).toEqual([]);
    expect(reinsererIdentite(masque, id)).toBe(texte);
  });
});

describe('masquerIdentiteConnue — nom connu dans l\'historique', () => {
  const marc = { prenom: 'Marc', nom: 'Hélène-Dupré' };

  it('respecte les limites de mot : « Marc » ne touche pas « Marché »', () => {
    expect(masquerIdentiteConnue('Marc est allé au Marché.', marc)).toBe(`${MARQUEURS.prenom} est allé au Marché.`);
  });

  it('ignore la casse et les accents', () => {
    expect(masquerIdentiteConnue('MARC HELENE-DUPRE et marc', marc)).toBe(`${MARQUEURS.beneficiaire} et ${MARQUEURS.prenom}`);
  });

  it('reconnaît l\'ordre « nom prénom »', () => {
    expect(masquerIdentiteConnue('Hélène-Dupré Marc', marc)).toBe(MARQUEURS.beneficiaire);
  });

  it('reconnaît le nom composé écrit avec une espace', () => {
    expect(masquerIdentiteConnue('M. Hélène Dupré', marc)).toBe(`M. ${MARQUEURS.nom}`);
  });

  it('n\'utilise pas un nom d\'une lettre (initiales sans rapport)', () => {
    expect(masquerIdentiteConnue('A. B. et C.', { prenom: 'A', nom: 'B' })).toBe('A. B. et C.');
  });

  it('texte vide ou identité absente : inchangé', () => {
    expect(masquerIdentiteConnue('', marc)).toBe('');
    expect(masquerIdentiteConnue(undefined, marc)).toBeUndefined();
    expect(masquerIdentiteConnue('Marc', null)).toBe('Marc');
  });

  it('un nom contenant des caractères spéciaux d\'expression régulière ne casse rien', () => {
    expect(masquerIdentiteConnue('Jo (test) ici', { prenom: 'Jo', nom: '(test)' })).toBe(`${MARQUEURS.beneficiaire} ici`);
  });
});
