import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// Le fichier du cron importe des modules qui ont besoin d'environnement (Sentry, client de
// service, web-push). On les remplace : ce qu'on teste ici, c'est la SÉLECTION des séances et
// l'exclusion des archivés, avec la vraie logique de fenêtre horaire.
const envoyerRappel = vi.fn(async (_supabase: unknown, _participantId: string, _message: unknown) => ({ nbEnvoyes: 1, nbEchecs: 0 }));
vi.mock('./notifications.js', () => ({
  envoyerRappel: (supabase: unknown, participantId: string, message: unknown) => envoyerRappel(supabase, participantId, message),
}));
vi.mock('./sentry.js', () => ({ withSentry: (h: unknown) => h }));
vi.mock('./patientAuth.js', () => ({ getServiceClient: vi.fn() }));

import { traiterRappelsSeance, traiterRappelsVeilleSeance } from '../cron/rappels.js';

type Row = Record<string, unknown>;

// Faux client en mémoire : select / eq / in / is / order / maybeSingle / insert.
function creerFaux(initial: { seances?: Row[]; participants?: Row[]; rappels_envoyes?: Row[]; rappel_preferences?: Row[] }, options: { participantsEnPanne?: boolean } = {}) {
  const store: Record<string, Row[]> = {
    seances: (initial.seances ?? []).map(r => ({ ...r })),
    participants: (initial.participants ?? []).map(r => ({ ...r })),
    rappels_envoyes: (initial.rappels_envoyes ?? []).map(r => ({ ...r })),
    rappel_preferences: (initial.rappel_preferences ?? []).map(r => ({ ...r })),
  };

  function from(table: string) {
    const filtres: ((r: Row) => boolean)[] = [];
    let tri: { champ: string; croissant: boolean } | null = null;
    let insertion: Row[] | null = null;

    const lignes = () => {
      let res = store[table].filter(r => filtres.every(f => f(r)));
      if (tri) {
        const { champ, croissant } = tri;
        res = [...res].sort((a, b) => (String(a[champ]) < String(b[champ]) ? -1 : 1) * (croissant ? 1 : -1));
      }
      return res;
    };

    const builder = {
      select() { return builder; },
      eq(champ: string, valeur: unknown) { filtres.push(r => (r[champ] ?? null) === valeur); return builder; },
      in(champ: string, valeurs: unknown[]) { filtres.push(r => valeurs.includes(r[champ])); return builder; },
      is(champ: string, valeur: unknown) { filtres.push(r => (r[champ] ?? null) === valeur); return builder; },
      order(champ: string, opts?: { ascending?: boolean }) { tri = { champ, croissant: opts?.ascending !== false }; return builder; },
      maybeSingle() { return Promise.resolve({ data: lignes()[0] ?? null, error: null }); },
      insert(rows: Row | Row[]) { insertion = Array.isArray(rows) ? rows : [rows]; return builder; },
      then(resolve: (v: unknown) => void) {
        if (insertion) {
          for (const row of insertion) store[table].push({ id: `gen-${store[table].length}`, ...row });
          return resolve({ error: null });
        }
        if (table === 'participants' && options.participantsEnPanne) {
          return resolve({ data: null, error: { message: 'panne' } });
        }
        return resolve({ data: lignes(), error: null });
      },
    };
    return builder;
  }

  return { client: { from } as unknown as SupabaseClient, store };
}

const ACTIF = 'participant-actif';
const ARCHIVE = 'participant-archive';
const participants = [{ id: ACTIF, archive: false }, { id: ARCHIVE, archive: true }];

function seance(id: string, participantId: string, date: string, heure = '11:00') {
  return { id, participant_id: participantId, praticien_id: 'praticien-1', date, heure_debut: heure, statut: 'planifiee' };
}

beforeEach(() => { envoyerRappel.mockClear(); });
afterEach(() => { vi.useRealTimers(); });

