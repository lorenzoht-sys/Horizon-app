import {
  Radar,
  RadarChart as ReRadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { Bilan, TestKey } from '../../types';
import { useNormalize } from '../../hooks/useNormalize';
import { TEST_RADAR_LABELS, ALL_TESTS } from '../../data/profiles';

interface Props {
  initial: Bilan | null;
  current: Bilan;
  testsActifs?: TestKey[];
}

function bilanAxisValue(key: TestKey, bilan: Bilan, normalize: ReturnType<typeof useNormalize>): number {
  switch (key) {
    case 'equilibre': {
      const moy = ((bilan.equilibre.droite ?? 0) + (bilan.equilibre.gauche ?? 0)) / 2;
      return normalize.equilibre(moy);
    }
    case 'chairStand': return normalize.chairStand30(bilan.chairStand30 ?? 0);
    case 'handGrip': {
      const moy = ((bilan.handGrip.droite ?? 0) + (bilan.handGrip.gauche ?? 0)) / 2;
      return normalize.handGrip(moy);
    }
    case 'tug':       return normalize.tug3m(bilan.tug3m ?? 20);
    case 'souplesse': return normalize.souplesse(bilan.souplesse.valeur ?? -20);
    case 'tm6':       return normalize.tm6(bilan.tm6.distanceMetres ?? 0);
    case 'memoire': {
      const mis = bilan.memoire.dubois?.scoreMIS;
      if (mis != null) return Math.round((mis / 10) * 100);
      const moy = ((bilan.memoire.scoreImmediat ?? 0) + (bilan.memoire.scoreDiffere ?? 0)) / 2;
      return normalize.memoire(moy);
    }
  }
}

export default function RadarChart({ initial, current, testsActifs }: Props) {
  const normalize = useNormalize();

  // N'afficher que les axes des tests actifs (ou tous si non précisé)
  const axes = (testsActifs ?? ALL_TESTS).filter(k => TEST_RADAR_LABELS[k]);

  const data = axes.map(key => ({
    subject: TEST_RADAR_LABELS[key]!,
    Actuel: Math.round(bilanAxisValue(key, current, normalize)),
    ...(initial ? { Initial: Math.round(bilanAxisValue(key, initial, normalize)) } : {}),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ReRadarChart data={data}>
        <PolarGrid stroke="#E5E7EB" />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: '#6B7280' }} />
        {initial && (
          <Radar name="Initial" dataKey="Initial"
            stroke="#94A3B8" fill="#94A3B8" fillOpacity={0.15} strokeDasharray="4 2" />
        )}
        <Radar name="Actuel" dataKey="Actuel"
          stroke="#1A5F9E" fill="#1A5F9E" fillOpacity={0.3} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </ReRadarChart>
    </ResponsiveContainer>
  );
}
