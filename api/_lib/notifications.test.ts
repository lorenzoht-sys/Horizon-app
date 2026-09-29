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
function creerSupabaseFake(abonnements: Abonnement[], table = 'push_subscriptions') {
  const deleted: string[] = [];
  const client = {
    from(t: string) {
      if (t !== table) throw new Error(`table inattendue: ${t}`);
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

  it('le payload envoyé porte url: "/patient" (repli du service worker pour les anciens payloads sans ce champ)', async () => {
    Object.assign(process.env, ENV_VAPID);

    const sendNotification = vi.fn().mockResolvedValue(undefined);
    vi.doMock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification } }));

    const { envoyerRappel } = await import('./notifications.js');
    const { client } = creerSupabaseFake([
      { id: 'abo-1', endpoint: 'https://push.example/1', p256dh: 'p1', auth_key: 'a1' },
    ]);

    await envoyerRappel(client, 'participant-1', MESSAGE);

    const [, payload] = sendNotification.mock.calls[0];
    expect(JSON.parse(payload)).toEqual({ title: MESSAGE.titre, body: MESSAGE.corps, url: '/patient' });
    // Jamais de tag explicite pour un rappel patient : push-sw.js garde son
    // tag fixe 'horizon-rappel', comportement inchangé.
    expect(JSON.parse(payload)).not.toHaveProperty('tag');
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

// Chantier « push praticien », lot E : miroir d'envoyerRappel ci-dessus,
// mais sur praticien_push_subscriptions/praticien_id — mêmes cas, plus la
// vérification du payload (url variable, contrairement au patient).
const MESSAGE_PRATICIEN = { titre: 'Horizon', corps: 'Un bénéficiaire a signalé une absence pour sa prochaine séance.', url: '/agenda' };

describe('envoyerAlertePraticien', () => {
  const envInitial = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...envInitial };
  });

  it('ne fait rien si les clés VAPID ne sont pas configurées, et journalise explicitement leur absence', async () => {
    delete process.env.VITE_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    const sendNotification = vi.fn();
    vi.doMock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification } }));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { envoyerAlertePraticien } = await import('./notifications.js');
    const { client } = creerSupabaseFake([], 'praticien_push_subscriptions');

    const resultat = await envoyerAlertePraticien(client, 'praticien-1', MESSAGE_PRATICIEN);

    expect(resultat).toEqual({ nbEnvoyes: 0, nbEchecs: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
    // Avant ce correctif, ce cas était totalement silencieux — indiscernable
    // en logs d'un praticien sans abonnement (constaté lors d'un
    // signalement non reçu sur iPhone, aucune trace exploitable).
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('Clés VAPID absentes'));
    consoleError.mockRestore();
  });

  it("ne fait rien si le praticien n'a aucun appareil abonné", async () => {
    Object.assign(process.env, ENV_VAPID);

    const sendNotification = vi.fn();
    vi.doMock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification } }));

    const { envoyerAlertePraticien } = await import('./notifications.js');
    const { client } = creerSupabaseFake([], 'praticien_push_subscriptions');

    const resultat = await envoyerAlertePraticien(client, 'praticien-1', MESSAGE_PRATICIEN);

    expect(resultat).toEqual({ nbEnvoyes: 0, nbEchecs: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('envoie une notification à chaque appareil abonné, avec le payload {title, body, url}', async () => {
    Object.assign(process.env, ENV_VAPID);

    const sendNotification = vi.fn().mockResolvedValue(undefined);
    vi.doMock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification } }));

    const { envoyerAlertePraticien } = await import('./notifications.js');
    const { client, deleted } = creerSupabaseFake([
      { id: 'abo-1', endpoint: 'https://push.example/1', p256dh: 'p1', auth_key: 'a1' },
      { id: 'abo-2', endpoint: 'https://push.example/2', p256dh: 'p2', auth_key: 'a2' },
    ], 'praticien_push_subscriptions');

    const resultat = await envoyerAlertePraticien(client, 'praticien-1', MESSAGE_PRATICIEN);

    expect(resultat).toEqual({ nbEnvoyes: 2, nbEchecs: 0 });
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(deleted).toEqual([]);
    const [, payload] = sendNotification.mock.calls[0];
    // Sans tag fourni : payload identique à avant, aucune clé `tag`.
    expect(JSON.parse(payload)).toEqual({ title: MESSAGE_PRATICIEN.titre, body: MESSAGE_PRATICIEN.corps, url: '/agenda' });
  });

  it('transmet le tag fourni dans le payload (une notification par séance sur l\'appareil)', async () => {
    Object.assign(process.env, ENV_VAPID);

    const sendNotification = vi.fn().mockResolvedValue(undefined);
    vi.doMock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification } }));

    const { envoyerAlertePraticien } = await import('./notifications.js');
    const { client } = creerSupabaseFake([
      { id: 'abo-1', endpoint: 'https://push.example/1', p256dh: 'p1', auth_key: 'a1' },
    ], 'praticien_push_subscriptions');

    await envoyerAlertePraticien(client, 'praticien-1', { ...MESSAGE_PRATICIEN, tag: 'absence-seance-42' });

    const [, payload] = sendNotification.mock.calls[0];
    expect(JSON.parse(payload)).toEqual({
      title: MESSAGE_PRATICIEN.titre, body: MESSAGE_PRATICIEN.corps, url: '/agenda', tag: 'absence-seance-42',
    });
  });

  it('journalise un récapitulatif avec le code d\'erreur et l\'id d\'abonnement, jamais l\'endpoint', async () => {
    Object.assign(process.env, ENV_VAPID);

    const erreur401 = Object.assign(new Error('Unauthorized'), { statusCode: 401 });
    const sendNotification = vi.fn().mockRejectedValue(erreur401);
    vi.doMock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification } }));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { envoyerAlertePraticien } = await import('./notifications.js');
    const { client } = creerSupabaseFake([
      { id: 'abo-secret-1', endpoint: 'https://push.example/endpoint-tres-specifique', p256dh: 'p1', auth_key: 'a1' },
    ], 'praticien_push_subscriptions');

    const resultat = await envoyerAlertePraticien(client, 'praticien-1', MESSAGE_PRATICIEN);

    expect(resultat).toEqual({ nbEnvoyes: 0, nbEchecs: 1 });
    expect(consoleError).toHaveBeenCalledTimes(1);
    const [message, detail] = consoleError.mock.calls[0];
    expect(message).toContain('1 échec');
    expect(detail).toEqual([{ abonnementId: 'abo-secret-1', statusCode: 401 }]);
    // Aucune donnée sensible dans le log : ni l'endpoint, ni les clés.
    expect(JSON.stringify(consoleError.mock.calls[0])).not.toContain('push.example/endpoint-tres-specifique');
    consoleError.mockRestore();
  });

  it('supprime un abonnement expiré (410) et compte un échec', async () => {
    Object.assign(process.env, ENV_VAPID);

    const erreur410 = Object.assign(new Error('Gone'), { statusCode: 410 });
    const sendNotification = vi.fn().mockRejectedValue(erreur410);
    vi.doMock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification } }));

    const { envoyerAlertePraticien } = await import('./notifications.js');
    const { client, deleted } = creerSupabaseFake([
      { id: 'abo-1', endpoint: 'https://push.example/1', p256dh: 'p1', auth_key: 'a1' },
    ], 'praticien_push_subscriptions');

    const resultat = await envoyerAlertePraticien(client, 'praticien-1', MESSAGE_PRATICIEN);

    expect(resultat).toEqual({ nbEnvoyes: 0, nbEchecs: 1 });
    expect(deleted).toEqual(['abo-1']);
  });

  it('conserve l\'abonnement en cas d\'erreur temporaire (ex: 500)', async () => {
    Object.assign(process.env, ENV_VAPID);

    const erreur500 = Object.assign(new Error('Server error'), { statusCode: 500 });
    const sendNotification = vi.fn().mockRejectedValue(erreur500);
    vi.doMock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification } }));

    const { envoyerAlertePraticien } = await import('./notifications.js');
    const { client, deleted } = creerSupabaseFake([
      { id: 'abo-1', endpoint: 'https://push.example/1', p256dh: 'p1', auth_key: 'a1' },
    ], 'praticien_push_subscriptions');

    const resultat = await envoyerAlertePraticien(client, 'praticien-1', MESSAGE_PRATICIEN);

    expect(resultat).toEqual({ nbEnvoyes: 0, nbEchecs: 1 });
    expect(deleted).toEqual([]);
  });

  it('ne plante pas si les clés VAPID sont invalides (setVapidDetails lève une exception)', async () => {
    Object.assign(process.env, ENV_VAPID);

    const setVapidDetails = vi.fn(() => {
      throw new Error('Vapid public key should be 65 bytes long when decoded.');
    });
    const sendNotification = vi.fn();
    vi.doMock('web-push', () => ({ default: { setVapidDetails, sendNotification } }));

    const { envoyerAlertePraticien } = await import('./notifications.js');
    const { client } = creerSupabaseFake([
      { id: 'abo-1', endpoint: 'https://push.example/1', p256dh: 'p1', auth_key: 'a1' },
    ], 'praticien_push_subscriptions');

    const resultat = await envoyerAlertePraticien(client, 'praticien-1', MESSAGE_PRATICIEN);

    expect(resultat).toEqual({ nbEnvoyes: 0, nbEchecs: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
