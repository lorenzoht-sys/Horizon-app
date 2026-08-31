// Définition d'un nouveau mot de passe, au bout d'un lien Supabase.
//
// Sert DEUX flux, volontairement, parce que c'est le même mécanisme :
//   - `recovery` : mot de passe oublié (ForgotPasswordPage)
//   - `invite`   : invitation d'un praticien par un admin
// Seul le texte affiché diffère.
//
// ── La contrainte qui justifie cette page ───────────────────────────────
// Une session de récupération EST une session valide : à l'instant où le
// lien est ouvert, le porteur du lien est authentifié, sans avoir jamais
// prouvé qu'il connaît le mot de passe. Si on le laissait naviguer dans
// l'application, le lien deviendrait une porte d'entrée — exactement ce
// qu'on ne veut pas d'un lien reçu par email, qui traîne dans une boîte
// et transite par des relais.
//
// D'où le verrouillage, réparti sur deux fichiers :
//   - ici : la page ne propose aucune sortie tant que le mot de passe n'est
//     pas redéfini ;
//   - App.tsx : tant que `enRecuperation` est vrai, TOUTE autre route
//     renvoie ici, et `isLoggedIn` reste faux.
//
// Le drapeau est persisté dans localStorage par App.tsx : sans ça, fermer
// l'onglet et revenir ferait retomber sur une session valide sans être
// passé par cette page — le trou que toute cette mécanique existe pour
// fermer.
//
// ── Deux écrans, et non un seul (recette PR #22, 2026-08-31) ────────────
// Cette page affichait le formulaire dans TOUS les cas, y compris au bout
// d'un lien que Supabase venait de refuser. Un lien mort et un lien frais
// étaient donc indiscernables à l'écran, et le formulaire fantôme qui en
// résultait a fait conclure à tort qu'un lien de récupération restait
// réutilisable. Vérification faite : le jeton est bien consommé côté
// Supabase. C'est l'affichage qui mentait, pas l'authentification.

import { useState, type FormEvent, type CSSProperties, type ReactNode } from 'react';
import { supabase, type ErreurLienAuth } from '../lib/supabase';
import AuthLeftPanel from '../components/layout/AuthLeftPanel';
import './LoginPage.css';

const inputStyle: CSSProperties = {
  width: '100%', padding: '11px 16px',
  border: '1.5px solid #E2EEF9',
  borderRadius: 10, fontSize: 14,
  fontFamily: 'var(--font-sans)',
  color: '#032c28', background: '#FAFCFF',
  outline: 'none', boxSizing: 'border-box',
  transition: 'border-color 0.2s, box-shadow 0.2s',
};

const labelStyle: CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#4A6080',
  display: 'block', marginBottom: 6,
  letterSpacing: '0.04em', textTransform: 'uppercase',
};

const eyebrowStyle: CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--color-teal)',
  letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10,
};

const titreStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)', fontSize: 24, fontWeight: 700,
  color: '#032c28', marginBottom: 6, letterSpacing: '-0.3px',
};

const sousTitreStyle: CSSProperties = {
  fontSize: 13, color: '#8B9BB4', marginBottom: 32, lineHeight: 1.5,
};

const boutonStyle: CSSProperties = {
  width: '100%', padding: '12px 16px', borderRadius: 10,
  border: 'none', background: 'var(--color-teal)', color: 'white',
  fontSize: 14, fontWeight: 700,
};

// Supabase refuse en dessous de 6 caractères ; on exige un peu plus, et on
// le dit AVANT la soumission plutôt que de laisser le serveur répondre.
const LONGUEUR_MINIMALE = 10;

/** Coquille commune aux deux écrans, pour ne pas la dupliquer. */
function Cadre({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'var(--font-sans)' }}>
      <AuthLeftPanel />
      <div className="login-right" style={{
        flex: 1, background: 'white',
        padding: '44px 40px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
      }}>
        {children}
      </div>
    </div>
  );
}

type Props = {
  /** 'invite' change les textes : premier mot de passe, pas réinitialisation. */
  typeLien: 'recovery' | 'invite' | null;
  /**
   * Erreur renvoyée par Supabase quand il a refusé le lien. Non nulle
   * signifie qu'il n'y a AUCUNE session : le formulaire ne peut aboutir,
   * on ne l'affiche donc pas.
   */
  erreurLien: ErreurLienAuth;
  /** Appelé après succès : App.tsx lève le verrou et quitte cette page. */
  onMotDePasseDefini: () => void;
};

