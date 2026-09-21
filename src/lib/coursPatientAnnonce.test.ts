import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  prochainsCours, prochainCours, debutCoursParis, reponseEncoreOuverte, NB_COURS_A_REPONDRE,
  type CoursPatientRecord,
} from './coursPatient';
import { patientAnnoncerPresence } from './patientApi';

function cours(over: Partial<CoursPatientRecord> = {}): CoursPatientRecord {
  return {
    coursId: 'c1', titre: 'Gym douce', date: '2026-07-15', heureDebut: '10:00', dureeMinutes: 45,
    statut: 'planifie', presence: null, ressentiBorg: null, ressentiBienetre: null, presenceAnnoncee: null, ...over,
  };
}

describe('prochainsCours — les 4 prochains cours à venir', () => {
  it('les plus proches d\'abord, au plus 4 (décidé)', () => {
    expect(NB_COURS_A_REPONDRE).toBe(4);
    const liste = ['2026-10-05', '2026-09-24', '2026-10-12', '2026-09-22', '2026-09-29', '2026-10-19']
      .map((date, i) => cours({ coursId: `c${i}`, date }));
    expect(prochainsCours(liste, '2026-09-21').map(c => c.date)).toEqual(['2026-09-22', '2026-09-24', '2026-09-29', '2026-10-05']);
  });

  it('un cours d\'aujourd\'hui en fait partie ; hier, non', () => {
    const liste = [cours({ coursId: 'hier', date: '2026-09-20' }), cours({ coursId: 'auj', date: '2026-09-21' })];
    expect(prochainsCours(liste, '2026-09-21').map(c => c.coursId)).toEqual(['auj']);
  });

  it('ni cours annulé, ni réalisé', () => {
    const liste = [cours({ coursId: 'a', statut: 'annule', date: '2026-09-25' }), cours({ coursId: 'r', statut: 'realise', date: '2026-09-25' })];
    expect(prochainsCours(liste, '2026-09-21')).toEqual([]);
  });

  it('prochainCours reste le premier de la liste', () => {
    const liste = [cours({ coursId: 'loin', date: '2026-10-01' }), cours({ coursId: 'proche', date: '2026-09-23' })];
    expect(prochainCours(liste, '2026-09-21')?.coursId).toBe('proche');
    expect(prochainCours([], '2026-09-21')).toBeNull();
  });
});

// Mêmes cas que api/_lib/presenceAnnoncee.test.ts : le calcul client est le MIROIR du serveur.
describe('debutCoursParis — miroir du serveur', () => {
  const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

  it('hiver (CET) et été (CEST)', () => {
    expect(iso(debutCoursParis('2026-01-15', '10:00'))).toBe('2026-01-15T09:00:00.000Z');
    expect(iso(debutCoursParis('2026-07-15', '10:00'))).toBe('2026-07-15T08:00:00.000Z');
  });

  it("les deux jours de changement d'heure, cours à 10h", () => {
    expect(iso(debutCoursParis('2026-03-29', '10:00'))).toBe('2026-03-29T08:00:00.000Z');
    expect(iso(debutCoursParis('2026-10-25', '10:00'))).toBe('2026-10-25T09:00:00.000Z');
  });

  it('accepte HH:MM:SS', () => {
    expect(iso(debutCoursParis('2026-07-15', '10:00:00'))).toBe('2026-07-15T08:00:00.000Z');
  });

  it("heure inexploitable : ne plante pas, et le cours reste ouvert jusqu'à 23h59 ce jour-là", () => {
    for (const heure of ['abc', '', '25:00', '10h30', '10:60']) {
      expect(iso(debutCoursParis('2026-07-15', heure)), heure).toBe('2026-07-15T21:59:00.000Z');
    }
  });

  it('date inexploitable : null', () => {
    for (const date of ['', 'demain', '2026-7-15', '15/07/2026']) {
      expect(debutCoursParis(date, '10:00'), date).toBeNull();
    }
  });
});

describe('reponseEncoreOuverte — jusqu\'au début du cours, aucune tolérance', () => {
  const c = cours(); // début : 2026-07-15T08:00:00Z
  const t = (s: string) => new Date(s).getTime();

  it('avant le début : ouverte ; la borne : une milliseconde avant OUI, à l\'instant du début NON', () => {
    expect(reponseEncoreOuverte(c, t('2026-07-14T08:00:00Z'))).toBe(true);
    expect(reponseEncoreOuverte(c, t('2026-07-15T07:59:59.999Z'))).toBe(true);
    expect(reponseEncoreOuverte(c, t('2026-07-15T08:00:00.000Z'))).toBe(false);
    expect(reponseEncoreOuverte(c, t('2026-07-15T09:30:00Z'))).toBe(false);
  });

  it('un cours annulé ou réalisé n\'est jamais ouvert', () => {
    const avant = t('2026-07-01T00:00:00Z');
    expect(reponseEncoreOuverte(cours({ statut: 'annule' }), avant)).toBe(false);
    expect(reponseEncoreOuverte(cours({ statut: 'realise' }), avant)).toBe(false);
  });

  it('une date corrompue : fermée, sans planter', () => {
    expect(reponseEncoreOuverte(cours({ date: 'demain' }), t('2026-07-01T00:00:00Z'))).toBe(false);
  });
});

describe('patientAnnoncerPresence', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  function simulerReponse(status: number, corps: unknown) {
    const appels: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      appels.push({ url, init });
      return { ok: status >= 200 && status < 300, status, json: async () => corps } as Response;
    }));
    return appels;
  }

  it('envoie le cours et la réponse — jamais un identifiant de participant — avec le jeton', async () => {
    const appels = simulerReponse(200, { ok: true, presenceAnnoncee: 'vient' });
    const r = await patientAnnoncerPresence('JETON', 'cours-1', 'vient');
    expect(r).toEqual({ ok: true, presenceAnnoncee: 'vient' });
    expect(appels[0].url).toBe('/api/patient/activite');
    expect((appels[0].init.headers as Record<string, string>).Authorization).toBe('Bearer JETON');
    expect(JSON.parse(appels[0].init.body as string)).toEqual({ type: 'cours-presence', coursId: 'cours-1', reponse: 'vient' });
  });

  it('409 : transmet le code et le message du serveur', async () => {
    simulerReponse(409, { error: 'Ce cours a déjà commencé : vous ne pouvez plus modifier votre réponse.', code: 'deja_commence' });
    const r = await patientAnnoncerPresence('J', 'c', 'vient');
    expect(r).toEqual({ ok: false, status: 409, code: 'deja_commence', error: 'Ce cours a déjà commencé : vous ne pouvez plus modifier votre réponse.' });
  });

  it('404 et 500 : refus sans code', async () => {
    simulerReponse(404, { error: 'Cours introuvable' });
    expect((await patientAnnoncerPresence('J', 'c', 'vient'))).toMatchObject({ ok: false, status: 404 });
    simulerReponse(500, { error: 'Erreur serveur' });
    expect((await patientAnnoncerPresence('J', 'c', 'vient'))).toMatchObject({ ok: false, status: 500 });
  });

  it('réseau injoignable : status 0, message lisible, pas d\'exception', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const r = await patientAnnoncerPresence('J', 'c', 'ne_vient_pas');
    expect(r).toMatchObject({ ok: false, status: 0 });
    expect((r as { error?: string }).error).toMatch(/réseau|connexion/i);
  });

  it('réponse illisible (pas du JSON) : refus propre', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => { throw new Error('html'); } }) as unknown as Response));
    expect(await patientAnnoncerPresence('J', 'c', 'vient')).toMatchObject({ ok: false, status: 502 });
  });
});
