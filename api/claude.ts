// Vercel Serverless Function — proxy Claude API
// Sécurisé (T6) : nécessite une session praticien Supabase valide
// (Authorization: Bearer <access_token>), pour éviter qu'un tiers
// n'utilise la clé ANTHROPIC_API_KEY (configurée dans Vercel) à nos frais.

import { getServiceClient, extractBearerToken } from './_lib/patientAuth.js';
import { withSentry, captureMessage } from './_lib/sentry.js';
import { checkClaudeRateLimit, recordClaudeRequest } from './_lib/rateLimit.js';

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
    return res.status(500).json({ error: String(err) });
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

  const { prompt, model } = req.body ?? {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt requis' });
  }

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
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return res.status(500).json({ error: `Erreur Claude API: ${errText}` });
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
    return res.status(500).json({ error: String(err) });
  }
});
