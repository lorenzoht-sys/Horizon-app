import { describe, it, expect } from 'vitest';
import { estArchive, filtrerParNom, separerParArchivage } from './archivage';

const p = (id: string, archive?: boolean, prenom = 'A', nom = 'B') => ({ id, archive, prenom, nom });

describe('séparation actifs / archivés', () => {
  it('chaque bénéficiaire est dans exactement une liste, aucun perdu', () => {
    const tous = [p('1', false), p('2', true), p('3'), p('4', true), p('5', false)];
    const { actifs, archives } = separerParArchivage(tous);
    expect(actifs.map(x => x.id)).toEqual(['1', '3', '5']);
    expect(archives.map(x => x.id)).toEqual(['2', '4']);
    expect(actifs.length + archives.length).toBe(tous.length);
  });

  it('champ absent ou null = actif (comme NOT NULL DEFAULT false)', () => {
    expect(estArchive({})).toBe(false);
    expect(estArchive({ archive: undefined })).toBe(false);
    expect(estArchive({ archive: null })).toBe(false);
    expect(estArchive({ archive: true })).toBe(true);
  });

  it('Test A/B — archiver puis désarchiver déplace le bénéficiaire, compteurs cohérents', () => {
    let liste = [p('1', false), p('2', false), p('3', false)];
    liste = liste.map(x => (x.id === '2' ? { ...x, archive: true } : x));
    let r = separerParArchivage(liste);
    expect([r.actifs.length, r.archives.length]).toEqual([2, 1]);
    expect(r.archives[0].id).toBe('2');

    liste = liste.map(x => (x.id === '2' ? { ...x, archive: false } : x));
    r = separerParArchivage(liste);
    expect([r.actifs.length, r.archives.length]).toEqual([3, 0]);
  });

  it('exemple du cahier : 25 dans l\'historique, 10 archivés → 15 actifs / 10 archivés', () => {
    const tous = Array.from({ length: 25 }, (_, i) => p(String(i), i < 10));
    const { actifs, archives } = separerParArchivage(tous);
    expect([actifs.length, archives.length]).toEqual([15, 10]);
  });

  it('ne modifie pas la liste d\'origine', () => {
    const tous = [p('1', true), p('2', false)];
    separerParArchivage(tous);
    expect(tous.map(x => x.id)).toEqual(['1', '2']);
  });
});

describe('recherche par nom', () => {
  const liste = [p('1', false, 'Jean', 'Dupont'), p('2', true, 'Marie', 'Durand')];
  it('insensible à la casse, sur prénom + nom', () => {
    expect(filtrerParNom(liste, 'DUP').map(x => x.id)).toEqual(['1']);
    expect(filtrerParNom(liste, 'marie d').map(x => x.id)).toEqual(['2']);
  });
  it('recherche vide = tout', () => {
    expect(filtrerParNom(liste, '  ')).toHaveLength(2);
  });
});
