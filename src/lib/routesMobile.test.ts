import { describe, expect, it } from 'vitest';
import { URLS_MOBILE, ecranMobileDepuisUrl, estRouteInterfaceUnique, ongletDepuisUrl } from './routesMobile';

function ecran(url: string) {
  const u = new URL(url, 'https://horizon.test');
  return ecranMobileDepuisUrl(u.pathname, u.search);
}

describe('estRouteInterfaceUnique', () => {
  it('sert la fiche bénéficiaire par l’interface unique', () => {
    expect(estRouteInterfaceUnique('/participant/abc-123')).toBe(true);
    expect(estRouteInterfaceUnique('/participant/abc-123/')).toBe(true);
  });

  it('pas ses sous-écrans, ni les autres écrans', () => {
    for (const p of ['/', '/participant/abc/bilan/new', '/participant/abc/programme', '/participants/nouveau', '/tournee']) {
      expect(estRouteInterfaceUnique(p)).toBe(false);
    }
  });

  it('sert aussi /archives (bénéficiaires archivés)', () => {
    expect(estRouteInterfaceUnique('/archives')).toBe(true);
    expect(estRouteInterfaceUnique('/archives/')).toBe(true);
  });
});

describe('ecranMobileDepuisUrl', () => {
  it('onglets de la barre du bas', () => {
    expect(ecran('/')).toEqual({ ecran: 'accueil' });
    expect(ecran(URLS_MOBILE.beneficiaires)).toEqual({ ecran: 'beneficiaires' });
    expect(ecran(URLS_MOBILE.saisie)).toEqual({ ecran: 'saisie' });
    expect(ecran(URLS_MOBILE.plus)).toEqual({ ecran: 'plus' });
    expect(ecran(URLS_MOBILE.tournee)).toEqual({ ecran: 'tournee' });
    expect(ecran(URLS_MOBILE.assistant)).toEqual({ ecran: 'assistant', beneficiaireId: null });
  });

  it('les URL construites pointent vers le bon écran (aller-retour)', () => {
    expect(ecran(URLS_MOBILE.assistantAvec('p1'))).toEqual({ ecran: 'assistant', beneficiaireId: 'p1' });
    expect(ecran(URLS_MOBILE.parametres)).toEqual({ ecran: 'parametres' });
    expect(ecran(URLS_MOBILE.nouveauBeneficiaire)).toEqual({ ecran: 'nouveauBeneficiaire' });
    expect(ecran(URLS_MOBILE.modifierBeneficiaire('p1'))).toEqual({ ecran: 'modifierBeneficiaire', participantId: 'p1' });
    expect(ecran(URLS_MOBILE.nouveauBilan('p1'))).toEqual({ ecran: 'nouveauBilan', participantId: 'p1' });
    expect(ecran(URLS_MOBILE.choixBeneficiaireBilan)).toEqual({ ecran: 'nouveauBilan', participantId: null });
    expect(ecran(URLS_MOBILE.detailBilan('p1', 'b9'))).toEqual({ ecran: 'detailBilan', participantId: 'p1', bilanId: 'b9' });
  });

  it('les URL mobiles sont celles des écrans desktop équivalents', () => {
    expect(URLS_MOBILE.fiche('p1')).toBe('/participant/p1');
    expect(URLS_MOBILE.nouveauBilan('p1')).toBe('/participant/p1/bilan/new');
    expect(URLS_MOBILE.detailBilan('p1', 'b9')).toBe('/participant/p1/bilan/b9');
    expect(URLS_MOBILE.modifierBeneficiaire('p1')).toBe('/participants/p1/modifier');
  });

  it('écrans desktop seulement : invite à tourner le téléphone, avec un retour sensé', () => {
    expect(ecran('/participant/p1/programme')).toEqual({ ecran: 'paysage', retour: '/participant/p1' });
    expect(ecran('/participant/p1/contrat/nouveau')).toEqual({ ecran: 'paysage', retour: '/participant/p1' });
    expect(ecran('/participant/p1/comparaison')).toEqual({ ecran: 'paysage', retour: '/participant/p1' });
    expect(ecran('/participant/p1/bilan/b9/edit')).toEqual({ ecran: 'paysage', retour: '/participant/p1' });
    for (const p of ['/agenda-v2', '/map', '/zones', '/stats', '/bibliotheque', '/structures/s1', '/admin/comptes']) {
      expect(ecran(p)).toEqual({ ecran: 'paysage', retour: URLS_MOBILE.plus });
    }
  });

  it('URL inconnue : accueil', () => {
    expect(ecran('/nimporte/quoi')).toEqual({ ecran: 'accueil' });
    expect(ecran('/?onglet=inconnu')).toEqual({ ecran: 'accueil' });
  });
});

describe('ongletDepuisUrl', () => {
  it('met en évidence l’onglet de l’écran, et « Bénéfic. » sur la fiche', () => {
    expect(ongletDepuisUrl('/', '')).toBe('accueil');
    expect(ongletDepuisUrl('/', '?onglet=plus')).toBe('plus');
    expect(ongletDepuisUrl('/tournee', '')).toBe('tournee');
    expect(ongletDepuisUrl('/participant/p1', '')).toBe('beneficiaires');
    expect(ongletDepuisUrl('/archives', '')).toBe('beneficiaires');
    expect(ongletDepuisUrl('/participants/nouveau', '')).toBeNull();
  });
});
