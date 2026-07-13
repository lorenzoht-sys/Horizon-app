// Vérifie le dictionnaire de reformulation bienveillante : aucun terme
// dévalorisant ("faible", "insuffisant", "réduit", "limité", "mauvais") ne
// doit apparaître dans un libellé destiné au bénéficiaire, quelle que soit
// la catégorie ou le profil.
import { describe, it, expect } from 'vitest';
import {
  libelleNoteBienveillant,
  libelleCategorieBilan,
  libelleSedentariteBeneficiaire,
  libelleFatigueBeneficiaire,
  libelleBorgBeneficiaire,
} from './formulationBienveillante';
import type { NotesBilan } from '../types';

const TERMES_DEVALORISANTS = /faible|insuffisant|réduit|limité|mauvais/i;

const CATEGORIES: (keyof NotesBilan)[] = ['equilibre', 'force', 'handGrip', 'mobilite', 'souplesse', 'endurance', 'memoire'];
const NOTES = [1, 2, 3, 4, 5] as const;

describe('libelleNoteBienveillant', () => {
  for (const categorie of CATEGORIES) {
    for (const note of NOTES) {
      it(`${categorie}/${note} ne contient aucun terme dévalorisant`, () => {
        expect(libelleNoteBienveillant(categorie, note)).not.toMatch(TERMES_DEVALORISANTS);
      });
    }
  }

  it('note basse (1-2) pointe vers le développement, pas un jugement d\'état', () => {
    expect(libelleNoteBienveillant('force', 1)).toBe('Force à développer');
    expect(libelleNoteBienveillant('force', 2)).toBe('Force à développer');
    expect(libelleNoteBienveillant('equilibre', 1)).toBe('Équilibre à consolider');
  });

  it('note moyenne (3) est neutre', () => {
    expect(libelleNoteBienveillant('mobilite', 3)).toBe('En progression');
  });

  it('notes hautes (4-5) restent positives', () => {
    expect(libelleNoteBienveillant('endurance', 4)).toBe('Bon niveau');
    expect(libelleNoteBienveillant('endurance', 5)).toBe('Excellent niveau');
  });
});

describe('libelleCategorieBilan', () => {
  it('fournit un libellé lisible pour chaque catégorie', () => {
    for (const categorie of CATEGORIES) {
      expect(libelleCategorieBilan(categorie).length).toBeGreaterThan(0);
    }
  });
});

describe('libelleSedentariteBeneficiaire', () => {
  it('reformule le profil "inactif" sans le mot faible', () => {
    const l = libelleSedentariteBeneficiaire('inactif');
    expect(l.label).not.toMatch(TERMES_DEVALORISANTS);
    expect(l.label).toBe('Marge de progression');
  });

  it('laisse les profils actif/tres_actif déjà positifs', () => {
    expect(libelleSedentariteBeneficiaire('actif').label).toBe('Modéré');
    expect(libelleSedentariteBeneficiaire('tres_actif').label).toBe('Élevé');
  });
});

describe('libelleFatigueBeneficiaire', () => {
  it('ne contient aucun terme dévalorisant, quel que soit le profil', () => {
    expect(libelleFatigueBeneficiaire('pas_de_fatigue').label).not.toMatch(TERMES_DEVALORISANTS);
    expect(libelleFatigueBeneficiaire('fatigue_probable').label).not.toMatch(TERMES_DEVALORISANTS);
  });
});

describe('libelleBorgBeneficiaire', () => {
  it('remplace "Effort faible" par "Effort léger", sans changer les seuils cliniques', () => {
    expect(libelleBorgBeneficiaire(11)).toBe('Effort léger');
    expect(libelleBorgBeneficiaire(12)).not.toMatch(TERMES_DEVALORISANTS);
    expect(libelleBorgBeneficiaire(20)).toBe('Effort maximal');
  });
});
