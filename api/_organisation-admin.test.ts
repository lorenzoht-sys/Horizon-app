// Liste des comptes de l'administration (étape 4 des rôles).
//
// Deux points seulement, mais ce sont les deux qui peuvent faire mal :
//
//   1. CE QUI PART SUR LE FIL. `construireCompte` est une liste blanche.
//      Un `...u` à sa place mettrait tout l'objet auth de Supabase dans la
//      réponse — `user_metadata`, `identities`, `recovery_sent_at`… Le test
//      compare l'ENSEMBLE EXACT des clés produites, il ne vérifie pas
//      l'absence de quelques champs choisis : une liste d'interdits en
//      oublie toujours un (règle de méthode, docs/PLAN-BETA.md).
//
//   2. LE BANNISSEMENT EXPIRÉ. `banned_until` est une date, pas un booléen.
//      Traiter sa seule présence comme « désactivé » afficherait comme tel
//      un compte redevenu utilisable, et un admin le « réactiverait » sans
//      que rien ne change — panne silencieuse, du côté rassurant.
import { describe, it, expect } from 'vitest';
import { construireCompte } from './organisation.js';

const MAINTENANT = Date.parse('2026-08-29T12:00:00Z');

function userAuth(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u-1',
    email: 'praticien@example.test',
    created_at: '2026-01-01T00:00:00Z',
    last_sign_in_at: '2026-08-28T09:00:00Z',
    email_confirmed_at: '2026-01-01T00:05:00Z',
    banned_until: null,
    // Ce que Supabase renvoie EN PLUS, et qui ne doit jamais sortir :
    user_metadata: { prenom: 'Pierre', interne: 'secret' },
    app_metadata: { provider: 'email' },
    identities: [{ id: 'i-1', identity_data: { sub: 'u-1' } }],
    recovery_sent_at: '2026-08-01T00:00:00Z',
    phone: '+33600000000',
    ...overrides,
  };
}

const praticien = { id: 'u-1', prenom: 'Pierre', nom: 'Durand', email: 'praticien@example.test' };

describe('construireCompte — ce qui part sur le fil', () => {
  it("ne produit QUE les clés autorisées, quel que soit l'objet source", () => {
    const autorisees = [
      'actif', 'appRole', 'creeLe', 'derniereConnexion', 'email',
      'emailConfirme', 'id', 'nom', 'prenom', 'sansFichePraticien',
    ];
    const compte = construireCompte(userAuth(), praticien, 'praticien', MAINTENANT);
    expect(Object.keys(compte).sort()).toEqual(autorisees);
  });

  it('ne laisse fuir aucune métadonnée auth, même sérialisé', () => {
    const brut = JSON.stringify(construireCompte(userAuth(), praticien, 'praticien', MAINTENANT));
    for (const interdit of ['user_metadata', 'app_metadata', 'identities', 'recovery_sent_at', 'secret', '+33600000000']) {
      expect(brut, `« ${interdit} » se retrouve dans la réponse`).not.toContain(interdit);
    }
  });

  it('signale un compte auth sans fiche praticien au lieu de le masquer', () => {
    const compte = construireCompte(userAuth(), undefined, null, MAINTENANT);
    expect(compte.sansFichePraticien).toBe(true);
    expect(compte.prenom).toBeNull();
    expect(compte.appRole).toBeNull();
  });
});

describe('construireCompte — statut actif / désactivé', () => {
  it('actif quand banned_until est absent', () => {
    expect(construireCompte(userAuth(), praticien, 'praticien', MAINTENANT).actif).toBe(true);
  });

  it('désactivé quand le bannissement court encore', () => {
    const u = userAuth({ banned_until: '2126-08-05T00:00:00Z' });
    expect(construireCompte(u, praticien, 'praticien', MAINTENANT).actif).toBe(false);
  });

  it('ACTIF quand le bannissement est expiré — une date, pas un booléen', () => {
    const u = userAuth({ banned_until: '2026-08-28T00:00:00Z' }); // la veille
    expect(
      construireCompte(u, praticien, 'praticien', MAINTENANT).actif,
      "un bannissement expiré ne désactive plus : l'afficher comme désactivé ferait « réactiver » sans effet",
    ).toBe(true);
  });

  it('actif quand banned_until est illisible, plutôt que de bloquer sur un parasite', () => {
    const u = userAuth({ banned_until: 'pas-une-date' });
    expect(construireCompte(u, praticien, 'praticien', MAINTENANT).actif).toBe(true);
  });
});
