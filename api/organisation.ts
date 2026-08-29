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

import { getServiceClient, getClientIp, logAuditEvent } from './_lib/patientAuth.js';
import { exigerAdmin } from './_lib/adminAuth.js';
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

  if (typeof body.action === 'string' && body.action.startsWith('admin.')) {
    return handleAdmin(req, res, body);
  }

  return res.status(400).json({ error: "action requis ('demande', 'rejoindre' ou 'admin.*')" });
});

// ── actions admin.* ─────────────────────────────────────────────────────────
//
// Administration des COMPTES praticiens (étape 4 des rôles) : lister,
// désactiver, réactiver. Jamais supprimer, jamais consulter de donnée
// clinique — voir les deux sections ci-dessous.
//
// ── Pourquoi ces actions vivent ici ─────────────────────────────────────
// Ce n'est pas un choix de conception, c'est une contrainte de plan. Vercel
// Hobby plafonne à 12 fonctions serverless et `api/` en compte exactement 12 :
// un `api/admin.ts` serait la treizième et casserait le déploiement. Ce
// fichier fusionnait déjà deux actions pour la même raison (voir l'en-tête),
// tout comme api/patient/session.ts. À reprendre dans un fichier dédié le
// jour du passage au plan Pro.
//
// ── AUCUNE SUPPRESSION, jamais ──────────────────────────────────────────
// Il n'existe volontairement aucune action `admin.supprimer`. Ce n'est pas
// un oubli ni une fonctionnalité repoussée : supprimer un compte praticien
// ORPHELINE le dossier patient. Les FK de participants, bilans,
// comptes_rendus_seances, notes_seances, contrats, programmes et seances
// vers auth.users sont en ON DELETE SET NULL — les lignes survivent avec
// `praticien_id` à NULL, et comme toutes les policies de ces tables filtrent
// sur `praticien_id = auth.uid()`, plus AUCUN compte authentifié ne peut
// jamais les relire. Donnée légalement conservée, pratiquement perdue, sans
// le moindre signal. Voir docs/PLAN-BETA.md.
// La désactivation passe donc par un bannissement du compte auth, qui est
// réversible et ne touche à aucune donnée.
//
// ── AUCUN ACCÈS AUX DONNÉES CLINIQUES ───────────────────────────────────
// Le rôle admin gère des comptes, pas des dossiers. Aucune de ces actions ne
// lit bilans, comptes rendus, notes de séance ou documents patient, et
// aucune policy ne donne cet accès à un admin — vérifié par l'audit inverse
// du 2026-08-29 et verrouillé par le describe « [RÔLES] un compte admin ne
// lit aucune donnée clinique » de tests/security/rls.spec.ts.

async function handleAdmin(req: any, res: any, body: any) {
  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }

  const auth = await exigerAdmin(req, supabase);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const ip = getClientIp(req);

  switch (body.action) {
    case 'admin.comptes':
      return handleAdminComptes(res, supabase, auth, ip);
    case 'admin.desactiver':
      return handleAdminStatut(res, supabase, auth, ip, body, true);
    case 'admin.reactiver':
      return handleAdminStatut(res, supabase, auth, ip, body, false);
    default:
      return res.status(400).json({ error: `Action admin inconnue : ${body.action}` });
  }
}

// Construit UNE ligne de la liste des comptes.
//
// Exportée pour être testée (api/_organisation-admin.test.ts) : c'est le
// point où une donnée pourrait fuiter sur le fil. La fonction est une
// LISTE BLANCHE — elle nomme les champs qu'elle produit, elle n'étale
// jamais l'objet source. Un `...u` ici mettrait tout l'objet auth de
// Supabase dans la réponse (métadonnées, identités, jetons de récupération).
//
// `maintenant` est un paramètre plutôt qu'un `Date.now()` interne : sans
// ça, le comportement autour d'un bannissement expiré n'est pas testable.
export function construireCompte(
  u: Record<string, any>,
  praticien: Record<string, any> | undefined,
  appRole: string | null,
  maintenant: number,
) {
  // `banned_until` est une DATE, pas un booléen : un bannissement peut être
  // daté dans le passé, donc expiré. On compare, on ne se contente pas de
  // constater sa présence — sinon un compte redevenu utilisable serait
  // affiché « désactivé », et un admin le « réactiverait » sans effet.
  const banniJusqua = u.banned_until ? Date.parse(u.banned_until) : null;
  const banActif = banniJusqua !== null && !Number.isNaN(banniJusqua) && banniJusqua > maintenant;

  return {
    id: u.id,
    email: u.email ?? praticien?.email ?? null,
    prenom: praticien?.prenom ?? null,
    nom: praticien?.nom ?? null,
    appRole,
    actif: !banActif,
    creeLe: u.created_at ?? null,
    derniereConnexion: u.last_sign_in_at ?? null,
    emailConfirme: Boolean(u.email_confirmed_at),
    // Un compte auth sans ligne `praticiens` est une anomalie : mieux vaut
    // la voir dans la liste que la masquer.
    sansFichePraticien: !praticien,
  };
}

