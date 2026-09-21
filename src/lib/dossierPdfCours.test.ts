import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import DossierPDF, { type DossierPDFProps } from '../components/export/DossierPDF';
import { syntheseCoursRealises, libelleSyntheseCours, type EntreeCours } from './coursCollectifs';
import type { CoursCollectif, ParticipationCoursCollectif, Participant } from '../types';

// Section « Cours collectifs » du dossier PDF (PR 5). Le PDF n'est pas dessiné ici : on parcourt
// l'arbre de rendu du composant et on en tire tout le texte, ce qui suffit à vérifier CE QUI est
// imprimé. Un rendu réel (plus bas) vérifie en plus qu'un vrai PDF sort, y compris avec une note
// très longue.

const PARTICIPANT = { id: 'p1', prenom: 'Camille', nom: 'Martin', bilans: [], dateNaissance: '1950-01-01' } as unknown as Participant;
const SETTINGS = { prenom: 'Pierre', nom: 'Durand', email: 'p@d.fr', telephone: '0600000000' };

function texteDe(noeud: unknown): string {
  const morceaux: string[] = [];
  const visiter = (n: unknown): void => {
    if (n == null || typeof n === 'boolean') return;
    if (typeof n === 'string' || typeof n === 'number') { morceaux.push(String(n)); return; }
    if (Array.isArray(n)) { n.forEach(visiter); return; }
    const el = n as { type?: unknown; props?: { children?: unknown } };
    if (typeof el.type === 'function') { visiter((el.type as (p: unknown) => unknown)(el.props)); return; }
    visiter(el.props?.children);
  };
  visiter(noeud);
  return morceaux.join(' ');
}

function entree(id: string, cours: Partial<CoursCollectif> = {}, participation: Partial<ParticipationCoursCollectif> = {}): EntreeCours {
  return {
    cours: {
      id: `c-${id}`, praticienId: 'pr1', titre: `Cours ${id}`, date: '2026-09-10', heureDebut: '10:00', dureeMinutes: 45,
      modeFacturation: 'individuel', statut: 'realise', createdAt: '', ...cours,
    },
    participation: {
      id: `pc-${id}`, coursId: `c-${id}`, participantId: 'p1', statutPresence: 'present', createdAt: '', ...participation,
    },
  };
}

function dossier(mode: 'praticien' | 'patient', coursRealises?: EntreeCours[]): DossierPDFProps {
  return { participant: PARTICIPANT, bilans: [], contratActif: null, programmeActif: null, compteRendus: [], settings: SETTINGS, mode, coursRealises };
}
const texteDuDossier = (p: DossierPDFProps) => texteDe((DossierPDF as unknown as (p: DossierPDFProps) => unknown)(p));

describe('syntheseCoursRealises — assiduité sur les cours RÉALISÉS', () => {
  it('compte présent, absent, excusé', () => {
    const s = syntheseCoursRealises([
      entree('1', {}, { statutPresence: 'present' }), entree('2', {}, { statutPresence: 'present' }),
      entree('3', {}, { statutPresence: 'absent' }), entree('4', {}, { statutPresence: 'excuse' }),
    ]);
    expect(s).toEqual({ realises: 4, presents: 2, absents: 1, excuses: 1 });
  });

  // statut_presence vaut « present » PAR DÉFAUT dès l'inscription : un cours à venir ou annulé ne doit
  // ni gonfler ni diluer le décompte.
  it('ignore les cours à venir et annulés, malgré leur « present » par défaut', () => {
    const s = syntheseCoursRealises([
      entree('1', { statut: 'realise' }, { statutPresence: 'present' }),
      entree('2', { statut: 'planifie' }, { statutPresence: 'present' }),
      entree('3', { statut: 'annule' }, { statutPresence: 'present' }),
    ]);
    expect(s).toEqual({ realises: 1, presents: 1, absents: 0, excuses: 0 });
  });

  it('libellé : accords, zéros omis, vide sans cours réalisé', () => {
    expect(libelleSyntheseCours({ realises: 10, presents: 8, absents: 1, excuses: 1 })).toBe('Présent à 8 cours sur 10 réalisés · 1 absence · 1 excusé');
    expect(libelleSyntheseCours({ realises: 1, presents: 1, absents: 0, excuses: 0 })).toBe('Présent à 1 cours sur 1 réalisé');
    expect(libelleSyntheseCours({ realises: 5, presents: 2, absents: 2, excuses: 1 })).toBe('Présent à 2 cours sur 5 réalisés · 2 absences · 1 excusé');
    expect(libelleSyntheseCours({ realises: 0, presents: 0, absents: 0, excuses: 0 })).toBe('');
    expect(libelleSyntheseCours(syntheseCoursRealises([]))).toBe('');
  });
});

