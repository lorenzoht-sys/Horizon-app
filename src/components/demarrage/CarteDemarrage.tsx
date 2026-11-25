import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, ArrowRight, Check, ChevronDown, Clock, Lightbulb, Lock, PartyPopper, X } from 'lucide-react';
import {
  guideEtape,
  messageProgression,
  phraseManquesFacturation,
  type Etape,
  type Progression,
} from '../../lib/demarrage';
import { AnneauProgression } from './AnneauProgression';
import { ICONE_ETAPE } from './iconeEtape';
import { TexteGeste } from './TexteGeste';

// Carte « Prise en main » : affichage seul, sans requête ni navigation (le
// conteneur GuideDemarrage s'en charge). Une seule carte pour le bureau et le
// téléphone : sur téléphone la liste des étapes est repliée par défaut, pour
// laisser la journée du praticien visible sans défiler.
//
// Pédagogie (19/11/2026, « que tous les professionnels comprennent ») : cliquer
// une étape de la liste ne fait pas changer de page, elle l'ouvre dans le
// panneau du haut, avec pourquoi c'est utile et les gestes à faire. Le praticien
// lit d'abord, puis agit avec le bouton. Jamais de saut dans l'inconnu.

interface Props {
  etapes: Etape[];
  progression: Progression;
  prenom: string | null;
  /** Champs manquants du profil de facturation (profilFacturationManquant). */
  manquesFacturation?: string[];
  mobile?: boolean;
  /** Étapes faites au passage précédent, si une étape vient d'être réussie. */
  faitesAvant?: number;
  onAction: (etape: Etape) => void;
  onMasquer: () => void;
}

const EASE = [0.25, 0.1, 0.25, 1] as const;

