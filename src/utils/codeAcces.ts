// Code d'accès patient unique (fix-code-acces).
//
// Format : 8 caractères alphanumériques aléatoires, en MAJUSCULES, sans
// caractères ambigus à l'oral/écrit — 0/O, 1/I/L exclus — pour faciliter la
// communication du code par téléphone ou SMS. Exemple : K7P9X2M4.
//
// Utilisé côté client (génération à la création d'un participant, voir
// src/hooks/useParticipants.ts) et par scripts/backfill-code-acces.ts
// (attribution rétroactive aux participants existants).
//
// ── [F-02] Pourquoi `crypto.getRandomValues` et non `Math.random()` ──────
// Ce code est l'UNIQUE identifiant du portail bénéficiaire : le connaître,
// c'est ouvrir le dossier. Il a donc la valeur d'un mot de passe, et doit
// être tiré comme tel.
//
// `Math.random()` est un générateur pseudo-aléatoire non cryptographique
// (xorshift128+ dans V8). Sa suite est ENTIÈREMENT déterminée par un état
// interne de 128 bits : quelques sorties consécutives observées suffisent à
// remonter cet état, puis à prédire les suivantes. Un praticien qui crée
// deux fiches et lit leurs deux codes peut, en principe, prédire les codes
// que l'application attribuera ensuite — y compris à des bénéficiaires
// d'un autre praticien, la génération étant faite côté client avec le même
// générateur. Ce n'est pas une faiblesse de force brute (l'espace nominal
// reste 31^8 ≈ 8,5·10^11) : c'est une faiblesse de PRÉDICTIBILITÉ, et
// aucune limite de débit ne protège contre elle.
//
// `crypto.getRandomValues` (Web Crypto, disponible dans le navigateur et
// dans Node ≥ 18) tire d'un CSPRNG : aucune sortie n'informe sur les
// suivantes.
//
// ── Le modulo n'est pas neutre ───────────────────────────────────────────
// L'alphabet compte 31 caractères, qui ne divise pas 256. Écrire
// `octet % 31` rendrait les 8 premiers caractères de l'alphabet ~3 % plus
// probables que les 23 autres — un biais mesurable, qui réduit l'entropie
// réelle sous les 39,7 bits annoncés. Les octets ≥ 248 (= 8 × 31) sont donc
// écartés plutôt que repliés : c'est un tirage par rejet, la seule façon
// simple d'obtenir une distribution exactement uniforme.

// 31 caractères : chiffres 2-9 et lettres A-Z, PRIVÉS de 0, O, 1, I et L.
// Ne pas y toucher sans relire `verifierAlphabetDictable` dans
// codeAcces.test.ts : ces exclusions existent pour qu'un code reste
// dictable au téléphone, pas par esthétique.
const ALPHABET_CODE_ACCES = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const LONGUEUR_CODE_ACCES = 8;

// Plus grand multiple de la taille de l'alphabet tenant dans un octet.
// Tout octet au-dessus est rejeté (voir en-tête). 256 - (256 % 31) = 248.
const PLAFOND_SANS_BIAIS =
  256 - (256 % ALPHABET_CODE_ACCES.length);

export function genererCodeAcces(): string {
  let code = '';
  // Un tirage de 8 octets suffit dans ~76 % des cas (8/256 de rejet par
  // octet) ; la boucle en redemande tant que le compte n'y est pas.
  const tampon = new Uint8Array(LONGUEUR_CODE_ACCES);
  while (code.length < LONGUEUR_CODE_ACCES) {
    crypto.getRandomValues(tampon);
    for (const octet of tampon) {
      if (octet >= PLAFOND_SANS_BIAIS) continue;
      code += ALPHABET_CODE_ACCES[octet % ALPHABET_CODE_ACCES.length];
      if (code.length === LONGUEUR_CODE_ACCES) break;
    }
  }
  return code;
}
