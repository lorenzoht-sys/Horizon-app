import { useState, type FormEvent, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './LoginPage.css';

// ── Panneau gauche ────────────────────────────────────────────────────────────

function LeftPanel() {
  const features = [
    { icon: 'ti-chart-line',     title: 'Bilans trimestriels',      desc: 'Graphiques + PDF automatiques',       badge: '4/an' },
    { icon: 'ti-clipboard-list', title: 'Programmes personnalisés', desc: 'Exercices + vidéos démo à domicile',  badge: '50+ exos' },
    { icon: 'ti-map-pin',        title: 'Carte des patients',       desc: 'Gérez vos tournées à domicile',       badge: 'GPS' },
  ];

  const stats = [
    { value: '127', label: 'patients' },
    { value: '48',  label: 'bilans/mois' },
    { value: '4.9★', label: 'satisfaction' },
  ];

  return (
    <div className="login-left" style={{
      width: '52%',
      background: 'linear-gradient(160deg, #1A3A3A 0%, #032c28 60%, #081E1E 100%)',
      padding: '44px 40px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* Motif points */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
        pointerEvents: 'none',
      }} />

      {/* Lueur radiale turquoise */}
      <div style={{
        position: 'absolute', top: '30%', left: '-10%',
        width: 420, height: 420, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(43,191,191,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Cercles décoratifs */}
      <div style={{
        position: 'absolute', top: -100, right: -100,
        width: 360, height: 360, borderRadius: '50%',
        border: '1.5px solid rgba(255,255,255,0.08)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: -40, right: -40,
        width: 200, height: 200, borderRadius: '50%',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: -80, right: 60,
        width: 240, height: 240, borderRadius: '50%',
        border: '1px solid rgba(43,191,191,0.12)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: -30, left: -60,
        width: 200, height: 200, borderRadius: '50%',
        background: 'rgba(43,191,191,0.05)',
        pointerEvents: 'none',
      }} />

      {/* Tout le contenu au-dessus des décorations */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 42, height: 42,
            background: 'white', borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          }}>
            <img
              src="/logo-horizon.png.png"
              style={{ height: 36, objectFit: 'contain' }}
              alt="Horizon"
              onError={e => { (e.target as HTMLImageElement).src = '/logo-horizon.svg'; }}
            />
          </div>
        </div>

        {/* Claim */}
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(43,191,191,0.15)',
            border: '1px solid rgba(43,191,191,0.4)',
            borderRadius: 20, padding: '5px 14px',
            fontSize: 11, fontWeight: 600,
            color: '#2BBFBF', letterSpacing: '0.04em',
            marginBottom: 18,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2BBFBF', flexShrink: 0 }} />
            Outil professionnel de suivi patient
          </div>

          <div style={{
            fontFamily: "'Poppins', sans-serif",
            fontSize: 32, fontWeight: 800,
            color: 'white', lineHeight: 1.18,
            letterSpacing: '-0.8px', marginBottom: 12,
          }}>
            Le lien entre<br />
            vos séances et<br />
            <span style={{ color: '#2BBFBF' }}>leurs progrès.</span>
          </div>

          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, marginBottom: 20 }}>
            Bilans fonctionnels, programmes personnalisés,<br />
            rapports PDF — partout où vous allez.
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 24 }}>
            {stats.map((s, i) => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: i > 0 ? 0 : 0 }}>
                {i > 0 && <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.12)', marginRight: 24 }} />}
                <div>
                  <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: 20, fontWeight: 700, color: 'white', lineHeight: 1 }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {s.label}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Feature cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {features.map(f => (
            <div key={f.title} style={{
              display: 'flex', alignItems: 'center', gap: 13,
              background: 'rgba(255,255,255,0.07)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderLeft: '3px solid rgba(43,191,191,0.6)',
              borderRadius: 12, padding: '12px 14px',
            }}>
              <div style={{
                width: 38, height: 38,
                background: 'rgba(43,191,191,0.18)',
                border: '1px solid rgba(43,191,191,0.25)',
                borderRadius: 10, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <i className={`ti ${f.icon}`} style={{ fontSize: 19, color: '#2BBFBF' }} aria-hidden="true" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'white', lineHeight: 1.2 }}>{f.title}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{f.desc}</div>
              </div>
              <div style={{
                fontSize: 10, fontWeight: 700, color: '#2BBFBF',
                background: 'rgba(43,191,191,0.15)',
                border: '1px solid rgba(43,191,191,0.25)',
                borderRadius: 20, padding: '2px 8px',
                flexShrink: 0, whiteSpace: 'nowrap',
              }}>{f.badge}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', letterSpacing: '0.08em' }}>
            HORIZON · 2025
          </div>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
        </div>

      </div>
    </div>
  );
}

// ── Panneau droit ─────────────────────────────────────────────────────────────

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
    fontFamily: "'Nunito', sans-serif",
    color: '#032c28', background: '#FAFCFF',
    outline: 'none', boxSizing: 'border-box',
  };

  const labelStyle: CSSProperties = {
    fontSize: 11, fontWeight: 700, color: '#4A6080',
    display: 'block', marginBottom: 6,
    letterSpacing: '0.04em', textTransform: 'uppercase',
  };

  const trustItems = [
    { icon: 'ti-shield-check', label: 'Conforme\nRGPD' },
    { icon: 'ti-lock',         label: 'Données\nchiffrées' },
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

      <div style={{ fontSize: 10, fontWeight: 700, color: '#2BBFBF', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
        Connexion sécurisée
      </div>
      <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: 24, fontWeight: 700, color: '#032c28', marginBottom: 6, letterSpacing: '-0.3px' }}>
        Bon retour 👋
      </div>
      <div style={{ fontSize: 13, color: '#8B9BB4', marginBottom: 32, lineHeight: 1.5 }}>
        Accédez à votre espace de suivi professionnel
      </div>

      <form onSubmit={onSubmit}>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Email professionnel</label>
          <input
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
          <a href="#" onClick={e => e.preventDefault()} style={{ fontSize: 12, color: '#2BBFBF', fontWeight: 600, textDecoration: 'none' }}>
            Mot de passe oublié ?
          </a>
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
            background: loading ? '#7DD9D9' : '#2BBFBF',
            color: 'white', border: 'none', borderRadius: 10,
            fontSize: 14, fontWeight: 700,
            fontFamily: "'Poppins', sans-serif",
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
            <i className={`ti ${t.icon}`} style={{ fontSize: 17, color: '#2BBFBF' }} aria-hidden="true" />
            <div style={{
              fontSize: 9, color: '#8B9BB4', fontWeight: 700, textAlign: 'center',
              textTransform: 'uppercase', letterSpacing: '0.03em', lineHeight: 1.3, whiteSpace: 'pre-line',
            }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Note */}
      <div style={{ textAlign: 'center', fontSize: 11, color: '#B8C8DC' }}>
        Première utilisation ?{' '}
        <a href="mailto:pierre@mouvapa.com" style={{ color: '#2BBFBF', fontWeight: 600, textDecoration: 'none' }}>
          Contacter le support
        </a>
      </div>

    </div>
  );
}

// ── Page de connexion ─────────────────────────────────────────────────────────

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

    if (!supabase) {
      if (email === 'pierre@mouvapa.com' && password === 'mouvapa2025') {
        localStorage.setItem('isLoggedIn', 'true');
        onLogin();
        navigate('/');
      } else {
        setError('Email ou mot de passe incorrect');
      }
      setLoading(false);
      return;
    }

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError('Email ou mot de passe incorrect');
      setLoading(false);
      return;
    }
    onLogin();
    navigate('/');
    setLoading(false);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Nunito', sans-serif" }}>
      <LeftPanel />
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
