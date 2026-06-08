import { useState, type FormEvent, type CSSProperties } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import AuthLeftPanel from '../components/layout/AuthLeftPanel';
import './LoginPage.css';

interface RightPanelProps {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  loading: boolean;
  error: string;
  onSubmit: (e: FormEvent) => void;
}

function RightPanel({
  email, setEmail, password, setPassword,
  showPassword, setShowPassword, loading, error, onSubmit,
}: RightPanelProps) {

  const inputStyle: CSSProperties = {
    width: '100%', padding: '11px 16px',
    border: '1.5px solid #E2EEF9',
    borderRadius: 10, fontSize: 14,
    fontFamily: "var(--font-sans)",
    color: '#032c28', background: '#FAFCFF',
    outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  };

  const labelStyle: CSSProperties = {
    fontSize: 11, fontWeight: 700, color: '#4A6080',
    display: 'block', marginBottom: 6,
    letterSpacing: '0.04em', textTransform: 'uppercase',
  };

  const trustItems = [
    { icon: 'ti-shield-check',  label: 'Conforme\nRGPD' },
    { icon: 'ti-lock',          label: 'Données\nchiffrées' },
    { icon: 'ti-device-mobile', label: '100%\nMobile' },
  ];

  return (
    <div className="login-right" style={{
      flex: 1,
      background: 'white',
      padding: '44px 40px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
    }}>

      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-teal)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
        Connexion sécurisée
      </div>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: 24, fontWeight: 700, color: '#032c28', marginBottom: 6, letterSpacing: '-0.3px' }}>
        Bon retour 👋
      </div>
      <div style={{ fontSize: 13, color: '#8B9BB4', marginBottom: 32, lineHeight: 1.5 }}>
        Accédez à votre espace de suivi professionnel
      </div>

      <form onSubmit={onSubmit}>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Email professionnel</label>
          <input
            className="login-input"
            type="email"
            placeholder="pierre@mouvapa.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Mot de passe</label>
          <div style={{ position: 'relative' }}>
            <input
              className="login-input"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              style={{ ...inputStyle, padding: '11px 44px 11px 16px' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: '#8B9BB4', padding: 0,
              }}
            >
              <i className={`ti ${showPassword ? 'ti-eye-off' : 'ti-eye'}`} style={{ fontSize: 16 }} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div style={{ textAlign: 'right', marginBottom: 22 }}>
          <Link to="/forgot-password" style={{ fontSize: 12, color: 'var(--color-teal)', fontWeight: 600, textDecoration: 'none' }}>
            Mot de passe oublié ?
          </Link>
        </div>

        {error && (
          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA',
            borderRadius: 8, padding: '10px 14px',
            fontSize: 13, color: '#DC2626', marginBottom: 16,
          }}>{error}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%', padding: 13,
            background: loading ? '#7DD9D9' : 'var(--color-teal)',
            color: 'white', border: 'none', borderRadius: 10,
            fontSize: 14, fontWeight: 700,
            fontFamily: "var(--font-sans)",
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            marginBottom: 20, transition: 'background 0.2s',
          }}
        >
          {loading ? 'Connexion...' : (
            <>
              Se connecter
              <span style={{
                width: 24, height: 24,
                background: 'rgba(255,255,255,0.15)',
                borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
              }}>→</span>
            </>
          )}
        </button>

      </form>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div style={{ flex: 1, height: 1, background: '#E2EEF9' }} />
        <div style={{ fontSize: 10, color: '#B8C8DC', fontWeight: 600, letterSpacing: '0.04em' }}>
          Horizon · Espace sécurisé
        </div>
        <div style={{ flex: 1, height: 1, background: '#E2EEF9' }} />
      </div>

      {/* Trust badges */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {trustItems.map(t => (
          <div key={t.label} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
            padding: '10px 8px', background: '#F8FBFF', borderRadius: 10, border: '1px solid #E2EEF9',
          }}>
            <i className={`ti ${t.icon}`} style={{ fontSize: 17, color: 'var(--color-teal)' }} aria-hidden="true" />
            <div style={{
              fontSize: 9, color: '#8B9BB4', fontWeight: 700, textAlign: 'center',
              textTransform: 'uppercase', letterSpacing: '0.03em', lineHeight: 1.3, whiteSpace: 'pre-line',
            }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Lien inscription */}
      <div style={{ textAlign: 'center', fontSize: 13, color: '#8B9BB4' }}>
        Pas encore de compte ?{' '}
        <Link to="/register" style={{ color: 'var(--color-teal)', fontWeight: 700, textDecoration: 'none' }}>
          Créer un compte
        </Link>
      </div>

    </div>
  );
}

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

    // Identifiants de secours — uniquement en local quand Supabase n'est pas configuré
    // (sinon ce serait une porte dérobée permanente en production).
    if (!supabase && email === 'pierre@mouvapa.com' && password === 'mouvapa2025') {
      localStorage.setItem('isLoggedIn', 'true');
      onLogin();
      navigate('/');
      setLoading(false);
      return;
    }

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
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "var(--font-sans)" }}>
      <AuthLeftPanel />
      <RightPanel
        email={email} setEmail={setEmail}
        password={password} setPassword={setPassword}
        showPassword={showPassword} setShowPassword={setShowPassword}
        loading={loading} error={error}
        onSubmit={handleLogin}
      />
    </div>
  );
}
