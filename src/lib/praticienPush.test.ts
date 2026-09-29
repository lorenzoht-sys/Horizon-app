import { describe, it, expect, vi } from 'vitest';
import { praticienEnregistrerAbonnementPush, praticienSupprimerAbonnementPush } from './praticienPush';
import type { SupabaseClient } from '@supabase/supabase-js';

// Mock minimal du client Supabase : reproduit uniquement la forme des
// chaînes utilisées par praticienPush.ts (from().upsert(...) et
// from().delete().eq().eq()), toutes deux thenables comme le vrai
// query builder supabase-js (résolvent directement en {data, error}).
function fakeSupabase(resultat: { error: unknown }) {
  const upsert = vi.fn(() => Promise.resolve(resultat));
  const eq = vi.fn(function (this: unknown) { return this; });
  const del = vi.fn(function (this: unknown) { return this; });
  const query = {
    upsert,
    delete: del,
    eq,
    then: (resolve: (v: { error: unknown }) => void) => resolve(resultat),
  };
  del.mockImplementation(() => query);
  eq.mockImplementation(() => query);
  const from = vi.fn(() => query);
  return { client: { from } as unknown as SupabaseClient, from, upsert, delete: del, eq };
}

const subscriptionValide: PushSubscriptionJSON = {
  endpoint: 'https://push.example/abc',
  keys: { p256dh: 'clé-p256dh', auth: 'clé-auth' },
};

describe('praticienEnregistrerAbonnementPush', () => {
  it('upsert la ligne avec le bon onConflict et renvoie true', async () => {
    const { client, from, upsert } = fakeSupabase({ error: null });
    const ok = await praticienEnregistrerAbonnementPush(client, 'praticien-1', subscriptionValide);
    expect(ok).toBe(true);
    expect(from).toHaveBeenCalledWith('praticien_push_subscriptions');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ praticien_id: 'praticien-1', endpoint: subscriptionValide.endpoint, p256dh: 'clé-p256dh', auth_key: 'clé-auth' }),
      { onConflict: 'praticien_id,endpoint' },
    );
  });

  it('renvoie false si Supabase renvoie une erreur', async () => {
    const { client } = fakeSupabase({ error: { message: 'boom' } });
    const ok = await praticienEnregistrerAbonnementPush(client, 'praticien-1', subscriptionValide);
    expect(ok).toBe(false);
  });

  it('renvoie false sans appeler Supabase si la subscription est incomplète', async () => {
    const { client, from } = fakeSupabase({ error: null });
    const ok = await praticienEnregistrerAbonnementPush(client, 'praticien-1', { endpoint: 'https://push.example/abc', keys: undefined } as unknown as PushSubscriptionJSON);
    expect(ok).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });
});

describe('praticienSupprimerAbonnementPush', () => {
  it('filtre par praticien_id ET endpoint, renvoie true', async () => {
    const { client, from, eq } = fakeSupabase({ error: null });
    const ok = await praticienSupprimerAbonnementPush(client, 'praticien-1', 'https://push.example/abc');
    expect(ok).toBe(true);
    expect(from).toHaveBeenCalledWith('praticien_push_subscriptions');
    expect(eq).toHaveBeenCalledWith('praticien_id', 'praticien-1');
    expect(eq).toHaveBeenCalledWith('endpoint', 'https://push.example/abc');
  });

  it('renvoie false si Supabase renvoie une erreur', async () => {
    const { client } = fakeSupabase({ error: { message: 'boom' } });
    const ok = await praticienSupprimerAbonnementPush(client, 'praticien-1', 'https://push.example/abc');
    expect(ok).toBe(false);
  });
});
