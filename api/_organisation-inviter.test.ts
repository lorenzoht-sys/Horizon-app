// Résolution de l'origine du lien d'invitation (`admin.inviter`).
//
// C'est le seul morceau de `admin.inviter` qui décide quelque chose sans
// appeler Supabase — et c'est celui qui construit une URL envoyée par email à
// un praticien. S'il se trompe, l'invitation part vers une adresse qui n'est
// pas l'application.
//
// La frontière réelle reste la liste des Redirect URLs de Supabase, qui refuse
// toute redirection hors liste. Ces tests vérifient qu'on ne s'appuie pas
// dessus par accident : `APP_URL` doit primer sur tout en-tête quand elle est
// configurée.
import { describe, it, expect, afterEach } from 'vitest';
import { resoudreOrigineApp } from './organisation.js';

function requete(headers: Record<string, string | string[] | undefined>) {
  return { headers };
}

const APP_URL_INITIALE = process.env.APP_URL;

afterEach(() => {
  if (APP_URL_INITIALE === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = APP_URL_INITIALE;
});

describe('resoudreOrigineApp', () => {
  it('préfère APP_URL à tout en-tête', () => {
    // Le point du test : un en-tête `x-forwarded-host` hostile ne doit pas
    // pouvoir détourner le lien quand l'origine est configurée explicitement.
    process.env.APP_URL = 'https://app.horizon-suivi.fr';
    const origine = resoudreOrigineApp(requete({ 'x-forwarded-host': 'attaquant.example' }));
    expect(origine).toBe('https://app.horizon-suivi.fr');
  });

  it('retire le slash final de APP_URL', () => {
    // Sans ça le lien devient `https://app.example//reset-password`, que
    // Supabase compare littéralement à sa liste d'autorisation.
    process.env.APP_URL = 'https://app.horizon-suivi.fr/';
    expect(resoudreOrigineApp(requete({}))).toBe('https://app.horizon-suivi.fr');
  });

  it("retombe sur l'origine de la requête quand APP_URL est absente", () => {
    delete process.env.APP_URL;
    const origine = resoudreOrigineApp(requete({
      'x-forwarded-host': 'app.horizon-suivi.fr',
      'x-forwarded-proto': 'https',
    }));
    expect(origine).toBe('https://app.horizon-suivi.fr');
  });

  it('suppose https quand le protocole est absent', () => {
    delete process.env.APP_URL;
    expect(resoudreOrigineApp(requete({ host: 'app.horizon-suivi.fr' })))
      .toBe('https://app.horizon-suivi.fr');
  });

  it('ne garde que la première valeur d\'un en-tête à rallonge', () => {
    // Derrière plusieurs proxys, `x-forwarded-host` peut valoir
    // « a.example, b.example ». Concaténer les deux produirait une URL
    // invalide, et donc une invitation morte.
    delete process.env.APP_URL;
    expect(resoudreOrigineApp(requete({ 'x-forwarded-host': 'a.example, b.example' })))
      .toBe('https://a.example');
    expect(resoudreOrigineApp(requete({ 'x-forwarded-host': ['a.example', 'b.example'] })))
      .toBe('https://a.example');
  });

  it('renvoie null quand aucune origine ne peut être déterminée', () => {
    // Mieux vaut un 500 explicite qu'un lien construit sur « undefined ».
    delete process.env.APP_URL;
    expect(resoudreOrigineApp(requete({}))).toBeNull();
  });

  it('ignore une APP_URL vide ou blanche', () => {
    // Une variable déclarée mais vide sur Vercel ne doit pas court-circuiter
    // la détection : c'est une configuration oubliée, pas un choix.
    process.env.APP_URL = '   ';
    expect(resoudreOrigineApp(requete({ host: 'app.horizon-suivi.fr' })))
      .toBe('https://app.horizon-suivi.fr');
  });
});
