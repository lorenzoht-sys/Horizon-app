import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  trouverAccesParCode,
  mettreAJourDernierAcces,
  isExpire,
} from '../hooks/useAccesPatients';

export default function PageAccesPatient() {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [erreur, setErreur] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  function handleSaisie(index: number, valeur: string) {
    if (!/^\d*$/.test(valeur)) return;
    const nouveau = [...code];
    nouveau[index] = valeur.slice(-1);
    setCode(nouveau);
    if (valeur && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
    if (nouveau.every(c => c !== '') && valeur !== '') {
      verifierCode(nouveau.join(''));
    }
  }

  function verifierCode(codeComplet: string) {
    setLoading(true);
    setErreur('');
    setTimeout(() => {
      const acces = trouverAccesParCode(codeComplet);
      if (acces && acces.actif && !isExpire(acces.dateExpiration)) {
        mettreAJourDernierAcces(acces.participantId);
        navigate(`/patient/${acces.participantId}?code=${codeComplet}`);
      } else {
        setErreur('Code incorrect ou expiré. Contactez votre intervenant APA.');
        setCode(['', '', '', '', '', '']);
        setTimeout(() => inputRefs.current[0]?.focus(), 50);
      }
      setLoading(false);
    }, 600);
  }

  const codeComplet = code.every(c => c !== '');

  return (
    <div style={{
      minHeight: '100vh', background: '#0D2B2B',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '20px',
    }}>

      <img src="/logo-horizon.png" style={{ height: 40, marginBottom: 32 }} alt="Horizon" />

      <div style={{
        background: 'white', borderRadius: 16,
        padding: '32px 28px', width: '100%', maxWidth: 380, textAlign: 'center',
      }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🔑</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#0D2B2B', marginBottom: 6 }}>
          Votre espace personnel
        </div>
        <div style={{ fontSize: 14, color: '#8FA8A8', marginBottom: 28, lineHeight: 1.5 }}>
          Saisissez le code à 6 chiffres<br />fourni par votre intervenant APA
        </div>

        {/* Saisie code */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 24 }}>
          {code.map((chiffre, i) => (
            <input
              key={i}
              ref={el => { inputRefs.current[i] = el; }}
              type="tel"
              inputMode="numeric"
              maxLength={1}
              value={chiffre}
              onChange={e => handleSaisie(i, e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Backspace' && !chiffre && i > 0) {
                  const prev = [...code];
                  prev[i - 1] = '';
                  setCode(prev);
                  inputRefs.current[i - 1]?.focus();
                }
              }}
              style={{
                width: 44, height: 52, textAlign: 'center',
                fontSize: 24, fontWeight: 700, border: '2px solid',
                borderColor: chiffre ? '#2BBFBF' : '#E0EEEE',
                borderRadius: 10, color: '#0D2B2B', outline: 'none',
                fontFamily: 'monospace', transition: 'border-color 0.15s',
              }}
            />
          ))}
        </div>

        {erreur && (
          <div style={{
            background: '#FEE2E2', border: '1px solid #FECACA',
            borderRadius: 8, padding: '10px 14px',
            fontSize: 13, color: '#991B1B', marginBottom: 16,
          }}>
            {erreur}
          </div>
        )}

        <button
          onClick={() => codeComplet && !loading && verifierCode(code.join(''))}
          disabled={!codeComplet || loading}
          style={{
            width: '100%', padding: '14px',
            background: codeComplet ? '#2BBFBF' : '#E0EEEE',
            color: codeComplet ? 'white' : '#8FA8A8',
            border: 'none', borderRadius: 10,
            fontSize: 15, fontWeight: 700,
            cursor: codeComplet ? 'pointer' : 'not-allowed',
            transition: 'background 0.15s',
          }}
        >
          {loading ? 'Vérification...' : 'Accéder à mon espace →'}
        </button>

        <div style={{ marginTop: 20, fontSize: 12, color: '#8FA8A8', lineHeight: 1.6 }}>
          Vous n'avez pas de code ?<br />Contactez votre intervenant APA.
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <a
          href="/login"
          style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}
        >
          Connexion praticien →
        </a>
      </div>
    </div>
  );
}
