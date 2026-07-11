import { describe, it, expect } from 'vitest';
import { filtrerLogsHistorique, regrouperLogsParBeneficiaire, type LogHistorique } from './assistantHistorique';

function log(overrides: Partial<LogHistorique> = {}): LogHistorique {
  return {
    id: 'l1', question: 'rédiger un compte-rendu famille', reponse: 'réponse',
    patient_id: 'p1', created_at: '2026-07-10T10:00:00Z',
    ...overrides,
  };
}

const NOMS: Record<string, string> = { p1: 'Jean Meule', p2: 'Camille Martin' };
const nomPatient = (id: string | null) => (id ? NOMS[id] ?? '' : '');

describe('filtrerLogsHistorique', () => {
  it('recherche vide : renvoie tous les logs inchangés', () => {
    const logs = [log()];
    expect(filtrerLogsHistorique(logs, '', nomPatient)).toEqual(logs);
    expect(filtrerLogsHistorique(logs, '   ', nomPatient)).toEqual(logs);
  });

  it('filtre sur le texte de la question (insensible à la casse)', () => {
    const logs = [log({ id: 'a', question: 'Vérifier les contre-indications' }), log({ id: 'b', question: 'Suggérer un programme' })];
    const res = filtrerLogsHistorique(logs, 'CONTRE-INDICATIONS', nomPatient);
    expect(res.map(l => l.id)).toEqual(['a']);
  });

  it('filtre aussi sur le nom du bénéficiaire associé (pas seulement la question)', () => {
    const logs = [
      log({ id: 'a', patient_id: 'p1', question: 'rédiger un compte-rendu' }),
      log({ id: 'b', patient_id: 'p2', question: 'rédiger un compte-rendu' }),
    ];
    const res = filtrerLogsHistorique(logs, 'meule', nomPatient);
    expect(res.map(l => l.id)).toEqual(['a']);
  });

  it('un log sans bénéficiaire ne fait pas planter la recherche par nom', () => {
    const logs = [log({ id: 'a', patient_id: null })];
    expect(() => filtrerLogsHistorique(logs, 'meule', nomPatient)).not.toThrow();
    expect(filtrerLogsHistorique(logs, 'meule', nomPatient)).toEqual([]);
  });
});

describe('regrouperLogsParBeneficiaire', () => {
  it('regroupe par bénéficiaire, triés par dernière activité décroissante', () => {
    const logs = [
      log({ id: 'old', patient_id: 'p1', created_at: '2026-07-01T10:00:00Z' }),
      log({ id: 'recent', patient_id: 'p2', question: 'autre question', created_at: '2026-07-10T10:00:00Z' }),
    ];
    const groupes = regrouperLogsParBeneficiaire(logs);
    expect(groupes.map(g => g.patientId)).toEqual(['p2', 'p1']);
  });

  it('regroupe les entrées de même question (régénérations) en un seul fil, triées de la plus récente à la plus ancienne', () => {
    const logs = [
      log({ id: 'v1', created_at: '2026-07-10T10:00:00Z' }),
      log({ id: 'v2', created_at: '2026-07-10T10:05:00Z' }), // régénération
      log({ id: 'v3', created_at: '2026-07-10T10:10:00Z' }), // 2e régénération
    ];
    const groupes = regrouperLogsParBeneficiaire(logs);
    expect(groupes).toHaveLength(1);
    expect(groupes[0].fils).toHaveLength(1);
    expect(groupes[0].fils[0].entries.map(e => e.id)).toEqual(['v3', 'v2', 'v1']);
  });

  it('deux questions différentes pour le même bénéficiaire donnent deux fils distincts', () => {
    const logs = [
      log({ id: 'a', question: 'question A', created_at: '2026-07-10T10:00:00Z' }),
      log({ id: 'b', question: 'question B', created_at: '2026-07-10T11:00:00Z' }),
    ];
    const groupes = regrouperLogsParBeneficiaire(logs);
    expect(groupes[0].fils).toHaveLength(2);
    // Triés par dernière activité décroissante : "question B" (11h) avant "question A" (10h)
    expect(groupes[0].fils.map(f => f.question)).toEqual(['question B', 'question A']);
  });

  it('un patient_id null (question posée sans bénéficiaire sélectionné) forme son propre groupe', () => {
    const logs = [log({ id: 'a', patient_id: null })];
    const groupes = regrouperLogsParBeneficiaire(logs);
    expect(groupes).toHaveLength(1);
    expect(groupes[0].patientId).toBeNull();
  });

  it('liste vide : aucun groupe', () => {
    expect(regrouperLogsParBeneficiaire([])).toEqual([]);
  });
});
