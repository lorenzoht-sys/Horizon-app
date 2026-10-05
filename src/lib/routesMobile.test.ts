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

  it('sert aussi le détail d’un bilan existant, mais pas sa création', () => {
    expect(estRouteInterfaceUnique('/participant/abc/bilan/xyz')).toBe(true);
    expect(estRouteInterfaceUnique('/participant/abc/bilan/xyz/')).toBe(true);
    // /bilan/new (création) reste mobile-only, hors de ce chantier.
    expect(estRouteInterfaceUnique('/participant/abc/bilan/new')).toBe(false);
  });

  it('sert aussi le rapport d’évolution (comparaison de tous les bilans)', () => {
    expect(estRouteInterfaceUnique('/participant/abc/comparaison')).toBe(true);
    expect(estRouteInterfaceUnique('/participant/abc/comparaison/')).toBe(true);
  });

  it('sert aussi la création d’un contrat de suivi', () => {
    expect(estRouteInterfaceUnique('/participant/abc/contrat/nouveau')).toBe(true);
    expect(estRouteInterfaceUnique('/participant/abc/contrat/nouveau/')).toBe(true);
    // Les autres sous-écrans « contrat » restent desktop seulement.
    expect(estRouteInterfaceUnique('/participant/abc/contrat/c9')).toBe(false);
  });

  it('sert aussi la bibliothèque (exercices, modèles)', () => {
    expect(estRouteInterfaceUnique('/bibliotheque')).toBe(true);
    expect(estRouteInterfaceUnique('/bibliotheque/')).toBe(true);
  });

  it('sert aussi les structures (liste + détail)', () => {
    expect(estRouteInterfaceUnique('/structures')).toBe(true);
    expect(estRouteInterfaceUnique('/structures/')).toBe(true);
    expect(estRouteInterfaceUnique('/structures/abc-123')).toBe(true);
    expect(estRouteInterfaceUnique('/structures/abc-123/')).toBe(true);
  });

  it('sert aussi la facturation (à valider + validées), cible de la notification du 1er du mois', () => {
    expect(estRouteInterfaceUnique('/factures')).toBe(true);
    expect(estRouteInterfaceUnique('/factures/')).toBe(true);
    expect(estRouteInterfaceUnique('/factures/a-valider')).toBe(true);
    expect(estRouteInterfaceUnique('/factures/a-valider/')).toBe(true);
  });

  it('sert le profil de facturation, sous-page de Paramètres, sans changer /settings', () => {
    expect(estRouteInterfaceUnique('/settings/facturation')).toBe(true);
    expect(estRouteInterfaceUnique('/settings/facturation/')).toBe(true);
    expect(estRouteInterfaceUnique('/settings')).toBe(false);          // reste l'écran natif « parametres »
    expect(estRouteInterfaceUnique('/settings/autre')).toBe(false);
    expect(estRouteInterfaceUnique('/settings/facturation/x')).toBe(false);
  });

  it('ne sert que ces deux écrans de facturation, pas des routes voisines', () => {
    expect(estRouteInterfaceUnique('/factures/abc-123')).toBe(false);
    expect(estRouteInterfaceUnique('/factures/a-valider/x')).toBe(false);
    expect(estRouteInterfaceUnique('/facturation')).toBe(false);
    expect(estRouteInterfaceUnique('/facturesx')).toBe(false);
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

  it('/agenda : écran natif mobile (sous-chantier 1), distinct de /agenda-v2 (desktop seulement)', () => {
    expect(ecran(URLS_MOBILE.agenda)).toEqual({ ecran: 'agenda', date: null });
    expect(ecran('/agenda-v2')).toEqual({ ecran: 'paysage', retour: URLS_MOBILE.plus });
  });

  it('/agenda?date=AAAA-MM-JJ : jour à ouvrir (lien de la notification « absence signalée »)', () => {
    expect(ecran(URLS_MOBILE.agendaJour('2026-10-07'))).toEqual({ ecran: 'agenda', date: '2026-10-07' });
    expect(URLS_MOBILE.agendaJour('2026-10-07')).toBe('/agenda?date=2026-10-07');
    expect(ongletDepuisUrl('/agenda', '?date=2026-10-07')).toBeNull();
  });

  it('/agenda?date= illisible ou inexistante : aujourd\'hui, comme sans paramètre', () => {
    for (const d of ['', '2026-10', '07-10-2026', '2026-02-31', '2026-13-01', 'demain']) {
      expect(ecran(`/agenda?date=${d}`)).toEqual({ ecran: 'agenda', date: null });
    }
    expect(ecran('/agenda?date=2028-02-29')).toEqual({ ecran: 'agenda', date: '2028-02-29' });
  });

  it('les URL construites pointent vers le bon écran (aller-retour)', () => {
    expect(ecran(URLS_MOBILE.assistantAvec('p1'))).toEqual({ ecran: 'assistant', beneficiaireId: 'p1' });
    expect(ecran(URLS_MOBILE.parametres)).toEqual({ ecran: 'parametres' });
    expect(ecran(URLS_MOBILE.nouveauBeneficiaire)).toEqual({ ecran: 'nouveauBeneficiaire' });
    expect(ecran(URLS_MOBILE.modifierBeneficiaire('p1'))).toEqual({ ecran: 'modifierBeneficiaire', participantId: 'p1' });
    expect(ecran(URLS_MOBILE.nouveauBilan('p1'))).toEqual({ ecran: 'nouveauBilan', participantId: 'p1' });
    expect(ecran(URLS_MOBILE.choixBeneficiaireBilan)).toEqual({ ecran: 'nouveauBilan', participantId: null });
  });

  it('les URL mobiles sont celles des écrans desktop équivalents', () => {
    expect(URLS_MOBILE.fiche('p1')).toBe('/participant/p1');
    expect(URLS_MOBILE.nouveauBilan('p1')).toBe('/participant/p1/bilan/new');
    expect(URLS_MOBILE.modifierBeneficiaire('p1')).toBe('/participants/p1/modifier');
  });

  it('écrans desktop seulement : écran « bientôt en version mobile », avec un retour sensé', () => {
    expect(ecran('/participant/p1/programme')).toEqual({ ecran: 'paysage', retour: '/participant/p1' });
    expect(ecran('/participant/p1/bilan/b9/edit')).toEqual({ ecran: 'paysage', retour: '/participant/p1' });
    for (const p of ['/agenda-v2', '/map', '/zones', '/stats', '/admin/comptes']) {
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
    expect(ongletDepuisUrl('/participant/p1/bilan/b9', '')).toBe('beneficiaires');
    expect(ongletDepuisUrl('/participant/p1/comparaison', '')).toBe('beneficiaires');
    expect(ongletDepuisUrl('/participant/p1/contrat/nouveau', '')).toBe('beneficiaires');
    expect(ongletDepuisUrl('/participants/nouveau', '')).toBeNull();
    // /agenda n'est pas un onglet de la barre du bas (atteint depuis « Plus »,
    // même situation que /assistant) : aucun onglet mis en évidence.
    expect(ongletDepuisUrl('/agenda', '')).toBeNull();
  });
});
