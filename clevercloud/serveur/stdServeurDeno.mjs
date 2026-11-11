// Remplace https://deno.land/std/http/server.ts (import de analyser-seance).
export const serve = traitement => globalThis.Deno.serve(traitement);