describe('dossier PDF praticien — section « Cours collectifs »', () => {
  const e1 = entree('A', { titre: 'Gym douce', date: '2026-09-10' }, { statutPresence: 'present', ressentiBorg: 6, ressentiBienetre: 2, notes: 'Douleur épaule droite.\nExercice adapté.' });
  const e2 = entree('B', { titre: 'Gym douce', date: '2026-09-03' }, { statutPresence: 'absent', notes: 'Prévenu la veille.' });

  it('imprime le titre de section, la synthèse, et pour chaque cours : date, titre, présence, effort, bien-être, note', () => {
    const t = texteDuDossier(dossier('praticien', [e1, e2]));
    expect(t).toContain('Cours collectifs (2)');
    expect(t).toContain('Assiduité');
    expect(t).toContain('Présent à 1 cours sur 2 réalisés · 1 absence');
    expect(t).toContain('10/09/2026');
    expect(t).toContain('Gym douce');
    expect(t).toContain('Présent · effort modéré · bien-être bien');
    expect(t).toContain('Absent');
    expect(t).toContain('Prévenu la veille.');
  });

  it("garde les retours à la ligne de la note", () => {
    expect(texteDuDossier(dossier('praticien', [e1]))).toContain('Douleur épaule droite.\nExercice adapté.');
  });

  it('du plus récent au plus ancien', () => {
    const t = texteDuDossier(dossier('praticien', [e2, e1]));
    expect(t.indexOf('10/09/2026')).toBeGreaterThan(-1);
    expect(t.indexOf('10/09/2026')).toBeLessThan(t.indexOf('03/09/2026'));
  });

  it("n'imprime jamais la présence ANNONCÉE par le bénéficiaire (décidé : bruit administratif dans un dossier)", () => {
    const annonce = entree('C', {}, { presenceAnnoncee: 'vient', presenceAnnonceeLe: '2026-09-01T10:00:00Z' });
    expect(texteDuDossier(dossier('praticien', [annonce]))).not.toMatch(/annonc/i);
  });

  it('retire les émojis (carré vide sous Helvetica) du titre et de la note', () => {
    const t = texteDuDossier(dossier('praticien', [entree('D', { titre: '🎉 Gym douce' }, { notes: '😓 Fatigue en fin de séance ✓' })]));
    expect(t).toContain('Gym douce');
    expect(t).toContain('Fatigue en fin de séance');
    expect(t).not.toMatch(/[\u{1F000}-\u{1FFFF}\u{2190}-\u{2BFF}]/u);
  });
});

