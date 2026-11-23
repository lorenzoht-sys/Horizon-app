import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import type { Participant, Seance } from '../../types';
import type { ContexteBeneficiaire } from '../../lib/tableauDeBord';
import { LABEL_TYPE } from '../../lib/agendaCommun';
import { niveauBienEtre, niveauEffort } from '../../lib/ressentiCours';

// « Votre prochain rendez-vous » (tableau de bord V1, 23/11/2026) : ce qu'un enseignant APA veut
// savoir avant de partir. On parle de la personne : son objectif, ce qu'il faut garder en tête,
// comment elle se sentait la dernière fois. Tout vient de données existantes (bilans, retours de
// séance), rien n'est saisi ici.

const AVATAR_COLORS = ['#2BB89A', '#1D9E9E', '#7D3C98', '#E67E22', '#C2187A', '#1A7F5A'];

export function CarteProchainRendezVous({ seance, participant, contexte, dernierRessenti, delai, quand }: {
  seance: Seance | null;
  participant: Participant | null;
  contexte: ContexteBeneficiaire;
  dernierRessenti: { borgRpe: number; bienEtre: number } | null;
  /** « dans 2 h 10 », « demain »… */
  delai: string;
  /** « Aujourd’hui · 14:30 » */
  quand: string;
}) {
  if (!seance || !participant) {
    return (
      <section aria-labelledby="titre-prochain" className="rounded-[20px] flex flex-col gap-3 justify-center"
        style={{ background: '#E3F4EF', border: '1px solid #C6E8DE', padding: '22px 24px' }}>
        <h2 id="titre-prochain" className="m-0 text-[13px] font-extrabold" style={{ color: '#147A64' }}>Votre prochain rendez-vous</h2>
        <p className="m-0 text-[15px] font-bold" style={{ color: 'var(--color-ink)' }}>Aucun rendez-vous prévu pour l’instant.</p>
        <p className="m-0 text-sm" style={{ color: '#3D4C5A' }}>Planifiez vos prochaines séances : elles apparaîtront ici, avec l’objectif de chaque personne.</p>
        <Link to="/agenda-v2" className="self-start inline-flex items-center h-[42px] px-4 rounded-[11px] text-white text-[13px] font-bold" style={{ background: '#1A9A7F' }}>
          Ouvrir l’agenda
        </Link>
      </section>
    );
  }

  const nom = `${participant.prenom} ${participant.nom}`;
  const adresse = seance.adresse?.trim() || [participant.adresseRue, participant.adresseCodePostal, participant.adresseVille].filter(Boolean).join(' ');
  const bienEtre = dernierRessenti ? niveauBienEtre(dernierRessenti.bienEtre) : null;
  const effort = dernierRessenti ? niveauEffort(dernierRessenti.borgRpe) : null;
  const lignes: { cle: string; titre: string; couleur: string; texte: string }[] = [];
  if (seance.objectif?.trim()) lignes.push({ cle: 'seance', titre: 'Objectif de la séance', couleur: '#147A64', texte: seance.objectif.trim() });
  if (contexte.objectif) lignes.push({ cle: 'objectif', titre: 'Son objectif', couleur: '#147A64', texte: `« ${contexte.objectif} »` });
  if (contexte.vigilance) lignes.push({ cle: 'vigilance', titre: 'À garder en tête', couleur: '#8A5300', texte: contexte.vigilance });
  if (bienEtre || effort) {
    lignes.push({
      cle: 'ressenti', titre: 'La dernière fois', couleur: '#3D4C5A',
      texte: [bienEtre && `se sentait « ${bienEtre.label.toLowerCase()} »`, effort && `effort « ${effort.label.toLowerCase()} »`].filter(Boolean).join(', '),
    });
  }

  return (
    <section aria-labelledby="titre-prochain" className="rounded-[20px] flex flex-col gap-3.5"
      style={{ background: '#E3F4EF', border: '1px solid #C6E8DE', padding: '22px 24px' }}>
      <div className="flex justify-between items-center gap-3">
        <h2 id="titre-prochain" className="m-0 text-[13px] font-extrabold" style={{ color: '#147A64' }}>Votre prochain rendez-vous</h2>
        <span className="text-[13px] font-bold px-2.5 py-1 rounded-full bg-white" style={{ color: '#147A64' }}>{delai}</span>
      </div>
      <div className="flex items-center gap-3.5">
        <span className="w-[52px] h-[52px] rounded-full text-white text-lg font-extrabold flex items-center justify-center flex-shrink-0"
          style={{ background: AVATAR_COLORS[participant.id.charCodeAt(0) % AVATAR_COLORS.length] }} aria-hidden="true">
          {`${participant.prenom[0] ?? ''}${participant.nom[0] ?? ''}`.toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="text-xl font-extrabold truncate" style={{ color: 'var(--color-ink)' }}>
            {nom} <span className="font-semibold" style={{ color: '#3D4C5A' }}>· {quand}</span>
          </div>
          <div className="text-[13px]" style={{ color: '#3D4C5A' }}>
            {LABEL_TYPE[seance.type]} · {seance.dureeMinutes} min
          </div>
        </div>
      </div>

      {lignes.length > 0 ? (
        <dl className="m-0 grid gap-x-3 gap-y-1.5 text-[13px] bg-white rounded-[14px] px-3.5 py-3" style={{ gridTemplateColumns: 'auto 1fr' }}>
          {lignes.map(l => (
            <div key={l.cle} className="contents">
              <dt className="font-bold whitespace-nowrap" style={{ color: l.couleur }}>{l.titre}</dt>
              <dd className="m-0" style={{ color: 'var(--color-ink)' }}>{l.texte}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="m-0 text-[13px] bg-white rounded-[14px] px-3.5 py-3" style={{ color: '#3D4C5A' }}>
          Astuce : notez l’objectif personnel de {participant.prenom} lors du bilan, il s’affichera ici avant chaque séance.
        </p>
      )}

      {adresse && (
        <p className="m-0 flex items-center gap-1.5 text-[13px]" style={{ color: '#3D4C5A' }}>
          <MapPin size={14} aria-hidden="true" style={{ color: '#147A64' }} /> {adresse}
        </p>
      )}

      <div className="flex gap-2 flex-wrap">
        <Link to={`/participant/${participant.id}`} className="inline-flex items-center h-[42px] px-4 rounded-[11px] text-white text-[13px] font-bold hover:opacity-90" style={{ background: '#1A9A7F' }}>
          Préparer la séance
        </Link>
        <Link to={`/participant/${participant.id}/programme`} className="inline-flex items-center h-[42px] px-4 rounded-[11px] bg-white text-[13px] font-bold hover:bg-gray-50" style={{ border: '1.5px solid #B5DDD2', color: 'var(--color-ink)' }}>
          Programme
        </Link>
        {adresse && (
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adresse)}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center h-[42px] px-4 rounded-[11px] bg-white text-[13px] font-bold hover:bg-gray-50" style={{ border: '1.5px solid #B5DDD2', color: 'var(--color-ink)' }}>
            Itinéraire
          </a>
        )}
      </div>
    </section>
  );
}
