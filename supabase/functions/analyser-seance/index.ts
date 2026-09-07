// Supabase Edge Function — Deno runtime
// Secret requis : ANTHROPIC_API_KEY (supabase secrets set ANTHROPIC_API_KEY=sk-ant-...)
// Secret requis : ORIGINES_AUTORISEES (voir plus bas)
//
// ── Ce que cette fonction protège ───────────────────────────────────────
// Elle détient ANTHROPIC_API_KEY, une clé facturée à l'organisation. Dans sa
// version précédente elle acceptait n'importe quelle requête, depuis
// n'importe quelle origine, sans vérifier qui appelait : l'URL de la
// fonction suffisait à faire tourner la clé aux frais du projet.
//
// Trois verrous, dans cet ordre — le moins coûteux d'abord, pour qu'un abus
// soit rejeté avant d'avoir consommé quoi que ce soit :
//   1. l'origine (CORS fermé, plus de '*') ;
//   2. le JWT du praticien, que supabase-js joint déjà à chaque appel ;
//   3. les plafonds et le garde-fou d'injection (voir `garde-prompt.ts`).
//
// Le rate limiting n'est PAS ici : il vit dans `api/_lib/rateLimit.ts`, côté
// Vercel, et ne couvre que /api/claude. Cette fonction reste donc sans
// plafond par praticien — c'est le trou connu qui subsiste après ce correctif.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import {
  construireIdentite,
  construireSystemPrompt,
  construireUserPrompt,
  validerChamps,
  validerDate,
} from "./garde-prompt.ts";

/**
 * Origines autorisées, en dur dans un secret plutôt que dans le code.
 *
 * `RAPPORT_CONSOLIDATION.md` note que les URLs de déploiement codées en dur
 * ont déjà été retirées une fois du projet : les réintroduire ici obligerait
 * à redéployer la fonction à chaque changement de domaine, et un déploiement
 * oublié se traduirait par une panne CORS opaque côté navigateur.
 *
 * Format : liste séparée par des virgules, origines complètes, sans slash
 * final. Exemple :
 *   supabase secrets set ORIGINES_AUTORISEES="https://app.exemple.fr,http://localhost:5173"
 */
