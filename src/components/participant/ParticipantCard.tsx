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
  '#2BBFBF', '#1D9E9E', '#7D3C98', '#E67E22',
  '#E91E8C', '#1A7F5A',
];

function avatarColor(id: string): string {
  return AVATAR_COLORS[id.charCodeAt(0) % AVATAR_COLORS.length];
}

export default function ParticipantCard({ participant }: Props) {
  const age = calcAge(participant.dateNaissance);
  const lastBilan = participant.bilans.at(-1);
  const needsBilan = lastBilan ? daysSince(lastBilan.date) > 85 : true;
  const bgColor = avatarColor(participant.id);

  return (
    <Link
      to={`/participant/${participant.id}`}
      className="bg-white flex flex-col gap-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 group"
      style={{
        borderRadius: 16,
        border: '1px solid #E2EEEE',
        padding: 24,
        textDecoration: 'none',
        display: 'flex',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-base"
          style={{ background: bgColor }}
        >
          {getInitials(participant.nom, participant.prenom)}
        </div>
        <div className="flex-1 min-w-0">
          <h3
            className="font-heading font-semibold truncate m-0"
            style={{ color: '#0D2B2B', fontSize: 15, lineHeight: 1.3 }}
          >
            {participant.prenom} {participant.nom}
          </h3>
          <p className="mt-0.5 m-0" style={{ fontSize: 13, color: '#5C7A7A' }}>
            {age} ans
          </p>
          {participant.pathologie ? (
            <p className="mt-0.5 m-0 truncate" style={{ fontSize: 12, color: '#A8C0C0' }}>
              {participant.pathologie}
            </p>
          ) : participant.contexteClinic ? (
            <p className="mt-0.5 m-0 truncate" style={{ fontSize: 12, color: '#A8C0C0' }}>
              {participant.contexteClinic}
            </p>
          ) : null}
        </div>
        <ChevronRight
          size={16}
          className="flex-shrink-0 mt-1 transition-colors"
          style={{ color: '#A8C0C0' }}
        />
      </div>

      <div className="flex items-center justify-between" style={{ fontSize: 12 }}>
        <div className="flex items-center gap-1.5" style={{ color: '#5C7A7A' }}>
          <Calendar size={12} />
          {lastBilan
            ? new Date(lastBilan.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
            : 'Aucun bilan'
          }
        </div>
        {needsBilan && (
          <div
            className="flex items-center gap-1 rounded-full"
            style={{
              background: 'rgba(243,156,18,0.10)',
              color: '#F39C12',
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 8px',
              textTransform: 'uppercase',
              letterSpacing: '0.3px',
            }}
          >
            <AlertCircle size={11} />
            <span>Bilan à faire</span>
          </div>
        )}
      </div>

      <div
        className="flex items-center gap-2 pt-3"
        style={{ borderTop: '1px solid #E2EEEE', fontSize: 12, color: '#A8C0C0' }}
      >
        <span
          className="rounded-full"
          style={{
            background: '#E8F9F9',
            color: '#2BBFBF',
            padding: '2px 8px',
            fontSize: 12,
          }}
        >
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
