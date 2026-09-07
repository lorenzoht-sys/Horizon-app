import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import type { Participant, VisibiliteBeneficiaire } from '../../types';
import { getAppHost } from '../../lib/config';

const VISIBILITE_DEFAULT: VisibiliteBeneficiaire = {
  progression: true, bilans: true, rdv: true, programme: true, messagePierre: true, carteSante: true,
};

const VISIBILITE_ITEMS = [
  { key: 'progression'   as const, label: 'Graphiques de progression' },
  { key: 'bilans'        as const, label: 'Résultats des bilans' },
  { key: 'rdv'           as const, label: 'Prochains rendez-vous' },
  { key: 'programme'     as const, label: "Programme d'exercices" },
  // La cle `messagePierre` est persistee en JSONB (colonne
  // participants.visibilite_beneficiaire, DEFAULT en prod comme en staging) :
  // seul le LIBELLE change ici. La renommer demande une migration.
  { key: 'messagePierre' as const, label: 'Message du praticien' },
  { key: 'carteSante'    as const, label: 'Carte de santé téléchargeable' },
];

interface Props {
  participant: Participant;
  onClose: () => void;
  /** Persiste en base (Supabase) — remplace l'ancien stockage localStorage,
   *  qui n'était jamais lu par le bénéficiaire sur son propre appareil. */
  onUpdate: (data: Partial<Participant>) => Promise<void>;
}

