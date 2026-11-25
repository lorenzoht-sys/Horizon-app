import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Lock, X } from 'lucide-react';
import {
  FIL_CONDUCTEUR,
  messageAccueil,
  phraseManquesFacturation,
  type Etape,
  type IdEtape,
  type Progression,
} from '../../lib/demarrage';
import { ICONE_ETAPE } from './iconeEtape';
import { EtapeDetaillee } from './CarteDemarrage';

// Guide en « premiers pas » (aucun bilan encore, voir enPremiersPas).
//
// 25/11/2026, retour de Lorenzo sur la première version (guide déplié, carte blanche) : « on ne
// voit pas assez le guide, j'ai peur que les gens soient perdus ». La carte blanche se confondait
// avec le reste de l'écran. Ici le guide devient le point d'entrée : un bandeau vert foncé dans
// la continuité de l'écran d'accueil (même lever de soleil), le parcours dessiné comme un chemin
// à sept arrêts, et une seule chose à faire, détaillée juste en dessous. Pas de liste à lire.

const COURT: Record<IdEtape, string> = {
  compte: 'Votre compte',
  beneficiaire: '1er bénéficiaire',
  bilan: '1er bilan',
  seance: '1re séance',
  programme: 'Programme',
  facturation: 'Facturation',
  application: 'Application',
};

interface Props {
  etapes: Etape[];
  progression: Progression;
  prenom: string | null;
  manquesFacturation?: string[];
  mobile?: boolean;
  onAction: (etape: Etape) => void;
  onMasquer: () => void;
}

export function ParcoursAccueil({ etapes, progression, prenom, manquesFacturation = [], mobile = false, onAction, onMasquer }: Props) {
  const reduit = useReducedMotion();
  const [selectionId, setSelectionId] = useState<IdEtape | null>(null);
  const { prochaine } = progression;
  const affichee = etapes.find(e => e.id === selectionId && !e.faite) ?? prochaine;

  return (
    <motion.section
      aria-labelledby="titre-parcours"
      initial={reduit ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
      className="relative overflow-hidden text-white"
      style={{
        borderRadius: mobile ? 22 : 26,
        background: 'linear-gradient(160deg, #0F3D36 0%, #12564A 60%, #0E4A40 100%)',
        boxShadow: '0 18px 50px rgba(15,61,54,0.28)',
        padding: mobile ? '20px 16px 16px' : '30px 32px 28px',
      }}
    >
      {/* Le soleil de l'écran d'accueil, qui se lève en haut à droite. */}
      <div aria-hidden="true" className="pointer-events-none absolute" style={{
        top: mobile ? -90 : -140, right: mobile ? -70 : -60, width: mobile ? 220 : 360, height: mobile ? 220 : 360, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,200,103,0.45) 0%, rgba(255,200,103,0.12) 40%, transparent 70%)',
      }} />

      {/* ── En-tête ─────────────────────────────────────────────── */}
      <div className="relative flex items-start" style={{ gap: 16 }}>
        <div className="min-w-0 flex-1">
          <div className="font-bold uppercase" style={{ fontSize: 11, letterSpacing: '0.14em', color: '#8FE3CC' }}>
            {mobile ? 'Votre démarrage' : 'Votre parcours de démarrage'} · {progression.faites} sur {progression.total}
          </div>
          <h2 id="titre-parcours" className="m-0 font-heading font-extrabold" style={{ fontSize: mobile ? 21 : 27, lineHeight: 1.2, marginTop: 6, letterSpacing: '-0.02em' }}>
            {messageAccueil(prenom)}
          </h2>
          {/* Sur téléphone, le chemin dessiné dit la même chose : on garde la place pour le geste. */}
          {!mobile && (
            <p className="m-0" style={{ fontSize: 14.5, lineHeight: 1.55, color: 'rgba(255,255,255,0.72)', marginTop: 6, maxWidth: 640 }}>
              {FIL_CONDUCTEUR}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onMasquer}
          aria-label="Masquer le guide de prise en main"
          title="Masquer : vous le retrouverez dans Paramètres"
          className="flex flex-shrink-0 items-center gap-1.5 rounded-lg transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          style={{ padding: mobile ? 6 : '6px 10px', fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.55)' }}
        >
          <X size={16} aria-hidden="true" />
          {!mobile && <span>Masquer</span>}
        </button>
      </div>

      {/* ── Le chemin : sept arrêts ─────────────────────────────── */}
      <ol className="relative m-0 flex list-none items-start p-0" style={{ marginTop: mobile ? 20 : 28 }} aria-label="Étapes du parcours">
        {etapes.map((etape, i) => (
          <Arret
            key={etape.id}
            etape={etape}
            numero={i + 1}
            dernier={i === etapes.length - 1}
            suivanteFaite={etapes[i + 1]?.faite ?? false}
            enCours={affichee?.id === etape.id}
            mobile={mobile}
            onChoisir={() => setSelectionId(etape.id)}
          />
        ))}
      </ol>
      {mobile && affichee && (
        <p className="relative m-0 text-center" style={{ fontSize: 12.5, fontWeight: 700, color: '#FFE2A8', marginTop: 8 }}>
          {affichee.id === prochaine?.id ? 'Maintenant' : `Étape ${etapes.indexOf(affichee) + 1}`} : {COURT[affichee.id]}
        </p>
      )}

      {/* ── Ce qu'il y a à faire maintenant ─────────────────────── */}
      {affichee && (
        <div className="relative text-ink" style={{ marginTop: mobile ? 16 : 24 }}>
          <EtapeDetaillee
            key={affichee.id}
            etape={affichee}
            numero={etapes.indexOf(affichee) + 1}
            total={etapes.length}
            estProchaine={affichee.id === prochaine?.id}
            manques={affichee.id === 'facturation' ? phraseManquesFacturation(manquesFacturation) : null}
            mobile={mobile}
            gestesOuverts
            surFondSombre
            onAction={onAction}
            onRetour={() => setSelectionId(null)}
          />
        </div>
      )}
    </motion.section>
  );
}

