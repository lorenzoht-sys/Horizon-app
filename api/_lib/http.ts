// Contrat HTTP des routes api/ : le sous-ensemble de l'API Vercel que les
// handlers utilisent, et que reproduit clevercloud/serveur/compatVercel.mjs
// (même liste, voir son en-tête). Typé ici pour se passer de `any` (27/11/2026).
import type { IncomingHttpHeaders } from 'node:http';

/** Corps JSON reçu : chaque champ est à valider avant usage. */
export type CorpsJson = Record<string, unknown>;

export interface RequeteApi {
  method?: string;
  url?: string;
  headers: IncomingHttpHeaders;
  query: Record<string, string | string[] | undefined>;
  body?: CorpsJson | null;
  socket?: { remoteAddress?: string };
}

export interface ReponseApi {
  headersSent: boolean;
  status(code: number): ReponseApi;
  json(valeur: unknown): ReponseApi;
  send(valeur: unknown): ReponseApi;
  setHeader(nom: string, valeur: string | number | readonly string[]): ReponseApi;
}

/**
 * Ligne lue par le client Supabase de service. Le dépôt n'a pas de types générés
 * pour la base : chaque colonne est `unknown` et se convertit là où elle est lue,
 * au lieu d'un `any` qui laisse tout passer.
 */
export type LigneBase = Record<string, unknown>;