export default function ModalEspacePatient({ participant, onClose, onUpdate }: Props) {
  const code = participant.codeAcces ?? '';
  const hasCode = code.length > 0;
  const patientUrl = `${window.location.origin}/patient/${participant.id}?code=${code}`;
  const [visibilite, setVisibilite] = useState<VisibiliteBeneficiaire>(
    () => participant.visibiliteBeneficiaire ?? VISIBILITE_DEFAULT
  );
  const [messageBeneficiaire, setMessageBeneficiaire] = useState(participant.messageBeneficiaire ?? '');
  const [copiedLink, setCopiedLink] = useState(false);

  function toggleVisibilite(key: keyof VisibiliteBeneficiaire, val: boolean) {
    const updated = { ...visibilite, [key]: val };
    setVisibilite(updated);
    onUpdate({ visibiliteBeneficiaire: updated }).catch(() => {
      toast.error('Erreur lors de la sauvegarde, réessayez');
      setVisibilite(visibilite);
    });
  }

  function setMessage(texte: string) {
    setMessageBeneficiaire(texte);
    onUpdate({ messageBeneficiaire: texte }).catch(() => {
      toast.error('Erreur lors de la sauvegarde, réessayez');
    });
  }

  function copier() {
    navigator.clipboard.writeText(code);
    toast('Code copié !');
  }

  function copierLien() {
    navigator.clipboard.writeText(patientUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
    toast('Lien copié !');
  }

  function partager() {
    if (navigator.share) {
      navigator.share({
        title: `Horizon — Portail de ${participant.prenom}`,
        text: `Voici votre accès à votre suivi Horizon`,
        url: patientUrl,
      });
    } else {
      copierLien();
    }
  }

  function envoyerSMS() {
    const msg = encodeURIComponent(
      `Bonjour ${participant.prenom}, votre code d'accès Horizon est : ${code}\nConnectez-vous sur : https://${getAppHost()}/patient`
    );
    window.open(`sms:${participant.telephone}?body=${msg}`);
  }

  const C = { dark: 'var(--color-ink)', teal: 'var(--color-teal)', muted: '#8FA8A8', bg: 'var(--color-bg)', border: '#E0EEEE' };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'white', borderRadius: 16,
        width: '100%', maxWidth: 400,
        maxHeight: '90vh', overflowY: 'auto', padding: 24,
      }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.dark }}>Espace bénéficiaire</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              {participant.prenom} {participant.nom}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: C.muted, lineHeight: 1 }}>
            ×
          </button>
        </div>

        {/* Code affiché */}
        <div style={{
          background: C.dark, borderRadius: hasCode ? '12px 12px 0 0' : 12,
          padding: '20px', textAlign: 'center',
          borderBottom: hasCode ? '1px solid rgba(255,255,255,0.07)' : 'none',
          marginBottom: hasCode ? 0 : 12,
        }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 8, letterSpacing: '0.1em' }}>
            CODE D'ACCÈS DE {participant.prenom.toUpperCase()}
          </div>
          {hasCode ? (
            <>
              <div style={{
                fontSize: 28, fontWeight: 700, color: C.teal,
                letterSpacing: '0.05em', fontFamily: 'monospace',
              }}>
                {code}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>
                {getAppHost()}/patient
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#FCA5A5' }}>
                Code non généré
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 8, lineHeight: 1.5 }}>
                Ce bénéficiaire n'a pas encore de code d'accès. Demandez à votre
                administrateur d'exécuter le script de génération des codes.
              </div>
            </>
          )}
        </div>

        {/* ── QR Code ─────────────────────────────────────────── */}
        {hasCode && (
          <div style={{
            background: C.dark,
            borderRadius: '0 0 12px 12px',
            padding: '20px 16px',
            textAlign: 'center',
            marginBottom: 12,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>
              QR Code — scan = accès direct
            </div>
            <div style={{ background: '#fff', borderRadius: 10, padding: 10, display: 'inline-block', boxShadow: '0 0 0 1px rgba(43,184,154,0.2)' }}>
              <QRCodeSVG
                value={patientUrl}
                size={160}
                bgColor="#ffffff"
                fgColor="#1C2B24"
                level="M"
              />
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 10, lineHeight: 1.4 }}>
              Le bénéficiaire scanne → ouvre son suivi<br/>sans saisir le code ✓
            </div>
          </div>
        )}

        {/* Boutons lien */}
        {hasCode && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button onClick={partager} style={{
            flex: 1, padding: '10px', background: '#2BB89A', color: 'white',
            border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <i className="ti ti-share" style={{ fontSize: 15 }} aria-hidden="true" />
            Envoyer
          </button>
          <button onClick={copierLien} style={{
            flex: 1, padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.2s',
            background: copiedLink ? 'rgba(43,184,154,0.12)' : 'rgba(0,0,0,0.04)',
            color: copiedLink ? '#1D9E75' : 'var(--color-ink-2)',
            border: `1px solid ${copiedLink ? 'rgba(43,184,154,0.3)' : C.border}`,
          }}>
            {copiedLink ? '✓ Copié' : 'Copier le lien'}
          </button>
        </div>
        )}

        {/* Boutons code */}
        {hasCode && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button onClick={copier} style={{
            flex: 1, padding: '10px', background: C.teal, color: 'white',
            border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <i className="ti ti-copy" style={{ fontSize: 15 }} aria-hidden="true" />
            Copier le code
          </button>
          {participant.telephone && (
            <button onClick={envoyerSMS} style={{
              flex: 1, padding: '10px', background: C.bg,
              border: `1px solid ${C.border}`, borderRadius: 8,
              fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--color-ink-2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <i className="ti ti-message" style={{ fontSize: 15 }} aria-hidden="true" />
              Envoyer SMS
            </button>
          )}
        </div>
        )}

        {/* Visibilité */}
        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--color-ink-2)',
            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
          }}>
            Ce que {participant.prenom} peut voir
          </div>
          {VISIBILITE_ITEMS.map(item => (
            <div key={item.key} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '7px 0', borderBottom: `1px solid ${C.bg}`,
              fontSize: 13, color: C.dark,
            }}>
              <span>{item.label}</span>
              <input
                type="checkbox"
                checked={visibilite[item.key]}
                onChange={e => toggleVisibilite(item.key, e.target.checked)}
                style={{ accentColor: C.teal, width: 16, height: 16 }}
              />
            </div>
          ))}
        </div>

        {/* Message du praticien */}
        {visibilite.messagePierre && (
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, color: 'var(--color-ink-2)',
              textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6,
            }}>
              Message pour {participant.prenom}
            </div>
            <textarea
              value={messageBeneficiaire}
              onChange={e => setMessage(e.target.value)}
              placeholder={`Bravo ${participant.prenom}, continuez comme ça !`}
              rows={3}
              style={{
                width: '100%', padding: '10px 12px',
                border: `1px solid ${C.border}`, borderRadius: 8,
                fontSize: 13, color: C.dark, resize: 'vertical',
                fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box',
              }}
            />
          </div>
        )}

      </div>
    </div>
  );
}
