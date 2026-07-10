import { describe, it, expect } from 'vitest';
import type { Contrat } from '../types';
import {
  formatContratContexte,
  formatProgrammeContexte, formatExerciceV1Ligne, formatExerciceV2Ligne, type ProgrammeResume,
  formatStructureContexte,
  calculerPlanningReel, formatPlanningReelContexte,
  formatDicteesContexte,
  formatNotesManuellesContexte,
} from './assistantContexte';

function contrat(overrides: Partial<Contrat> = {}): Contrat {
  return {
    id: 'c1',
    participantId: 'p1',
    dateDebut: '2026-01-05',
    dateFin: '2026-07-05',
    nbSeancesSemaine: 2,
    heureDebut: '10:00',
    dureeMinutes: 45,
    dureesSeances: [45, 45],
    statut: 'actif',
    dateCreation: '2026-01-01',
    nombreSeancesTotal: 24,
    nombreSeancesRealisees: 10,
    ...overrides,
  };
}

describe('formatContratContexte', () => {
  it('absent : texte informatif, jamais un stub', () => {
    const texte = formatContratContexte(null);
    expect(texte).not.toBe('');
    expect(texte.toLowerCase()).not.toBe('contrat: aucun');
    expect(texte).toContain('Aucun contrat');
  });

  it('contrat actif : inclut statut, dates, progression, sans alerte', () => {
    const texte = formatContratContexte(contrat());
    expect(texte).toContain('Statut : Actif');
    expect(texte).toContain('45 min, 2 séances/semaine');
    expect(texte).toContain('10/24 séances réalisées');
    expect(texte).not.toContain('⚠️');
  });

  it('contrat terminé : mis en évidence avec une alerte explicite', () => {
    const texte = formatContratContexte(contrat({ statut: 'termine' }));
    expect(texte).toContain('Statut : Terminé');
    expect(texte).toContain('⚠️ CONTRAT TERMINÉ');
  });

  it('contrat suspendu : mis en évidence avec une alerte explicite', () => {
    const texte = formatContratContexte(contrat({ statut: 'suspendu' }));
    expect(texte).toContain('⚠️ CONTRAT SUSPENDU');
  });
});

describe('formatProgrammeContexte', () => {
  it('absent : texte informatif, jamais un stub "programme: aucun"', () => {
    const texte = formatProgrammeContexte(null);
    expect(texte).not.toBe('');
    expect(texte.toLowerCase()).not.toBe('programme: aucun');
    expect(texte).toContain('Aucun programme actif');
  });

  it('programme présent : inclut titre, objectif, message, exercices', () => {
    const prog: ProgrammeResume = {
      titre: 'Renforcement bas du corps',
      objectif: 'Améliorer équilibre',
      messageMotivation: 'Courage Camille !',
      lignesExercices: ['Squats — 3 séries, 12 rép., 3x/semaine'],
    };
    const texte = formatProgrammeContexte(prog);
    expect(texte).toContain('Titre : Renforcement bas du corps');
    expect(texte).toContain('Objectif : Améliorer équilibre');
    expect(texte).toContain('Message de motivation : Courage Camille !');
    expect(texte).toContain('Squats — 3 séries, 12 rép., 3x/semaine');
  });

  it('programme sans exercice : le signale explicitement', () => {
    const texte = formatProgrammeContexte({ titre: 'Vide', objectif: null, messageMotivation: null, lignesExercices: [] });
    expect(texte).toContain('Aucun exercice renseigné');
  });
});

describe('formatExerciceV1Ligne / formatExerciceV2Ligne', () => {
  it('V1 : combine niveau, séries, répétitions, durée, fréquence', () => {
    const ligne = formatExerciceV1Ligne('Squats', { niveau: 'intermediaire', series: 3, repetitions: 12, dureeSecondes: null, frequenceParSemaine: [1, 3, 5] });
    expect(ligne).toBe('Squats — intermédiaire, 3 séries, 12 rép., 3x/semaine');
  });

  it('V1 : nom seul si aucun détail', () => {
    expect(formatExerciceV1Ligne('Marche', {})).toBe('Marche');
  });

  it('V2 : combine séries/répétitions/durée + jours de la séance', () => {
    const ligne = formatExerciceV2Ligne({ nom: 'Fentes', series: 3, repetitions: 10 }, ['lundi', 'jeudi']);
    expect(ligne).toBe('Fentes — 3 séries, 10 rép., lundi/jeudi');
  });
});

