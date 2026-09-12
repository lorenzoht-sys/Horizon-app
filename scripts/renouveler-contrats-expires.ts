// scripts/renouveler-contrats-expires.ts
//
// Remédiation ponctuelle, à lancer UNE FOIS au déploiement du renouvellement
// automatique des contrats à durée indéterminée (api/cron/renouveler-contrats.ts) :
// applique la même logique de renouvellement à tous les contrats
// duree_indeterminee = true déjà expirés (date_fin < aujourd'hui) au moment
// du déploiement, pour qu'aucun ne reste bloqué à attendre le prochain
// passage du cron (qui ne les resélectionnera qu'une fois leur date_fin
// retombée dans la marge — MARGE_RENOUVELLEMENT_JOURS jours avant
// l'échéance — donc jamais pour un contrat déjà passé cette échéance tant
// que ce script ne l'a pas remis en état une première fois).
//
// N'est PAS un endpoint : script à usage unique, exécuté depuis la machine
// du développeur (ou une étape de déploiement), jamais exposé sur Vercel.
//
// Usage (PowerShell) :
//   $env:VITE_SUPABASE_URL = "https://xxxx.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY = "eyJ..."   (clé service_role — jamais le anon key)
//   npx tsx scripts/renouveler-contrats-expires.ts
//
// Idempotent : relancer ce script ne fait rien de plus si tous les contrats
// concernés ont déjà été renouvelés (aucun contrat "déjà expiré" ne reste en
// base une fois traité — voir api/_lib/renouvellementContrats.ts).

import { createClient } from '@supabase/supabase-js';
import { addDays, format } from 'date-fns';
import { chargerContratsEligibles, renouvelerContratsEligibles } from '../api/_lib/renouvellementContrats.js';

async function main() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Variables manquantes : VITE_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requises.');
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const aujourdhuiStr = format(new Date(), 'yyyy-MM-dd');
  // "Déjà expiré" = date_fin strictement avant aujourd'hui, conformément au
  // diagnostic (deja_expire). Les contrats qui expirent seulement bientôt
  // sont laissés au cron régulier (MARGE_RENOUVELLEMENT_JOURS).
  const seuilDejaExpire = format(addDays(new Date(), -1), 'yyyy-MM-dd');

  const contrats = await chargerContratsEligibles(supabase, seuilDejaExpire);
  console.log(`${contrats.length} contrat(s) à durée indéterminée déjà expiré(s) trouvé(s).`);
  if (contrats.length === 0) {
    console.log('Rien à faire.');
    return;
  }

  const resultats = await renouvelerContratsEligibles(supabase, seuilDejaExpire, aujourdhuiStr);

  let ok = 0;
  let echecs = 0;
  let sansJours = 0;
  for (const r of resultats) {
    if ('erreur' in r) {
      echecs++;
      console.error(`  ✗ contrat ${r.contratId} : ${r.erreur}`);
    } else if ('anomalie' in r) {
      sansJours++;
      console.warn(`  ⚠ contrat ${r.contratId} : jours_fixe non renseigné — non renouvelé, à compléter manuellement (Fiche bénéficiaire → Contrats)`);
    } else {
      ok++;
      console.log(`  ✓ contrat ${r.contratId} : date_fin ${r.ancienneDateFin} → ${r.nouvelleDateFin}, ${r.seancesCreees} séance(s) créée(s)`);
    }
  }

  console.log(`\n${ok} contrat(s) renouvelé(s), ${sansJours} sans jours_fixe (à compléter), ${echecs} échec(s).`);
  if (echecs > 0) process.exitCode = 1;
}

main().catch(err => {
  console.error('Erreur :', err);
  process.exit(1);
});
