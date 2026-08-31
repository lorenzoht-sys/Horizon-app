// Validation du numero SIRET, partagee par les TROIS ecrans qui le
// collectent : les reglages desktop, l'onboarding et les reglages mobile.
//
// ── Pourquoi ce module existe ───────────────────────────────────────────
// La validation ne vivait que dans SettingsPage, et n'y controlait que la
// longueur. L'onboarding et l'ecran mobile n'en avaient aucune : ils
// enregistraient la saisie telle quelle. C'est par la qu'un SIRET de 15
// chiffres est entre en base, et rien n'etait la pour l'arreter.
//
// ── Pourquoi la cle de Luhn, et pas seulement la longueur ───────────────
// Le SIRET porte une cle de controle de Luhn sur ses 14 chiffres. Les trois
// fautes de frappe reelles — un chiffre en trop, un chiffre oublie, deux
// chiffres intervertis — cassent cette cle. Ne verifier que la longueur les
// laisse toutes passer des lors que le compte tombe juste, et le mauvais
// numero part sur un contrat de prestation qui engage.
//
// Une exception connue n'est PAS traitee ici : les SIRET de La Poste
// (prefixe 356000000) ne respectent pas Luhn. Aucun praticien APA n'emet de
// contrat sous ce SIREN ; l'ajouter serait une branche morte.
//
// ── Pourquoi un module a part, et pas dans settingsPraticien ────────────
// `settingsPraticien` importe le client Supabase. L'onboarding n'a besoin
// que de la validation. Ici, rien a importer : une fonction pure, testee
// dans siret.test.ts.

/** Ce qui a echoue. Chaque cas a son message : « absent » et « invalide »
 *  demandent deux gestes differents a l'utilisateur. */
export type EchecSiret = 'absent' | 'format' | 'longueur' | 'cle';

export interface ResultatSiret {
  valide: boolean;
  /** Saisie normalisee (espaces retires), a enregistrer telle quelle. */
  siret: string;
  echec?: EchecSiret;
  /** Message pret a afficher. Vide si valide. */
  message?: string;
}

/** Retire les espaces de saisie. Le SIRET s'ecrit « 123 456 789 00012 ». */
export function normaliserSiret(saisie: string): string {
  return (saisie ?? '').replace(/\s/g, '');
}

/**
 * Cle de Luhn sur les 14 chiffres.
 *
 * Parcours de droite a gauche, un chiffre sur deux double ; un resultat au
 * dessus de 9 perd 9 (equivaut a additionner ses deux chiffres). La somme
 * doit etre un multiple de 10.
 */
function cleLuhnValide(siret: string): boolean {
  let somme = 0;
  for (let i = siret.length - 1, rang = 0; i >= 0; i--, rang++) {
    let chiffre = siret.charCodeAt(i) - 48;
    if (rang % 2 === 1) {
      chiffre *= 2;
      if (chiffre > 9) chiffre -= 9;
    }
    somme += chiffre;
  }
  return somme % 10 === 0;
}

/**
 * Valide une saisie de SIRET.
 *
 * Une saisie vide rend `echec: 'absent'` — c'est a l'appelant de decider si
 * l'absence bloque. Elle ne bloque pas dans les reglages (un salarie de
 * structure n'a pas de SIRET personnel), elle bloque a la generation d'un
 * contrat de prestation. Cette regle vit chez les appelants, pas ici.
 */
export function validerSiret(saisie: string): ResultatSiret {
  const siret = normaliserSiret(saisie);

  if (!siret) {
    return {
      valide: false,
      siret: '',
      echec: 'absent',
      message: 'Renseignez votre numéro SIRET : il figure obligatoirement sur les contrats de prestation.',
    };
  }

  if (!/^\d+$/.test(siret)) {
    return {
      valide: false,
      siret,
      echec: 'format',
      message: 'Le SIRET ne doit contenir que des chiffres.',
    };
  }

  if (siret.length !== 14) {
    return {
      valide: false,
      siret,
      echec: 'longueur',
      message: `Le SIRET doit contenir exactement 14 chiffres — vous en avez saisi ${siret.length}.`,
    };
  }

  if (!cleLuhnValide(siret)) {
    return {
      valide: false,
      siret,
      echec: 'cle',
      message: 'Ce SIRET comporte bien 14 chiffres, mais sa clé de contrôle est fausse. Vérifiez votre saisie.',
    };
  }

  return { valide: true, siret };
}
