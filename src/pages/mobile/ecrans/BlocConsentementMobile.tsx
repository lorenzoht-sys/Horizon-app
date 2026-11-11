import { avecConsentement } from '../../../lib/consentementRgpd';
import type { RgpdConsent } from '../../../types';
import { C, usePraticienSettings } from './communs';

// ── Nouveau patient mobile ─────────────────────────────────────────────────────

// Même bloc et mêmes règles que le formulaire complet
// (ParticipantForm.tsx) : le libellé de la case principale est identique, et
// la validation passe par src/lib/consentementRgpd.ts.
export function BlocConsentementMobile({ rgpd, onRgpdChange, droitImage, onDroitImageChange }: {
  rgpd: RgpdConsent;
  onRgpdChange: (rgpd: RgpdConsent) => void;
  droitImage: boolean;
  onDroitImageChange: (v: boolean) => void;
}) {
  const { settings } = usePraticienSettings();
  const cases = [
    { key: 'consentementObtenu', label: 'Le bénéficiaire a été informé et a consenti' },
    { key: 'droitAcces',         label: "Droit d'accès expliqué" },
    { key: 'droitRectification', label: 'Droit de rectification expliqué' },
    { key: 'droitEffacement',    label: "Droit à l'effacement expliqué" },
  ] as const;
  const ligne: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: C.text, padding: '7px 0', cursor: 'pointer' };
  const caseACocher: React.CSSProperties = { width: 20, height: 20, accentColor: 'var(--color-teal)', flexShrink: 0 };

  return (
    <div style={{ background: 'white', border: `1px solid ${rgpd.consentementObtenu ? C.border : '#FCD34D'}`, borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-ink-2)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
        🔒 Consentement RGPD *
      </div>
      <div style={{ background: C.bg, borderRadius: 8, padding: '8px 10px', fontSize: 12, color: '#4A6080', lineHeight: 1.5, marginBottom: 8 }}>
        <strong>À lire au bénéficiaire :</strong> « Dans le cadre de votre suivi en APA, je collecte vos données personnelles et de santé.
        Utilisées uniquement pour votre suivi. Droits d'accès, rectification, effacement : {settings.email || 'votre praticien'} »
      </div>
      {cases.map(({ key, label }) => (
        <label key={key} style={ligne}>
          <input type="checkbox" checked={rgpd[key]} style={caseACocher}
            onChange={e => {
              const coche = e.target.checked;
              onRgpdChange(key === 'consentementObtenu'
                ? avecConsentement(rgpd, coche, new Date().toISOString().slice(0, 10))
                : { ...rgpd, [key]: coche });
            }} />
          {label}
        </label>
      ))}
      <label style={ligne}>
        <input type="checkbox" checked={droitImage} style={caseACocher} onChange={e => onDroitImageChange(e.target.checked)} />
        Droit à l'image accordé (photos/vidéos en séance)
      </label>
      <div style={{ fontSize: 12, color: C.muted, margin: '8px 0 6px' }}>Mode de recueil</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {(['oral_note', 'ecrit', 'numerique'] as const).map(m => (
          <button key={m} type="button" onClick={() => onRgpdChange({ ...rgpd, methodeConsentement: m })}
            style={{
              flex: 1, padding: '8px 4px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${rgpd.methodeConsentement === m ? C.primary : C.border}`,
              background: rgpd.methodeConsentement === m ? C.primary : 'white',
              color: rgpd.methodeConsentement === m ? 'white' : '#4A6080',
            }}>
            {m === 'oral_note' ? 'Oral noté' : m === 'ecrit' ? 'Écrit' : 'Numérique'}
          </button>
        ))}
      </div>
      {!rgpd.consentementObtenu && (
        <div style={{ fontSize: 12, color: '#B45309', fontWeight: 600, marginTop: 10 }}>
          ⚠️ Obligatoire pour créer la fiche : sans consentement, les données de santé ne peuvent pas être collectées légalement.
        </div>
      )}
    </div>
  );
}
