import { describe, expect, it } from 'vitest';
import {
  MESSAGE_CONSENTEMENT_REQUIS,
  avecConsentement,
  consentementDepuisCellule,
  erreurConsentementCreation,
  normaliserRgpd,
  rgpdDeclareAImport,
  rgpdParDefaut,
} from './consentementRgpd';

describe('erreurConsentementCreation', () => {
  it('autorise la création uniquement si consentementObtenu vaut true', () => {
    expect(erreurConsentementCreation({ ...rgpdParDefaut(), consentementObtenu: true })).toBeNull();
  });

  it('refuse un rgpd absent (chemins mobile et import Excel avant correction)', () => {
    expect(erreurConsentementCreation(null)).toBe(MESSAGE_CONSENTEMENT_REQUIS);
    expect(erreurConsentementCreation(undefined)).toBe(MESSAGE_CONSENTEMENT_REQUIS);
  });

  it("refuse le motif des 7 fiches : l'état par défaut, rien de coché", () => {
    const motifDesSeptFiches = {
      consentementObtenu: false, droitAcces: false, droitRectification: false, droitEffacement: false,
      methodeConsentement: 'oral_note' as const, consentementDate: '2026-08-12',
    };
    expect(erreurConsentementCreation(motifDesSeptFiches)).toBe(MESSAGE_CONSENTEMENT_REQUIS);
  });

  it("refuse une valeur « vraie » qui n'est pas le booléen true", () => {
    expect(erreurConsentementCreation({ consentementObtenu: 'true' as unknown as boolean })).toBe(MESSAGE_CONSENTEMENT_REQUIS);
  });
});

describe('brouillon mobile rouvert dans le formulaire complet', () => {
  // Le formulaire complet initialise son état RGPD avec
  // normaliserRgpd({ ...initial, ...brouillon.data }.rgpd), puis refuse la
  // création via erreurConsentementCreation. Quel que soit le chemin qui a
  // écrit le brouillon, il ne peut donc pas contourner le consentement.
  it('un brouillon sans objet rgpd ne peut pas être enregistré', () => {
    const brouillonMobile: { prenom: string; nom: string; rgpd?: undefined } = { prenom: 'Marie', nom: 'Durand' };
    expect(erreurConsentementCreation(normaliserRgpd(brouillonMobile.rgpd))).toBe(MESSAGE_CONSENTEMENT_REQUIS);
  });

  it('un brouillon avec le consentement décoché ne peut pas être enregistré', () => {
    const brouillonMobile = { prenom: 'Marie', nom: 'Durand', rgpd: rgpdParDefaut() };
    expect(erreurConsentementCreation(normaliserRgpd(brouillonMobile.rgpd))).toBe(MESSAGE_CONSENTEMENT_REQUIS);
  });

  it('un brouillon où le consentement a été coché passe', () => {
    const rgpd = avecConsentement(rgpdParDefaut(), true, '2026-09-13');
    expect(erreurConsentementCreation(normaliserRgpd(rgpd))).toBeNull();
  });
});

describe('normaliserRgpd', () => {
  it('efface la date de recueil quand le consentement n’a pas été obtenu', () => {
    expect(normaliserRgpd({ consentementObtenu: false, consentementDate: '2026-08-12' }).consentementDate).toBe('');
  });

  it('conserve la date quand le consentement a été obtenu', () => {
    expect(normaliserRgpd({ consentementObtenu: true, consentementDate: '2026-08-12' }).consentementDate).toBe('2026-08-12');
  });

  it('complète les champs manquants sans jamais présumer un droit expliqué', () => {
    expect(normaliserRgpd({ consentementObtenu: true })).toEqual({
      consentementObtenu: true, droitAcces: false, droitRectification: false, droitEffacement: false,
      methodeConsentement: 'oral_note', consentementDate: '',
    });
  });
});

describe('avecConsentement', () => {
  it('pose la date du jour en cochant, et l’efface en décochant', () => {
    const coche = avecConsentement(rgpdParDefaut(), true, '2026-09-13');
    expect(coche).toMatchObject({ consentementObtenu: true, consentementDate: '2026-09-13' });
    expect(avecConsentement(coche, false, '2026-09-14')).toMatchObject({ consentementObtenu: false, consentementDate: '' });
  });

  it('ne réécrit pas une date de recueil déjà connue', () => {
    const rgpd = { ...rgpdParDefaut(), consentementDate: '2026-01-05' };
    expect(avecConsentement(rgpd, true, '2026-09-13').consentementDate).toBe('2026-01-05');
  });
});

describe('consentementDepuisCellule (import Excel)', () => {
  it('accepte « Oui » quelle que soit la casse ou les espaces', () => {
    for (const v of ['Oui', 'oui', 'OUI', '  Oui  ']) expect(consentementDepuisCellule(v)).toBe(true);
  });

  it('refuse tout le reste', () => {
    for (const v of ['', 'Non', 'non', 'x', 'O', 'yes', 'oui ?', null, undefined, true, 1]) {
      expect(consentementDepuisCellule(v)).toBe(false);
    }
  });
});

describe('rgpdDeclareAImport', () => {
  it('marque le consentement comme déclaré à l’import, sans inventer de droits expliqués', () => {
    expect(rgpdDeclareAImport('2026-09-13')).toEqual({
      consentementObtenu: true, droitAcces: false, droitRectification: false, droitEffacement: false,
      methodeConsentement: 'declare_import', consentementDate: '2026-09-13',
    });
  });
});
