import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Participant } from '../../types';
import { Building2, CalendarDays, MoreHorizontal, Archive } from 'lucide-react';
import { libelleAge } from '../../lib/age';
import { echeanceBilan, resultatsCles, LIBELLE_NIVEAU, type Niveau, type EtatEcheance } from '../../lib/tableauDeBord';

// Carte d'un bénéficiaire (tableau de bord, archives, fiche structure).
// Refonte du 23/11/2026 (maquette validée par Lorenzo) : en plus de l'identité, la carte montre
// les quatre résultats du dernier bilan avec leur niveau, l'échéance du prochain bilan et, quand
// le tableau de bord les fournit, l'assiduité au programme et le prochain rendez-vous.
// Toute la carte reste cliquable (lien étiré) ; le menu « ··· » porte les actions secondaires.

interface Props {
  participant: Participant;
  structureNom?: string;
  /** Part des exercices du programme faits sur 7 jours (null : aucun exercice prévu). */
  assiduite?: number | null;
  /** « Jeu. 26 · 09:00 », déjà mis en forme ; null : aucun rendez-vous prévu. */
  prochainRendezVous?: string | null;
  /** Présent : le menu « ··· » propose « Archiver ». */
  onArchiver?: () => void;
}

const AVATAR_COLORS = ['#2BB89A', '#1D9E9E', '#7D3C98', '#E67E22', '#C2187A', '#1A7F5A'];

function avatarColor(id: string): string {
  return AVATAR_COLORS[id.charCodeAt(0) % AVATAR_COLORS.length];
}

const POINT_NIVEAU: Record<Niveau, string> = {
  norme: '#27AE60',
  surveiller: '#F0A429',
  difficulte: '#E8544A',
};

const PASTILLE_ECHEANCE: Record<EtatEcheance, { fond: string; texte: string }> = {
  a_jour:  { fond: '#E6F5F1', texte: '#147A64' },
  bientot: { fond: '#FEF5E7', texte: '#A8650A' },
  retard:  { fond: '#FEF0EF', texte: '#C0392B' },
  initial: { fond: '#FEF5E7', texte: '#A8650A' },
};

function couleursAssiduite(taux: number): { barre: string; texte: string } {
  if (taux >= 70) return { barre: '#2BB89A', texte: '#147A64' };
  if (taux >= 50) return { barre: '#F0A429', texte: '#A8650A' };
  return { barre: '#E8544A', texte: '#C0392B' };
}

