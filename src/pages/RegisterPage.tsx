import { useState, type FormEvent, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import AuthLeftPanel from '../components/layout/AuthLeftPanel';
import './LoginPage.css';

const inputStyle: CSSProperties = {
  width: '100%', padding: '11px 16px',
  border: '1.5px solid #E2EEF9',
  borderRadius: 10, fontSize: 14,
  fontFamily: "'Nunito', sans-serif",
  color: '#032c28', background: '#FAFCFF',
  outline: 'none', boxSizing: 'border-box',
  transition: 'border-color 0.2s, box-shadow 0.2s',
};

const labelStyle: CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#4A6080',
  display: 'block', marginBottom: 6,
  letterSpacing: '0.04em', textTransform: 'uppercase',
};


export default function RegisterPage() {
  const [prenom, setPrenom]       = useState('');
  const [nom, setNom]             = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [titre, setTitre]         = useState('');
  const [cabinet, setCabinet]     = useState('');
  const [showPwd, setShowPwd]     = useState(false);
  const [showConf, setShowConf]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!prenom || !nom || !email || !password || !confirm) {
      setError('Veuillez remplir tous les champs obligatoires.');
      return;
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (!supabase) {
      setError('Service indisponible. Veuillez réessayer plus tard.');
      return;
    }

    setLoading(true);

    // Étape 1 — Créer le compte
    const { data, error: authError } = await supabase.auth.signUp({ email, password });
    if (authError) {
      setError(authError.message === 'User already registered'
        ? 'Un compte existe déjà avec cet email.'
        : authError.message);
      setLoading(false);
      return;
    }

    // Étape 2 — Créer le profil praticien
    if (data.user) {
      await (supabase as unknown as { from: (t: string) => { insert: (v: object) => Promise<unknown> } })
        .from('praticiens')
        .insert({ id: data.user.id, prenom, nom, email, titre, cabinet });
    }

    // Étape 3 — Connecter directement si signUp n'a pas créé de session
    // (cas où la confirmation email est activée dans Supabase)
    if (!data.session) {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError('Compte créé. Veuillez vous connecter.');
        setLoading(false);
        return;
      }
    }
    // L'onAuthStateChange dans App.tsx détecte la session et redirige vers /
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Nunito', sans-serif" }}>
      <AuthLeftPanel />

      <div className="login-right" style={{
        flex: 1, background: 'white',
        padding: '44px 40px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        overflowY: 'auto',
      }}>

        <>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#2BBFBF', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
              Inscription gratuite
            </div>
            <div style={{ fontFamily: "'Poppins', sans-serif", fontSize: 24, fontWeight: 700, color: '#032c28', marginBottom: 6, letterSpacing: '-0.3px' }}>
              Créer mon compte
            </div>
            <div style={{ fontSize: 13, color: '#8B9BB4', marginBottom: 28, lineHeight: 1.5 }}>
              Rejoignez Horizon et gérez vos patients professionnellement
            </div>

            <form onSubmit={handleSubmit}>

              {/* Prénom / Nom */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Prénom <span style={{ color: '#DC2626' }}>*</span></label>
                  <input className="login-input" type="text" placeholder="Pierre" value={prenom} onChange={e => setPrenom(e.target.value)} autoComplete="given-name" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Nom <span style={{ color: '#DC2626' }}>*</span></label>
                  <input className="login-input" type="text" placeholder="Clavier" value={nom} onChange={e => setNom(e.target.value)} autoComplete="family-name" style={inputStyle} />
                </div>
              </div>

              {/* Email */}
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Email professionnel <span style={{ color: '#DC2626' }}>*</span></label>
                <input className="login-input" type="email" placeholder="pierre@mouvapa.com" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" style={inputStyle} />
              </div>

              {/* Mot de passe / Confirmer */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Mot de passe <span style={{ color: '#DC2626' }}>*</span></label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="login-input"
                      type={showPwd ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoComplete="new-password"
                      style={{ ...inputStyle, padding: '11px 40px 11px 16px' }}
                    />
                    <button type="button" onClick={() => setShowPwd(!showPwd)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#8B9BB4', padding: 0 }}>
                      <i className={`ti ${showPwd ? 'ti-eye-off' : 'ti-eye'}`} style={{ fontSize: 15 }} aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Confirmer <span style={{ color: '#DC2626' }}>*</span></label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="login-input"
                      type={showConf ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      autoComplete="new-password"
                      style={{ ...inputStyle, padding: '11px 40px 11px 16px' }}
                    />
                    <button type="button" onClick={() => setShowConf(!showConf)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#8B9BB4', padding: 0 }}>
                      <i className={`ti ${showConf ? 'ti-eye-off' : 'ti-eye'}`} style={{ fontSize: 15 }} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Titre */}
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Titre professionnel</label>
                <input className="login-input" type="text" placeholder="Ex : Enseignant APA, Kinésithérapeute…" value={titre} onChange={e => setTitre(e.target.value)} style={inputStyle} />
              </div>

              {/* Cabinet */}
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Cabinet / Société</label>
                <input className="login-input" type="text" placeholder="Ex : MouvAPA, Cabinet Santé+" value={cabinet} onChange={e => setCabinet(e.target.value)} style={inputStyle} />
              </div>

              {error && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#DC2626', marginBottom: 16 }}>
                  {error}
                </div>
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
                {loading ? 'Création en cours...' : (
                  <>
                    Créer mon compte
                    <span style={{ width: 24, height: 24, background: 'rgba(255,255,255,0.15)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>→</span>
                  </>
                )}
              </button>

            </form>

            <div style={{ textAlign: 'center', fontSize: 13, color: '#8B9BB4' }}>
              Déjà un compte ?{' '}
              <Link to="/login" style={{ color: '#2BBFBF', fontWeight: 700, textDecoration: 'none' }}>
                Se connecter
              </Link>
            </div>
        </>

      </div>
    </div>
  );
}