describe('formatStructureContexte', () => {
  it('absent : chaîne vide (section optionnelle)', () => {
    expect(formatStructureContexte(null)).toBe('');
  });

  it('présent : nom + type lisible', () => {
    expect(formatStructureContexte({ nom: 'EHPAD Les Tilleuls', type: 'ehpad' })).toBe('Rattaché à la structure : EHPAD Les Tilleuls (EHPAD)');
  });
});

describe('calculerPlanningReel / formatPlanningReelContexte', () => {
  const now = new Date('2026-07-10T12:00:00');

  it('aucune séance dans la fenêtre : total à 0, formatage vide', () => {
    const resume = calculerPlanningReel([], now, 90);
    expect(resume.total).toBe(0);
    expect(formatPlanningReelContexte(resume)).toBe('');
  });

  it('calcule réalisées/annulées/taux de présence et les 3 dernières annulations', () => {
    const seances = [
      { date: '2026-07-08', statut: 'realisee' as const },
      { date: '2026-07-01', statut: 'realisee' as const },
      { date: '2026-06-24', statut: 'annulee' as const, motifAnnulation: 'maladie' as const },
      { date: '2026-06-17', statut: 'annulee' as const, motifAnnulation: 'transport' as const },
      { date: '2026-07-15', statut: 'planifiee' as const }, // future, hors fenêtre passée
      { date: '2025-01-01', statut: 'realisee' as const },  // hors fenêtre 90j
    ];
    const resume = calculerPlanningReel(seances, now, 90);
    expect(resume.realisees).toBe(2);
    expect(resume.annulees).toBe(2);
    expect(resume.tauxPresence).toBe(50);
    expect(resume.dernieresAnnulations.map(a => a.motif)).toEqual(['maladie', 'transport']);

    const texte = formatPlanningReelContexte(resume);
    expect(texte).toContain('2 réalisées / 2 annulées (maladie, transport) / 4 total');
    expect(texte).toContain('Taux de présence aux séances planifiées : 50%');
  });
});

describe('formatDicteesContexte', () => {
  it('absent : message explicite (comportement existant conservé)', () => {
    expect(formatDicteesContexte([])).toBe('Aucune séance dictée');
  });

  it('inclut points d\'attention et douleurs signalées quand présents', () => {
    const texte = formatDicteesContexte([
      { dateSeance: '2026-07-10', observations: 'RAS', progression: 'en progrès', pointsAttention: 'Surveiller le genou', douleursSignalees: 'Épaule droite' },
    ]);
    expect(texte).toContain('2026-07-10 [en progrès] : RAS');
    expect(texte).toContain("douleur signalée : Épaule droite");
    expect(texte).toContain("point d'attention : Surveiller le genou");
  });

  it('sans alerte : pas de suffixe ⚠️', () => {
    const texte = formatDicteesContexte([{ dateSeance: '2026-07-10', observations: 'RAS', progression: null }]);
    expect(texte).not.toContain('⚠️');
  });
});

describe('formatNotesManuellesContexte', () => {
  it('absent : chaîne vide (section optionnelle)', () => {
    expect(formatNotesManuellesContexte([])).toBe('');
  });

  it('inclut ressenti, douleur EVA et alertes actives', () => {
    const texte = formatNotesManuellesContexte([{
      date: '2026-07-06',
      ressenti: 'difficile',
      note: 'Patient fatigué',
      alertes: { douleurSignalee: false, fatiguePlusQueHabitude: true, progressionNotable: false, pointARevoir: true },
      douleurEVA: 4,
    }]);
    expect(texte).toContain('ressenti : difficile');
    expect(texte).toContain('douleur EVA 4/10');
    expect(texte).toContain("alertes : fatigue plus que d'habitude, point à revoir");
    expect(texte).toContain('Patient fatigué');
  });

  it('sans alerte active : ne mentionne pas "alertes :"', () => {
    const texte = formatNotesManuellesContexte([{
      date: '2026-07-03', ressenti: 'excellent', note: 'RAS',
      alertes: { douleurSignalee: false, fatiguePlusQueHabitude: false, progressionNotable: false, pointARevoir: false },
    }]);
    expect(texte).not.toContain('alertes :');
  });
});
