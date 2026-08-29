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

import { useState, type FormEvent, type CSSProperties } from 'react';
import { supabase } from '../lib/supabase';
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

// Supabase refuse en dessous de 6 caractères ; on exige un peu plus, et on
// le dit AVANT la soumission plutôt que de laisser le serveur répondre.
const LONGUEUR_MINIMALE = 10;

type Props = {
  /** 'invite' change les textes : premier mot de passe, pas réinitialisation. */
  typeLien: 'recovery' | 'invite' | null;
  /** Appelé après succès : App.tsx lève le verrou et ouvre l'application. */
  onMotDePasseDefini: () => void;
};

export default function ResetPasswordPage({ typeLien, onMotDePasseDefini }: Props) {
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const invitation = typeLien === 'invite';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErreur(null);

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
    setEnCours(false);

    if (error) {
      // Cas le plus fréquent : lien expiré ou déjà utilisé. La session de
      // récupération n'existe plus, `updateUser` échoue en 401. Message
      // explicite plutôt qu'un écran blanc — l'utilisateur doit savoir qu'il
      // lui faut un nouveau lien, pas réessayer le même.
      const expire = /session|jwt|token|expired|Auth session missing/i.test(error.message);
      setErreur(
        expire
          ? 'Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau depuis « Mot de passe oublié ».'
          : `Impossible de définir le mot de passe : ${error.message}`,
      );
      return;
    }

    onMotDePasseDefini();
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'var(--font-sans)' }}>
      <AuthLeftPanel />

      <div className="login-right" style={{
        flex: 1, background: 'white',
        padding: '44px 40px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-teal)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
          {invitation ? 'Bienvenue' : 'Récupération de compte'}
        </div>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 24, fontWeight: 700, color: '#032c28', marginBottom: 6, letterSpacing: '-0.3px' }}>
          {invitation ? 'Choisissez votre mot de passe' : 'Nouveau mot de passe'}
        </div>
        <div style={{ fontSize: 13, color: '#8B9BB4', marginBottom: 32, lineHeight: 1.5 }}>
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
              autoComplete="new-password"
              style={inputStyle}
            />
          </div>

          {erreur && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#DC2626', marginBottom: 16 }}>
              {erreur}
            </div>
          )}

          <button
            type="submit"
            disabled={enCours}
            className="login-button"
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 10,
              border: 'none', background: 'var(--color-teal)', color: 'white',
              fontSize: 14, fontWeight: 700, cursor: enCours ? 'default' : 'pointer',
              opacity: enCours ? 0.6 : 1,
            }}
          >
            {enCours ? 'Enregistrement…' : 'Définir le mot de passe'}
          </button>
        </form>

        {/* Aucun lien de sortie, délibérément : tant que le mot de passe
            n'est pas redéfini, il n'y a rien d'autre à faire ici. */}
      </div>
    </div>
  );
}
