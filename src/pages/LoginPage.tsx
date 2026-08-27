import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import AuthLeftPanel from '../components/layout/AuthLeftPanel';
import LegalFooterLinks from '../components/legal/LegalFooterLinks';
import './LoginPage.css';

interface Props {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('Veuillez remplir tous les champs'); return; }
    setLoading(true);

    if (supabase) {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (!authError) {
        onLogin();
        navigate('/');
        setLoading(false);
        return;
      }
    }

    setError('Email ou mot de passe incorrect');
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#edf1ee',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      <div className="login-grid" style={{
        maxWidth: 1440,
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: '1fr 500px',
        minHeight: '100vh',
      }}>
      <AuthLeftPanel />

      {/* ── Panneau droit — formulaire ─────────────────────────────── */}
      <div className="login-right-panel" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '32px 48px 32px 16px',
      }}>
        <div style={{
          width: '100%',
          background: '#ffffff',
          borderRadius: 24,
          padding: '36px 36px 30px',
          boxShadow: '0 24px 72px rgba(15,46,42,0.13), 0 4px 16px rgba(15,46,42,0.06)',
        }}>

          {/* Badge "Connexion sécurisée" */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            background: '#e6f4f2', borderRadius: 100, padding: '5px 13px', marginBottom: 18,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#0d9488', boxShadow: '0 0 0 2px rgba(13,148,136,0.2)' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#0d9488', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Connexion sécurisée
            </span>
          </div>

          {/* Titre + sous-titre */}
          <h2 style={{ fontSize: 28, fontWeight: 800, color: '#0f2e2a', letterSpacing: '-0.8px', lineHeight: 1.1, marginBottom: 6 }}>
            Bon retour 👋
          </h2>
          <p style={{ fontSize: 14.5, color: '#94a3b8', fontWeight: 400, marginBottom: 28 }}>
            Accédez à votre espace professionnel.
          </p>

          <form onSubmit={handleLogin}>

            {/* Email */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 16 }}>
              <label htmlFor="login-email" style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                Email professionnel
              </label>
              <input
                id="login-email"
                className="login-input"
                type="email"
                placeholder="vous@structure.fr"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            {/* Mot de passe */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label htmlFor="login-password" style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                  Mot de passe
                </label>
                <Link to="/forgot-password" style={{ fontSize: 13, color: '#0d9488', fontWeight: 600, textDecoration: 'none' }}>
                  Oublié ?
                </Link>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-password"
                  className="login-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  style={{ paddingRight: 46 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', padding: 4, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', color: '#94a3b8', lineHeight: 1,
                  }}
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M2 2L16 16" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />
                      <path d="M6.5 3.8C7.3 3.6 8.1 3.5 9 3.5c4.5 0 7.5 5.5 7.5 5.5s-.6 1.3-1.8 2.6M4.5 5.5C2.7 6.8 1.5 9 1.5 9s3 5.5 7.5 5.5c1.7 0 3.2-.6 4.4-1.5" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M1.5 9C1.5 9 4.5 3.5 9 3.5S16.5 9 16.5 9 13.5 14.5 9 14.5 1.5 9 1.5 9z" stroke="#94a3b8" strokeWidth="1.5" strokeLinejoin="round" />
                      <circle cx="9" cy="9" r="2.25" stroke="#94a3b8" strokeWidth="1.5" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Erreur */}
            {error && (
              <div style={{
                background: '#FEF2F2', border: '1px solid #FECACA',
                borderRadius: 10, padding: '10px 14px',
                fontSize: 13, color: '#DC2626', marginBottom: 16,
              }}>
                {error}
              </div>
            )}

            {/* CTA */}
            <button type="submit" disabled={loading} className="login-btn">
              {loading ? 'Connexion…' : (
                <>
                  Se connecter
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M3.75 9H14.25" stroke="white" strokeWidth="2" strokeLinecap="round" />
                    <path d="M10 4.5L14.5 9L10 13.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              )}
            </button>

          </form>

          {/* Lien inscription */}
          <p style={{ textAlign: 'center', fontSize: 13.5, color: '#94a3b8', marginTop: 16 }}>
            Pas encore de compte ?{' '}
            <Link to="/register" style={{ color: '#0d9488', fontWeight: 700, textDecoration: 'none' }}>
              Créer un compte
            </Link>
          </p>

          {/* Séparateur + badges sécurité */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24, marginBottom: 16 }}>
            <div style={{ flex: 1, height: 1, background: '#f0f4f2' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="12" height="12" viewBox="0 0 15 15" fill="none">
                <path d="M7.5 1.25L1.25 4.25v3.5C1.25 11.1 4 13.5 7.5 14.25c3.5-.75 6.25-3.15 6.25-6.5V4.25L7.5 1.25z" stroke="#0d9488" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: '#64748b' }}>Données sécurisées</span>
            </div>
            <div style={{ width: 3, height: 3, borderRadius: '50%', background: '#d4ddd8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="12" height="12" viewBox="0 0 15 15" fill="none">
                <rect x="2.5" y="6.5" width="10" height="7.25" rx="1.5" stroke="#0d9488" strokeWidth="1.4" />
                <path d="M5 6.5V4.5a2.5 2.5 0 0 1 5 0v2" stroke="#0d9488" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: '#64748b' }}>Chiffrées</span>
            </div>
            <div style={{ width: 3, height: 3, borderRadius: '50%', background: '#d4ddd8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="12" height="12" viewBox="0 0 15 15" fill="none">
                <rect x="3.5" y="0.75" width="8" height="13.5" rx="1.75" stroke="#0d9488" strokeWidth="1.4" />
                <path d="M6 12h3" stroke="#0d9488" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: '#64748b' }}>100% mobile</span>
            </div>
          </div>

        </div>

        <LegalFooterLinks style={{ marginTop: 20 }} />
      </div>
      </div>{/* fin login-grid */}
    </div>
  );
}
