import { useState, useEffect, type FormEvent, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface Props {
  onComplete: () => void;
}

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

const TYPES_PRO = [
  'Enseignant APA',
  'Kinésithérapeute',
  'Coach sportif',
  'Éducateur sportif',
  'Autre',
];

export default function OnboardingPage({ onComplete }: Props) {
  const navigate = useNavigate();

  const [prenom,  setPrenom]  = useState('');
  const [nom,     setNom]     = useState('');
  const [titre,   setTitre]   = useState('');
  const [societe, setSociete] = useState('');
  const [siret,   setSiret]   = useState('');
  // Echappatoire salarie. Le mode `intervenant` de
  // CONCEPTION_MODE_ORGANISATION.md decrit un salarie APA d'une structure :
  // il n'a pas de SIRET personnel, et n'emet pas de contrat de prestation.
  // Non persiste — aucune colonne pour ca, et rien n'en depend ailleurs :
  // cette case ne fait que lever l'exigence ICI. La regle reelle est
  // appliquee la ou elle compte, a la generation du contrat.
  const [salarie, setSalarie] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // Précharger prénom et nom depuis la table praticiens : un compte qui a
  // déjà une fiche ne doit pas les ressaisir.
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from('praticiens')
        .select('prenom, nom')
        .eq('id', user.id)
        .single()
        .then(({ data }: { data: { prenom?: string; nom?: string } | null }) => {
          if (data?.prenom) setPrenom(data.prenom);
          if (data?.nom) setNom(data.nom);
        });
    });
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    // Identite complete exigee ICI, et pas seulement dans les reglages.
    // L'onboarding ne demandait ni prenom ni nom : un praticien invite
    // arrivait dans l'application sans identite, et generait un contrat de
    // prestation sans prestataire nomme — ou avec son seul prenom, ce que
    // le garde-fou de ModalGenerationContrat laissait passer.
    if (!prenom.trim() || !nom.trim()) {
      setError('Renseignez votre prénom et votre nom : ils figurent sur les contrats que vous générez.');
      return;
    }
    if (!titre.trim()) {
      setError('Veuillez sélectionner votre type de professionnel.');
      return;
    }
    if (!salarie && !siret.replace(/s/g, '')) {
      setError("Renseignez votre numéro SIRET : il figure obligatoirement sur les contrats de prestation. Si vous êtes salarié·e d'une structure, cochez la case ci-dessous.");
      return;
    }

    if (!supabase) { onComplete(); navigate('/'); return; }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { onComplete(); navigate('/'); return; }

    const siretClean = siret.replace(/\s/g, '');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upsertError } = await (supabase as any)
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
      console.error('[Onboarding] Erreur upsert praticiens:', upsertError);
      setError(upsertError.message ?? "Erreur lors de l'enregistrement. Réessayez.");
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
    navigate('/');
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--color-ink)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100,
      fontFamily: "var(--font-sans)",
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
            fontFamily: "var(--font-sans)",
            fontSize: 26, fontWeight: 800,
            color: 'white', marginBottom: 8, letterSpacing: '-0.5px',
          }}>
            {prenom ? `Bienvenue ${prenom} 👋` : 'Bienvenue 👋'}
          </div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
            Quelques informations pour commencer
          </div>
        </div>

        {/* Carte formulaire */}
        <div style={{
          background: 'white', borderRadius: 20,
          padding: '32px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        }}>
          <form onSubmit={handleSubmit}>

            {/* Identite. Premiere position : c'est ce qui figurera sur les
                documents que ce praticien emettra. */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>
                  Prénom <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <input
                  value={prenom}
                  onChange={e => setPrenom(e.target.value)}
                  autoComplete="given-name"
                  autoFocus
                  placeholder="Marie"
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>
                  Nom <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <input
                  value={nom}
                  onChange={e => setNom(e.target.value)}
                  autoComplete="family-name"
                  placeholder="Durand"
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Type de professionnel */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>
                Type de professionnel <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <select
                value={titre}
                onChange={e => setTitre(e.target.value)}
                style={{
                  ...inputStyle,
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%234A6080' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 14px center',
                  paddingRight: 36,
                  cursor: 'pointer',
                  color: titre ? '#032c28' : '#9BAABB',
                }}
              >
                <option value="" disabled>Choisissez votre métier…</option>
                {TYPES_PRO.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Nom de l'entreprise / cabinet */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Nom de l'entreprise / cabinet</label>
              <input
                type="text"
                placeholder="Ex : Cabinet Santé+, Activ'Forme"
                value={societe}
                onChange={e => setSociete(e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* SIRET */}
            <div style={{ marginBottom: 22 }}>
              <label style={labelStyle}>
                Numéro SIRET {!salarie && <span style={{ color: '#DC2626' }}>*</span>}
              </label>
              <input
                type="text"
                placeholder="123 456 789 00012"
                value={siret}
                onChange={e => setSiret(e.target.value)}
                style={inputStyle}
              />
              <div style={{ fontSize: 11, color: '#B8C8DC', marginTop: 4 }}>
                14 chiffres — il figure sur les contrats de prestation que vous émettrez.
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12.5, color: '#4A6080', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={salarie}
                  onChange={e => setSalarie(e.target.checked)}
                  style={{ width: 15, height: 15, cursor: 'pointer' }}
                />
                Je suis salarié·e d'une structure (pas de SIRET personnel)
              </label>
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
                background: loading ? '#7DD9D9' : 'var(--color-teal)',
                color: 'white', border: 'none', borderRadius: 10,
                fontSize: 15, fontWeight: 700,
                fontFamily: "var(--font-sans)",
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