function originesAutorisees(): string[] {
  return (Deno.env.get("ORIGINES_AUTORISEES") ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

/**
 * En-têtes CORS pour une origine donnée, ou `null` si elle n'est pas admise.
 *
 * `null` fait échouer la requête AVANT tout traitement. Le secret absent ou
 * vide ne vaut pas « tout autoriser » : il ne rend aucune origine valide, et
 * la fonction se ferme complètement. Une panne visible vaut mieux qu'un
 * retour silencieux au comportement ouvert qu'on est en train de corriger.
 */
function enTetesCors(origine: string | null): Record<string, string> | null {
  if (!origine) return null;
  const propre = origine.replace(/\/$/, "");
  if (!originesAutorisees().includes(propre)) return null;
  return {
    "Access-Control-Allow-Origin": propre,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    // Sans `Vary`, un cache intermédiaire pourrait servir à une origine
    // l'en-tête calculé pour une autre.
    "Vary": "Origin",
  };
}

function json(corps: unknown, statut: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  const cors = enTetesCors(req.headers.get("origin"));

  // Origine refusée : pas d'en-tête CORS dans la réponse non plus. Le
  // navigateur bloquera de toute façon ; le 403 est là pour les appels
  // hors navigateur, qui eux verraient une réponse utile sans lui.
  if (!cors) {
    return new Response(JSON.stringify({ error: "Origine non autorisée" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, cors);
  }

  try {
    // ── Verrou 2 : le JWT ────────────────────────────────────────────────
    // `supabase.functions.invoke()` joint déjà la session du praticien dans
    // `Authorization: Bearer <access_token>` — voir DicteePostSeance.tsx.
    // Aucun changement côté client n'est nécessaire.
    const entete = req.headers.get("authorization") ?? "";
    const token = entete.toLowerCase().startsWith("bearer ")
      ? entete.slice(7).trim()
      : "";
    if (!token) {
      return json({ error: "Authentification requise" }, 401, cors);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      console.error("[analyser-seance] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY absent");
      return json({ error: "Configuration serveur incomplète" }, 500, cors);
    }

    // service_role : même choix que `api/_lib/patientAuth.ts`. Le client ne
    // sert qu'à valider le token et à lire une ligne de `praticiens` ; il
    // n'est jamais construit à partir de données venant de la requête.
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return json({ error: "Session invalide ou expirée" }, 401, cors);
    }
    const praticienId = userData.user.id;

    // ── Verrou 3 : plafonds et injection ────────────────────────────────
    let corps: Record<string, unknown>;
    try {
      corps = await req.json();
    } catch {
      return json({ error: "Corps de requête invalide" }, 400, cors);
    }

    const validation = validerChamps(corps ?? {});
    if (!validation.ok) {
      // Journalisé avec le praticien_id (compte professionnel, jamais un
      // patient) et le motif, jamais le texte : sans ça, impossible de
      // distinguer après coup une vraie tentative d'un faux positif du
      // garde-fou. Aucune donnée de santé n'est écrite dans les logs.
      if (validation.motif) {
        console.warn(
          `[analyser-seance] garde-fou injection déclenché — praticien ${praticienId} — motif ${validation.motif}`,
        );
      }
      return json({ error: validation.message }, validation.statut, cors);
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      console.error("[analyser-seance] ANTHROPIC_API_KEY non configuré");
      return json({ error: "Configuration serveur incomplète" }, 500, cors);
    }

    // ── Identité du praticien ───────────────────────────────────────────
    // Lue en base, jamais reçue du client : le nom du praticien finit dans
    // des observations enregistrées au dossier, un client compromis pourrait
    // sinon les faire signer par n'importe qui.
    //
    // `maybeSingle()` et non `single()` : un praticien qui n'a pas encore
    // rempli son identité n'est pas une erreur, c'est le cas nominal juste
    // après l'onboarding. Une lecture en échec donne `null` — donc un prompt
    // sans nom, jamais un nom de repli (cf. src/lib/initiales.ts).
    const { data: praticien, error: praticienErr } = await supabase
      .from("praticiens")
      .select("prenom, nom, titre")
      .eq("id", praticienId)
      .maybeSingle();

    if (praticienErr) {
      console.error(`[analyser-seance] lecture praticiens échouée : ${praticienErr.message}`);
    }
    const identite = construireIdentite(praticien);

    // Marqueur imprévisible, régénéré à chaque requête : un texte injecté ne
    // peut pas refermer un bloc dont il ignore le nom.
    const nonce = `#### DICTEE-${crypto.randomUUID()} ####`;
    const dateAujourdhui = validerDate(
      corps.dateAujourdhui,
      new Date().toISOString().slice(0, 10),
    );

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: construireSystemPrompt(identite, nonce),
        messages: [
          {
            role: "user",
            content: construireUserPrompt(validation.champs, dateAujourdhui, nonce),
          },
        ],
      }),
    });

    if (!claudeRes.ok) {
      // Le détail reste dans les logs. Le renvoyer au navigateur exposait le
      // corps d'erreur d'Anthropic — nom de modèle, quotas, état de la clé —
      // à un appelant qui n'a aucune raison de le connaître.
      console.error(`[analyser-seance] Anthropic ${claudeRes.status}: ${await claudeRes.text()}`);
      return json({ error: "Le service d'analyse est momentanément indisponible" }, 502, cors);
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text ?? "{}";
    const cleanText = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleanText);
    } catch {
      console.error(`[analyser-seance] réponse non JSON : ${cleanText.slice(0, 500)}`);
      return json({ error: "Réponse IA non exploitable" }, 502, cors);
    }

    return json(parsed, 200, cors);
  } catch (err) {
    // `String(err)` renvoyait la stack au client. Elle reste dans les logs.
    console.error(`[analyser-seance] erreur inattendue : ${String(err)}`);
    return json({ error: "Erreur interne" }, 500, cors);
  }
});
