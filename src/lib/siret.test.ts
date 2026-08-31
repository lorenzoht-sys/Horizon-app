import { describe, it, expect } from 'vitest';
import { validerSiret, normaliserSiret } from './siret';

// Le SIRET de reference est celui releve en base pendant l'audit
// (praticiens.320b9e08) : 14 chiffres, cle de Luhn juste.
const SIRET_VALIDE = '99082925100018';

describe('validerSiret', () => {
  it('accepte un SIRET a 14 chiffres dont la cle est juste', () => {
    const r = validerSiret(SIRET_VALIDE);
    expect(r.valide).toBe(true);
    expect(r.siret).toBe(SIRET_VALIDE);
    expect(r.echec).toBeUndefined();
  });

  it('accepte la saisie espacee et la normalise', () => {
    const r = validerSiret('990 829 251 000 18');
    expect(r.valide).toBe(true);
    expect(r.siret).toBe(SIRET_VALIDE);
  });

  it('distingue une saisie absente', () => {
    expect(validerSiret('').echec).toBe('absent');
    expect(validerSiret('   ').echec).toBe('absent');
  });

  // Le cas qui a motive ce module : la ligne praticiens.b9930ad6 portait
  // 15 chiffres, entree par un ecran sans validation.
  it('refuse 15 chiffres', () => {
    const r = validerSiret('111111111111111');
    expect(r.valide).toBe(false);
    expect(r.echec).toBe('longueur');
    expect(r.message).toContain('15');
  });

  it('refuse 13 chiffres', () => {
    expect(validerSiret('9908292510001').echec).toBe('longueur');
  });

  it('refuse les caracteres non numeriques', () => {
    expect(validerSiret('9908292510001A').echec).toBe('format');
  });

  it('refuse 14 chiffres dont la cle est fausse', () => {
    expect(validerSiret('11111111111111').echec).toBe('cle');
  });

  // Faute de frappe reelle : un chiffre change, la longueur reste bonne.
  // C'est exactement ce qu'un controle de longueur seul laisse passer.
  it('attrape un chiffre errone que la longueur ne voit pas', () => {
    const r = validerSiret('99082925100017');
    expect(r.siret).toHaveLength(14);
    expect(r.echec).toBe('cle');
  });

  it('donne un message different pour absent et pour invalide', () => {
    const absent = validerSiret('');
    const invalide = validerSiret('11111111111111');
    expect(absent.message).not.toBe(invalide.message);
    expect(absent.message).toBeTruthy();
    expect(invalide.message).toBeTruthy();
  });
});

describe('normaliserSiret', () => {
  it('retire les espaces sans toucher aux chiffres', () => {
    expect(normaliserSiret(' 990 829 251 000 18 ')).toBe(SIRET_VALIDE);
  });
});
