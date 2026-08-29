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
//   - connexionParCode  : participants.select().eq().maybeSingle()
//   - accesViaPraticien : auth.getUser(token) puis la RPC acces_participant_pour
//
// Le stub `rpc` manquait, et c'est ce qui cassait les trois tests
// d'accesViaPraticien (« supabase.rpc is not a function »), corrigé le
// 2026-08-29. Ce n'était pas un simple oubli de stub : le faux décrivait
// l'ANCIENNE implémentation, où la propriété se vérifiait en lisant
// `participants.praticien_id`. Elle passe désormais par
// `acces_participant_pour` (20260714_mode_organisation_acces_participant_pour.sql),
// qui accorde l'accès au propriétaire OU à un membre actif de l'organisation
// active du participant. Les tests affirmaient donc une sémantique que le
// code n'avait plus — ils ne protégeaient plus rien. Personne ne l'a vu
// parce que la CI n'exécutait pas `test:unit` (voir docs/PLAN-BETA.md).
function creerSupabaseFake(options: {
  participant?: { id: string; praticien_id?: string } | null;
  participantError?: unknown;
  authUser?: { id: string } | null;
  authError?: unknown;
  // Réponse de la RPC acces_participant_pour : le booléen qui décide.
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
    rpc: vi.fn(async (nom: string, _args: Record<string, unknown>) => {
      if (nom !== 'acces_participant_pour') throw new Error('RPC inattendue: ' + nom);
      return { data: options.acces ?? false, error: options.accesError ?? null };
    }),
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

  it("refuse l'accès quand acces_participant_pour répond false, et le journalise", async () => {
    const supabase = creerSupabaseFake({ authUser: { id: 'praticien-1' }, acces: false });
    const resultat = await accesViaPraticien(supabase, 'jwt-praticien', 'participant-1', '1.2.3.4');
    expect(resultat).toEqual({ status: 403, body: { error: 'Ce patient ne fait pas partie de votre liste.' } });
    expect(logAuditEvent).toHaveBeenCalledWith(supabase, 'patient_access_via_praticien', 'participant-1', '1.2.3.4', false);
    expect(signPatientToken).not.toHaveBeenCalled();
  });

  it("interroge la RPC avec l'id issu du JWT vérifié, jamais une valeur d'entrée", async () => {
    // Le point sensible de cette fonction : si l'identité de l'appelant
    // venait du corps de la requête, n'importe qui se ferait passer pour le
    // praticien propriétaire. Elle doit venir de getUser(), et de nulle part
    // ailleurs. Aucun des tests précédents ne le vérifiait.
    const supabase = creerSupabaseFake({ authUser: { id: 'praticien-verifie' }, acces: true });
    await accesViaPraticien(supabase, 'jwt-praticien', 'participant-1', '1.2.3.4');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((supabase as any).rpc).toHaveBeenCalledWith('acces_participant_pour', {
      p_participant_id: 'participant-1',
      p_user_id: 'praticien-verifie',
    });
  });

  it('renvoie 500 sans délivrer de token si la RPC échoue', async () => {
    const supabase = creerSupabaseFake({
      authUser: { id: 'praticien-1' },
      accesError: new Error('boom'),
    });
    const resultat = await accesViaPraticien(supabase, 'jwt-praticien', 'participant-1', '1.2.3.4');
    expect(resultat).toEqual({ status: 500, body: { error: 'Erreur serveur' } });
    expect(signPatientToken).not.toHaveBeenCalled();
  });

  it('refuse un participantId qui ne correspond à aucun patient', async () => {
    // La RPC répond false pour un participant inexistant comme pour celui
    // d'un autre praticien : même réponse, volontairement — l'appelant
    // n'apprend pas si l'identifiant existe.
    const supabase = creerSupabaseFake({ authUser: { id: 'praticien-1' }, acces: false });
    const resultat = await accesViaPraticien(supabase, 'jwt-praticien', 'participant-inconnu', '1.2.3.4');
    expect(resultat.status).toBe(403);
  });

  it('autorise quand acces_participant_pour répond true et renvoie un token (mêmes garanties que connexionParCode)', async () => {
    const supabase = creerSupabaseFake({ authUser: { id: 'praticien-1' }, acces: true });
    const resultat = await accesViaPraticien(supabase, 'jwt-praticien', 'participant-1', '1.2.3.4');
    expect(resultat).toEqual({ status: 200, body: { token: 'token-pour-participant-1', participantId: 'participant-1' } });
    expect(logAuditEvent).toHaveBeenCalledWith(supabase, 'patient_access_via_praticien', 'participant-1', '1.2.3.4', true);
    expect(signPatientToken).toHaveBeenCalledWith('participant-1');
  });
});
