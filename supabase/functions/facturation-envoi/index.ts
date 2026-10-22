// Supabase Edge Function — Deno runtime. Plan facturation PR 8 : envoi d'une facture (ou d'un avoir)
// validée par e-mail, via l'API Resend, PDF en pièce jointe, « Répondre à » vers le praticien.
//
// Qui l'appelle : le praticien, depuis « Factures validées », avec son jeton (`supabase.functions.invoke`,
// verify_jwt = true). La fonction vérifie elle-même que la facture est la sienne : elle lit avec
// service_role (le PDF est dans un bucket privé, le journal n'est inscriptible que par service_role).
//
// Corps : { facture_id, envoi_id, email?, enregistrer_email? }
//   envoi_id          UUID tiré par l'écran à chaque clic : clé d'idempotence Resend (une reprise du même
//                     clic n'envoie pas deux e-mails ; « Renvoyer » tire un nouvel identifiant)
//   email             adresse saisie au moment de l'envoi, prioritaire sur celle figée à la validation
//   enregistrer_email l'écrire aussi dans la fiche : e-mail du proche payeur (contrat) ou du bénéficiaire
//                     (décision du 2026-10-22, case décochée par défaut). La facture validée, elle, ne
//                     change pas : son snapshot est inaltérable ; le journal garde l'adresse utilisée.
// Réponses : 200 { ok, destinataire, statut, enregistree } (enregistree : l'adresse a bien été écrite dans la
//            fiche, affiché par l'écran depuis la recette du 2026-10-22 où une écriture est passée inaperçue) ; 422 { code: 'email_manquant' | 'email_invalide' } ;
//            409 facture non envoyable ; 502 échec Resend (journalisé).
//
// Secrets (par projet, `supabase secrets set`) : RESEND_API_KEY (clé « Sending access » du domaine),
// FACTURES_EXPEDITEUR (facultatif, défaut factures@horizon-suivi.fr), ORIGINES_AUTORISEES (CORS, partagé
// avec analyser-seance). Journaux : identifiants et numéros de facture seulement, jamais d'adresse ni de nom.
import { createClient } from "@supabase/supabase-js";
import { composerMessage, destinataire, erreurCourte, type FactureEnvoi } from "./envoi.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function enTetesCors(origine: string | null): Record<string, string> | null {
  if (!origine) return null;
  const propre = origine.replace(/\/$/, "");
  const admises = (Deno.env.get("ORIGINES_AUTORISEES") ?? "").split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
  if (!admises.includes(propre)) return null;
  return {
    "Access-Control-Allow-Origin": propre,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(corps: unknown, statut: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(corps), { status: statut, headers: { ...cors, "Content-Type": "application/json" } });
}

function base64(octets: Uint8Array): string {
  let s = "";
  for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(s);
}

