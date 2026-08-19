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
// [F-02, docs/RAPPORT_SECURITE.md] Génération via crypto.getRandomValues
// (Web Crypto API) plutôt que Math.random() — non prédictible même en
// observant plusieurs codes générés, contrairement au PRNG interne du
// moteur JS. Choisi plutôt que node:crypto pour rester le même appel dans
// les deux contextes d'exécution de ce fichier (navigateur ET script Node
// via tsx, qui expose aussi `crypto` en global depuis Node 19). Format/
// alphabet/longueur inchangés : les codes déjà distribués aux patients
// existants restent valides, aucune rotation nécessaire.

const ALPHABET_CODE_ACCES = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const LONGUEUR_CODE_ACCES = 8;

export function genererCodeAcces(): string {
  const valeurs = new Uint32Array(LONGUEUR_CODE_ACCES);
  crypto.getRandomValues(valeurs);
  let code = '';
  for (let i = 0; i < LONGUEUR_CODE_ACCES; i++) {
    code += ALPHABET_CODE_ACCES[valeurs[i] % ALPHABET_CODE_ACCES.length];
  }
  return code;
}
