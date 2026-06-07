// Vercel Serverless Function — proxy Claude API
// Ajouter ANTHROPIC_API_KEY dans les variables d'environnement Vercel

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configuré dans Vercel' });
  }

  const { prompt } = req.body ?? {};
  if (!prompt) {
    return res.status(400).json({ error: 'prompt requis' });
  }

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
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
}
