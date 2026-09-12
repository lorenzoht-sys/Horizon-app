// Contrat de la fusion des deux crons derrière un seul endpoint
// (api/cron/rappels.ts) : les traitements tournent l'un APRÈS l'autre, et
// l'échec de l'un n'empêche jamais l'autre de s'exécuter.
//
// C'est le risque propre à la fusion : avant, deux endpoints séparés
// tombaient indépendamment. Un seul point d'entrée pourrait transformer
// deux pannes isolées en une panne totale — ces tests verrouillent le fait
// que ça n'arrive pas.
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  doitRenouvelerMaintenant,
  executerTachesCron,
  HEURE_RENOUVELLEMENT_UTC,
  type Tache,
} from './cronTaches.js';

// executerTachesCron journalise chaque échec via console.error (les logs
// Vercel sont le seul endroit où la pile complète reste lisible). On le
// neutralise pour ne pas polluer la sortie de la suite, sans changer le
// comportement testé.
afterEach(() => {
  vi.restoreAllMocks();
});

function silencerConsole() {
  vi.spyOn(console, 'error').mockImplementation(() => {});
}

describe('doitRenouvelerMaintenant — fenêtre quotidienne', () => {
  it(`renouvelle à ${HEURE_RENOUVELLEMENT_UTC}h UTC`, () => {
    expect(doitRenouvelerMaintenant(new Date('2026-09-12T03:15:00Z'))).toBe(true);
  });

  it('ne renouvelle pas aux autres heures', () => {
    expect(doitRenouvelerMaintenant(new Date('2026-09-12T02:15:00Z'))).toBe(false);
    expect(doitRenouvelerMaintenant(new Date('2026-09-12T04:15:00Z'))).toBe(false);
    expect(doitRenouvelerMaintenant(new Date('2026-09-12T19:05:00Z'))).toBe(false);
  });

  it('une seule exécution par jour sur les 24 du cron horaire', () => {
    const heuresQuiRenouvellent = Array.from({ length: 24 }, (_, h) =>
      doitRenouvelerMaintenant(new Date(`2026-09-12T${String(h).padStart(2, '0')}:15:00Z`)),
    ).filter(Boolean);
    expect(heuresQuiRenouvellent).toHaveLength(1);
  });

  // L'ancien job pg_cron `15 3 * * *` était interprété en UTC (fuseau de la
  // base Supabase). Si la fenêtre était calée sur l'heure civile Paris, le
  // renouvellement se décalerait d'une heure entre hiver et été — ce que la
  // fusion n'est pas censée changer.
  it('reste calée sur UTC, pas sur l\'heure de Paris (été comme hiver)', () => {
    // 03h15 UTC en plein été (Paris = UTC+2, soit 05h15 civiles) : renouvelle.
    expect(doitRenouvelerMaintenant(new Date('2026-07-15T03:15:00Z'))).toBe(true);
    // 03h15 civiles Paris en été = 01h15 UTC : ne renouvelle pas.
    expect(doitRenouvelerMaintenant(new Date('2026-07-15T01:15:00Z'))).toBe(false);
  });
});

