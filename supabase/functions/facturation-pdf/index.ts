// Supabase Edge Function — Deno runtime. Étape 5 (PR A) : génère le PDF d'une facture VALIDÉE, le
// range dans le bucket privé `factures` et pose `factures.pdf_path`.
//
// Qui l'appelle : le trigger de la migration 20261010100000 (pg_net), juste après le passage de
// `brouillon` à `validee`. Ce n'est pas un appel de navigateur : pas de JWT utilisateur, d'où
// `verify_jwt = false` dans config.toml. La seule barrière est un secret partagé (en-tête
// `x-facturation-secret`, comparé en temps constant) ; il vit dans les secrets de la fonction et
// dans Vault côté base, jamais dans le dépôt.
//
// Secrets : FACTURATION_WEBHOOK_SECRET (à poser avec `supabase secrets set`, par projet).
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis par la plateforme.
//
// Idempotence : appelée deux fois (reprise, double déclenchement), elle ne produit qu'un fichier.
//   - `pdf_path` déjà posé : rien à faire ;
//   - fichier déjà présent mais `pdf_path` vide (échec entre l'envoi et l'écriture) : le fichier
//     EXISTANT gagne, il n'est jamais écrasé ; on contrôle seulement qu'une recomposition donnerait
//     les mêmes octets, et on le journalise sinon ;
//   - aucune donnée de santé dans les logs : identifiants et numéros de facture seulement.

import { createClient } from "@supabase/supabase-js";
import { composerFacturePdf, type FacturePdf } from "./composer.ts";

const BUCKET = "factures";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), { status, headers: { "content-type": "application/json" } });
}

function egalTempsConstant(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

async function sha256(octets: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", octets);
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erreur: "Méthode non autorisée" }, 405);

  const secret = Deno.env.get("FACTURATION_WEBHOOK_SECRET");
  if (!secret) return json({ erreur: "Fonction non configurée" }, 500);
  if (!egalTempsConstant(req.headers.get("x-facturation-secret") ?? "", secret)) {
    return json({ erreur: "Non autorisé" }, 401);
  }

  let factureId = "";
  try {
    factureId = String((await req.json())?.facture_id ?? "");
  } catch { /* corps invalide : traité ci-dessous */ }
  if (!UUID.test(factureId)) return json({ erreur: "facture_id invalide" }, 400);

  const url = Deno.env.get("SUPABASE_URL");
  const cle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !cle) return json({ erreur: "Fonction non configurée" }, 500);
  const admin = createClient(url, cle, { auth: { persistSession: false } });

  const { data: f, error: errF } = await admin
    .from("factures")
    .select(
      "id, numero, type, statut, periode, date_emission, echeance, total_ht, montant_tva, taux_tva, total, " +
        "snapshot_emetteur, snapshot_destinataire, pdf_path, praticien_id, facture_origine_id",
    )
    .eq("id", factureId)
    .maybeSingle();
  if (errF) { console.error("[facturation-pdf] lecture facture", factureId, errF.message); return json({ erreur: "Lecture impossible" }, 500); }
  if (!f) return json({ erreur: "Facture introuvable" }, 404);
  if (f.statut === "brouillon" || !f.numero) return json({ erreur: "Facture non validée" }, 409);
  if (f.pdf_path) return json({ ok: true, deja: true, pdf_path: f.pdf_path });

  const { data: lignes, error: errL } = await admin
    .from("lignes_facture")
    .select("libelle, quantite, prix_unitaire, montant, seances(date, heure_debut)")
    .eq("facture_id", factureId);
  if (errL) { console.error("[facturation-pdf] lecture lignes", factureId, errL.message); return json({ erreur: "Lecture impossible" }, 500); }

  let numeroOrigine: string | null = null;
  if (f.facture_origine_id) {
    const { data: o } = await admin.from("factures").select("numero").eq("id", f.facture_origine_id).maybeSingle();
    numeroOrigine = o?.numero ?? null;
  }

  const un = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
  const donnees: FacturePdf = {
    numero: f.numero,
    type: f.type,
    dateEmission: f.date_emission,
    echeance: f.echeance,
    periode: f.periode,
    numeroOrigine,
    totalHt: Number(f.total_ht),
    montantTva: Number(f.montant_tva),
    tauxTva: Number(f.taux_tva),
    total: Number(f.total),
    emetteur: f.snapshot_emetteur ?? {},
    destinataire: f.snapshot_destinataire ?? {},
    lignes: (lignes ?? []).map((l: Record<string, unknown>) => {
      const s = un<{ date?: string; heure_debut?: string }>(l.seances as never);
      return {
        libelle: String(l.libelle),
        quantite: Number(l.quantite),
        prixUnitaire: Number(l.prix_unitaire),
        montant: Number(l.montant),
        seanceDate: s?.date ?? null,
        seanceHeure: s?.heure_debut ?? null,
      };
    }),
  };

  const octets = await composerFacturePdf(donnees);
  const empreinte = await sha256(octets);
  const chemin = `${f.praticien_id}/${f.numero}.pdf`;

  const { error: errUp } = await admin.storage.from(BUCKET).upload(chemin, octets, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (errUp) {
    const existe = /already exists|Duplicate/i.test(errUp.message);
    if (!existe) { console.error("[facturation-pdf] stockage", factureId, errUp.message); return json({ erreur: "Stockage impossible" }, 500); }
    // Le fichier existe : il fait foi. On vérifie qu'il correspond à la recomposition.
    const { data: blob } = await admin.storage.from(BUCKET).download(chemin);
    if (blob) {
      const present = await sha256(new Uint8Array(await blob.arrayBuffer()));
      if (present !== empreinte) console.warn("[facturation-pdf] fichier existant différent de la recomposition", f.numero);
    }
  }

  // `pdf_path IS NULL` : une reprise concurrente n'écrase pas le chemin déjà posé.
  const { error: errMaj } = await admin.from("factures").update({ pdf_path: chemin }).eq("id", factureId).is("pdf_path", null);
  if (errMaj) { console.error("[facturation-pdf] écriture pdf_path", factureId, errMaj.message); return json({ erreur: "Écriture impossible" }, 500); }

  return json({ ok: true, pdf_path: chemin, sha256: empreinte, octets: octets.length });
});
