// api/cron/renouveler-contrats.ts
//
// POST /api/cron/renouveler-contrats — endpoint déclenché quotidiennement
// par un job pg_cron (Supabase, via pg_net), sur le même modèle que
// api/cron/rappels.ts. Voir supabase/migrations/20260911_cron_renouveler_contrats.sql
// pour la configuration côté Supabase.
//
// Protection : l'appelant doit fournir l'en-tête `x-cron-secret` avec la
// valeur de la variable d'environnement CRON_SECRET (même secret que
// api/cron/rappels.ts — les deux jobs partagent la même protection).
//
// Renouvelle silencieusement (aucune notification à Pierre) les contrats à
// durée indéterminée dont l'échéance approche : prolonge date_fin d'un an et
// génère les séances de la nouvelle période, d'après le motif déclaré sur le
// contrat (jours_fixe / nb_seances_semaine / durees_seances / heure_debut) —
// jamais d'après les séances déjà générées. Toute la logique est dans
// api/_lib/renouvellementContrats.ts (testable indépendamment de ce
// handler HTTP).

import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, format } from 'date-fns';
import { getServiceClient } from '../_lib/patientAuth.js';
import { withSentry } from '../_lib/sentry.js';
import { secretsIdentiques } from '../_lib/secrets.js';
import { MARGE_RENOUVELLEMENT_JOURS, renouvelerContratsEligibles } from '../_lib/renouvellementContrats.js';

export default withSentry(async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'CRON_SECRET non configuré' });
  }

  const header = req.headers['x-cron-secret'];
  const fourni = Array.isArray(header) ? header[0] : header;
  // Comparaison à temps constant — voir api/_lib/secrets.ts.
  if (!secretsIdentiques(fourni ?? '', secret)) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  let supabase: SupabaseClient;
  try {
    supabase = getServiceClient();
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }

  try {
    const maintenant = new Date();
    const aujourdhuiStr = format(maintenant, 'yyyy-MM-dd');
    const seuilDateFin = format(addDays(maintenant, MARGE_RENOUVELLEMENT_JOURS), 'yyyy-MM-dd');

    const resultats = await renouvelerContratsEligibles(supabase, seuilDateFin, aujourdhuiStr);
    const seancesCreees = resultats.reduce((acc, r) => acc + ('seancesCreees' in r ? r.seancesCreees : 0), 0);
    const erreurs = resultats.filter((r): r is { contratId: string; erreur: string } => 'erreur' in r);
    // jours_fixe manquant : ni erreur technique ni renouvellement, contrat
    // volontairement non touché. Remonté ici pour les logs Vercel, mais le
    // signalement qui compte pour Pierre est côté UI (useContrats.ts,
    // contratsSansJours), indépendant de cette réponse.
    const anomalies = resultats.filter((r): r is { contratId: string; anomalie: 'jours_fixe_manquant' } => 'anomalie' in r);

    return res.status(200).json({
      examines: resultats.length,
      renouveles: resultats.length - erreurs.length - anomalies.length,
      seancesCreees,
      erreurs,
      anomalies,
    });
  } catch (err) {
    // Détail de l'exception plutôt qu'un "Erreur serveur" générique — utile
    // pour diagnostiquer depuis les logs Vercel sans avoir à deviner.
    const detail = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: 'Erreur serveur', detail: detail.slice(0, 500) });
  }
});
