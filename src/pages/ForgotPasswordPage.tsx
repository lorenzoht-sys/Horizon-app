import { useState, type FormEvent, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import AuthLeftPanel from '../components/layout/AuthLeftPanel';
import './LoginPage.css';

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

function SuccessScreen({ email }: { email: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 0' }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: 'rgba(43,191,191,0.12)',
        border: '2px solid rgba(43,191,191,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 20px',
      }}>
        <i className="ti ti-send" style={{ fontSize: 28, color: 'var(--color-teal)' }} aria-hidden="true" />
      </div>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: 20, fontWeight: 700, color: '#032c28', marginBottom: 10 }}>
        Lien envoyé !
      </div>
      <div style={{ fontSize: 14, color: '#8B9BB4', lineHeight: 1.6, marginBottom: 6 }}>
        Un lien de réinitialisation a été envoyé à
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#032c28', marginBottom: 28 }}>
        {email}
      </div>
      <div style={{ fontSize: 12, color: '#B8C8DC', marginBottom: 28 }}>
        Vérifiez votre boîte email et vos spams.
      </div>
      <Link to="/login" style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: 'var(--color-teal)', color: 'white',
        padding: '11px 24px', borderRadius: 10,
        fontSize: 14, fontWeight: 700, textDecoration: 'none',
        fontFamily: "var(--font-sans)",
      }}>
        <i className="ti ti-arrow-left" style={{ fontSize: 15 }} aria-hidden="true" />
        Retour à la connexion
      </Link>
    </div>
  );
}

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Veuillez saisir votre adresse email.');
      return;
    }
    if (!supabase) {
      setError('Service indisponible. Veuillez réessayer plus tard.');
      return;
    }

    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (resetError) {
      setError('Une erreur est survenue. Vérifiez votre adresse email.');
      setLoading(false);
      return;
    }

    setLoading(false);
    setSuccess(true);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "var(--font-sans)" }}>
      <AuthLeftPanel />

      <div className="login-right" style={{
        flex: 1, background: 'white',
        padding: '44px 40px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
      }}>

        {success ? <SuccessScreen email={email} /> : (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-teal)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
              Récupération de compte
            </div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 24, fontWeight: 700, color: '#032c28', marginBottom: 6, letterSpacing: '-0.3px' }}>
              Mot de passe oublié ?
            </div>
            <div style={{ fontSize: 13, color: '#8B9BB4', marginBottom: 32, lineHeight: 1.5 }}>
              Entrez votre email et nous vous enverrons un lien<br />
              pour réinitialiser votre mot de passe.
            </div>

            <form onSubmit={handleSubmit}>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Adresse email</label>
                <input
                  className="login-input"
                  type="email"
                  placeholder="marie.durand@exemple.fr"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  style={inputStyle}
                />
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
                  background: loading ? '#7DD9D9' : 'var(--color-teal)',
                  color: 'white', border: 'none', borderRadius: 10,
                  fontSize: 14, fontWeight: 700,
                  fontFamily: "var(--font-sans)",
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  marginBottom: 24, transition: 'background 0.2s',
                }}
              >
                {loading ? 'Envoi en cours...' : (
                  <>
                    Envoyer le lien
                    <span style={{ width: 24, height: 24, background: 'rgba(255,255,255,0.15)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>→</span>
                  </>
                )}
              </button>

            </form>

            <div style={{ textAlign: 'center', fontSize: 13, color: '#8B9BB4' }}>
              <Link to="/login" style={{ color: 'var(--color-teal)', fontWeight: 700, textDecoration: 'none' }}>
                <i className="ti ti-arrow-left" style={{ fontSize: 13, marginRight: 4 }} aria-hidden="true" />
                Retour à la connexion
              </Link>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
