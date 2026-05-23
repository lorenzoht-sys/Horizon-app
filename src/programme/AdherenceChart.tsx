import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Props {
  data: { semaine: string; taux: number; fait: number; prevu: number }[];
}

export default function AdherenceChart({ data }: Props) {
  if (data.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">Aucune donnée de suivi disponible.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
        <XAxis
          dataKey="semaine"
          tick={{ fontSize: 11 }}
          tickFormatter={(v) => {
            const d = new Date(v);
            return `${d.getDate()}/${d.getMonth() + 1}`;
          }}
        />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
        <Tooltip
          formatter={(value) => [`${value}%`, 'Adhérence']}
          labelFormatter={(label) => {
            const d = new Date(label as string);
            return `Semaine du ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
          }}
        />
        <Bar dataKey="taux" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell
              key={index}
              fill={entry.taux >= 70 ? '#22C55E' : entry.taux >= 40 ? '#F59E0B' : '#EF4444'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