export function CarteDemarrage({ etapes, progression, prenom, manquesFacturation = [], mobile = false, faitesAvant, onAction, onMasquer }: Props) {
  const reduit = useReducedMotion();
  const [listeOuverte, setListeOuverte] = useState(!mobile);
  const [selectionId, setSelectionId] = useState<Etape['id'] | null>(null);
  const { prochaine, termine } = progression;
  // Étape choisie dans la liste, tant qu'elle reste à faire ; sinon la prochaine.
  const affichee = etapes.find(e => e.id === selectionId && !e.faite) ?? prochaine;

  function choisir(etape: Etape) {
    setSelectionId(etape.id);
    // Sur téléphone, le panneau est au-dessus de la liste : on y ramène le regard.
    if (mobile) document.getElementById('etape-detaillee')?.scrollIntoView({ behavior: reduit ? 'auto' : 'smooth', block: 'center' });
  }

  return (
    <motion.section
      aria-labelledby="titre-demarrage"
      initial={reduit ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="relative overflow-hidden bg-white"
      style={{
        borderRadius: mobile ? 20 : 22,
        border: '1px solid #E2EEEE',
        boxShadow: 'var(--shadow-sm)',
        padding: mobile ? 16 : 24,
      }}
    >
      {/* Halo discret, rappel de la landing : donne du relief sans alourdir. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          top: -120, right: -80, width: 320, height: 320, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(43,184,154,0.10) 0%, transparent 70%)',
        }}
      />

      {/* ── En-tête ─────────────────────────────────────────────── */}
      <div className="relative flex items-center" style={{ gap: mobile ? 14 : 20 }}>
        {termine ? (
          <div
            className="flex flex-shrink-0 items-center justify-center rounded-full"
            style={{ width: mobile ? 56 : 72, height: mobile ? 56 : 72, background: 'var(--color-teal-light)' }}
          >
            <PartyPopper size={mobile ? 26 : 32} style={{ color: 'var(--color-teal)' }} aria-hidden="true" />
          </div>
        ) : (
          <AnneauProgression
            faites={progression.faites}
            total={progression.total}
            depuis={faitesAvant}
            taille={mobile ? 56 : 72}
            epaisseur={mobile ? 6 : 7}
          />
        )}
        <div className="min-w-0 flex-1">
          <div
            className="font-bold uppercase"
            style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--color-teal-dark)' }}
          >
            Prise en main
          </div>
          <h2
            id="titre-demarrage"
            className="m-0 font-heading font-bold"
            style={{ fontSize: mobile ? 16 : 19, lineHeight: 1.3, color: 'var(--color-ink)', marginTop: 3, letterSpacing: '-0.01em' }}
          >
            {messageProgression(progression, prenom)}
          </h2>
          {!mobile && (
            <p className="m-0" style={{ fontSize: 13, color: 'var(--color-ink-2)', marginTop: 4 }}>
              {termine
                ? 'Horizon est prêt pour votre activité. Ce guide reste accessible depuis Paramètres.'
                : 'Chaque étape se coche toute seule dès qu’elle est faite.'}
            </p>
          )}
        </div>
        {termine && !mobile && <BoutonFermer onClick={onMasquer} />}
        {!termine && (
          <button
            type="button"
            onClick={onMasquer}
            aria-label="Masquer le guide de prise en main"
            title="Masquer : vous le retrouverez dans Paramètres"
            className="flex flex-shrink-0 items-center gap-1.5 self-start rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
            style={{ padding: mobile ? 6 : '6px 10px', fontSize: 12.5, fontWeight: 600 }}
          >
            <X size={16} aria-hidden="true" />
            {!mobile && <span>Masquer</span>}
          </button>
        )}
      </div>

      {/* ── Terminé (téléphone) : bouton pleine largeur sous l'en-tête ── */}
      {termine && mobile && (
        <div className="relative" style={{ marginTop: 14 }}>
          <BoutonFermer onClick={onMasquer} pleineLargeur />
        </div>
      )}

      {/* ── Étape détaillée : prochaine, ou choisie dans la liste ─── */}
      {affichee && (
        <EtapeDetaillee
          key={affichee.id}
          etape={affichee}
          numero={etapes.indexOf(affichee) + 1}
          total={etapes.length}
          estProchaine={affichee.id === prochaine?.id}
          manques={affichee.id === 'facturation' ? phraseManquesFacturation(manquesFacturation) : null}
          mobile={mobile}
          onAction={onAction}
          onRetour={() => setSelectionId(null)}
        />
      )}

      {/* ── Toutes les étapes ───────────────────────────────────── */}
      {!termine && (
        <div className="relative" style={{ marginTop: mobile ? 12 : 18 }}>
          {mobile && (
            <button
              type="button"
              onClick={() => setListeOuverte(o => !o)}
              aria-expanded={listeOuverte}
              aria-controls="liste-etapes-demarrage"
              className="flex w-full items-center justify-between rounded-lg text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
              style={{ padding: '4px 2px', fontSize: 13, fontWeight: 600 }}
            >
              <span>{listeOuverte ? 'Masquer les étapes' : `Voir les ${progression.total} étapes`}</span>
              <ChevronDown
                size={16}
                aria-hidden="true"
                style={{ transition: 'transform .2s', transform: listeOuverte ? 'rotate(180deg)' : 'none' }}
              />
            </button>
          )}
          <AnimatePresence initial={false}>
            {listeOuverte && (
              <motion.ol
                id="liste-etapes-demarrage"
                key="liste"
                initial={reduit ? false : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={reduit ? undefined : { height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
                className={`m-0 grid list-none overflow-hidden p-0 ${mobile ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'}`}
                style={{ gap: mobile ? 2 : 6, marginTop: mobile ? 6 : 0 }}
              >
                {etapes.map((etape, i) => (
                  <LigneEtape
                    key={etape.id}
                    etape={etape}
                    numero={i + 1}
                    estAffichee={affichee?.id === etape.id}
                    mobile={mobile}
                    onChoisir={choisir}
                  />
                ))}
              </motion.ol>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.section>
  );
}

function BoutonFermer({ onClick, pleineLargeur = false }: { onClick: () => void; pleineLargeur?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-[10px] bg-teal text-white transition-colors hover:bg-teal-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 focus-visible:ring-offset-2 ${pleineLargeur ? 'w-full' : ''}`}
      style={{ padding: '10px 18px', fontSize: 14, fontWeight: 700 }}
    >
      Fermer le guide
    </button>
  );
}

function EtapeDetaillee({ etape, numero, total, estProchaine, manques, mobile, onAction, onRetour }: {
  etape: Etape;
  numero: number;
  total: number;
  estProchaine: boolean;
  manques: string | null;
  mobile: boolean;
  onAction: (e: Etape) => void;
  onRetour: () => void;
}) {
  const reduit = useReducedMotion();
  const Icone = ICONE_ETAPE[etape.id];
  const guide = guideEtape(etape.id, mobile);
  // Ordinateur : les gestes sont visibles d'emblée. Téléphone : repliés, pour ne
  // pas repousser la journée trop bas ; un bouton clair les déplie.
  const [gestesOuverts, setGestesOuverts] = useState(!mobile);

  return (
    <motion.div
      id="etape-detaillee"
      initial={reduit ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: EASE }}
      className="relative"
      style={{
        marginTop: mobile ? 14 : 20,
        borderRadius: 16,
        background: 'linear-gradient(135deg, #F1FAF7 0%, #E6F5F1 100%)',
        border: '1px solid rgba(43,184,154,0.22)',
        padding: mobile ? 14 : '18px 20px',
      }}
    >
      <div className="flex" style={{ gap: mobile ? 12 : 16, flexDirection: mobile ? 'column' : 'row', alignItems: mobile ? 'stretch' : 'flex-start' }}>
        <div className="flex min-w-0 flex-1 items-start" style={{ gap: 14 }}>
          <span
            aria-hidden="true"
            className="flex flex-shrink-0 items-center justify-center bg-white"
            style={{ width: 44, height: 44, borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 2px 8px rgba(43,184,154,0.12)' }}
          >
            <Icone size={20} style={{ color: 'var(--color-teal-dark)' }} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
              <span className="font-bold uppercase" style={{ fontSize: 10.5, letterSpacing: '0.08em', color: 'var(--color-teal-dark)' }}>
                {estProchaine ? 'Prochaine étape' : `Étape ${numero} sur ${total}`}
              </span>
              {etape.duree && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-white"
                  style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-2)', padding: '2px 8px' }}
                >
                  <Clock size={11} aria-hidden="true" /> {etape.duree}
                </span>
              )}
            </div>
            <h3 className="m-0 font-heading font-bold" style={{ fontSize: 15.5, color: 'var(--color-ink)', marginTop: 3 }}>
              {etape.titre}
            </h3>
            <p className="m-0" style={{ fontSize: 13, color: 'var(--color-ink-2)', marginTop: 3, lineHeight: 1.5 }}>
              {guide.pourquoi}
            </p>
          </div>
        </div>
        {!mobile && <BoutonAction etape={etape} onAction={onAction} />}
      </div>

      {/* Ce qui bloque, dit simplement, avant les gestes. */}
      {(etape.bloqueePar || manques) && (
        <div
          role="note"
          className="flex items-start bg-white"
          style={{ gap: 8, marginTop: 12, borderRadius: 10, padding: '9px 12px', fontSize: 12.5, color: 'var(--color-ink)', border: '1px solid #F3E3BF' }}
        >
          <AlertCircle size={15} aria-hidden="true" className="mt-px flex-shrink-0" style={{ color: '#B7791F' }} />
          <span>{etape.bloqueePar ?? manques}</span>
        </div>
      )}

      {/* Comment faire : les gestes, avec les libellés exacts des boutons. */}
      {!etape.bloqueePar && (
        <div style={{ marginTop: 12 }}>
          {mobile && (
            <button
              type="button"
              onClick={() => setGestesOuverts(o => !o)}
              aria-expanded={gestesOuverts}
              className="flex w-full items-center justify-between rounded-lg text-teal-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
              style={{ padding: '2px 0', fontSize: 13, fontWeight: 700 }}
            >
              <span className="inline-flex items-center gap-1.5"><Lightbulb size={14} aria-hidden="true" /> Comment faire ?</span>
              <ChevronDown size={16} aria-hidden="true" style={{ transition: 'transform .2s', transform: gestesOuverts ? 'rotate(180deg)' : 'none' }} />
            </button>
          )}
          {!mobile && (
            <div className="inline-flex items-center gap-1.5 text-teal-dark" style={{ fontSize: 12, fontWeight: 700 }}>
              <Lightbulb size={13} aria-hidden="true" /> Comment faire
            </div>
          )}
          {gestesOuverts && (
            <ol className="m-0 list-none p-0" style={{ marginTop: 8, display: 'grid', gap: 7 }}>
              {guide.gestes.map((geste, i) => (
                <li key={i} className="flex items-start" style={{ gap: 10, fontSize: 13, color: 'var(--color-ink)', lineHeight: 1.5 }}>
                  <span
                    aria-hidden="true"
                    className="flex flex-shrink-0 items-center justify-center rounded-full bg-white tabular-nums"
                    style={{ width: 20, height: 20, fontSize: 11, fontWeight: 800, color: 'var(--color-teal-dark)', border: '1px solid rgba(43,184,154,0.35)', marginTop: 1 }}
                  >
                    {i + 1}
                  </span>
                  <span><TexteGeste texte={geste} /></span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {mobile && <div style={{ marginTop: 14 }}><BoutonAction etape={etape} onAction={onAction} pleineLargeur /></div>}

      {!estProchaine && (
        <button
          type="button"
          onClick={onRetour}
          className="mt-3 rounded text-ink-2 underline-offset-2 hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
          style={{ fontSize: 12.5, fontWeight: 600 }}
        >
          Revenir à la prochaine étape
        </button>
      )}
    </motion.div>
  );
}

function BoutonAction({ etape, onAction, pleineLargeur = false }: { etape: Etape; onAction: (e: Etape) => void; pleineLargeur?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onAction(etape)}
      className={`group inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-[10px] bg-teal text-white transition-all hover:bg-teal-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 focus-visible:ring-offset-2 ${pleineLargeur ? 'w-full' : ''}`}
      style={{ padding: '11px 18px', fontSize: 14, fontWeight: 700, boxShadow: 'var(--shadow-teal)' }}
    >
      {etape.bloqueePar ? 'Ajouter un bénéficiaire' : etape.action}
      <ArrowRight size={16} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

function LigneEtape({ etape, numero, estAffichee, mobile, onChoisir }: {
  etape: Etape; numero: number; estAffichee: boolean; mobile: boolean; onChoisir: (e: Etape) => void;
}) {
  const Icone = ICONE_ETAPE[etape.id];
  const bloquee = Boolean(etape.bloqueePar);
  const contenu = (
    <>
      <Pastille faite={etape.faite} bloquee={bloquee} />
      <Icone size={15} aria-hidden="true" className="flex-shrink-0" style={{ color: etape.faite ? 'var(--color-ink-3)' : 'var(--color-ink-2)' }} />
      <span
        // Sur téléphone le titre passe à la ligne plutôt que d'être coupé : la colonne est étroite.
        className={`min-w-0 flex-1 ${mobile ? 'leading-snug' : 'truncate'}`}
        style={{
          fontSize: 13.5,
          fontWeight: estAffichee ? 700 : 500,
          color: etape.faite ? 'var(--color-ink-3)' : 'var(--color-ink)',
        }}
      >
        <span className="sr-only">Étape {numero}{etape.faite ? ', faite' : bloquee ? ', bloquée' : ', à faire'} : </span>
        {etape.titre}
      </span>
      {!etape.faite && etape.duree && (
        <span className="flex-shrink-0 tabular-nums" style={{ fontSize: 11.5, color: 'var(--color-ink-3)', fontWeight: 600 }}>
          {etape.duree}
        </span>
      )}
    </>
  );

  const style: React.CSSProperties = {
    gap: 10,
    padding: '9px 10px',
    borderRadius: 10,
    // Pas de fond inline hors étape affichée : il écraserait le survol (hover:bg-surface-2).
    ...(estAffichee ? { background: 'rgba(43,184,154,0.08)' } : {}),
  };

  return (
    <li>
      {etape.faite ? (
        <div className="flex items-center" style={style}>{contenu}</div>
      ) : (
        <button
          type="button"
          onClick={() => onChoisir(etape)}
          aria-current={estAffichee ? 'step' : undefined}
          aria-controls="etape-detaillee"
          className="flex w-full items-center text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40"
          style={style}
        >
          {contenu}
        </button>
      )}
    </li>
  );
}

function Pastille({ faite, bloquee }: { faite: boolean; bloquee: boolean }) {
  const reduit = useReducedMotion();
  if (faite) {
    return (
      <motion.span
        aria-hidden="true"
        initial={reduit ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 28 }}
        className="flex flex-shrink-0 items-center justify-center rounded-full"
        style={{ width: 20, height: 20, background: 'var(--color-teal)' }}
      >
        <Check size={12} strokeWidth={3} color="#FFFFFF" />
      </motion.span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex flex-shrink-0 items-center justify-center rounded-full"
      style={{ width: 20, height: 20, border: `1.5px ${bloquee ? 'dashed' : 'solid'} #C9D8DF`, background: '#FFFFFF' }}
    >
      {bloquee && <Lock size={10} style={{ color: 'var(--color-ink-3)' }} />}
    </span>
  );
}
