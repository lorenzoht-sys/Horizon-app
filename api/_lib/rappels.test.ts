import { describe, it, expect } from 'vitest';
import {
  PREFS_PAR_DEFAUT,
  resoudrePrefs,
  dateHeureParisVersUTC,
  seanceDansLaFenetreDeRappel,
  doitRelancerExercices,
} from './rappels.js';

describe('resoudrePrefs', () => {
  it('retourne les défauts si rien n\'est configuré', () => {
    expect(resoudrePrefs(undefined, undefined)).toEqual(PREFS_PAR_DEFAUT);
  });

  it('utilise les réglages globaux du praticien si pas de surcharge patient', () => {
    const global = { rappel_seance_actif: false, rappel_seance_delai_heures: 4, relance_exercices_actif: true, relance_exercices_seuil_jours: 5 };
    expect(resoudrePrefs(undefined, global)).toEqual({
      rappelSeanceActif: false,
      rappelSeanceDelaiHeures: 4,
      relanceExercicesActif: true,
      relanceExercicesSeuilJours: 5,
    });
  });

  it('la surcharge patient prend le dessus sur le global', () => {
    const global = { rappel_seance_actif: true, rappel_seance_delai_heures: 2, relance_exercices_actif: true, relance_exercices_seuil_jours: 3 };
    const parPatient = { rappel_seance_delai_heures: 12 };
    expect(resoudrePrefs(parPatient, global)).toEqual({
      rappelSeanceActif: true,
      rappelSeanceDelaiHeures: 12,
      relanceExercicesActif: true,
      relanceExercicesSeuilJours: 3,
    });
  });
});

describe('dateHeureParisVersUTC', () => {
  it('convertit une heure d\'hiver (CET, UTC+1)', () => {
    // 15 janvier 2026, 10:00 Europe/Paris == 09:00 UTC
    const date = dateHeureParisVersUTC('2026-01-15', '10:00');
    expect(date.toISOString()).toBe('2026-01-15T09:00:00.000Z');
  });

  it('convertit une heure d\'été (CEST, UTC+2)', () => {
    // 15 juillet 2026, 10:00 Europe/Paris == 08:00 UTC
    const date = dateHeureParisVersUTC('2026-07-15', '10:00');
    expect(date.toISOString()).toBe('2026-07-15T08:00:00.000Z');
  });

  it('accepte une heure au format HH:MM:SS', () => {
    const date = dateHeureParisVersUTC('2026-07-15', '10:00:00');
    expect(date.toISOString()).toBe('2026-07-15T08:00:00.000Z');
  });
});

describe('seanceDansLaFenetreDeRappel', () => {
  const maintenant = new Date('2026-07-15T08:00:00.000Z');

  it('rappelle si la séance est dans la fenêtre (ex: 1h avant, délai 2h)', () => {
    const seance = new Date('2026-07-15T09:00:00.000Z');
    expect(seanceDansLaFenetreDeRappel(maintenant, seance, PREFS_PAR_DEFAUT)).toBe(true);
  });

  it('ne rappelle pas si la séance est trop loin (ex: 3h, délai 2h)', () => {
    const seance = new Date('2026-07-15T11:00:00.000Z');
    expect(seanceDansLaFenetreDeRappel(maintenant, seance, PREFS_PAR_DEFAUT)).toBe(false);
  });

  it('ne rappelle pas si la séance est déjà passée', () => {
    const seance = new Date('2026-07-15T07:00:00.000Z');
    expect(seanceDansLaFenetreDeRappel(maintenant, seance, PREFS_PAR_DEFAUT)).toBe(false);
  });

  it('ne rappelle pas si le rappel de séance est désactivé', () => {
    const seance = new Date('2026-07-15T09:00:00.000Z');
    const prefs = { ...PREFS_PAR_DEFAUT, rappelSeanceActif: false };
    expect(seanceDansLaFenetreDeRappel(maintenant, seance, prefs)).toBe(false);
  });
});

describe('doitRelancerExercices', () => {
  const maintenant = new Date('2026-07-15T08:00:00.000Z');

  it('relance si inactif depuis plus que le seuil et jamais relancé', () => {
    const derniereActivite = new Date('2026-07-10T08:00:00.000Z'); // 5 jours, seuil 3j
    expect(doitRelancerExercices(maintenant, derniereActivite, null, PREFS_PAR_DEFAUT)).toBe(true);
  });

  it('ne relance pas si inactif depuis moins que le seuil', () => {
    const derniereActivite = new Date('2026-07-14T08:00:00.000Z'); // 1 jour, seuil 3j
    expect(doitRelancerExercices(maintenant, derniereActivite, null, PREFS_PAR_DEFAUT)).toBe(false);
  });

  it('ne relance pas deux fois dans la même fenêtre (anti-harcèlement)', () => {
    const derniereActivite = new Date('2026-07-01T08:00:00.000Z'); // largement inactif
    const derniereRelance = new Date('2026-07-14T08:00:00.000Z'); // relancé il y a 1 jour, seuil 3j
    expect(doitRelancerExercices(maintenant, derniereActivite, derniereRelance, PREFS_PAR_DEFAUT)).toBe(false);
  });

  it('relance à nouveau si la dernière relance date de plus que le seuil', () => {
    const derniereActivite = new Date('2026-07-01T08:00:00.000Z');
    const derniereRelance = new Date('2026-07-10T08:00:00.000Z'); // relancé il y a 5 jours, seuil 3j
    expect(doitRelancerExercices(maintenant, derniereActivite, derniereRelance, PREFS_PAR_DEFAUT)).toBe(true);
  });

  it('ne relance pas si la relance exercices est désactivée', () => {
    const derniereActivite = new Date('2026-07-01T08:00:00.000Z');
    const prefs = { ...PREFS_PAR_DEFAUT, relanceExercicesActif: false };
    expect(doitRelancerExercices(maintenant, derniereActivite, null, prefs)).toBe(false);
  });
});
