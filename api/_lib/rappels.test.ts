import { describe, it, expect } from 'vitest';
import {
  PREFS_PAR_DEFAUT,
  resoudrePrefs,
  dateHeureParisVersUTC,
  seanceDansLaFenetreDeRappel,
  heureParisCivile,
  doitEnvoyerRappelJourSeance,
} from './rappels.js';

describe('resoudrePrefs', () => {
  it('retourne les défauts si rien n\'est configuré', () => {
    expect(resoudrePrefs(undefined, undefined)).toEqual(PREFS_PAR_DEFAUT);
  });

  it('utilise les réglages globaux du praticien si pas de surcharge patient', () => {
    const global = { rappel_seance_actif: false, rappel_seance_delai_heures: 4, rappel_jour_seance_actif: true, rappel_jour_seance_heure: '09:00:00' };
    expect(resoudrePrefs(undefined, global)).toEqual({
      rappelSeanceActif: false,
      rappelSeanceDelaiHeures: 4,
      rappelJourSeanceActif: true,
      rappelJourSeanceHeure: '09:00:00',
    });
  });

  it('la surcharge patient prend le dessus sur le global', () => {
    const global = { rappel_seance_actif: true, rappel_seance_delai_heures: 2, rappel_jour_seance_actif: true, rappel_jour_seance_heure: '08:00:00' };
    const parPatient = { rappel_seance_delai_heures: 12 };
    expect(resoudrePrefs(parPatient, global)).toEqual({
      rappelSeanceActif: true,
      rappelSeanceDelaiHeures: 12,
      rappelJourSeanceActif: true,
      rappelJourSeanceHeure: '08:00:00',
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

describe('heureParisCivile', () => {
  it('calcule l\'heure civile en hiver (CET, UTC+1)', () => {
    expect(heureParisCivile(new Date('2026-01-15T07:30:00.000Z'))).toBe('08:30');
  });

  it('calcule l\'heure civile en été (CEST, UTC+2)', () => {
    expect(heureParisCivile(new Date('2026-07-15T06:00:00.000Z'))).toBe('08:00');
  });
});

describe('doitEnvoyerRappelJourSeance', () => {
  // 2026-07-15T06:00:00Z == 08:00 Europe/Paris (CEST)
  const huitHeuresParis = new Date('2026-07-15T06:00:00.000Z');
  const septHeuresParis = new Date('2026-07-15T05:00:00.000Z');

  it('envoie si l\'heure cible (08:00) est atteinte et pas déjà envoyé aujourd\'hui', () => {
    expect(doitEnvoyerRappelJourSeance(huitHeuresParis, PREFS_PAR_DEFAUT, false)).toBe(true);
  });

  it('n\'envoie pas avant l\'heure cible', () => {
    expect(doitEnvoyerRappelJourSeance(septHeuresParis, PREFS_PAR_DEFAUT, false)).toBe(false);
  });

  it('n\'envoie pas si déjà envoyé aujourd\'hui', () => {
    expect(doitEnvoyerRappelJourSeance(huitHeuresParis, PREFS_PAR_DEFAUT, true)).toBe(false);
  });

  it('n\'envoie pas si le rappel jour de séance est désactivé', () => {
    const prefs = { ...PREFS_PAR_DEFAUT, rappelJourSeanceActif: false };
    expect(doitEnvoyerRappelJourSeance(huitHeuresParis, prefs, false)).toBe(false);
  });

  it('respecte une heure cible personnalisée', () => {
    const prefs = { ...PREFS_PAR_DEFAUT, rappelJourSeanceHeure: '09:00:00' };
    expect(doitEnvoyerRappelJourSeance(huitHeuresParis, prefs, false)).toBe(false);
  });
});