function Arret({ etape, numero, dernier, suivanteFaite, enCours, mobile, onChoisir }: {
  etape: Etape; numero: number; dernier: boolean; suivanteFaite: boolean; enCours: boolean; mobile: boolean; onChoisir: () => void;
}) {
  const reduit = useReducedMotion();
  const Icone = ICONE_ETAPE[etape.id];
  const bloquee = Boolean(etape.bloqueePar);
  const taille = mobile ? (enCours ? 38 : 30) : (enCours ? 54 : 42);

  const pastille = etape.faite
    ? { background: '#2BB89A', border: '2px solid #2BB89A', color: '#FFFFFF' }
    : enCours
      ? { background: '#FFFFFF', border: '2px solid #FFFFFF', color: '#147A64' }
      : { background: 'rgba(255,255,255,0.06)', border: `1.5px ${bloquee ? 'dashed' : 'solid'} rgba(255,255,255,${bloquee ? 0.28 : 0.4})`, color: `rgba(255,255,255,${bloquee ? 0.4 : 0.75})` };

  const contenu = (
    <>
      <span className="relative flex items-center justify-center" style={{ height: mobile ? 38 : 54 }}>
        {enCours && !reduit && (
          <motion.span
            aria-hidden="true"
            className="absolute rounded-full"
            style={{ width: taille, height: taille, border: '2px solid rgba(255,226,168,0.8)' }}
            animate={{ scale: [1, 1.35], opacity: [0.8, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
        <span className="relative flex items-center justify-center rounded-full transition-all" style={{ width: taille, height: taille, ...pastille, boxShadow: enCours ? '0 6px 20px rgba(0,0,0,0.25)' : undefined }}>
          {etape.faite
            ? <Check size={mobile ? 14 : 18} strokeWidth={3} aria-hidden="true" />
            : bloquee && !enCours
              ? <Lock size={mobile ? 12 : 15} aria-hidden="true" />
              : <Icone size={mobile ? (enCours ? 17 : 14) : (enCours ? 24 : 18)} aria-hidden="true" />}
        </span>
      </span>
      {!mobile && (
        <span className="mt-2 block text-center leading-tight" style={{
          fontSize: 12.5, fontWeight: enCours ? 800 : 600,
          color: enCours ? '#FFFFFF' : etape.faite ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.75)',
        }}>
          {COURT[etape.id]}
        </span>
      )}
      <span className="sr-only">Étape {numero}{etape.faite ? ', faite' : enCours ? ', en cours' : bloquee ? ', pas encore possible' : ', à faire'} : {etape.titre}</span>
    </>
  );

  return (
    <li className="relative flex flex-1 flex-col items-center">
      {/* Le tronçon de chemin vers l'arrêt suivant, plein une fois les deux faits. */}
      {!dernier && (
        <span aria-hidden="true" className="absolute" style={{
          top: (mobile ? 38 : 54) / 2 - 1.5, left: '50%', width: '100%', height: 3, borderRadius: 3,
          background: etape.faite && suivanteFaite ? '#2BB89A' : etape.faite ? 'linear-gradient(90deg, #2BB89A, rgba(255,255,255,0.2))' : 'rgba(255,255,255,0.16)',
        }} />
      )}
      {etape.faite ? (
        <div className="relative flex flex-col items-center">{contenu}</div>
      ) : (
        <button type="button" onClick={onChoisir} aria-current={enCours ? 'step' : undefined}
          className="relative flex flex-col items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          style={{ padding: mobile ? 0 : '0 4px' }}>
          {contenu}
        </button>
      )}
    </li>
  );
}
