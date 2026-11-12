// Reprise des PDF de factures (2026-11-12, lot « facture PDF » de la migration HDS).
//
// Aujourd'hui, le trigger `factures_pdf_apres_validation` appelle l'Edge
// Function `facturation-pdf` par pg_net, avec un secret lu dans Vault. Ni l'un
// ni l'autre n'est garanti sur l'add-on PostgreSQL de Clever Cloud. Plutôt que
// de dépendre de la réponse de l'hébergeur, ce module fait le même travail
// depuis l'application : il cherche les factures validées sans `pdf_path` et
// appelle la MÊME fonction, avec le même en-tête `x-facturation-secret`.
// Aucune logique dupliquée : la composition, le stockage et l'idempotence
// restent dans supabase/functions/facturation-pdf.
//
// Gain par rapport au trigger : c'est une vraie reprise. Avec pg_net, un appel
// perdu (fonction indisponible, délai dépassé) laissait la facture sans PDF
// pour toujours ; ici elle est retentée au passage suivant.
//
// Désactivé par défaut (REPRISE_FACTURES_PDF=1 pour l'activer), instance 0
// seulement, comme le planificateur de cron.mjs. Sur la cible, la fonction SQL
// du trigger est neutralisée par clevercloud/sql/03_facture_pdf_sans_pg_net.sql.
// Ne pas l'activer sur une base où le trigger pg_net fonctionne encore : sans
// danger (la fonction est idempotente), mais inutile.
//
// Journaux : identifiants de facture seulement, jamais de contenu.

export const INTERVALLE_MS = 15_000;
const LOT = 20;
// Au-delà, une facture en échec répété n'est plus retentée jusqu'au redémarrage :
// une erreur durable (données incohérentes) ne doit pas boucler toutes les 15 s.
export const ESSAIS_MAX = 5;

export function repriseFacturesActive(env = process.env) {
  return env.REPRISE_FACTURES_PDF === '1' && (env.INSTANCE_NUMBER ?? '0') === '0';
}

/**
 * Un passage : lit les factures sans PDF, appelle la fonction pour chacune.
 * `echecs` (Map id → nombre d'essais ratés) est conservé d'un passage à l'autre.
 */
export async function passerReprise({ port, postgrest, cleService, secret, echecs, appeler = fetch }) {
  // Toute facture sortie de l'état brouillon doit avoir son PDF (elle a un
  // numéro et elle est inaltérable). Les plus anciennes d'abord.
  const rep = await appeler(
    `${postgrest}/factures?select=id&pdf_path=is.null&statut=in.(validee,envoyee,payee,en_retard)&order=date_emission.asc,id.asc&limit=${LOT + echecs.size}`,
    { headers: { apikey: cleService, authorization: `Bearer ${cleService}` } },
  );
  if (!rep.ok) throw new Error(`lecture des factures sans PDF refusée (${rep.status})`);
  const aTraiter = (await rep.json()).map(l => l.id).filter(id => (echecs.get(id) ?? 0) < ESSAIS_MAX).slice(0, LOT);

  let faits = 0;
  for (const id of aTraiter) {
    let ok = false;
    try {
      const r = await appeler(`http://127.0.0.1:${port}/functions/v1/facturation-pdf`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-facturation-secret': secret },
        body: JSON.stringify({ facture_id: id }),
      });
      ok = r.ok;
      if (!ok) console.error(`[reprise-pdf] facture ${id} : HTTP ${r.status}`);
    } catch (err) {
      console.error(`[reprise-pdf] facture ${id} : ${err?.name ?? 'Erreur'}`);
    }
    if (ok) { echecs.delete(id); faits++; continue; }
    const n = (echecs.get(id) ?? 0) + 1;
    echecs.set(id, n);
    if (n === ESSAIS_MAX) console.error(`[reprise-pdf] facture ${id} : abandon après ${ESSAIS_MAX} essais, à examiner.`);
  }
  return { vues: aTraiter.length, faites: faits };
}

export function demarrerRepriseFactures({ port, env = process.env, appeler = fetch, intervalle = INTERVALLE_MS } = {}) {
  if (!repriseFacturesActive(env)) return null;
  const postgrest = env.POSTGREST_URL?.replace(/\/+$/, '');
  const cleService = env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = env.FACTURATION_WEBHOOK_SECRET;
  if (!postgrest || !cleService || !secret) {
    console.error('[reprise-pdf] REPRISE_FACTURES_PDF=1 mais POSTGREST_URL, SUPABASE_SERVICE_ROLE_KEY ou FACTURATION_WEBHOOK_SECRET absent : reprise non démarrée.');
    return null;
  }
  const echecs = new Map();
  let minuteur;
  let arrete = false;
  const passer = async () => {
    try {
      const { faites } = await passerReprise({ port, postgrest, cleService, secret, echecs, appeler });
      if (faites > 0) console.log(`[reprise-pdf] ${faites} PDF généré(s).`);
    } catch (err) {
      console.error(`[reprise-pdf] passage en échec : ${err instanceof Error ? err.message : 'Erreur'}`);
    }
    // Replanifié après la fin du passage : jamais deux passages en parallèle.
    if (!arrete) minuteur = setTimeout(passer, intervalle);
  };
  minuteur = setTimeout(passer, intervalle);
  console.log('[reprise-pdf] reprise des PDF de factures active (instance 0).');
  return { arreter: () => { arrete = true; clearTimeout(minuteur); } };
}