Deno.serve(async (req) => {
  const cors = enTetesCors(req.headers.get("origin"));
  if (!cors) return new Response(JSON.stringify({ erreur: "Origine non autorisée" }), { status: 403, headers: { "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erreur: "Méthode non autorisée" }, 405, cors);

  const entete = req.headers.get("authorization") ?? "";
  const jeton = entete.toLowerCase().startsWith("bearer ") ? entete.slice(7).trim() : "";
  if (!jeton) return json({ erreur: "Authentification requise" }, 401, cors);

  const url = Deno.env.get("SUPABASE_URL");
  const cle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const cleResend = Deno.env.get("RESEND_API_KEY");
  const expedition = Deno.env.get("FACTURES_EXPEDITEUR") || "factures@horizon-suivi.fr";
  if (!url || !cle) return json({ erreur: "Configuration serveur incomplète" }, 500, cors);
  if (!cleResend) return json({ erreur: "L'envoi par e-mail n'est pas encore configuré" }, 500, cors);

  const admin = createClient(url, cle, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: u, error: errU } = await admin.auth.getUser(jeton);
  if (errU || !u?.user) return json({ erreur: "Session invalide ou expirée" }, 401, cors);
  const praticienId = u.user.id;

  let corps: Record<string, unknown> = {};
  try { corps = await req.json(); } catch { /* traité ci-dessous */ }
  const factureId = String(corps.facture_id ?? "");
  const envoiId = String(corps.envoi_id ?? "");
  if (!UUID.test(factureId) || !UUID.test(envoiId)) return json({ erreur: "Requête invalide" }, 400, cors);

  const { data: f, error: errF } = await admin
    .from("factures")
    .select("id, numero, type, statut, periode, total, echeance, pdf_path, praticien_id, contrat_id, participant_id, snapshot_emetteur, snapshot_destinataire")
    .eq("id", factureId)
    .maybeSingle();
  if (errF) { console.error("[facturation-envoi] lecture facture", factureId, errF.message); return json({ erreur: "Lecture impossible" }, 500, cors); }
  // Facture d'un autre praticien : même réponse qu'une facture inexistante.
  if (!f || f.praticien_id !== praticienId) return json({ erreur: "Facture introuvable" }, 404, cors);
  if (f.statut === "brouillon" || !f.numero) return json({ erreur: "Une facture se valide avant d'être envoyée" }, 409, cors);
  if (f.statut === "annulee") return json({ erreur: "Facture annulée : elle ne s'envoie plus" }, 409, cors);
  if (!f.pdf_path) return json({ erreur: "PDF en préparation : réessayez dans un instant" }, 409, cors);

  const emetteur = (f.snapshot_emetteur ?? {}) as Record<string, string | null>;
  const dest = (f.snapshot_destinataire ?? {}) as Record<string, unknown>;
  const facture: FactureEnvoi = {
    numero: f.numero, type: f.type === "avoir" ? "avoir" : "facture", periode: f.periode, total: Number(f.total), echeance: f.echeance,
    emetteur: { societe: emetteur.societe, prenom: emetteur.prenom, nom: emetteur.nom, email: emetteur.email },
    destinataire: { email: typeof dest.email === "string" ? dest.email : null },
  };
  const saisie = typeof corps.email === "string" ? corps.email : null;
  const cible = destinataire(facture, saisie);
  if ("manquant" in cible) return json({ code: "email_manquant", erreur: "Aucune adresse e-mail pour ce destinataire" }, 422, cors);
  if ("invalide" in cible) return json({ code: "email_invalide", erreur: "Adresse e-mail invalide" }, 422, cors);

  const { data: blob, error: errPdf } = await admin.storage.from("factures").download(f.pdf_path);
  if (errPdf || !blob) { console.error("[facturation-envoi] lecture PDF", f.numero, errPdf?.message ?? ""); return json({ erreur: "PDF illisible" }, 500, cors); }
  const message = composerMessage(facture, cible.email, base64(new Uint8Array(await blob.arrayBuffer())), expedition);

  let messageId: string | null = null;
  let echec: string | null = null;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${cleResend}`, "Content-Type": "application/json", "Idempotency-Key": `facture-envoi-${envoiId}` },
      body: JSON.stringify(message),
    });
    const reponse = await r.json().catch(() => ({}));
    if (r.ok && typeof reponse?.id === "string") messageId = reponse.id;
    else echec = erreurCourte(reponse?.message ?? `HTTP ${r.status}`);
  } catch (e) {
    echec = erreurCourte(e);
  }

  const { error: errJ } = await admin.from("envois_factures").insert({
    facture_id: f.id, praticien_id: praticienId, destinataire: cible.email,
    resultat: messageId ? "envoye" : "echec", message_id: messageId, erreur: messageId ? null : echec,
  });
  if (errJ) console.error("[facturation-envoi] journal", f.numero, errJ.message);

  if (!messageId) {
    console.error("[facturation-envoi] échec Resend", f.numero, echec);
    return json({ erreur: `L'envoi a échoué : ${echec}` }, 502, cors);
  }

  // « envoyee » seulement depuis « validee » : une facture payée ou en retard garde son statut.
  let statut = f.statut;
  if (f.statut === "validee") {
    const { error: errS } = await admin.from("factures").update({ statut: "envoyee" }).eq("id", f.id).eq("statut", "validee");
    if (errS) console.error("[facturation-envoi] statut", f.numero, errS.message);
    else statut = "envoyee";
  }

  // Enregistrer l'adresse saisie dans la fiche (case cochée) : filtre explicite sur le praticien.
  let enregistree = false;
  if (saisie && corps.enregistrer_email === true) {
    const maj = dest.role === "proche"
      ? admin.from("contrats").update({ payeur_email: cible.email }).eq("id", f.contrat_id).eq("praticien_id", praticienId).select("id")
      : admin.from("participants").update({ email: cible.email }).eq("id", f.participant_id).eq("praticien_id", praticienId).select("id");
    const { data: lignes, error: errM } = await maj;
    if (errM) console.error("[facturation-envoi] enregistrement de l'adresse", f.numero, errM.message);
    else enregistree = (lignes?.length ?? 0) > 0;
  }

  return json({ ok: true, destinataire: cible.email, statut, enregistree }, 200, cors);
});
