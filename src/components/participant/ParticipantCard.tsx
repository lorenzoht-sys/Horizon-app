import { Link } from 'react-router-dom';
import type { Participant } from '../../types';
import { Calendar, AlertCircle, ChevronRight, Phone } from 'lucide-react';

interface Props {
  participant: Participant;
}

function calcAge(dateNaissance: string): number {
  const today = new Date();
  const birth = new Date(dateNaissance);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function daysSince(date: string): number {
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

function getInitials(nom: string, prenom: string): string {
  return `${prenom[0] ?? ''}${nom[0] ?? ''}`.toUpperCase();
}

const AVATAR_COLORS = [
  'bg-primary', 'bg-secondary', 'bg-purple-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500',
];

function avatarColor(id: string): string {
  const idx = id.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

export default function ParticipantCard({ participant }: Props) {
  const age = calcAge(participant.dateNaissance);
  const lastBilan = participant.bilans.at(-1);
  const needsBilan = lastBilan ? daysSince(lastBilan.date) > 85 : true;
  const color = avatarColor(participant.id);

  return (
    <Link
      to={`/participant/${participant.id}`}
      className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-lg hover:border-primary/20 transition-all group flex flex-col gap-4"
    >
      <div className="flex items-start gap-3">
        <div className={`${color} w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0`}>
          {getInitials(participant.nom, participant.prenom)}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-heading font-semibold text-dark truncate">
            {participant.prenom} {participant.nom}
          </h3>
          <p className="text-sm text-gray-500">{age} ans</p>
          {participant.pathologie ? (
            <p className="text-xs text-gray-400 truncate mt-0.5">{participant.pathologie}</p>
          ) : participant.contexteClinic ? (
            <p className="text-xs text-gray-400 truncate mt-0.5">{participant.contexteClinic}</p>
          ) : null}
        </div>
        <ChevronRight size={16} className="text-gray-300 group-hover:text-primary transition-colors flex-shrink-0 mt-1" />
      </div>

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-gray-500">
          <Calendar size={12} />
          {lastBilan
            ? new Date(lastBilan.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
            : 'Aucun bilan'
          }
        </div>
        {needsBilan && (
          <div className="flex items-center gap-1 bg-warning/10 text-warning px-2 py-0.5 rounded-full">
            <AlertCircle size={11} />
            <span>Bilan à faire</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-400 border-t border-gray-50 pt-3">
        <span className="bg-light text-primary px-2 py-0.5 rounded-full">
          {participant.bilans.length} bilan{participant.bilans.length !== 1 ? 's' : ''}
        </span>
        {participant.telephone && (
          <span className="flex items-center gap-1">
            <Phone size={10} />
            {participant.telephone}
          </span>
        )}
      </div>
    </Link>
  );
}
