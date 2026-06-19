import type { Bilan } from '../../types';
import { useBilanDelta } from '../../hooks/useBilanDelta';
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';

interface Props {
  current: Bilan;
  previous: Bilan | null;
}

function DeltaBadge({ isPositive, direction }: { isPositive: boolean; direction: string }) {
  if (direction === 'first') return <span className="text-gray-400 text-xs">—</span>;
  if (direction === 'equal') return <Minus size={14} className="text-gray-400" />;
  return isPositive
    ? <TrendingUp size={14} className="text-success" />
    : <TrendingDown size={14} className="text-danger" />;
}

export default function ComparisonTable({ current, previous }: Props) {
  const d = useBilanDelta(current, previous);

  const rows: { label: string; unit: string; current: number | null; delta: typeof d.tm6Distance; warning?: string | null }[] = [
    { label: 'Équilibre D', unit: 's', current: current.equilibre.droite, delta: d.equilibreDroite },
    { label: 'Équilibre G', unit: 's', current: current.equilibre.gauche, delta: d.equilibreGauche },
    { label: 'Chair Stand 30s', unit: 'rép.', current: current.chairStand30, delta: d.chairStand30 },
    { label: 'HandGrip D', unit: 'kg', current: current.handGrip.droite, delta: d.handGripDroite },
    { label: 'HandGrip G', unit: 'kg', current: current.handGrip.gauche, delta: d.handGripGauche },
    { label: 'TUG 3m', unit: 's', current: current.tug3m, delta: d.tug3m },
    { label: 'Souplesse', unit: 'cm', current: current.souplesse.valeur, delta: d.souplesse },
    { label: 'TM6 Distance', unit: 'm', current: current.tm6.distanceMetres, delta: d.tm6Distance, warning: d.tm6DureeMismatch ? 'Durées de test différentes — comparaison indicative' : null },
    { label: 'Mémoire immédiate', unit: '/5', current: current.memoire.scoreImmediat, delta: d.memoireImmediat },
    { label: 'Mémoire différée', unit: '/5', current: current.memoire.scoreDiffere, delta: d.memoireDiffere },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-2 px-3 text-gray-500 font-medium">Test</th>
            <th className="text-center py-2 px-3 text-gray-500 font-medium">Initial</th>
            <th className="text-center py-2 px-3 text-gray-500 font-medium">Actuel</th>
            <th className="text-center py-2 px-3 text-gray-500 font-medium">Évol.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
              <td className="py-2 px-3 font-medium text-dark">
                <span className="flex items-center gap-1.5">
                  {row.label}
                  {row.warning && (
                    <span title={row.warning}>
                      <AlertTriangle size={13} className="text-orange-500" />
                    </span>
                  )}
                </span>
              </td>
              <td className="py-2 px-3 text-center text-gray-500">
                {row.delta.previous !== null ? `${row.delta.previous} ${row.unit}` : '—'}
              </td>
              <td className="py-2 px-3 text-center font-semibold text-dark">
                {row.current !== null ? `${row.current} ${row.unit}` : '—'}
              </td>
              <td className="py-2 px-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <DeltaBadge isPositive={row.delta.isPositive} direction={row.delta.direction} />
                  {row.delta.delta !== null && row.delta.direction !== 'equal' && (
                    <span className={`text-xs font-medium ${row.delta.isPositive ? 'text-success' : 'text-danger'}`}>
                      {row.delta.delta > 0 ? '+' : ''}{Math.round(row.delta.delta * 10) / 10}
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
