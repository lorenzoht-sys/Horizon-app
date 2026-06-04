import { useState } from 'react';
import toast from 'react-hot-toast';
import type { AccesPatient, Participant } from '../../types';
import { calculerCode, getAccesPatient, sauvegarderAccesPatient } from '../../hooks/useAccesPatients';

const URL_APP = 'horizon-app-dusky.vercel.app/patient';

const VISIBILITE_ITEMS = [
  { key: 'progression'   as const, label: 'Graphiques de progression' },
  { key: 'bilans'        as const, label: 'Résultats des bilans' },
  { key: 'rdv'           as const, label: 'Prochains rendez-vous' },
  { key: 'programme'     as const, label: "Programme d'exercices" },
  { key: 'messagePierre' as const, label: 'Message de Pierre' },
];

interface Props {
  participant: Participant;
  onClose: () => void;
}

export default function ModalEspacePatient({ participant, onClose }: Props) {
  const code = calculerCode(participant.prenom);
  const [local, setLocal] = useState<AccesPatient>(() => getAccesPatient(participant.id));

  function toggleVisibilite(key: keyof AccesPatient['visibilite'], val: boolean) {
    const updated: AccesPatient = { ...local, visibilite: { ...local.visibilite, [key]: val } };
    sauvegarderAccesPatient(updated);
    setLocal(updated);
  }

  function setMessage(texte: string) {
    const updated: AccesPatient = { ...local, messagePierreTexte: texte };
    sauvegarderAccesPatient(updated);
    setLocal(updated);
  }

  function copier() {
    navigator.clipboard.writeText(code);
    toast('Code copié !');
  }

  function envoyerSMS() {
    const msg = encodeURIComponent(
      `Bonjour ${participant.prenom}, votre code d'accès Horizon est : ${code}\nConnectez-vous sur : https://${URL_APP}`
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
            <div style={{ fontSize: 16, fontWeight: 700, color: C.dark }}>Espace patient</div>
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
          background: C.dark, borderRadius: 12,
          padding: '20px', textAlign: 'center', marginBottom: 16,
        }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 8, letterSpacing: '0.1em' }}>
            CODE D'ACCÈS DE {participant.prenom.toUpperCase()}
          </div>
          <div style={{
            fontSize: 28, fontWeight: 700, color: C.teal,
            letterSpacing: '0.05em', fontFamily: 'monospace',
          }}>
            {code}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>
            {URL_APP}
          </div>
        </div>

        {/* Boutons */}
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
                checked={local.visibilite[item.key]}
                onChange={e => toggleVisibilite(item.key, e.target.checked)}
                style={{ accentColor: C.teal, width: 16, height: 16 }}
              />
            </div>
          ))}
        </div>

        {/* Message de Pierre */}
        {local.visibilite.messagePierre && (
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, color: 'var(--color-ink-2)',
              textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6,
            }}>
              Message pour {participant.prenom}
            </div>
            <textarea
              value={local.messagePierreTexte ?? ''}
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

        {/* Dernier accès */}
        {local.dernierAcces && (
          <div style={{ fontSize: 11, color: C.muted, marginTop: 12 }}>
            Dernier accès patient : {new Date(local.dernierAcces).toLocaleDateString('fr-FR')}
          </div>
        )}

      </div>
    </div>
  );
}
