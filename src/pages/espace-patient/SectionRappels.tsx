import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { patientActiverRappels, patientDesactiverRappels } from '../../lib/patientApi';
import { activerRappelsPush, desactiverRappelsPush, etatAbonnementPush, estIOS, estInstalleeSurEcranAccueil, pushSupporte } from '../../lib/push';
import { C } from './communs';

// ── Rappels (notifications push) ────────────────────────────────────────────

export type EtatRappels = 'verification' | 'actif' | 'inactif' | 'ios' | 'non_supporte' | 'refuse' | 'erreur';

export function SectionRappels({ token }: { token: string }) {
  const [etat, setEtat] = useState<EtatRappels>('verification');
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    void (async () => {
      if (estIOS() && !estInstalleeSurEcranAccueil()) { setEtat('ios'); return; }
      if (!pushSupporte()) { setEtat('non_supporte'); return; }
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') { setEtat('refuse'); return; }
      const statut = await etatAbonnementPush();
      if (statut === 'non_supporte') setEtat('non_supporte');
      else setEtat(statut === 'abonne' ? 'actif' : 'inactif');
    })();
  }, []);

  async function activer() {
    setEnCours(true);
    const res = await activerRappelsPush();
    if (res.ok) {
      const ok = await patientActiverRappels(token, res.subscription);
      if (ok) {
        setEtat('actif');
        toast.success('Rappels activés !');
      } else {
        setEtat('erreur');
        toast.error("Erreur lors de l'activation. Réessayez plus tard.");
      }
    } else if (res.raison === 'permission_refusee') {
      setEtat('refuse');
    } else if (res.raison === 'ios_non_installee') {
      setEtat('ios');
    } else if (res.raison === 'non_supporte' || res.raison === 'cle_manquante') {
      setEtat('non_supporte');
    } else {
      setEtat('erreur');
      toast.error("Erreur lors de l'activation. Réessayez plus tard.");
    }
    setEnCours(false);
  }

  async function desactiver() {
    setEnCours(true);
    const endpoint = await desactiverRappelsPush();
    if (endpoint) await patientDesactiverRappels(token, endpoint);
    setEtat('inactif');
    toast('Rappels désactivés sur cet appareil.');
    setEnCours(false);
  }

  // Pendant la vérification initiale, on n'affiche rien (évite un flash).
  if (etat === 'verification') return null;

  const cardStyle = {
    margin: '12px 16px',
    background: 'white',
    border: `1px solid ${C.border}`,
    borderRadius: 14,
    padding: '14px 16px',
  };

  if (etat === 'actif') {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 4 }}>
          🔔 Rappels activés
        </div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 10 }}>
          Vous recevrez une notification avant vos séances et si vous n'avez pas fait vos exercices depuis un moment.
        </div>
        <button onClick={desactiver} disabled={enCours} style={{
          background: 'none', border: `1px solid ${C.border}`, borderRadius: 8,
          padding: '8px 12px', fontSize: 12, fontWeight: 600, color: C.muted,
          cursor: enCours ? 'default' : 'pointer',
        }}>
          Désactiver sur cet appareil
        </button>
      </div>
    );
  }

  if (etat === 'inactif') {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 4 }}>
          🔔 Activer les rappels
        </div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 10 }}>
          Recevez une notification avant vos séances et la veille au soir des jours où vous en avez une.
        </div>
        <button onClick={activer} disabled={enCours} style={{
          width: '100%', padding: '11px', background: C.teal, color: 'white',
          border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
          cursor: enCours ? 'default' : 'pointer', opacity: enCours ? 0.7 : 1,
        }}>
          {enCours ? 'Activation…' : 'Activer les rappels'}
        </button>
      </div>
    );
  }

  if (etat === 'ios') {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 4 }}>
          🔔 Rappels
        </div>
        <div style={{ fontSize: 12, color: C.text, lineHeight: 1.7, background: C.bg, borderRadius: 8, padding: '10px 12px' }}>
          Pour activer les rappels sur iPhone/iPad : installez l'app sur votre écran d'accueil
          (<strong>□↑</strong> puis <strong>"Sur l'écran d'accueil"</strong>), puis revenez ici.
        </div>
      </div>
    );
  }

  if (etat === 'refuse') {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 4 }}>
          🔔 Rappels désactivés
        </div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
          Les notifications ont été refusées pour ce site. Pour les activer, autorisez les
          notifications pour Horizon dans les réglages de votre navigateur, puis revenez sur cette page.
        </div>
      </div>
    );
  }

  if (etat === 'non_supporte') {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 4 }}>
          🔔 Rappels
        </div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
          Les rappels par notification ne sont pas disponibles sur ce navigateur. Essayez avec une
          version récente de Chrome ou Safari, ou installez l'app sur votre écran d'accueil.
        </div>
      </div>
    );
  }

  // erreur
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 4 }}>
        🔔 Rappels
      </div>
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 10 }}>
        Une erreur est survenue lors de l'activation des rappels.
      </div>
      <button onClick={activer} disabled={enCours} style={{
        background: 'none', border: `1px solid ${C.border}`, borderRadius: 8,
        padding: '8px 12px', fontSize: 12, fontWeight: 600, color: C.teal,
        cursor: enCours ? 'default' : 'pointer',
      }}>
        Réessayer
      </button>
    </div>
  );
}
