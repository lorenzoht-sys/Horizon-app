import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

interface Abonnement {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
}

// Simule juste assez de l'API supabase-js pour le code touché par
// envoyerRappel : select(...).eq(...) sur push_subscriptions, et
// delete().eq('id', ...) pour la suppression des abonnements expirés.
function creerSupabaseFake(abonnements: Abonnement[]) {
  const deleted: string[] = [];
  const client = {
    from(table: string) {
      if (table !== 'push_subscriptions') throw new Error(`table inattendue: ${table}`);
      return {
        select: () => ({
          eq: (_col: string, _val: string) => Promise.resolve({ data: abonnements }),
        }),
        delete: () => ({
          eq: (_col: string, id: string) => {
            deleted.push(id);
            return Promise.resolve({ error: null });
          },
        }),
      };
    },
  };
  return { client: client as unknown as SupabaseClient, deleted };
}

const ENV_VAPID = {
  VITE_VAPID_PUBLIC_KEY: 'clé-publique-test',
  VAPID_PRIVATE_KEY: 'clé-privée-test',
  VAPID_CONTACT_EMAIL: 'mailto:test@example.com',
};

const MESSAGE = { titre: 'Horizon', corps: 'Pensez à vos exercices !' };

describe('envoyerRappel', () => {
  const envInitial = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...envInitial };
  });

  it('ne fait rien si les clés VAPID ne sont pas configurées', async () => {
    delete process.env.VITE_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    const sendNotification = vi.fn();
    vi.doMock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification } }));

    const { envoyerRappel } = await import('./notifications.js');
    const { client } = creerSupabaseFake([]);

    const resultat = await envoyerRappel(client, 'participant-1', MESSAGE);

    expect(resultat).toEqual({ nbEnvoyes: 0, nbEchecs: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("ne fait rien si le patient n'a aucun appareil abonné", async () => {
    Object.assign(process.env, ENV_VAPID);

    const sendNotification = vi.fn();
    vi.doMock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification } }));

    const { envoyerRappel } = await import('./notifications.js');
    const { client } = creerSupabaseFake([]);

    const resultat = await envoyerRappel(client, 'participant-1', MESSAGE);

    expect(resultat).toEqual({ nbEnvoyes: 0, nbEchecs: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('envoie une notification à chaque appareil abonné', async () => {
    Object.assign(process.env, ENV_VAPID);

    const sendNotification = vi.fn().mockResolvedValue(undefined);
    vi.doMock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification } }));

    const { envoyerRappel } = await import('./notifications.js');
    const { client, deleted } = creerSupabaseFake([
      { id: 'abo-1', endpoint: 'https://push.example/1', p256dh: 'p1', auth_key: 'a1' },
      { id: 'abo-2', endpoint: 'https://push.example/2', p256dh: 'p2', auth_key: 'a2' },
    ]);

    const resultat = await envoyerRappel(client, 'participant-1', MESSAGE);

    expect(resultat).toEqual({ nbEnvoyes: 2, nbEchecs: 0 });
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(deleted).toEqual([]);
  });

  it('supprime un abonnement expiré (410) et compte un échec', async () => {
    Object.assign(process.env, ENV_VAPID);

    const erreur410 = Object.assign(new Error('Gone'), { statusCode: 410 });
    const sendNotification = vi.fn().mockRejectedValue(erreur410);
    vi.doMock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification } }));

    const { envoyerRappel } = await import('./notifications.js');
    const { client, deleted } = creerSupabaseFake([
      { id: 'abo-1', endpoint: 'https://push.example/1', p256dh: 'p1', auth_key: 'a1' },
    ]);

    const resultat = await envoyerRappel(client, 'participant-1', MESSAGE);

    expect(resultat).toEqual({ nbEnvoyes: 0, nbEchecs: 1 });
    expect(deleted).toEqual(['abo-1']);
  });

  it('ne plante pas si les clés VAPID sont invalides (setVapidDetails lève une exception)', async () => {
    Object.assign(process.env, ENV_VAPID);

    const setVapidDetails = vi.fn(() => {
      throw new Error('Vapid public key should be 65 bytes long when decoded.');
    });
    const sendNotification = vi.fn();
    vi.doMock('web-push', () => ({ default: { setVapidDetails, sendNotification } }));

    const { envoyerRappel } = await import('./notifications.js');
    const { client } = creerSupabaseFake([
      { id: 'abo-1', endpoint: 'https://push.example/1', p256dh: 'p1', auth_key: 'a1' },
    ]);

    const resultat = await envoyerRappel(client, 'participant-1', MESSAGE);

    expect(resultat).toEqual({ nbEnvoyes: 0, nbEchecs: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('conserve l\'abonnement en cas d\'erreur temporaire (ex: 500)', async () => {
    Object.assign(process.env, ENV_VAPID);

    const erreur500 = Object.assign(new Error('Server error'), { statusCode: 500 });
    const sendNotification = vi.fn().mockRejectedValue(erreur500);
    vi.doMock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification } }));

    const { envoyerRappel } = await import('./notifications.js');
    const { client, deleted } = creerSupabaseFake([
      { id: 'abo-1', endpoint: 'https://push.example/1', p256dh: 'p1', auth_key: 'a1' },
    ]);

    const resultat = await envoyerRappel(client, 'participant-1', MESSAGE);

    expect(resultat).toEqual({ nbEnvoyes: 0, nbEchecs: 1 });
    expect(deleted).toEqual([]);
  });
});