describe('executerTachesCron — exécution séquentielle et isolation', () => {
  it('exécute les tâches l\'une après l\'autre, dans l\'ordre', async () => {
    const trace: string[] = [];
    const taches: Tache[] = [
      {
        nom: 'rappels',
        executer: async () => {
          trace.push('rappels:debut');
          await new Promise(r => setTimeout(r, 10));
          trace.push('rappels:fin');
          return { envoyes: 2 };
        },
      },
      {
        nom: 'renouvellement',
        executer: async () => {
          trace.push('renouvellement:debut');
          return { renouveles: 1 };
        },
      },
    ];

    const { ordre, resultats } = await executerTachesCron(taches);

    // Séquentiel, pas parallèle : les rappels sont terminés avant que le
    // renouvellement ne démarre.
    expect(trace).toEqual(['rappels:debut', 'rappels:fin', 'renouvellement:debut']);
    expect(ordre).toEqual(['rappels', 'renouvellement']);
    expect(resultats.rappels).toEqual({ statut: 'ok', resultat: { envoyes: 2 } });
    expect(resultats.renouvellement).toEqual({ statut: 'ok', resultat: { renouveles: 1 } });
  });

  // Le cas nommé dans la demande : un contrat mal formé fait lever le
  // renouvellement, les rappels du jour doivent partir quand même.
  it('un renouvellement en échec n\'empêche pas les rappels', async () => {
    silencerConsole();
    let rappelsExecutes = false;

    const { resultats } = await executerTachesCron([
      {
        nom: 'rappels',
        executer: async () => {
          rappelsExecutes = true;
          return { envoyes: 3 };
        },
      },
      {
        nom: 'renouvellement',
        executer: async () => {
          throw new Error('contrat c-42 : jours_fixe illisible');
        },
      },
    ]);

    expect(rappelsExecutes).toBe(true);
    expect(resultats.rappels).toEqual({ statut: 'ok', resultat: { envoyes: 3 } });
    expect(resultats.renouvellement).toEqual({
      statut: 'erreur',
      erreur: 'contrat c-42 : jours_fixe illisible',
    });
  });

  // Le sens inverse : les rappels tombent (push HS, table injoignable), le
  // renouvellement doit quand même tourner. C'est l'ordre d'exécution qui
  // rend ce cas plus dangereux — les rappels passent EN PREMIER, donc sans
  // isolation ils emporteraient le renouvellement avec eux.
  it('des rappels en échec n\'empêchent pas le renouvellement', async () => {
    silencerConsole();
    let renouvellementExecute = false;

    const { ordre, resultats } = await executerTachesCron([
      {
        nom: 'rappels',
        executer: async () => {
          throw new Error('web-push indisponible');
        },
      },
      {
        nom: 'renouvellement',
        executer: async () => {
          renouvellementExecute = true;
          return { renouveles: 4 };
        },
      },
    ]);

    expect(renouvellementExecute).toBe(true);
    expect(ordre).toEqual(['rappels', 'renouvellement']);
    expect(resultats.rappels).toEqual({ statut: 'erreur', erreur: 'web-push indisponible' });
    expect(resultats.renouvellement).toEqual({ statut: 'ok', resultat: { renouveles: 4 } });
  });

  it('les deux peuvent échouer sans que la fonction ne rejette', async () => {
    silencerConsole();

    const bilan = await executerTachesCron([
      { nom: 'rappels', executer: async () => { throw new Error('boum A'); } },
      { nom: 'renouvellement', executer: async () => { throw new Error('boum B'); } },
    ]);

    expect(bilan.resultats.rappels).toEqual({ statut: 'erreur', erreur: 'boum A' });
    expect(bilan.resultats.renouvellement).toEqual({ statut: 'erreur', erreur: 'boum B' });
  });

  it('tronque un message d\'erreur trop long (logs Vercel lisibles)', async () => {
    silencerConsole();
    const { resultats } = await executerTachesCron([
      { nom: 'rappels', executer: async () => { throw new Error('x'.repeat(900)); } },
    ]);
    const r = resultats.rappels;
    expect(r.statut).toBe('erreur');
    if (r.statut === 'erreur') expect(r.erreur).toHaveLength(500);
  });

  it('gère une valeur levée qui n\'est pas une Error', async () => {
    silencerConsole();
    const { resultats } = await executerTachesCron([
      { nom: 'rappels', executer: async () => { throw 'panne brute'; } },
    ]);
    expect(resultats.rappels).toEqual({ statut: 'erreur', erreur: 'panne brute' });
  });

  it('une liste vide ne casse rien', async () => {
    const bilan = await executerTachesCron([]);
    expect(bilan.ordre).toEqual([]);
    expect(bilan.resultats).toEqual({});
  });
});
