// Vercel Serverless Function — proxy Claude API
// Sécurisé (T6) : nécessite une session praticien Supabase valide
// (Authorization: Bearer <access_token>), pour éviter qu'un tiers
// n'utilise la clé ANTHROPIC_API_KEY (configurée dans Vercel) à nos frais.

import { getServiceClient, extractBearerToken } from './_lib/patientAuth.js';
import { withSentry, captureMessage } from './_lib/sentry.js';
import { checkClaudeRateLimit, recordClaudeRequest } from './_lib/rateLimit.js';
import { SYSTEME_CADRAGE, validerPrompt } from './_lib/guard.js';

export default withSentry(async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = extractBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Authentification requise' });

  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    // Second des deux `catch` visés par PLAN-BETA §4 n°6. Celui-ci se
    // déclenche quand SUPABASE_SERVICE_ROLE_KEY manque : `String(err)`
    // annonçait au navigateur quelle variable d'environnement est absente.
    console.error(`[api/claude] client service indisponible : ${String(err)}`);
    return res.status(500).json({ error: 'Erreur serveur' });
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Session invalide ou expirée' });
  }
  const praticienId = userData.user.id;

  // Rate limiting (docs/RAPPORT_SECURITE.md) : évite qu'un compte compromis
  // (ou un bug côté front qui boucle) épuise le crédit ANTHROPIC_API_KEY
  // partagé par tous les praticiens — voir api/_lib/rateLimit.ts.
  const withinLimit = await checkClaudeRateLimit(supabase, praticienId);
  if (!withinLimit) {
    // Log volontaire (pas juste un 429 silencieux) : seule façon de savoir
    // après coup si ce seuil se déclenche sur un usage réel, pour l'ajuster
    // sur des données plutôt que sur l'estimation documentée dans
    // api/_lib/rateLimit.ts.
    //
    // Doublé dans Sentry : les logs Vercel ont une rétention courte (quelques
    // jours selon le plan), insuffisante pour juger d'un seuil sur plusieurs
    // semaines d'usage — ce qui est précisément l'objectif ici.
    //
    // Le praticien_id (UUID d'un compte professionnel, jamais un patient) est
    // transmis en tag : sans lui, impossible de distinguer un seul compte
    // emballé — le cas qu'on veut détecter — d'un plafond trop bas qui gêne
    // tout le monde. Aucune donnée de santé ni de patient n'est jointe.
    console.warn(`[api/claude] rate limit atteint pour praticien ${praticienId}`);
    await captureMessage('[api/claude] rate limit atteint', {
      level: 'warning',
      tags: { praticien_id: praticienId },
    });
    return res.status(429).json({ error: 'Trop de requêtes IA récentes, réessayez dans un instant' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configuré dans Vercel' });
  }

  // Plafond de taille (PLAN-BETA §4 n°4). Refusé, jamais tronqué : voir
  // api/_lib/guard.ts pour la mesure qui fixe PROMPT_MAX_LENGTH, et pourquoi
  // la détection d'injection par motif ne s'applique pas à cette frontière.
  const validation = validerPrompt(req.body?.prompt);
  if (!validation.ok) {
    if (validation.statut === 413) {
      // Journalisé comme le rate limit, et pour la même raison : le seuil a
      // été posé sur une mesure du catalogue d'exercices, pas sur un usage
      // observé. Sans trace, impossible de savoir s'il gêne quelqu'un.
      console.warn(`[api/claude] prompt trop long pour praticien ${praticienId}`);
      await captureMessage('[api/claude] plafond de prompt atteint', {
        level: 'warning',
        tags: { praticien_id: praticienId },
      });
    }
    return res.status(validation.statut).json({ error: validation.message });
  }
  const prompt = validation.prompt;

  const { model } = req.body ?? {};

  // Modèle par défaut inchangé pour tous les appelants existants. Un appelant
  // peut explicitement demander Sonnet pour les usages nécessitant plus de
  // fiabilité (ex : remplissage de documents sans inventer de données).
  const ALLOWED_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6'];
  const resolvedModel = typeof model === 'string' && ALLOWED_MODELS.includes(model)
    ? model
    : 'claude-haiku-4-5-20251001';

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: resolvedModel,
        max_tokens: 8192,
        // Garde-fou anti prompt-injection (PLAN-BETA §4 n°5). Le prompt
        // arrive assemblé : ce message est le seul endroit où l'on puisse
        // distinguer la consigne de tâche des données citées. Voir
        // api/_lib/guard.ts pour la limite de ce mécanisme.
        system: SYSTEME_CADRAGE,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      // Le corps d'erreur d'Anthropic — nom de modèle, quotas, état de la
      // clé — ne repart plus au navigateur (PLAN-BETA §4 n°6). Il reste dans
      // les logs, où il sert au diagnostic sans être exposé à l'appelant.
      console.error(`[api/claude] Anthropic ${claudeRes.status}: ${await claudeRes.text()}`);
      return res.status(502).json({ error: "Le service d'analyse est momentanément indisponible" });
    }

    const data = await claudeRes.json();
    const rawText: string = data.content?.[0]?.text ?? '';
    const cleanText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // Comptabilisé seulement après une réponse Claude réussie : un appel qui
    // échoue (ex. erreur Anthropic) ne doit pas consommer le quota du
    // praticien pour une panne qui n'est pas de son fait.
    await recordClaudeRequest(supabase, praticienId);

    return res.status(200).json({ text: cleanText });
  } catch (err) {
    // `String(err)` renvoyait la stack au navigateur (PLAN-BETA §4 n°6).
    console.error(`[api/claude] erreur inattendue : ${String(err)}`);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});
