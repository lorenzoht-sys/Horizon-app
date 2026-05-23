import type { Programme } from '../types';

interface Props {
  programme: Programme;
}

function getLastNDays(n: number): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function getDayStatus(programme: Programme, dateISO: string): 'fait' | 'partiel' | 'absent' | 'non-prevu' {
  const day = new Date(dateISO).getDay();
  const dayNum = day === 0 ? 7 : day;
  const prevu = programme.exercices.filter(e => e.frequenceParSemaine.includes(dayNum));
  if (prevu.length === 0) return 'non-prevu';

  let totalFait = 0;
  for (const semaine of programme.suiviSemaines) {
    const jours = semaine.jours[dateISO] ?? [];
    totalFait += jours.filter(j => j.fait).length;
  }

  if (totalFait === 0) return 'absent';
  if (totalFait < prevu.length) return 'partiel';
  return 'fait';
}

const STATUS_STYLE: Record<string, string> = {
  fait: 'bg-success text-white',
  partiel: 'bg-warning text-white',
  absent: 'bg-danger/20 text-danger',
  'non-prevu': 'bg-gray-100 text-gray-300',
};

export default function SuiviCalendar({ programme }: Props) {
  const days = getLastNDays(28);

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <div key={i} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {/* Leading empty cells for alignment */}
        {(() => {
          const firstDay = new Date(days[0]).getDay();
          const offset = firstDay === 0 ? 6 : firstDay - 1;
          return Array.from({ length: offset }).map((_, i) => (
            <div key={`empty-${i}`} />
          ));
        })()}
        {days.map(dateISO => {
          const status = getDayStatus(programme, dateISO);
          const d = new Date(dateISO);
          return (
            <div
              key={dateISO}
              title={`${d.toLocaleDateString('fr-FR')} — ${status === 'fait' ? 'Réalisé' : status === 'partiel' ? 'Partiel' : status === 'absent' ? 'Non fait' : 'Pas prévu'}`}
              className={`aspect-square rounded-md flex items-center justify-center text-xs font-semibold ${STATUS_STYLE[status]}`}
            >
              {d.getDate()}
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 mt-3 text-xs text-gray-500 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-success inline-block" />Réalisé</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-warning inline-block" />Partiel</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-danger/20 inline-block" />Non fait</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-100 inline-block" />Pas prévu</span>
      </div>
    </div>
  );
}
