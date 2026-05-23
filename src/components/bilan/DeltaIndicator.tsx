import type { DeltaResult } from '../../types';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface Props {
  delta: DeltaResult;
  unit?: string;
  compact?: boolean;
}

export default function DeltaIndicator({ delta, unit = '', compact = false }: Props) {
  if (delta.direction === 'first' || delta.delta === null) {
    return <span className="text-xs text-gray-400 italic">initial</span>;
  }

  if (delta.direction === 'equal') {
    return (
      <span className="inline-flex items-center gap-1 text-gray-500 text-xs font-medium">
        <Minus size={12} />
        {!compact && '='}
      </span>
    );
  }

  const isPositive = delta.isPositive;
  const colorClass = isPositive ? 'text-success' : 'text-danger';
  const sign = delta.delta > 0 ? '+' : '';
  const displayDelta = delta.lowerIsBetter
    ? (delta.delta < 0 ? `${sign}${Math.abs(Math.round(delta.delta * 10) / 10)}` : `+${Math.round(delta.delta * 10) / 10}`)
    : `${sign}${Math.round(delta.delta * 10) / 10}`;

  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${colorClass}`}>
      {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {!compact && `${displayDelta} ${unit}`}
    </span>
  );
}
