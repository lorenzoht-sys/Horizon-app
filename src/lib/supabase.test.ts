// Détection du type de lien d'authentification (fragment Supabase).
//
// Cette fonction décide si l'utilisateur doit être verrouillé sur la page de
// définition du mot de passe. Se tromper dans un sens laisse entrer sans mot
// de passe quelqu'un qui n'a qu'un lien email ; se tromper dans l'autre
// enferme un utilisateur normal sur un formulaire qu'il ne peut pas valider.
//
// Le relevé réel se fait au chargement du module `supabase.ts`, avant
// `createClient` — impossible à rejouer dans un test. D'où l'extraction de la
// logique en fonction pure.
import { describe, it, expect } from 'vitest';
import { lireTypeLienAuth, lireErreurLienAuth } from './supabase';

describe('lireTypeLienAuth', () => {
  it('reconnaît un lien de récupération de mot de passe', () => {
    expect(lireTypeLienAuth('#access_token=abc&expires_in=3600&type=recovery')).toBe('recovery');
  });

  it("reconnaît un lien d'invitation", () => {
    expect(lireTypeLienAuth('#access_token=abc&type=invite&refresh_token=xyz')).toBe('invite');
  });

  it('tolère un fragment sans dièse en tête', () => {
    expect(lireTypeLienAuth('access_token=abc&type=recovery')).toBe('recovery');
  });

  it("ignore les types qui n'exigent pas de définir un mot de passe", () => {
    // 'signup' et 'magiclink' ouvrent une session ordinaire : les verrouiller
    // sur le formulaire de mot de passe bloquerait un utilisateur légitime.
    for (const type of ['signup', 'magiclink', 'email_change']) {
      expect(lireTypeLienAuth(`#access_token=abc&type=${type}`), type).toBeNull();
    }
  });

  it('renvoie null sur un fragment vide', () => {
    expect(lireTypeLienAuth('')).toBeNull();
    expect(lireTypeLienAuth('#')).toBeNull();
  });

  it("renvoie null quand le fragment ne porte qu'une erreur", () => {
    // Cas d'un lien expiré : Supabase renvoie une erreur, pas de jeton. Il ne
    // faut PAS verrouiller — l'utilisateur doit pouvoir redemander un lien.
    expect(lireTypeLienAuth('#error=access_denied&error_description=Email+link+is+invalid+or+has+expired')).toBeNull();
  });

  it('renvoie null quand le fragment a été perdu en route', () => {
    // Le cas réel du 2026-08-29 : le suivi des clics de Brevo réécrit le lien
    // et sa redirection perd le fragment, qui n'est jamais transmis au
    // serveur. La page est alors ouverte sans jeton — aucun verrou, et
    // l'utilisateur atterrit sur la connexion. C'est le bon comportement
    // faute de mieux : il ne faut pas enfermer quelqu'un sur un formulaire
    // qui ne peut pas aboutir.
    expect(lireTypeLienAuth('')).toBeNull();
  });
});

// Relevé de l'échec renvoyé par Supabase quand il REFUSE le lien.
//
// C'est le seul signal qui distingue un lien mort d'un lien frais : les deux
// arrivent à la même adresse, et `lireTypeLienAuth` renvoie null dans les deux
// cas. Tant que personne ne lisait ces paramètres, la page servait le
// formulaire à l'identique — un formulaire fantôme, pris pendant la recette de
// la PR #22 pour la preuve d'un lien réutilisable qui n'existait pas.
describe('lireErreurLienAuth', () => {
  it('reconnaît un lien expiré ou déjà consommé', () => {
    const erreur = lireErreurLienAuth(
      '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    );
    expect(erreur).toEqual({
      code: 'otp_expired',
      description: 'Email link is invalid or has expired',
    });
  });

  it('retombe sur `error` quand `error_code` est absent', () => {
    expect(lireErreurLienAuth('#error=access_denied')?.code).toBe('access_denied');
  });

  it('lit aussi la query string, pour les erreurs émises sans fragment', () => {
    expect(lireErreurLienAuth('', '?error_code=otp_expired')?.code).toBe('otp_expired');
  });

  it('ne signale rien sur un lien valide', () => {
    // Le cas qui compte le plus : un succès ne doit JAMAIS déclencher l'écran
    // d'échec, sinon on bloque un praticien dont le lien est parfaitement bon.
    expect(lireErreurLienAuth('#access_token=abc&type=recovery&expires_in=3600')).toBeNull();
  });

  it('ne signale rien sur une URL nue', () => {
    expect(lireErreurLienAuth('')).toBeNull();
    expect(lireErreurLienAuth('#')).toBeNull();
  });
});