// admin.comptes — liste des comptes et de leur statut.
//
// Le statut vient d'auth.users (`banned_until`), pas d'une colonne
// applicative : aucune migration n'a été nécessaire, et l'état affiché est
// celui qui gouverne réellement la connexion, pas une copie qui pourrait en
// diverger.
async function handleAdminComptes(res: any, supabase: any, auth: any, ip: string) {
  // PAGINATION : 1000 comptes suffisent très largement à l'échelle visée.
  // Au-delà, cette liste serait silencieusement tronquée — d'où le
  // `tronquee` renvoyé au client, pour que la limite soit visible plutôt
  // que devinée.
  const PAR_PAGE = 1000;
  const { data: usersData, error: usersErr } = await supabase.auth.admin.listUsers({ perPage: PAR_PAGE });
  if (usersErr) {
    console.error('[admin.comptes] listUsers:', usersErr.message);
    return res.status(500).json({ error: 'Erreur lors de la lecture des comptes' });
  }
  const users = usersData?.users ?? [];

  const { data: praticiens } = await supabase.from('praticiens').select('id, prenom, nom, email');
  const { data: roles } = await supabase.from('user_roles').select('user_id, app_role');

  const parId = new Map<string, Record<string, any>>(
    (praticiens ?? []).map((p: any) => [p.id as string, p as Record<string, any>]),
  );
  const roleParId = new Map<string, string>(
    (roles ?? []).map((r: any) => [r.user_id as string, r.app_role as string]),
  );

  const maintenant = Date.now();
  const comptes = users.map((u: any) =>
    construireCompte(u, parId.get(u.id), roleParId.get(u.id) ?? null, maintenant),
  );

  await logAuditEvent(supabase, 'admin_comptes_consultes', null, ip, true, {
    acteur: auth.userId,
    acteurEmail: auth.email,
    nombreComptes: comptes.length,
  });

  return res.status(200).json({
    ok: true,
    comptes,
    tronquee: users.length >= PAR_PAGE,
  });
}

// admin.desactiver / admin.reactiver — bannissement réversible du compte auth.
async function handleAdminStatut(
  res: any, supabase: any, auth: any, ip: string, body: any, desactiver: boolean,
) {
  const cibleId = typeof body.praticienId === 'string' ? body.praticienId.trim() : '';
  if (!cibleId) {
    return res.status(400).json({ error: 'praticienId requis' });
  }

  // Un admin ne peut pas se désactiver lui-même : il se verrouillerait
  // dehors, et plus personne ne pourrait le réactiver depuis l'application.
  // La réactivation ne passe pas par ce garde-fou (se réactiver soi-même est
  // impossible de toute façon : on ne peut pas se connecter pour le faire).
  if (desactiver && cibleId === auth.userId) {
    return res.status(400).json({ error: 'Vous ne pouvez pas désactiver votre propre compte.' });
  }

  const { data: cible, error: cibleErr } = await supabase.auth.admin.getUserById(cibleId);
  if (cibleErr || !cible?.user) {
    return res.status(404).json({ error: 'Compte introuvable' });
  }

  // ban_duration : 100 ans pour une désactivation (Supabase n'expose pas de
  // bannissement sans terme), 'none' pour la levée. Aucune donnée touchée.
  const { error: majErr } = await supabase.auth.admin.updateUserById(cibleId, {
    ban_duration: desactiver ? '876000h' : 'none',
  });

  if (majErr) {
    console.error('[admin.statut] updateUserById:', majErr.message);
    await logAuditEvent(
      supabase,
      desactiver ? 'admin_praticien_desactive' : 'admin_praticien_reactive',
      null, ip, false,
      { acteur: auth.userId, acteurEmail: auth.email, cible: cibleId, erreur: majErr.message },
    );
    return res.status(500).json({ error: 'Erreur lors de la mise à jour du compte' });
  }

  await logAuditEvent(
    supabase,
    desactiver ? 'admin_praticien_desactive' : 'admin_praticien_reactive',
    null, ip, true,
    {
      acteur: auth.userId,
      acteurEmail: auth.email,
      cible: cibleId,
      cibleEmail: cible.user.email ?? null,
    },
  );

  return res.status(200).json({ ok: true, actif: !desactiver });
}

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
