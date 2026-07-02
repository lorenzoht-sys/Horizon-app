import { toast } from 'sonner';

interface GeocodeResult {
  lat: number;
  lng: number;
  adresseNormalisee: string;
}

/**
 * Géocode une adresse via l'API Adresse officielle française.
 * Gratuit, sans clé API, pour les adresses françaises.
 */
export async function geocodeAdresse(
  rue: string,
  codePostal: string,
  ville: string
): Promise<GeocodeResult | null> {
  const q = [rue, codePostal, ville].filter(Boolean).join(' ').trim();
  if (!q) return null;

  try {
    const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const feature = data?.features?.[0];
    if (!feature) {
      toast.error('Adresse introuvable — vérifiez l\'adresse du bénéficiaire', { id: 'geocode-fail' });
      return null;
    }

    const [lng, lat] = feature.geometry.coordinates as [number, number];
    const adresseNormalisee = feature.properties.label as string;
    return { lat, lng, adresseNormalisee };
  } catch {
    return null;
  }
}
