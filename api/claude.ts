// Vercel Serverless Function — proxy Claude API
// Sécurisé (T6) : nécessite une session praticien Supabase valide
// (Authorization: Bearer <access_token>), pour éviter qu'un tiers
// n'utilise la clé ANTHROPIC_API_KEY (configurée dans Vercel) à nos frais.

import { getServiceClient, extractBearerToken } from './_lib/patientAuth.js';
import { withSentry } from './_lib/sentry.js';

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

    return res.status(200).json({ text: cleanText });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});
