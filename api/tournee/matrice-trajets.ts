// Vercel Serverless Function — matrice de trajets routiers via OpenRouteService
// Reçoit une liste de coordonnées, retourne durees[][] (secondes) et distances[][] (mètres).
// ORS_API_KEY est lue depuis process.env — jamais exposée au client.
// Si ORS est indisponible, retourne une matrice Haversine avec fallback:true.

import { getServiceClient, extractBearerToken } from '../_lib/patientAuth.js';
import { withSentry } from '../_lib/sentry.js';

interface LatLng { lat: number; lng: number }

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function haversineMatrix(points: LatLng[]): { durees: number[][]; distances: number[][] } {
  const n = points.length;
  const durees: number[][] = [];
  const distances: number[][] = [];
  for (let i = 0; i < n; i++) {
    durees[i] = [];
    distances[i] = [];
    for (let j = 0; j < n; j++) {
      const km = haversineKm(points[i], points[j]);
      // Facteur routier 1.4 ; vitesse moyenne 40 km/h
      const distM = km * 1400;
      durees[i][j] = Math.round(distM / (40000 / 3600));
      distances[i][j] = Math.round(distM);
    }
  }
  return { durees, distances };
}

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

  const { coordonnees } = req.body ?? {};
  if (!Array.isArray(coordonnees) || coordonnees.length < 2) {
    return res.status(400).json({ error: 'coordonnees[] requis (minimum 2 points)' });
  }

  const points: LatLng[] = coordonnees;

  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    // Pas de clé configurée → fallback immédiat
    return res.status(200).json({ ...haversineMatrix(points), fallback: true });
  }

  try {
    // ORS attend [lng, lat] (ordre inversé vs Supabase)
    const locations = points.map(p => [p.lng, p.lat]);

    const orsRes = await fetch('https://api.openrouteservice.org/v2/matrix/driving-car', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey,
      },
      body: JSON.stringify({ locations, metrics: ['duration', 'distance'], units: 'm' }),
    });

    if (!orsRes.ok) {
      const errText = await orsRes.text();
      console.error('[matrice-trajets] Erreur ORS:', orsRes.status, errText);
      return res.status(200).json({ ...haversineMatrix(points), fallback: true });
    }

    const data = await orsRes.json();
    const durees: number[][] = (data.durations as number[][]).map(row => row.map(Math.round));
    const distances: number[][] = (data.distances as number[][]).map(row => row.map(Math.round));

    return res.status(200).json({ durees, distances, fallback: false });
  } catch (err) {
    console.error('[matrice-trajets] Exception ORS:', err);
    return res.status(200).json({ ...haversineMatrix(points), fallback: true });
  }
});
