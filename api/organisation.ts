// POST /api/organisation
//
// Fusionne deux actions distinctes (dispatch par le champ `action` du
// body), sur le même principe que api/patient/session.ts (login/accès
// délégué fusionnés) — pour rester sous la limite de fonctions serverless
// du plan Vercel Hobby (12), voir supabase/migrations/README.md.
//
//   - { action: 'demande', nom, emailContact, demandeurNom, siret? }
//     Formulaire public de demande de création d'organisation, non
//     authentifié. Implémenté ci-dessous.
//   - { action: 'rejoindre', code }  (Authorization: Bearer <JWT>)
//     Rejoindre une organisation via un code d'invitation, authentifié.
//     PAS ENCORE IMPLÉMENTÉ — prochaine pièce du palier 5 (voir
//     organisation_invitations, 20260714_mode_organisation_invitations.sql).

import { getServiceClient, getClientIp } from './_lib/patientAuth.js';
import { withSentry } from './_lib/sentry.js';

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MINUTES = 15;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default withSentry(async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body ?? {};

  if (body.action === 'demande') {
    return handleDemande(req, res, body);
  }

  if (body.action === 'rejoindre') {
    return res.status(501).json({ error: 'Pas encore disponible' });
  }

  return res.status(400).json({ error: "action requis ('demande' ou 'rejoindre')" });
});

// ── action: 'demande' ───────────────────────────────────────────────────────
// L'organisation est créée avec statut = 'en_attente' (défaut de la
// colonne, voir 20260714_mode_organisation_statut_securite.sql) : elle
// reste sans aucun accès aux données tant qu'un admin ne l'a pas validée
// manuellement (palier 5, étape 2 — UPDATE organisations SET statut =
// 'active' via Supabase Studio, pas d'interface dédiée pour l'instant).
//
// Endpoint public : pas de JWT à vérifier, donc rate limiting par IP sur
// organisation_demande_attempts (table dédiée, volontairement séparée de
// patient_login_attempts — voir 20260714_mode_organisation_demande_attempts.sql).
async function handleDemande(req: any, res: any, body: any) {
  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }

  const ip = getClientIp(req);

  // Rate limiting : 5 tentatives / 15 min / IP (même seuil que la connexion
  // patient). L'enregistrement de la tentative se fait avant la validation
  // des champs, comme pour connexionParCode — on compte toute soumission,
  // pas seulement celles qui passeraient la validation.
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
  const { count } = await supabase
    .from('organisation_demande_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('created_at', since);

  if ((count ?? 0) >= RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' });
  }

  await supabase.from('organisation_demande_attempts').insert({ ip });

  const nom = typeof body.nom === 'string' ? body.nom.trim() : '';
  const emailContact = typeof body.emailContact === 'string' ? body.emailContact.trim() : '';
  const demandeurNom = typeof body.demandeurNom === 'string' ? body.demandeurNom.trim() : '';
  const siret = typeof body.siret === 'string' ? body.siret.trim() : '';

  if (!nom) {
    return res.status(400).json({ error: "Le nom de l'organisation est requis." });
  }
  if (!emailContact || !EMAIL_REGEX.test(emailContact)) {
    return res.status(400).json({ error: 'Email de contact invalide.' });
  }
  if (!demandeurNom) {
    return res.status(400).json({ error: 'Le nom du demandeur est requis.' });
  }

  const { error: insErr } = await supabase.from('organisations').insert({
    nom,
    email_contact: emailContact,
    demandeur_nom: demandeurNom,
    siret: siret || null,
    // statut : défaut 'en_attente' de la colonne, pas besoin de le préciser
  });

  if (insErr) {
    console.error('[organisation demande] échec insertion:', insErr.code, insErr.message);
    return res.status(500).json({ error: 'Erreur lors de l\'enregistrement de la demande' });
  }

  // Pas d'id renvoyé : formulaire public, aucune info utile à donner au client.
  return res.status(200).json({ ok: true });
}
