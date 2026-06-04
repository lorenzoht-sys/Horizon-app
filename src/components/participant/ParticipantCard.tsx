import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Participant } from '../../types';
import { Calendar, AlertCircle, ChevronRight, Phone, Building2 } from 'lucide-react';

interface Props {
  participant: Participant;
  structureNom?: string;
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
  'var(--color-teal)', '#1D9E9E', '#7D3C98', '#E67E22',
  '#E91E8C', '#1A7F5A',
];

function avatarColor(id: string): string {
  return AVATAR_COLORS[id.charCodeAt(0) % AVATAR_COLORS.length];
}

export default function ParticipantCard({ participant, structureNom }: Props) {
  const age = calcAge(participant.dateNaissance);
  const lastBilan = participant.bilans.at(-1);
  const needsBilan = lastBilan ? daysSince(lastBilan.date) > 85 : true;
  const bgColor = avatarColor(participant.id);

  return (
    <motion.div
      whileHover={{ y: -3, boxShadow: 'var(--shadow-md)', borderColor: 'rgba(43,184,154,0.3)' }}
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.15 }}
      style={{ borderRadius: 16, border: '1px solid #E2EEEE' }}
    >
    <Link
      to={`/participant/${participant.id}`}
      className="bg-white flex flex-col gap-4 shadow-sm group"
      style={{
        borderRadius: 16,
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
            style={{ color: 'var(--color-ink)', fontSize: 15, lineHeight: 1.3 }}
          >
            {participant.prenom} {participant.nom}
          </h3>
          <p className="mt-0.5 m-0" style={{ fontSize: 13, color: 'var(--color-ink-2)' }}>
            {age} ans
          </p>
          {participant.pathologie ? (
            <p className="mt-0.5 m-0 truncate" style={{ fontSize: 12, color: 'var(--color-ink-3)' }}>
              {participant.pathologie}
            </p>
          ) : participant.contexteClinic ? (
            <p className="mt-0.5 m-0 truncate" style={{ fontSize: 12, color: 'var(--color-ink-3)' }}>
              {participant.contexteClinic}
            </p>
          ) : null}
        </div>
        <ChevronRight
          size={16}
          className="flex-shrink-0 mt-1 transition-colors"
          style={{ color: 'var(--color-ink-3)' }}
        />
      </div>

      <div className="flex items-center justify-between" style={{ fontSize: 12 }}>
        <div className="flex items-center gap-1.5" style={{ color: 'var(--color-ink-2)' }}>
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
        style={{ borderTop: '1px solid #E2EEEE', fontSize: 12, color: 'var(--color-ink-3)' }}
      >
        <span
          className="rounded-full"
          style={{ background: 'var(--color-teal-light)', color: 'var(--color-teal)', padding: '2px 8px', fontSize: 12 }}
        >
          {participant.bilans.length} bilan{participant.bilans.length !== 1 ? 's' : ''}
        </span>
        {(participant.structureId || structureNom) && (
          <span className="flex items-center gap-1 rounded-full" style={{ background: '#EEF2FF', color: '#4F46E5', padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
            <Building2 size={10} />
            {structureNom ?? 'Structure'}
          </span>
        )}
        {participant.telephone && (
          <span className="flex items-center gap-1">
            <Phone size={10} />
            {participant.telephone}
          </span>
        )}
      </div>
    </Link>
    </motion.div>
  );
}
