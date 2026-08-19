import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// On mocke patientAuth.js : ce module a son propre comportement (rate
// limiting, signature JWT, audit) déjà en place en prod et non modifié par
// cette fusion. Ce qu'on veut valider ici, c'est UNIQUEMENT le dispatch et
// la logique métier propres à patientSession.ts (quelle requête Supabase,
// quel statut, quel corps de réponse) — pas re-tester le rate limiting.
const signPatientToken = vi.fn(async (participantId: string) => `token-pour-${participantId}`);
const checkRateLimit = vi.fn(async () => true);
const recordLoginAttempt = vi.fn(async () => {});
const logAuditEvent = vi.fn(async () => {});

// vi.doMock (contrairement à vi.mock) n'est pas hoisté : les vi.fn()
// ci-dessus sont donc déjà initialisés quand ce mock est enregistré.
vi.doMock('./patientAuth.js', () => ({
  signPatientToken,
  checkRateLimit,
  recordLoginAttempt,
  logAuditEvent,
}));

const { connexionParCode, accesViaPraticien } = await import('./patientSession.js');

// Simule juste assez de l'API supabase-js pour les deux chemins :
// participants.select().eq().maybeSingle(), et auth.getUser(token).
function creerSupabaseFake(options: {
  participant?: { id: string; praticien_id?: string } | null;
  participantError?: unknown;
  authUser?: { id: string } | null;
  authError?: unknown;
  // accesViaPraticien passe par la RPC acces_participant_pour (mode
  // organisation, 20260714_mode_organisation_acces_participant_pour.sql),
  // pas par une lecture directe de participants.praticien_id — voir
  // api/_lib/patientSession.ts:83-84.
  acces?: boolean;
  accesError?: unknown;
}) {
  const client = {
    auth: {
      getUser: vi.fn(async (_token: string) => ({
        data: { user: options.authUser ?? null },
        error: options.authError ?? null,
      })),
    },
    from(table: string) {
      if (table !== 'participants') throw new Error(`table inattendue: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: options.participant ?? null,
              error: options.participantError ?? null,
            }),
          }),
        }),
      };
    },
    rpc: vi.fn(async (_fn: string, _params: Record<string, unknown>) => ({
      data: options.acces ?? false,
      error: options.accesError ?? null,
    })),
  };
  return client as unknown as SupabaseClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimit.mockResolvedValue(true);
});

describe('connexionParCode (chemin 1 : connexion patient par code)', () => {
  it('rejette un code vide/absent sans même vérifier le rate limit', async () => {
    const supabase = creerSupabaseFake({ participant: null });
    const resultat = await connexionParCode(supabase, '', '1.2.3.4');
    expect(resultat).toEqual({ status: 400, body: { error: 'Code requis' } });
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it('bloque après trop de tentatives (rate limit)', async () => {
    checkRateLimit.mockResolvedValueOnce(false);
    const supabase = creerSupabaseFake({ participant: null });
    const resultat = await connexionParCode(supabase, 'ABCD1234', '1.2.3.4');
    expect(resultat.status).toBe(429);
    expect(logAuditEvent).toHaveBeenCalledWith(supabase, 'patient_login', null, '1.2.3.4', false);
  });

  it('refuse un code qui ne correspond à aucun participant', async () => {
    const supabase = creerSupabaseFake({ participant: null });
    const resultat = await connexionParCode(supabase, 'ZZZZ9999', '1.2.3.4');
    expect(resultat.status).toBe(401);
    expect(logAuditEvent).toHaveBeenCalledWith(supabase, 'patient_login', null, '1.2.3.4', false);
    expect(signPatientToken).not.toHaveBeenCalled();
  });

  it('connecte le patient avec un code valide (normalisé en majuscules) et renvoie un token', async () => {
    const supabase = creerSupabaseFake({ participant: { id: 'participant-1' } });
    const resultat = await connexionParCode(supabase, ' abcd1234 ', '1.2.3.4');
    expect(resultat).toEqual({ status: 200, body: { token: 'token-pour-participant-1', participantId: 'participant-1' } });
    expect(recordLoginAttempt).toHaveBeenCalledWith(supabase, '1.2.3.4');
    expect(logAuditEvent).toHaveBeenCalledWith(supabase, 'patient_login', 'participant-1', '1.2.3.4', true);
    expect(signPatientToken).toHaveBeenCalledWith('participant-1');
  });
});

describe('accesViaPraticien (chemin 2 : accès délégué par le praticien, sans code)', () => {
  it('rejette une requête sans participantId', async () => {
    const supabase = creerSupabaseFake({ authUser: { id: 'praticien-1' } });
    const resultat = await accesViaPraticien(supabase, 'jwt-praticien', '', '1.2.3.4');
    expect(resultat).toEqual({ status: 400, body: { error: 'participantId requis' } });
  });

  it('rejette un JWT praticien invalide ou expiré', async () => {
    const supabase = creerSupabaseFake({ authUser: null, authError: new Error('invalid') });
    const resultat = await accesViaPraticien(supabase, 'jwt-invalide', 'participant-1', '1.2.3.4');
    expect(resultat).toEqual({ status: 401, body: { error: 'Session invalide ou expirée' } });
  });

  it("refuse l'accès si le patient n'appartient pas à ce praticien (RPC acces_participant_pour → false)", async () => {
    const supabase = creerSupabaseFake({ authUser: { id: 'praticien-1' }, acces: false });
    const resultat = await accesViaPraticien(supabase, 'jwt-praticien', 'participant-1', '1.2.3.4');
    expect(resultat).toEqual({ status: 403, body: { error: 'Ce patient ne fait pas partie de votre liste.' } });
    expect(logAuditEvent).toHaveBeenCalledWith(supabase, 'patient_access_via_praticien', 'participant-1', '1.2.3.4', false);
    expect(signPatientToken).not.toHaveBeenCalled();
  });

  it('refuse un participantId qui ne correspond à aucun patient (RPC acces_participant_pour → false)', async () => {
    const supabase = creerSupabaseFake({ authUser: { id: 'praticien-1' }, acces: false });
    const resultat = await accesViaPraticien(supabase, 'jwt-praticien', 'participant-inconnu', '1.2.3.4');
    expect(resultat.status).toBe(403);
  });

  it('autorise le praticien propriétaire du patient et renvoie un token (mêmes garanties que connexionParCode)', async () => {
    const supabase = creerSupabaseFake({ authUser: { id: 'praticien-1' }, acces: true });
    const resultat = await accesViaPraticien(supabase, 'jwt-praticien', 'participant-1', '1.2.3.4');
    expect(resultat).toEqual({ status: 200, body: { token: 'token-pour-participant-1', participantId: 'participant-1' } });
    expect(supabase.rpc).toHaveBeenCalledWith('acces_participant_pour', { p_participant_id: 'participant-1', p_user_id: 'praticien-1' });
    expect(logAuditEvent).toHaveBeenCalledWith(supabase, 'patient_access_via_praticien', 'participant-1', '1.2.3.4', true);
    expect(signPatientToken).toHaveBeenCalledWith('participant-1');
  });
});