describe('dossier PDF — ce qui n\'y entre JAMAIS', () => {
  const note = 'NOTE-INTERNE-SECRETE';

  it('carte santé du bénéficiaire (mode patient) : aucun cours, même si on lui en passait', () => {
    const t = texteDuDossier(dossier('patient', [entree('A', { titre: 'Gym douce' }, { notes: note })]));
    expect(t).not.toContain('Cours collectifs');
    expect(t).not.toContain('Gym douce');
    expect(t).not.toContain(note);
  });

  it('sans cours (champ absent ou liste vide) : pas de section', () => {
    expect(texteDuDossier(dossier('praticien'))).not.toContain('Cours collectifs');
    expect(texteDuDossier(dossier('praticien', []))).not.toContain('Cours collectifs');
  });

  it('un cours à venir ou annulé : ni titre, ni note, ni présence, et pas de section s\'il n\'y a que ceux-là', () => {
    const seuls = [
      entree('P', { statut: 'planifie', titre: 'A venir' }, { notes: note }),
      entree('N', { statut: 'annule', titre: 'Annule' }, { notes: note }),
    ];
    const t = texteDuDossier(dossier('praticien', seuls));
    expect(t).not.toContain('Cours collectifs');
    expect(t).not.toContain(note);
  });

  it('un cours à venir mêlé à des cours réalisés n\'apparaît pas et ne fausse pas la synthèse', () => {
    const t = texteDuDossier(dossier('praticien', [
      entree('R', { statut: 'realise', titre: 'Fait' }),
      entree('P', { statut: 'planifie', titre: 'A venir' }, { notes: note }),
    ]));
    expect(t).toContain('Fait');
    expect(t).toContain('Présent à 1 cours sur 1 réalisé');
    expect(t).not.toContain('A venir');
    expect(t).not.toContain(note);
  });

  // La note d'une participation est celle d'UNE personne : elle ne doit jamais atterrir dans le dossier
  // d'une autre, même si l'appelant se trompe de liste.
  it("la participation d'un AUTRE bénéficiaire est ignorée (isolation garantie par le composant lui-même)", () => {
    const autre = entree('X', { titre: 'Cours de groupe' }, { participantId: 'autre-beneficiaire', notes: note });
    const t = texteDuDossier(dossier('praticien', [autre]));
    expect(t).not.toContain(note);
    expect(t).not.toContain('Cours collectifs');
    const mixte = texteDuDossier(dossier('praticien', [autre, entree('M', { titre: 'Le mien' })]));
    expect(mixte).not.toContain(note);
    expect(mixte).toContain('Le mien');
    expect(mixte).toContain('Cours collectifs (1)');
  });
});

describe('dossier PDF — volume', () => {
  it('les 5 derniers en détail, la synthèse sur TOUS les cours réalisés', () => {
    const sept = Array.from({ length: 7 }, (_, i) => entree(`0${i + 1}`, { titre: `Cours 0${i + 1}`, date: `2026-0${i + 1}-15` }, { statutPresence: i < 2 ? 'absent' : 'present' }));
    const t = texteDuDossier(dossier('praticien', sept));
    expect(t).toContain('Cours collectifs (5 derniers sur 7)');
    for (const garde of ['Cours 03', 'Cours 04', 'Cours 05', 'Cours 06', 'Cours 07']) expect(t).toContain(garde);
    for (const ecarte of ['Cours 01', 'Cours 02']) expect(t).not.toContain(ecarte);
    expect(t).toContain('Présent à 5 cours sur 7 réalisés · 2 absences');
  });

  it('jusqu\'à 5 cours : « (N) » sans « derniers sur »', () => {
    const t = texteDuDossier(dossier('praticien', [entree('1'), entree('2', { date: '2026-08-01' })]));
    expect(t).toContain('Cours collectifs (2)');
    expect(t).not.toContain('derniers sur');
  });
});

describe('dossier PDF — rendu réel', () => {
  it('produit un vrai PDF, même avec une note très longue, des émojis et beaucoup de cours', async () => {
    const longue = ('Observation détaillée sur la séance. '.repeat(60) + '😓\n').repeat(3);
    const cours = Array.from({ length: 12 }, (_, i) => entree(`${i}`, { titre: `Cours ${i} 🎉`, date: `2026-01-${String(i + 1).padStart(2, '0')}` }, { notes: i === 0 ? longue : 'Note courte.' }));
    const buf = await renderToBuffer(React.createElement(DossierPDF as never, dossier('praticien', cours)) as never);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(3000);
  }, 60000);

  it('le mode patient produit aussi un PDF valide, sans cours', async () => {
    const buf = await renderToBuffer(React.createElement(DossierPDF as never, dossier('patient')) as never);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  }, 60000);
});
