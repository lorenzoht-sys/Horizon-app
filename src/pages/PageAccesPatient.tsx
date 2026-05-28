import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trouverParticipantParCode, mettreAJourDernierAcces } from '../hooks/useAccesPatients';

export default function PageAccesPatient() {
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  function verifierCode() {
    const codeNorm = code.trim().toLowerCase();
    if (!codeNorm) return;
    setLoading(true);
    setErreur('');
    setTimeout(() => {
      const participant = trouverParticipantParCode(codeNorm);
      if (participant) {
        mettreAJourDernierAcces(participant.id);
        navigate(`/patient/${participant.id}?code=${codeNorm}`);
      } else {
        setErreur('Code incorrect. Contactez votre intervenant APA.');
        setCode('');
      }
      setLoading(false);
    }, 600);
  }

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
          Saisissez le code fourni<br />par votre intervenant APA
        </div>

        <input
          type="text"
          value={code}
          onChange={e => setCode(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && verifierCode()}
          placeholder="Ex : marie2026"
          autoFocus
          style={{
            width: '100%', padding: '14px 16px',
            fontSize: 20, fontWeight: 700, textAlign: 'center',
            border: '2px solid', borderColor: code ? '#2BBFBF' : '#E0EEEE',
            borderRadius: 10, color: '#0D2B2B', outline: 'none',
            fontFamily: 'monospace', letterSpacing: '0.05em',
            boxSizing: 'border-box', marginBottom: 16,
            transition: 'border-color 0.15s',
          }}
        />

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
          onClick={verifierCode}
          disabled={!code.trim() || loading}
          style={{
            width: '100%', padding: '14px',
            background: code.trim() ? '#2BBFBF' : '#E0EEEE',
            color: code.trim() ? 'white' : '#8FA8A8',
            border: 'none', borderRadius: 10,
            fontSize: 15, fontWeight: 700,
            cursor: code.trim() ? 'pointer' : 'not-allowed',
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
