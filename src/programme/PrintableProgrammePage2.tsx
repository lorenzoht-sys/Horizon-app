import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import type { Participant, Programme, Exercice } from '../types';

interface Props {
  participant: Participant;
  programme: Programme;
  exercices: Exercice[];
}

function QRImg({ url, size = 80 }: { url: string; size?: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(url, { width: size, margin: 1, color: { dark: '#0D2B4B', light: '#ffffff' } })
      .then(setSrc)
      .catch(() => {});
  }, [url, size]);
  if (!src) return null;
  return <img src={src} alt="QR" style={{ width: size, height: size, display: 'block' }} />;
}

// Largeur fixe de chaque colonne jour (px)
const COL_W = 52;   // largeur de chaque colonne jour
const COL_EX = 350; // 714px conteneur − 7×52px = 350px pour la colonne exercice

export default function PrintableProgrammePage2({ participant, programme, exercices }: Props) {
  const sorted = [...programme.exercices].sort((a, b) => a.ordre - b.ordre);
  const avecVideo = sorted
    .map(ep => ({ ep, ex: exercices.find(e => e.id === ep.exerciceId) }))
    .filter(({ ex }) => !!ex?.videoYoutubeId);

  const jours = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  return (
    <div
      id="pp-page2"
      style={{
        display: 'none',
        width: '794px',
        padding: '40px',
        fontFamily: 'var(--font-sans)',
        background: '#ffffff',
        boxSizing: 'border-box',
      }}
    >
      {/* ── TITRE ── */}
      <div style={{
        color: '#1A5F9E', fontSize: 13, fontWeight: 800,
        textTransform: 'uppercase', letterSpacing: 1.2,
        borderBottom: '2px solid #1A5F9E', paddingBottom: 10, marginBottom: 24,
      }}>
        Tableau de suivi — À cocher chaque jour
      </div>

      {/* ── TABLEAU ── */}
      {/* On utilise un tableau HTML avec des largeurs fixes explicites */}
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
        marginBottom: 32,
      }}>
        {/* Définition stricte des largeurs */}
        <colgroup>
          <col style={{ width: COL_EX }} />
          {jours.map(j => <col key={j} style={{ width: COL_W }} />)}
        </colgroup>

        {/* En-tête */}
        <thead>
          <tr style={{ background: '#0D2B4B' }}>
            <th style={{
              width: COL_EX,
              padding: '13px 16px',
              textAlign: 'left',
              color: '#ffffff', fontSize: 14, fontWeight: 700,
              borderBottom: 'none',
            }}>
              Exercice
            </th>
            {jours.map(j => (
              <th key={j} style={{
                width: COL_W,
                padding: '13px 0',
                textAlign: 'center',
                color: '#ffffff', fontSize: 13, fontWeight: 700,
                borderBottom: 'none',
              }}>
                {j}
              </th>
            ))}
          </tr>
        </thead>

        {/* Corps */}
        <tbody>
          {sorted.map((ep, i) => {
            const ex = exercices.find(e => e.id === ep.exerciceId);
            return (
              <tr key={ep.exerciceId} style={{ background: i % 2 === 0 ? '#ffffff' : '#FAFCFE' }}>
                {/* Colonne exercice */}
                <td style={{
                  width: COL_EX,
                  padding: '14px 16px',
                  borderBottom: '1px solid #E8F4FD',
                  verticalAlign: 'middle',
                }}>
                  <div style={{ fontWeight: 700, color: '#0D2B4B', fontSize: 14 }}>
                    {i + 1}. {ex?.nom ?? ep.exerciceId}
                  </div>
                  <div style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>
                    {ep.series} série{ep.series > 1 ? 's' : ''}
                    {ep.repetitions ? ` · ${ep.repetitions} rép.` : ep.dureeSecondes ? ` · ${ep.dureeSecondes}s` : ''}
                  </div>
                </td>

                {/* Colonnes jours */}
                {[1, 2, 3, 4, 5, 6, 7].map(d => {
                  const actif = ep.frequenceParSemaine.includes(d);
                  return (
                    <td key={d} style={{
                      width: COL_W,
                      padding: '14px 0',
                      borderBottom: '1px solid #E8F4FD',
                      textAlign: 'center',
                      verticalAlign: 'middle',
                    }}>
                      {actif ? (
                        /* Case à cocher — rendue comme un tableau 1×1 pour centrage parfait */
                        <table style={{ borderCollapse: 'collapse', margin: '0 auto' }}>
                          <tbody>
                            <tr>
                              <td style={{
                                width: 28, height: 28,
                                border: '2.5px solid #1A5F9E',
                                borderRadius: 6,
                                padding: 0,
                              }} />
                            </tr>
                          </tbody>
                        </table>
                      ) : (
                        <span style={{ color: '#C9C7C0', fontSize: 18 }}>—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ── QR CODES ── */}
      {avecVideo.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #E8F4FD', borderRadius: 12, marginBottom: 28 }}>
          <tbody>
            <tr>
              <td style={{ padding: '14px 18px', verticalAlign: 'middle', width: '55%' }}>
                <div style={{ fontWeight: 700, color: '#0D2B4B', fontSize: 13, marginBottom: 4 }}>
                  📱 Voir les démonstrations vidéo
                </div>
                <div style={{ color: '#6B7280', fontSize: 12, lineHeight: 1.5 }}>
                  Scannez le QR code avec votre téléphone pour regarder la vidéo de chaque exercice.
                </div>
              </td>
              <td style={{ padding: '14px 18px', verticalAlign: 'middle', textAlign: 'center' }}>
                <table style={{ borderCollapse: 'collapse', margin: '0 auto' }}>
                  <tbody>
                    <tr>
                      {avecVideo.map(({ ex }) =>
                        ex?.videoYoutubeId ? (
                          <td key={ex.id} style={{ padding: '0 10px', textAlign: 'center', verticalAlign: 'top' }}>
                            <QRImg url={`https://youtu.be/${ex.videoYoutubeId}`} size={72} />
                            <div style={{ fontSize: 10, color: '#6B7280', marginTop: 4, width: 72, lineHeight: 1.3 }}>
                              {ex.nom}
                            </div>
                          </td>
                        ) : null
                      )}
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      )}

      {/* ── FOOTER ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: '1px solid #E8F4FD' }}>
        <tbody>
          <tr>
            <td style={{ padding: '12px 0 0', color: '#B4B2A9', fontSize: 12, verticalAlign: 'middle' }}>
              Pierre Clavier — Enseignant en Activité Physique Adaptée — Mouv'APA · mouvapa.com
            </td>
            <td style={{ padding: '12px 0 0', color: '#B4B2A9', fontSize: 12, textAlign: 'right', verticalAlign: 'middle' }}>
              {participant.prenom} {participant.nom} — {new Date(programme.dateCreation).toLocaleDateString('fr-FR')}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
