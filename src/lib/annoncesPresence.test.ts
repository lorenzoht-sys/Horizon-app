import { describe, it, expect } from 'vitest';
import { resumeAnnonces, libelleResumeAnnonces, libelleCompactAnnonces } from './coursCollectifs';
import { dbToParticipationCoursCollectif, participationCoursCollectifToDb } from './mappers';
import type { PresenceAnnoncee } from '../types';

// Présence ANNONCÉE par le bénéficiaire avant un cours (vue praticien). Trois états :
// « vient », « ne vient pas », et « sans réponse » — c'est ce dernier qui permet de
// repérer les indécis à relancer.
const p = (presenceAnnoncee?: PresenceAnnoncee) => ({ presenceAnnoncee });

describe('resumeAnnonces', () => {
  it('compte les trois états, dont « sans réponse »', () => {
    const r = resumeAnnonces([p('vient'), p('vient'), p('ne_vient_pas'), p(), p()]);
    expect(r).toEqual({ vient: 2, neVientPas: 1, sansReponse: 2, total: 5 });
  });

  it('personne n\'a répondu : tout le monde est « sans réponse »', () => {
    expect(resumeAnnonces([p(), p(), p()])).toEqual({ vient: 0, neVientPas: 0, sansReponse: 3, total: 3 });
  });

  it('un cours sans participant : tout à zéro', () => {
    expect(resumeAnnonces([])).toEqual({ vient: 0, neVientPas: 0, sansReponse: 0, total: 0 });
  });

  it('une valeur inconnue compte comme « sans réponse », jamais comme « vient »', () => {
    const inconnu = { presenceAnnoncee: 'peut-etre' as unknown as PresenceAnnoncee };
    expect(resumeAnnonces([inconnu])).toEqual({ vient: 0, neVientPas: 0, sansReponse: 1, total: 1 });
  });
});

describe('libellés du résumé', () => {
  it('accorde au singulier et au pluriel', () => {
    expect(libelleResumeAnnonces(resumeAnnonces([p('vient')]))).toBe('1 vient');
    expect(libelleResumeAnnonces(resumeAnnonces([p('vient'), p('vient')]))).toBe('2 viennent');
    expect(libelleResumeAnnonces(resumeAnnonces([p('ne_vient_pas')]))).toBe('1 ne vient pas');
    expect(libelleResumeAnnonces(resumeAnnonces([p('ne_vient_pas'), p('ne_vient_pas')]))).toBe('2 ne viennent pas');
  });

  it('les trois états ensemble, les zéros omis', () => {
    expect(libelleResumeAnnonces(resumeAnnonces([p('vient'), p('vient'), p('ne_vient_pas'), p(), p()]))).toBe('2 viennent · 1 ne vient pas · 2 sans réponse');
    expect(libelleResumeAnnonces(resumeAnnonces([p('vient'), p()]))).toBe('1 vient · 1 sans réponse');
  });

  it('aucun participant : chaîne vide', () => {
    expect(libelleResumeAnnonces(resumeAnnonces([]))).toBe('');
  });

  it('forme compacte pour le calendrier', () => {
    expect(libelleCompactAnnonces(resumeAnnonces([p('vient'), p('vient'), p('ne_vient_pas'), p(), p()]))).toBe('✓2 ✗1 ?2');
    expect(libelleCompactAnnonces(resumeAnnonces([p('vient')]))).toBe('✓1');
    expect(libelleCompactAnnonces(resumeAnnonces([]))).toBe('');
  });
});

describe('participation à un cours : présence annoncée', () => {
  const ligne = {
    id: 'p1', cours_id: 'c1', participant_id: 'u1', statut_presence: 'present',
    programme_individuel_id: null, ressenti_borg: null, ressenti_bienetre: null, notes: null,
    created_at: '2026-09-21T10:00:00Z',
  };

  it('lit la réponse et son horodatage', () => {
    const r = dbToParticipationCoursCollectif({ ...ligne, presence_annoncee: 'vient', presence_annoncee_le: '2026-09-21T18:55:23Z' });
    expect(r.presenceAnnoncee).toBe('vient');
    expect(r.presenceAnnonceeLe).toBe('2026-09-21T18:55:23Z');
  });

  it('NULL en base, colonne absente ou valeur inconnue : pas de réponse (undefined)', () => {
    expect(dbToParticipationCoursCollectif({ ...ligne, presence_annoncee: null, presence_annoncee_le: null }).presenceAnnoncee).toBeUndefined();
    expect(dbToParticipationCoursCollectif(ligne).presenceAnnoncee).toBeUndefined();
    expect(dbToParticipationCoursCollectif({ ...ligne, presence_annoncee: 'peut-etre' }).presenceAnnoncee).toBeUndefined();
  });

  it('la présence annoncée est distincte de la présence constatée', () => {
    const r = dbToParticipationCoursCollectif({ ...ligne, statut_presence: 'absent', presence_annoncee: 'vient' });
    expect(r.statutPresence).toBe('absent');
    expect(r.presenceAnnoncee).toBe('vient');
  });

  // Champ écrit UNIQUEMENT par la route patient (décision : le praticien ne saisit pas
  // une annonce à la place du bénéficiaire). Le mapper d'écriture ne doit jamais l'émettre,
  // sinon la création d'un cours ou une mise à jour de présence pourrait l'écraser.
  it("le mapper d'écriture n'émet JAMAIS la présence annoncée, même si l'objet la porte", () => {
    const db = participationCoursCollectifToDb({
      id: 'p1', coursId: 'c1', participantId: 'u1', statutPresence: 'present',
      presenceAnnoncee: 'vient', presenceAnnonceeLe: '2026-09-21T18:55:23Z',
    });
    expect(Object.keys(db)).not.toContain('presence_annoncee');
    expect(Object.keys(db)).not.toContain('presence_annoncee_le');
  });
});
