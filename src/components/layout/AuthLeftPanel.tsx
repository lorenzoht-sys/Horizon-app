export default function AuthLeftPanel() {
  return (
    <div className="login-panel-left" style={{
      display: 'flex',
      flexDirection: 'column',
      padding: '48px 32px 44px 64px',
      position: 'relative',
      overflow: 'hidden',
      flex: '0 0 52%',
    }}>

      {/* Logo */}
      <div style={{ flexShrink: 0 }}>
        <img
          src="/logo-horizon.png.png"
          alt="Horizon"
          style={{ height: 44, width: 'auto', display: 'block' }}
          onError={e => { (e.target as HTMLImageElement).src = '/logo-horizon.svg'; }}
        />
      </div>

      {/* Headline + chips */}
      <div className="login-panel-fadein" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>

        <p style={{ fontSize: 11.5, fontWeight: 700, color: '#0d9488', letterSpacing: '0.13em', textTransform: 'uppercase', marginBottom: 22 }}>
          Activité Physique Adaptée
        </p>

        <h1 style={{ fontSize: 'clamp(52px,5.5vw,80px)', fontWeight: 800, color: '#0f2e2a', lineHeight: 0.94, letterSpacing: '-3px', margin: 0 }}>
          Vos patients<br />
          <em style={{ fontStyle: 'italic', color: '#0d9488' }}>vous</em><br />
          attendent.
        </h1>

        <p style={{ fontSize: 16, color: '#5a7a72', marginTop: 22, fontWeight: 400, lineHeight: 1.65, maxWidth: 400 }}>
          Bilans fonctionnels, programmes et comptes-rendus centralisés — pour les enseignants en APA libéral.
        </p>

        {/* Chips flottants */}
        <div style={{ position: 'relative', height: 220, marginTop: 40, flexShrink: 0, overflow: 'hidden' }}>

          {/* Chip 1 — patient */}
          <div className="login-chip-1" style={{
            position: 'absolute', top: 4, left: 0,
            background: '#fff', borderRadius: 16, padding: '13px 16px',
            boxShadow: '0 8px 32px rgba(15,46,42,0.11)', border: '1px solid rgba(0,0,0,0.04)',
            display: 'flex', alignItems: 'center', gap: 12, width: 224,
          }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#0d9488,#0a7a70)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 700, color: '#fff' }}>ML</div>
            <div>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: '#0f2e2a', lineHeight: 1.2 }}>Marie L.</p>
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Bilan TUG · il y a 2j</p>
            </div>
            <div style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0, boxShadow: '0 0 0 3px rgba(34,197,94,0.15)' }} />
          </div>

          {/* Chip 2 — stat dark */}
          <div className="login-chip-2" style={{
            position: 'absolute', top: 16, left: 248,
            background: '#0f2e2a', borderRadius: 16, padding: '14px 18px',
            boxShadow: '0 8px 32px rgba(15,46,42,0.22)',
          }}>
            <p style={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(255,255,255,0.42)', letterSpacing: '0.09em', textTransform: 'uppercase' }}>Chair Stand</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
              <span style={{ fontSize: 32, fontWeight: 800, color: '#fff', letterSpacing: '-1.5px', lineHeight: 1 }}>12</span>
              <span style={{ fontSize: 13, color: '#0d9488', fontWeight: 600 }}>rép.</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <div style={{ width: 90, height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                <div style={{ width: '42%', height: '100%', background: 'linear-gradient(90deg,#0d9488,#34d399)', borderRadius: 99 }} />
              </div>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', whiteSpace: 'nowrap' }}>≥ 14</span>
            </div>
          </div>

          {/* Chip 3 — agenda */}
          <div className="login-chip-3" style={{
            position: 'absolute', top: 118, left: 24,
            background: '#fff', borderRadius: 16, padding: '12px 15px',
            boxShadow: '0 6px 26px rgba(15,46,42,0.09)', border: '1px solid rgba(0,0,0,0.04)',
            display: 'flex', alignItems: 'center', gap: 11, width: 210,
          }}>
            <div style={{ width: 34, height: 38, borderRadius: 9, background: '#e6f4f2', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 8.5, fontWeight: 700, color: '#0d9488', textTransform: 'uppercase', letterSpacing: '0.05em' }}>JUI</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#0f2e2a', lineHeight: 1.1 }}>28</span>
            </div>
            <div>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: '#0f2e2a', lineHeight: 1.2 }}>Séance J. Bernard</p>
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>10h30 → 11h30</p>
            </div>
          </div>

          {/* Chip 4 — IA */}
          <div className="login-chip-4" style={{
            position: 'absolute', top: 138, left: 256,
            background: '#e6f4f2', borderRadius: 14, padding: '11px 14px',
            boxShadow: '0 4px 20px rgba(13,148,136,0.14)', border: '1px solid rgba(13,148,136,0.14)',
            maxWidth: 190,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <div style={{ width: 18, height: 18, borderRadius: 6, background: '#0d9488', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1.5 4.5h6M4.5 1.5v6" stroke="white" strokeWidth="1.6" strokeLinecap="round" /></svg>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#0d9488', letterSpacing: '0.02em' }}>Synthèse IA</span>
            </div>
            <p style={{ fontSize: 11, color: '#0f2e2a', lineHeight: 1.55, fontWeight: 400 }}>Équilibre statique à travailler en priorité.</p>
          </div>

        </div>
      </div>

      {/* Stats footer */}
      <div className="login-stats-fadein" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ paddingRight: 28 }}>
          <p style={{ fontSize: 24, fontWeight: 800, color: '#0f2e2a', letterSpacing: '-0.8px', lineHeight: 1 }}>127</p>
          <p style={{ fontSize: 10.5, fontWeight: 600, color: '#94a3b8', marginTop: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>patients suivis</p>
        </div>
        <div style={{ width: 1, height: 36, background: '#cdd8d2' }} />
        <div style={{ padding: '0 28px' }}>
          <p style={{ fontSize: 24, fontWeight: 800, color: '#0f2e2a', letterSpacing: '-0.8px', lineHeight: 1 }}>48</p>
          <p style={{ fontSize: 10.5, fontWeight: 600, color: '#94a3b8', marginTop: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>bilans / mois</p>
        </div>
        <div style={{ width: 1, height: 36, background: '#cdd8d2' }} />
        <div style={{ paddingLeft: 28 }}>
          <p style={{ fontSize: 24, fontWeight: 800, color: '#0d9488', letterSpacing: '-0.8px', lineHeight: 1 }}>4.9 ★</p>
          <p style={{ fontSize: 10.5, fontWeight: 600, color: '#94a3b8', marginTop: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>satisfaction</p>
        </div>
      </div>

    </div>
  );
}