export default function ParticipantCard({ participant, structureNom, assiduite, prochainRendezVous, onArchiver }: Props) {
  const [menuOuvert, setMenuOuvert] = useState(false);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const dernierBilan = [...participant.bilans].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const resultats = resultatsCles(dernierBilan);
  const echeance = echeanceBilan(participant.bilans, aujourdhui);
  const pastille = PASTILLE_ECHEANCE[echeance.etat];
  const nom = `${participant.prenom} ${participant.nom}`;
  const lieu = structureNom ?? participant.adresseVille ?? null;

  return (
    <article
      className="relative bg-white flex flex-col gap-3.5 transition-shadow hover:shadow-md focus-within:shadow-md"
      style={{ borderRadius: 18, border: '1px solid #E2EEEE', padding: 18, boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-[15px]"
          style={{ background: avatarColor(participant.id) }}
          aria-hidden="true"
        >
          {`${participant.prenom[0] ?? ''}${participant.nom[0] ?? ''}`.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-heading font-bold truncate m-0 flex items-center gap-1.5" style={{ fontSize: 16, lineHeight: 1.3 }}>
            {/* Lien étiré : toute la carte ouvre la fiche, comme avant la refonte. */}
            <Link to={`/participant/${participant.id}`} className="text-dark hover:text-primary-dark after:absolute after:inset-0 after:rounded-[18px] focus:outline-none">
              {nom}
            </Link>
            {participant.archive && (
              <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: '#F1F2F4', color: '#6B7280' }}>
                Archivé
              </span>
            )}
          </h3>
          <p className="m-0 mt-0.5 truncate flex items-center gap-1" style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>
            {libelleAge(participant.dateNaissance)}
            {lieu && <> · {structureNom && <Building2 size={11} className="flex-shrink-0" aria-label="Structure" />}{lieu}</>}
          </p>
        </div>
        {onArchiver && (
          <div className="relative z-10" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setMenuOuvert(false); }}>
            <button
              type="button"
              aria-label={`Plus d'actions pour ${nom}`}
              aria-expanded={menuOuvert}
              aria-haspopup="menu"
              onClick={() => setMenuOuvert(o => !o)}
              onKeyDown={e => { if (e.key === 'Escape') setMenuOuvert(false); }}
              className="w-9 h-9 rounded-[10px] border border-[#E2EEEE] bg-white flex items-center justify-center text-ink-2 hover:text-primary-dark hover:border-primary/40"
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOuvert && (
              <div role="menu" className="absolute right-0 mt-1 w-44 bg-white rounded-xl border border-[#E2EEEE] shadow-lg py-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setMenuOuvert(false); onArchiver(); }}
                  aria-label={`Archiver ${nom}`}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-dark hover:bg-gray-50"
                >
                  <Archive size={14} /> Archiver
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {resultats.length > 0 ? (
        <div className="grid grid-cols-4 gap-1.5" aria-label="Résultats du dernier bilan">
          {resultats.map(r => (
            <div key={r.cle} className="rounded-[10px] text-center px-1 py-2" style={{ background: '#F5F9FB' }}
              title={r.niveau ? LIBELLE_NIVEAU[r.niveau] : undefined}>
              <div className="flex items-center justify-center gap-1 text-[11px] font-bold" style={{ color: 'var(--color-ink-2)' }}>
                {r.niveau && <span className="w-[7px] h-[7px] rounded-full" style={{ background: POINT_NIVEAU[r.niveau] }} aria-hidden="true" />}
                {r.libelle}
              </div>
              <div className="text-sm font-extrabold mt-0.5 truncate">
                {r.valeur}
                {r.niveau && <span className="sr-only"> ({LIBELLE_NIVEAU[r.niveau]})</span>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="m-0 text-xs rounded-[10px] px-3 py-2.5" style={{ background: '#F5F9FB', color: 'var(--color-ink-2)' }}>
          Aucun résultat de bilan pour l’instant.
        </p>
      )}

      <div className="flex flex-col gap-2 text-[13px]">
        {!participant.archive && (
          <div className="flex justify-between items-center gap-2">
            <span style={{ color: 'var(--color-ink-2)' }}>Prochain bilan</span>
            <span className="font-bold text-xs px-2.5 py-0.5 rounded-full" style={{ background: pastille.fond, color: pastille.texte }}>
              {echeance.libelle}
            </span>
          </div>
        )}
        {assiduite !== undefined && (
          <div className="flex justify-between items-center gap-2">
            <span style={{ color: 'var(--color-ink-2)' }}>Exercices faits (7 jours)</span>
            {assiduite === null ? (
              <span className="text-xs" style={{ color: 'var(--color-ink-2)' }}>—</span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="inline-block w-[70px] h-1.5 rounded-full overflow-hidden" style={{ background: '#E6F5F1' }} aria-hidden="true">
                  <span className="block h-full rounded-full" style={{ width: `${assiduite}%`, background: couleursAssiduite(assiduite).barre }} />
                </span>
                <strong style={{ color: couleursAssiduite(assiduite).texte }}>{assiduite} %</strong>
              </span>
            )}
          </div>
        )}
      </div>

      {prochainRendezVous !== undefined && (
        <div className="flex justify-between items-center pt-3 text-[13px]" style={{ borderTop: '1px solid #EEF4F4' }}>
          <span className="flex items-center gap-1.5 font-semibold text-dark">
            <CalendarDays size={14} className="text-primary" aria-hidden="true" />
            {prochainRendezVous ?? <span className="font-normal" style={{ color: 'var(--color-ink-2)' }}>Aucun rendez-vous prévu</span>}
          </span>
          <span className="font-bold text-primary-dark" aria-hidden="true">Fiche →</span>
        </div>
      )}
    </article>
  );
}
