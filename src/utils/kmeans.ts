interface Point { id: string; lat: number; lng: number; }
interface Cluster { centroide: { lat: number; lng: number }; points: Point[]; }

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lng - a.lng) * Math.PI / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function kMeans(points: Point[], k: number, iterations = 100): Cluster[] {
  if (points.length === 0) return [];
  if (k >= points.length) {
    return points.map(p => ({ centroide: { lat: p.lat, lng: p.lng }, points: [p] }));
  }

  // Initialisation K-Means++ : 1er centroïde aléatoire, suivants pondérés par distance
  const centroides: { lat: number; lng: number }[] = [];
  const shuffled = [...points].sort(() => Math.random() - 0.5);
  centroides.push({ lat: shuffled[0].lat, lng: shuffled[0].lng });

  while (centroides.length < k) {
    const distances = points.map(p =>
      Math.min(...centroides.map(c => haversine(p, c))) ** 2
    );
    const total = distances.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < points.length; i++) {
      r -= distances[i];
      if (r <= 0) { centroides.push({ lat: points[i].lat, lng: points[i].lng }); break; }
    }
  }

  let clusters: Cluster[] = [];

  for (let iter = 0; iter < iterations; iter++) {
    clusters = centroides.map(c => ({ centroide: c, points: [] as Point[] }));

    for (const point of points) {
      let minDist = Infinity, closestIdx = 0;
      centroides.forEach((c, i) => {
        const d = haversine({ lat: point.lat, lng: point.lng }, c);
        if (d < minDist) { minDist = d; closestIdx = i; }
      });
      clusters[closestIdx].points.push(point);
    }

    const nouveaux = clusters.map(cl => {
      if (!cl.points.length) return cl.centroide;
      return {
        lat: cl.points.reduce((s, p) => s + p.lat, 0) / cl.points.length,
        lng: cl.points.reduce((s, p) => s + p.lng, 0) / cl.points.length,
      };
    });

    const converge = nouveaux.every((c, i) =>
      Math.abs(c.lat - centroides[i].lat) < 0.0001 &&
      Math.abs(c.lng - centroides[i].lng) < 0.0001
    );
    centroides.splice(0, centroides.length, ...nouveaux);
    if (converge) break;
  }

  return clusters;
}