describe('rappel de séance — bénéficiaire archivé', () => {
  // 22/09/2026 08:00 UTC = 10:00 à Paris ; séance à 11:00 Paris : dans la fenêtre par défaut de 2 h.
  const MAINTENANT = '2026-09-22T08:00:00Z';
  const AUJOURDHUI = '2026-09-22';

  it("n'envoie rien à un archivé qui a encore une séance planifiée, mais envoie à l'actif", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(MAINTENANT));
    const { client, store } = creerFaux({
      participants,
      seances: [seance('s-actif', ACTIF, AUJOURDHUI), seance('s-archive', ARCHIVE, AUJOURDHUI)],
    });

    const resultat = await traiterRappelsSeance(client);

    expect(resultat).toEqual({ examinees: 2, envoyes: 1, ignoreesArchivees: 1 });
    expect(envoyerRappel).toHaveBeenCalledTimes(1);
    expect(envoyerRappel.mock.calls[0][1]).toBe(ACTIF);
    // journal : uniquement l'actif
    expect(store.rappels_envoyes.map(r => r.participant_id)).toEqual([ACTIF]);
    // la séance de l'archivé reste au planning, intacte
    expect(store.seances.find(s => s.id === 's-archive')?.statut).toBe('planifiee');
  });

  it('contre-épreuve : sans archivage, les deux reçoivent leur rappel', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(MAINTENANT));
    const { client } = creerFaux({
      participants: [{ id: ACTIF, archive: false }, { id: ARCHIVE, archive: false }],
      seances: [seance('s-actif', ACTIF, AUJOURDHUI), seance('s-archive', ARCHIVE, AUJOURDHUI)],
    });
    const resultat = await traiterRappelsSeance(client);
    expect(resultat).toEqual({ examinees: 2, envoyes: 2, ignoreesArchivees: 0 });
    expect(envoyerRappel).toHaveBeenCalledTimes(2);
  });

  it('seul un archivé a une séance : aucun envoi', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(MAINTENANT));
    const { client } = creerFaux({ participants, seances: [seance('s1', ARCHIVE, AUJOURDHUI)] });
    const resultat = await traiterRappelsSeance(client);
    expect(resultat).toEqual({ examinees: 1, envoyes: 0, ignoreesArchivees: 1 });
    expect(envoyerRappel).not.toHaveBeenCalled();
  });

  it('désarchivage : le rappel repart, sans aucune réparation', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(MAINTENANT));
    const { client, store } = creerFaux({ participants, seances: [seance('s1', ARCHIVE, AUJOURDHUI)] });
    await traiterRappelsSeance(client);
    expect(envoyerRappel).not.toHaveBeenCalled();

    store.participants.find(p => p.id === ARCHIVE)!.archive = false;
    const resultat = await traiterRappelsSeance(client);
    expect(resultat.envoyes).toBe(1);
    expect(envoyerRappel).toHaveBeenCalledTimes(1);
  });

  it("état d'archivage illisible : lève et n'envoie rien (jamais « personne n'est archivé » par défaut)", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(MAINTENANT));
    const { client } = creerFaux({ participants, seances: [seance('s-archive', ARCHIVE, AUJOURDHUI)] }, { participantsEnPanne: true });
    await expect(traiterRappelsSeance(client)).rejects.toThrow(/archivage/);
    expect(envoyerRappel).not.toHaveBeenCalled();
  });
});

describe('rappel de la veille — bénéficiaire archivé', () => {
  // 22/09/2026 17:30 UTC = 19:30 à Paris (≥ 19:00) ; séances demain (23/09).
  const MAINTENANT = '2026-09-22T17:30:00Z';
  const DEMAIN = '2026-09-23';

  it("n'envoie rien à un archivé, envoie à l'actif, et journalise seulement l'actif", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(MAINTENANT));
    const { client, store } = creerFaux({
      participants,
      seances: [seance('s-actif', ACTIF, DEMAIN), seance('s-archive', ARCHIVE, DEMAIN)],
    });

    const resultat = await traiterRappelsVeilleSeance(client);

    expect(resultat).toEqual({ examines: 1, envoyes: 1, ignoreesArchivees: 1 });
    expect(envoyerRappel).toHaveBeenCalledTimes(1);
    expect(envoyerRappel.mock.calls[0][1]).toBe(ACTIF);
    expect(store.rappels_envoyes.map(r => [r.participant_id, r.type])).toEqual([[ACTIF, 'rappel_jour_seance']]);
    expect(store.seances.find(s => s.id === 's-archive')?.statut).toBe('planifiee');
  });

  it('contre-épreuve : sans archivage, les deux reçoivent le rappel de la veille', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(MAINTENANT));
    const { client } = creerFaux({
      participants: [{ id: ACTIF, archive: false }, { id: ARCHIVE, archive: false }],
      seances: [seance('s-actif', ACTIF, DEMAIN), seance('s-archive', ARCHIVE, DEMAIN)],
    });
    const resultat = await traiterRappelsVeilleSeance(client);
    expect(resultat).toEqual({ examines: 2, envoyes: 2, ignoreesArchivees: 0 });
  });

  it('seul un archivé a une séance demain : aucun envoi', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(MAINTENANT));
    const { client } = creerFaux({ participants, seances: [seance('s1', ARCHIVE, DEMAIN)] });
    const resultat = await traiterRappelsVeilleSeance(client);
    expect(resultat).toEqual({ examines: 0, envoyes: 0, ignoreesArchivees: 1 });
    expect(envoyerRappel).not.toHaveBeenCalled();
  });

  it("état d'archivage illisible : lève et n'envoie rien", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(MAINTENANT));
    const { client } = creerFaux({ participants, seances: [seance('s1', ARCHIVE, DEMAIN)] }, { participantsEnPanne: true });
    await expect(traiterRappelsVeilleSeance(client)).rejects.toThrow(/archivage/);
    expect(envoyerRappel).not.toHaveBeenCalled();
  });
});
