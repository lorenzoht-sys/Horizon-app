// Crochets de résolution des modules (module.register), installés par
// compatDeno.mjs. Ils tournent dans le fil des chargeurs de Node : aucun état
// partagé avec le serveur, la configuration arrive par `initialize`.
//
// Deux rôles :
//  1. faire tourner les Edge Functions telles quelles : leurs imports par URL
//     (deno.land, esm.sh) sont ramenés aux modules installés ;
//  2. donner aux routes et aux fonctions un client Supabase dont le stockage
//     peut être remplacé (clientCompat.mjs), sans modifier leur code.

let conf;

export async function initialize(donnees) {
  conf = donnees;
}

export async function resolve(specifier, context, nextResolve) {
  if (/^https:\/\/deno\.land\/std@[^/]+\/http\/server\.ts$/.test(specifier)) {
    return { url: conf.stdServeur, shortCircuit: true };
  }
  // https://esm.sh/@supabase/supabase-js@2.106.2 → @supabase/supabase-js
  const esm = /^https:\/\/esm\.sh\/((?:@[^/@]+\/)?[^/@]+)(?:@[^/]+)?$/.exec(specifier);
  const nom = esm ? esm[1] : specifier;

  const parent = context.parentURL ?? '';
  if (nom === '@supabase/supabase-js' && conf.perimetre.some(p => parent.startsWith(p))) {
    const reel = await nextResolve(nom, context);
    return { url: `${conf.clientCompat}?reel=${encodeURIComponent(reel.url)}`, shortCircuit: true };
  }
  return nextResolve(nom, context);
}
