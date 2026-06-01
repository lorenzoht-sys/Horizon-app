// Supabase Edge Function — Deno runtime
// Secret requis : ANTHROPIC_API_KEY (supabase secrets set ANTHROPIC_API_KEY=sk-ant-...)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { transcription, nomPatient, pathologie, objectifProgramme, dateAujourdhui } = await req.json();

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY non configuré' }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const userPrompt = `Patient : ${nomPatient} (${pathologie ?? 'pathologie non précisée'})
Objectif du programme : ${objectifProgramme ?? 'non défini'}

Transcription de la dictée de Pierre :
"${transcription}"

Extrais et structure ces informations en JSON :
{
  "date_seance": "YYYY-MM-DD (aujourd'hui = ${dateAujourdhui} si non précisé)",
  "duree_minutes": number ou null si non précisé,
  "exercices_realises": [
    {
      "nom": string,
      "series": number ou null,
      "repetitions": number ou null,
      "duree_secondes": number ou null,
      "commentaire": string ou null
    }
  ],
  "observations": string,
  "douleurs_signalees": string ou null,
  "humeur_patient": "très bien" ou "bien" ou "moyen" ou "fatigué" ou null,
  "progression": "en progrès" ou "stable" ou "régression" ou null,
  "points_attention": string ou null,
  "prochaine_seance_notes": string ou null
}`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: `Tu es l'assistant de Pierre Clavier, enseignant en Activité Physique Adaptée (APA).
Pierre vient de terminer une séance avec un patient et te dicte oralement un résumé.
Ton rôle est d'extraire et structurer les informations pour remplir la fiche de compte-rendu.
Réponds UNIQUEMENT en JSON valide, sans markdown, sans explication.`,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return new Response(JSON.stringify({ error: `Erreur Claude API: ${errText}` }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text ?? '{}';

    const parsed = JSON.parse(rawText);

    return new Response(JSON.stringify(parsed), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
