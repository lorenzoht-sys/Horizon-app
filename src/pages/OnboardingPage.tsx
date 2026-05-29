import { useState, type FormEvent, type CSSProperties } from 'react';
import { supabase } from '../lib/supabase';

interface Props {
  onComplete: () => void;
}

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

export default function OnboardingPage({ onComplete }: Props) {
  const [prenom,   setPrenom]   = useState('');
  const [nom,      setNom]      = useState('');
  const [titre,    setTitre]    = useState('');
  const [societe,  setSociete]  = useState('');
  const [siret,    setSiret]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!prenom.trim() || !nom.trim() || !titre.trim()) {
      setError('Veuillez renseigner les champs obligatoires (*).');
      return;
    }

    if (!supabase) { onComplete(); return; }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { onComplete(); return; }

    const siretClean = siret.replace(/\s/g, '');
    const { error: upsertError } = await (supabase as unknown as {
      from: (t: string) => { upsert: (v: object) => Promise<{ error: { message: string } | null }> }
    })
      .from('praticiens')
      .upsert({
        id:      user.id,
        prenom:  prenom.trim(),
        nom:     nom.trim(),
        titre:   titre.trim(),
        societe: societe.trim() || null,
        siret:   siretClean || null,
        email:   user.email,
      });

    if (upsertError) {
      setError('Erreur lors de l\'enregistrement. Réessayez.');
      setLoading(false);
      return;
    }

    // Mise à jour du cache localStorage pour les composants PDF
    localStorage.setItem('settings_praticien', JSON.stringify({
      prenom: prenom.trim(), nom: nom.trim(), titre: titre.trim(),
      societe: societe.trim(), siret: siretClean,
    }));
    window.dispatchEvent(new Event('settings_praticien_updated'));

    setLoading(false);
    onComplete();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#0D2B2B',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100,
      fontFamily: "'Nunito', sans-serif",
      overflowY: 'auto',
      padding: '24px',
    }}>

      {/* Motif fond */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
        pointerEvents: 'none',
      }} />
      {/* Lueur turquoise */}
      <div style={{
        position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(43,191,191,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 480 }}>

        {/* En-tête */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 64, height: 64,
            background: 'white', borderRadius: 16,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 20,
            boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
          }}>
            <img
              src="/logo-horizon.png.png"
              style={{ height: 50, objectFit: 'contain' }}
              alt="Horizon"
              onError={e => { (e.target as HTMLImageElement).src = '/logo-horizon.svg'; }}
            />
          </div>
          <div style={{
            fontFamily: "'Poppins', sans-serif",
            fontSize: 26, fontWeight: 800,
            color: 'white', marginBottom: 8, letterSpacing: '-0.5px',
          }}>
            Bienvenue sur Horizon 👋
          </div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
            Quelques informations pour commencer
          </div>
        </div>

        {/* Carte formulaire */}
        <div style={{
          background: 'white', borderRadius: 20,
          padding: '32px 32px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        }}>
          <form onSubmit={handleSubmit}>

            {/* Prénom / Nom */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>
                  Prénom <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="Pierre"
                  value={prenom}
                  onChange={e => setPrenom(e.target.value)}
                  autoComplete="given-name"
                  autoFocus
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>
                  Nom <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="Clavier"
                  value={nom}
                  onChange={e => setNom(e.target.value)}
                  autoComplete="family-name"
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Titre */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>
                Titre professionnel <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <input
                type="text"
                placeholder="Ex : Enseignant en APA, Kinésithérapeute…"
                value={titre}
                onChange={e => setTitre(e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* Société */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Nom de la société / cabinet</label>
              <input
                type="text"
                placeholder="Ex : MouvAPA, Cabinet Santé+"
                value={societe}
                onChange={e => setSociete(e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* SIRET */}
            <div style={{ marginBottom: 22 }}>
              <label style={labelStyle}>Numéro SIRET</label>
              <input
                type="text"
                placeholder="123 456 789 00012"
                value={siret}
                onChange={e => setSiret(e.target.value)}
                style={inputStyle}
              />
              <div style={{ fontSize: 11, color: '#B8C8DC', marginTop: 4 }}>
                14 chiffres — utilisé sur vos factures · Peut être complété dans les Paramètres
              </div>
            </div>

            {error && (
              <div style={{
                background: '#FEF2F2', border: '1px solid #FECACA',
                borderRadius: 8, padding: '10px 14px',
                fontSize: 13, color: '#DC2626', marginBottom: 16,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: 14,
                background: loading ? '#7DD9D9' : '#2BBFBF',
                color: 'white', border: 'none', borderRadius: 10,
                fontSize: 15, fontWeight: 700,
                fontFamily: "'Poppins', sans-serif",
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                transition: 'background 0.2s',
              }}
            >
              {loading ? 'Enregistrement…' : (
                <>
                  Commencer
                  <span style={{
                    width: 26, height: 26,
                    background: 'rgba(255,255,255,0.2)',
                    borderRadius: 6,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14,
                  }}>→</span>
                </>
              )}
            </button>

          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>
          Ces informations apparaîtront sur vos documents PDF. Vous pourrez les modifier dans Paramètres.
        </div>

      </div>
    </div>
  );
}