export default function ResetPasswordPage({ typeLien, erreurLien, onMotDePasseDefini }: Props) {
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [succes, setSucces] = useState(false);
  // Vrai quand l'échec vient du lien lui-même : on propose alors d'en
  // demander un nouveau, plutôt que de laisser l'utilisateur devant un
  // formulaire qui ne peut plus aboutir.
  const [lienMort, setLienMort] = useState(false);

  const invitation = typeLien === 'invite';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    // Garde dure contre le double envoi. Le bouton désactivé suffit à la
    // souris, pas à un second clic servi avant le rendu. Un deuxième appel
    // avec le MÊME mot de passe est refusé par Supabase en 422
    // (`same_password`) : l'utilisateur voyait une erreur alors que son mot
    // de passe venait justement d'être changé.
    if (enCours || succes) return;

    setErreur(null);
    setLienMort(false);

    if (motDePasse.length < LONGUEUR_MINIMALE) {
      setErreur(`Le mot de passe doit contenir au moins ${LONGUEUR_MINIMALE} caractères.`);
      return;
    }
    if (motDePasse !== confirmation) {
      setErreur('Les deux mots de passe ne correspondent pas.');
      return;
    }
    if (!supabase) {
      setErreur('Service indisponible. Réessayez plus tard.');
      return;
    }

    setEnCours(true);
    const { error } = await supabase.auth.updateUser({ password: motDePasse });

    if (error) {
      setEnCours(false);
      // Cas le plus fréquent : lien expiré ou déjà utilisé. La session de
      // récupération n'existe plus, `updateUser` échoue en 401. Message
      // explicite plutôt qu'un écran blanc — l'utilisateur doit savoir qu'il
      // lui faut un nouveau lien, pas réessayer le même.
      const expire = /session|jwt|token|expired|Auth session missing/i.test(error.message);
      setLienMort(expire);
      setErreur(
        expire
          ? 'Ce lien a expiré ou a déjà été utilisé.'
          : `Impossible de définir le mot de passe : ${error.message}`,
      );
      return;
    }

    // `enCours` n'est volontairement PAS remis à faux : le bouton doit rester
    // verrouillé jusqu'à ce qu'App.tsx quitte la page. Le remettre à faux
    // réarmait le bouton sur une page qui, elle, ne bougeait pas — c'est ce
    // qui a produit le double clic et le 422 pendant la recette.
    setSucces(true);
    onMotDePasseDefini();
  }

  // ── Écran 1 : Supabase a refusé le lien ───────────────────────────────
  if (erreurLien) {
    return (
      <Cadre>
        <div style={eyebrowStyle}>Récupération de compte</div>
        <div style={titreStyle}>Ce lien n’est plus valable</div>
        <div style={sousTitreStyle}>
          Il a expiré, ou il a déjà servi à définir un mot de passe.<br />
          Demandez-en un nouveau pour continuer.
        </div>

        {/* Navigation « dure » (et non un <Link>) : recharger la page est le
            seul moyen de repartir d'une URL propre. Le type du lien et son
            erreur sont relevés une fois pour toutes au chargement du module
            supabase.ts — un simple changement de route côté React les
            laisserait tels quels. */}
        <a
          href="/forgot-password"
          style={{
            ...boutonStyle,
            display: 'block', textAlign: 'center',
            textDecoration: 'none', boxSizing: 'border-box',
          }}
        >
          Demander un nouveau lien
        </a>

        {/* Le code brut aide au diagnostic sans parasiter la lecture. */}
        <div style={{ fontSize: 11, color: '#B6C2D4', marginTop: 18 }}>
          Code : {erreurLien.code}
        </div>
      </Cadre>
    );
  }

  // ── Écran 2 : le formulaire ───────────────────────────────────────────
  return (
    <Cadre>
      <div style={eyebrowStyle}>
        {invitation ? 'Bienvenue' : 'Récupération de compte'}
      </div>
      <div style={titreStyle}>
        {invitation ? 'Choisissez votre mot de passe' : 'Nouveau mot de passe'}
      </div>
      <div style={sousTitreStyle}>
        {invitation
          ? <>Votre compte est créé. Définissez un mot de passe<br />pour accéder à Horizon.</>
          : <>Choisissez un nouveau mot de passe.<br />Vous serez connecté aussitôt.</>}
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Nouveau mot de passe</label>
          <input
            className="login-input"
            type="password"
            value={motDePasse}
            onChange={e => setMotDePasse(e.target.value)}
            disabled={enCours || succes}
            autoComplete="new-password"
            autoFocus
            style={inputStyle}
          />
          <div style={{ fontSize: 11.5, color: '#8B9BB4', marginTop: 6 }}>
            {LONGUEUR_MINIMALE} caractères minimum.
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Confirmer le mot de passe</label>
          <input
            className="login-input"
            type="password"
            value={confirmation}
            onChange={e => setConfirmation(e.target.value)}
            disabled={enCours || succes}
            autoComplete="new-password"
            style={inputStyle}
          />
        </div>

        {erreur && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#DC2626', marginBottom: 16 }}>
            {erreur}
            {/* Sans cette sortie, un lien mort laissait l'utilisateur devant
                un formulaire définitivement inopérant : le verrou d'App.tsx
                renvoie ici depuis toute autre route. */}
            {lienMort && (
              <>
                {' '}
                <a href="/forgot-password" style={{ color: '#DC2626', fontWeight: 700 }}>
                  Demander un nouveau lien
                </a>
              </>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={enCours || succes}
          className="login-button"
          style={{
            ...boutonStyle,
            background: succes ? '#0F9D77' : 'var(--color-teal)',
            cursor: enCours || succes ? 'default' : 'pointer',
            opacity: enCours ? 0.6 : 1,
            transition: 'background 0.2s, opacity 0.2s',
          }}
        >
          {succes ? 'Mot de passe enregistré' : enCours ? 'Enregistrement…' : 'Définir le mot de passe'}
        </button>
      </form>

      {/* Aucun autre lien de sortie, délibérément : tant que le mot de passe
          n'est pas redéfini, il n'y a rien d'autre à faire ici. */}
    </Cadre>
  );
}
