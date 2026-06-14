// Code d'accès patient unique (fix-code-acces).
//
// Format : 8 caractères alphanumériques aléatoires, en MAJUSCULES, sans
// caractères ambigus à l'oral/écrit — 0/O, 1/I/L exclus — pour faciliter la
// communication du code par téléphone ou SMS. Exemple : K7P9X2M4.
//
// Utilisé côté client (génération à la création d'un participant, voir
// src/hooks/useParticipants.ts) et par scripts/backfill-code-acces.ts
// (attribution rétroactive aux participants existants).

const ALPHABET_CODE_ACCES = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const LONGUEUR_CODE_ACCES = 8;

export function genererCodeAcces(): string {
  let code = '';
  for (let i = 0; i < LONGUEUR_CODE_ACCES; i++) {
    code += ALPHABET_CODE_ACCES[Math.floor(Math.random() * ALPHABET_CODE_ACCES.length)];
  }
  return code;
}
