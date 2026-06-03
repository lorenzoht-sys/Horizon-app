import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

function calculerCode(prenom: string): string {
  return prenom
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '')
    + '2026';
}

export default function PageAccesPatient() {
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function verifierCode() {
    const codeEntre = code.trim().toLowerCase();
    if (!codeEntre) return;
    setLoading(true);
    setErreur('');

    try {
      if (!supabase) throw new Error('no-supabase');

      const { data: tousParticipants } = await supabase
        .from('participants')
        .select('id, prenom, nom');

      const patient = tousParticipants?.find(p =>
        calculerCode(p.prenom) === codeEntre
      );

      if (patient) {
        navigate(`/patient/${patient.id}?code=${codeEntre}`);
      } else {
        setErreur('Ce code ne correspond à aucun compte. Contactez votre enseignant APA.');
        setCode('');
      }
    } catch {
      setErreur('Erreur de connexion. Vérifiez votre réseau et réessayez.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'white',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: "'Nunito', sans-serif",
    }}>

      {/* Logo */}
      <img
        src="/logo-horizon.png"
        style={{ height: 44, marginBottom: 40 }}
        alt="Horizon"
        onError={e => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />

      <div style={{
        width: '100%', maxWidth: 380, textAlign: 'center',
      }}>

        {/* Titre */}
        <div style={{ fontSize: 22, fontWeight: 800, color: '#0D2B2B', marginBottom: 8 }}>
          Bienvenue sur votre espace santé
        </div>
        <div style={{ fontSize: 15, color: '#8FA8A8', marginBottom: 36, lineHeight: 1.6 }}>
          Suivez vos progrès et retrouvez votre programme d'exercices.
        </div>

        {/* Champ code */}
        <div style={{ marginBottom: 12 }}>
          <label style={{
            display: 'block', fontSize: 13, fontWeight: 700,
            color: '#5C7A7A', marginBottom: 8, textAlign: 'left',
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            Votre code d'accès
          </label>
          <input
            type="text"
            value={code}
            onChange={e => { setCode(e.target.value); setErreur(''); }}
            onKeyDown={e => e.key === 'Enter' && verifierCode()}
            placeholder="Entrez votre code…"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            style={{
              width: '100%',
              padding: '16px 18px',
              fontSize: 22,
              fontWeight: 700,
              textAlign: 'center',
              border: '2px solid',
              borderColor: erreur ? '#FECACA' : code ? '#2BBFBF' : '#E0EEEE',
              borderRadius: 14,
              color: '#0D2B2B',
              outline: 'none',
              letterSpacing: '0.04em',
              boxSizing: 'border-box',
              transition: 'border-color 0.2s',
              background: 'white',
            }}
          />
        </div>

        {/* Erreur */}
        {erreur && (
          <div style={{
            background: '#FFF5F5',
            border: '1px solid #FECACA',
            borderRadius: 10,
            padding: '12px 16px',
            fontSize: 14,
            color: '#B91C1C',
            marginBottom: 16,
            lineHeight: 1.5,
            textAlign: 'left',
          }}>
            😕 {erreur}
          </div>
        )}

        {/* Bouton */}
        <button
          onClick={verifierCode}
          disabled={!code.trim() || loading}
          style={{
            width: '100%',
            padding: '16px',
            background: loading
              ? '#8FA8A8'
              : code.trim() ? '#2BBFBF' : '#E0EEEE',
            color: code.trim() ? 'white' : '#8FA8A8',
            border: 'none',
            borderRadius: 14,
            fontSize: 16,
            fontWeight: 800,
            cursor: code.trim() && !loading ? 'pointer' : 'not-allowed',
            transition: 'background 0.2s, transform 0.1s',
            minHeight: 54,
            letterSpacing: '0.01em',
          }}
        >
          {loading ? '⏳ Vérification…' : 'Accéder à mon espace →'}
        </button>

        {/* Aide */}
        <div style={{
          marginTop: 28,
          padding: '16px',
          background: '#F4FAFA',
          borderRadius: 12,
          fontSize: 13,
          color: '#5C7A7A',
          lineHeight: 1.6,
        }}>
          🔑 Votre code vous a été remis par votre enseignant APA.<br />
          Si vous ne le retrouvez pas, contactez-le directement.
        </div>

      </div>

      {/* Lien praticien discret */}
      <a
        href="/login"
        style={{
          position: 'fixed',
          bottom: 16,
          fontSize: 11,
          color: '#C9DCDC',
          textDecoration: 'none',
        }}
      >
        Connexion praticien
      </a>
    </div>
  );
}
