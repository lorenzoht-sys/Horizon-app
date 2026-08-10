import {
  Radar,
  RadarChart as ReRadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';
import type { Bilan, TestKey } from '../../types';
import { useNormalize } from '../../hooks/useNormalize';
import { TEST_RADAR_LABELS, ALL_TESTS } from '../../data/profiles';
import { computeBergScore } from '../../data/berg';

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
    case 'apley':
      return bilan.apley?.score != null ? Math.round((bilan.apley.score / 4) * 100) : 0;
    case 'tinetti':
      return 0;
    case 'eva':
      return 0;
    case 'berg': {
      const score = computeBergScore(bilan.berg);
      return score !== null ? Math.round((score / 56) * 100) : 0;
    }
    case 'moca':
      return bilan.mocaScore != null ? Math.round((bilan.mocaScore / 30) * 100) : 0;
    case 'marche10m': {
      const h = bilan.marche10m?.habituel;
      if (!h || h <= 0) return 0;
      return Math.min(100, Math.round(((10 / h) / 2.0) * 100));
    }
    case 'adl': {
      const adlScore = bilan.adl ? Object.values(bilan.adl).filter(Boolean).length : 0;
      const iadlScore = bilan.iadl ? Object.values(bilan.iadl).filter(Boolean).length : 0;
      return Math.round(((adlScore + iadlScore) / 14) * 100);
    }
  }
}

export default function RadarChart({ initial, current, testsActifs }: Props) {
  const normalize = useNormalize();

  // N'afficher que les axes des tests actifs (ou tous si non précisé, ou si
  // testsActifs est un tableau vide — voir diagnostic TM6 : [] ne veut pas
  // dire "aucun test actif" mais "aucun choix jamais fait")
  const axes = (testsActifs?.length ? testsActifs : ALL_TESTS).filter(k => TEST_RADAR_LABELS[k]);

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
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 12px', fontSize: 11, boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
                <div style={{ fontWeight: 700, color: '#374151', marginBottom: 4 }}>{label}</div>
                {(payload as unknown as Array<{ name: string; value: number; color: string }>).map(p => (
                  <div key={p.name} style={{ color: p.color, fontWeight: 600 }}>
                    {p.name} : {p.value}/100
                  </div>
                ))}
              </div>
            );
          }}
        />
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
