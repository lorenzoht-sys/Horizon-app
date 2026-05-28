import { useState } from 'react';
import { addMonths } from 'date-fns';
import toast from 'react-hot-toast';
import type { AccesPatient, Participant } from '../../types';
import {
  sauvegarderAccesPatient,
  revoquerAcces,
} from '../../hooks/useAccesPatients';

function formatDateFR(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function formatDateRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs}h`;
  const d = Math.floor(hrs / 24);
  return `il y a ${d} jour${d > 1 ? 's' : ''}`;
}

const VISIBILITE_ITEMS = [
  { key: 'progression'   as const, label: 'Graphiques de progression' },
  { key: 'bilans'        as const, label: 'Résultats des bilans' },
  { key: 'rdv'           as const, label: 'Prochains rendez-vous' },
  { key: 'programme'     as const, label: "Programme d'exercices" },
  { key: 'messagePierre' as const, label: 'Message de Pierre' },
];

interface Props {
  participant: Participant;
  acces: AccesPatient | null;
  onClose: () => void;
  onUpdated: () => void;
}

export default function ModalEspacePatient({ participant, acces, onClose, onUpdated }: Props) {
  const [local, setLocal] = useState<AccesPatient | null>(acces);

  function genererCode() {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const nouvelAcces: AccesPatient = {
      participantId: participant.id,
      code,
      dateCreation: new Date().toISOString(),
      dateExpiration: addMonths(new Date(), 12).toISOString(),
      actif: true,
      visibilite: { progression: true, bilans: true, rdv: true, programme: true, messagePierre: true },
    };
    sauvegarderAccesPatient(nouvelAcces);
    setLocal(nouvelAcces);
    onUpdated();
    toast.success('Code généré !');
  }

  function toggleVisibilite(key: keyof AccesPatient['visibilite'], val: boolean) {
    if (!local) return;
    const updated: AccesPatient = { ...local, visibilite: { ...local.visibilite, [key]: val } };
    sauvegarderAccesPatient(updated);
    setLocal(updated);
    onUpdated();
  }

  function setMessage(texte: string) {
    if (!local) return;
    const updated: AccesPatient = { ...local, messagePierreTexte: texte };
    sauvegarderAccesPatient(updated);
    setLocal(updated);
    onUpdated();
  }

  function handleRevoquer() {
    if (!confirm(`Désactiver l'accès de ${participant.prenom} ?`)) return;
    revoquerAcces(participant.id);
    setLocal(null);
    onUpdated();
    toast.success('Accès désactivé');
  }

  function copierLien() {
    navigator.clipboard.writeText(
      `${window.location.origin}/patient — Code : ${local!.code}`
    );
    toast('Lien copié !');
  }

  function envoyerSMS() {
    const url = `${window.location.origin}/patient`;
    const msg = encodeURIComponent(
      `Bonjour ${participant.prenom},\n\nVoici votre espace personnel Horizon :\n\n🌐 ${url}\n🔑 Votre code : ${local!.code}\n\nSaisissez ce code pour accéder à votre espace.\n\nPierre Clavier — Mouv'APA`
    );
    window.open(`sms:${participant.telephone}?body=${msg}`);
  }

  const C = { dark: '#0D2B2B', teal: '#2BBFBF', muted: '#8FA8A8', bg: '#F4FAFA', border: '#E0EEEE' };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'white', borderRadius: 16,
        width: '100%', maxWidth: 420,
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

        {!local ? (
          /* ── Pas encore de code ── */
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔑</div>
            <div style={{ fontSize: 14, color: '#5C7A7A', marginBottom: 20, lineHeight: 1.6 }}>
              Générez un code d'accès pour {participant.prenom}.<br />
              Il lui permettra de consulter ses progrès et ses RDV.
            </div>
            <button onClick={genererCode} style={{
              background: C.teal, color: 'white', border: 'none',
              borderRadius: 10, padding: '12px 24px',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>
              🎲 Générer un code d'accès
            </button>
          </div>
        ) : (
          /* ── Code existant ── */
          <div>

            {/* Affichage du code */}
            <div style={{
              background: C.dark, borderRadius: 12,
              padding: '20px', textAlign: 'center', marginBottom: 16,
            }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 8, letterSpacing: '0.1em' }}>
                CODE D'ACCÈS DE {participant.prenom.toUpperCase()}
              </div>
              <div style={{
                fontSize: 42, fontWeight: 700, color: C.teal,
                letterSpacing: '0.2em', fontFamily: 'monospace',
              }}>
                {local.code.slice(0, 3)} {local.code.slice(3)}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>
                Valide jusqu'au {formatDateFR(local.dateExpiration)}
              </div>
            </div>

            {/* Instructions */}
            <div style={{
              background: C.bg, borderRadius: 10, padding: '12px 14px',
              marginBottom: 14, fontSize: 12, color: '#5C7A7A', lineHeight: 1.8,
            }}>
              <strong style={{ color: C.dark }}>Comment ça marche :</strong><br />
              1. Envoyez ce code à {participant.prenom} par SMS<br />
              2. {participant.prenom} va sur <strong>{window.location.origin}/patient</strong><br />
              3. Saisit son code → accède à son espace
            </div>

            {/* Boutons */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {participant.telephone && (
                <button onClick={envoyerSMS} style={{
                  flex: 1, padding: '10px', background: C.teal, color: 'white',
                  border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  <i className="ti ti-message" style={{ fontSize: 15 }} aria-hidden="true" />
                  SMS
                </button>
              )}
              <button onClick={copierLien} style={{
                flex: 1, padding: '10px', background: C.bg,
                border: `1px solid ${C.border}`, borderRadius: 8,
                fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#5C7A7A',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <i className="ti ti-copy" style={{ fontSize: 15 }} aria-hidden="true" />
                Copier le lien
              </button>
            </div>

            {/* Visibilité */}
            <div style={{ marginBottom: 14 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: '#5C7A7A',
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
              <div style={{ marginBottom: 14 }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: '#5C7A7A',
                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6,
                }}>
                  Message pour {participant.prenom}
                </div>
                <textarea
                  value={local.messagePierreTexte ?? ''}
                  onChange={e => setMessage(e.target.value)}
                  placeholder={`Bonjour ${participant.prenom}, bravo pour vos progrès !`}
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
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>
                Dernier accès : {formatDateRelative(local.dernierAcces)}
              </div>
            )}

            {/* Régénérer */}
            <button onClick={genererCode} style={{
              width: '100%', padding: '9px', marginBottom: 8,
              background: 'none', border: `1px solid ${C.border}`,
              borderRadius: 8, fontSize: 13, color: '#5C7A7A', cursor: 'pointer',
            }}>
              🔄 Régénérer un nouveau code
            </button>

            {/* Révoquer */}
            <button onClick={handleRevoquer} style={{
              width: '100%', padding: '9px',
              background: 'none', border: `1px solid ${C.border}`,
              borderRadius: 8, fontSize: 13, color: '#E85050', cursor: 'pointer',
            }}>
              Désactiver l'accès patient
            </button>

          </div>
        )}
      </div>
    </div>
  );
}
