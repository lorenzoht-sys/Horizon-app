import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { Bilan } from '../../types';

interface CurveConfig {
  key: string;
  label: string;
  unit: string;
  color: string;
  getValue: (b: Bilan) => number | null;
}

const CURVES: CurveConfig[] = [
  { key: 'equD', label: 'Équilibre D', unit: 's', color: '#1A5F9E', getValue: b => b.equilibre.droite },
  { key: 'equG', label: 'Équilibre G', unit: 's', color: '#2BBFBF', getValue: b => b.equilibre.gauche },
  { key: 'cs', label: 'Chair Stand', unit: 'rép.', color: '#22C55E', getValue: b => b.chairStand30 },
  { key: 'tug', label: 'TUG 3m', unit: 's', color: '#F59E0B', getValue: b => b.tug3m },
  { key: 'tm6', label: 'TM6', unit: 'm', color: '#EF4444', getValue: b => b.tm6.distanceMetres },
  { key: 'grip', label: 'HandGrip D', unit: 'kg', color: '#8B5CF6', getValue: b => b.handGrip.droite },
];

interface Props {
  bilans: Bilan[];
  metricKey?: string;
}

export default function ProgressCurve({ bilans, metricKey }: Props) {
  const sorted = [...bilans].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const curves = metricKey ? CURVES.filter(c => c.key === metricKey) : CURVES;

  const data = sorted.map(b => {
    const point: Record<string, unknown> = {
      date: new Date(b.date).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
    };
    curves.forEach(c => {
      const v = c.getValue(b);
      if (v !== null) point[c.key] = v;
    });
    return point;
  });

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
        <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 12 }}
          formatter={(value, name) => {
            const key = String(name ?? '');
            const curve = CURVES.find(c => c.key === key);
            return [`${value} ${curve?.unit ?? ''}`, curve?.label ?? key] as [string, string];
          }}
        />
        {curves.map(c => (
          <Line
            key={c.key}
            type="monotone"
            dataKey={c.key}
            stroke={c.color}
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 2 }}
            activeDot={{ r: 6 }}
            connectNulls={false}
          />
        ))}
        <ReferenceLine y={0} stroke="#E5E7EB" />
      </LineChart>
    </ResponsiveContainer>
  );
}
