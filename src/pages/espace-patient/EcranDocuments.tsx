import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { Participant, Bilan, Programme } from '../../types';
import { patientUrlPdfFacture } from '../../lib/patientApi';
import { etatPourBeneficiaire, trierFacturesPatient, type FacturePatient } from '../../lib/facturesPatient';
import { exportCarteSantePatient } from '../../utils/exportDossierPDF';
import { purgerSessionPatient } from '../../hooks/useAccesPatients';
import MarkdownRendu from '../../components/ui/MarkdownRendu';
import { resultatTm6 } from '../../lib/tm6';
import { C, fmtCourt, fmtMoisAnnee, loadPraticien } from './communs';

// ── ÉCRAN 4 — Documents ───────────────────────────────────────────────────────

// Factures et avoirs émis (point D, D2) : liste déjà filtrée par le serveur (documents_du_beneficiaire).
// Le PDF s'ouvre par une URL signée de 60 s, demandée au clic et jamais conservée.
export function SectionFactures({ factures, token, avecMarge }: { factures: FacturePatient[]; token: string; avecMarge: boolean }) {
  const [enCours, setEnCours] = useState<string | null>(null);
  const fmtEuro = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  async function ouvrir(f: FacturePatient) {
    setEnCours(f.id);
    const r = await patientUrlPdfFacture(token, f.id);
    setEnCours(null);
    if (r.ok) { window.location.assign(r.url); return; }
    toast.error(r.status === 409 ? 'Le PDF est en préparation, réessayez dans quelques minutes.'
      : r.status === 429 ? 'Trop de demandes. Réessayez dans quelques minutes.'
      : r.error ?? 'Téléchargement impossible. Réessayez plus tard.');
  }
  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', paddingLeft: 2, marginTop: avecMarge ? 8 : 0 }}>
        Vos factures ({factures.length})
      </div>
      {trierFacturesPatient(factures).map(f => {
        const etat = etatPourBeneficiaire(f);
        const couleur = etat.ton === 'ok' ? C.green : etat.ton === 'attente' ? C.orange : C.gray;
        return (
          <div key={f.id} data-testid="facture-patient" style={{
            background: 'white', border: `1.5px solid ${C.border}`, borderRadius: 18, padding: '14px 16px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>
                🧾 {f.type === 'avoir' ? 'Avoir' : 'Facture'} · {fmtMoisAnnee(f.periode)}
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                N° {f.numero} · {fmtCourt(f.dateEmission)} · {fmtEuro(f.total)}
              </div>
              <span style={{ display: 'inline-block', marginTop: 6, fontSize: 10, fontWeight: 700, color: couleur, background: `${couleur}1A`, padding: '3px 8px', borderRadius: 20 }}>
                {etat.libelle}
              </span>
            </div>
            {f.pdfDisponible ? (
              <button
                data-testid="facture-patient-pdf"
                onClick={() => void ouvrir(f)}
                disabled={enCours === f.id}
                style={{
                  flexShrink: 0, background: 'var(--color-teal)', color: 'white', border: 'none', borderRadius: 12,
                  padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: enCours === f.id ? 'not-allowed' : 'pointer',
                  opacity: enCours === f.id ? 0.6 : 1,
                }}
              >
                {enCours === f.id ? '…' : 'PDF'}
              </button>
            ) : (
              <span style={{ flexShrink: 0, fontSize: 11, color: C.muted }}>PDF en préparation</span>
            )}
          </div>
        );
      })}
    </>
  );
}

export function EcranDocuments({ bilans, participant, programmeActif, documentsPatient, factures, token }: {
  bilans: Bilan[];
  participant: Participant;
  programmeActif: Programme | null;
  documentsPatient: { id: string; titre: string; contenu: string; date_creation: string }[];
  factures: FacturePatient[];
  token: string;
}) {
  const navigate = useNavigate();
  const [genPDF, setGenPDF] = useState(false);
  const [documentsDeplies, setDocumentsDeplies] = useState<Set<string>>(new Set());
  const praticien = loadPraticien();
  const sortedBilans = [...bilans].sort((a, b) => b.date.localeCompare(a.date));
  const carteSanteAutorisee = participant.visibiliteBeneficiaire?.carteSante !== false;
  const hasContent = documentsPatient.length > 0 || factures.length > 0 || sortedBilans.length > 0 || carteSanteAutorisee;

  async function handleExportCarteSante() {
    setGenPDF(true);
    try {
      let s: Record<string, string> = {};
      try { s = JSON.parse(localStorage.getItem('settings_praticien') ?? '{}'); } catch {}
      const settings = {
        prenom: s.prenom ?? '',
        nom: s.nom ?? '',
        titre: s.titre ?? '',
        email: s.email ?? '',
        telephone: s.telephone ?? '',
        societe: s.societe ?? '',
      };
      const date = new Date().toISOString().slice(0, 10);
      await exportCarteSantePatient(
        {
          participant,
          bilans: [...bilans].sort((a, b) => a.date.localeCompare(b.date)),
          contratActif: null,
          programmeActif,
          compteRendus: [],
          settings,
        },
        `Carte-Sante-${participant.prenom}-${participant.nom}-${date}.pdf`
      );
    } finally { setGenPDF(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Fiche complète téléchargeable */}
      {carteSanteAutorisee && (
        <div style={{
          background: 'white', border: '1.5px solid rgba(43,191,191,0.3)',
          borderRadius: 18, padding: '16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.dark, marginBottom: 2 }}>
                📄 Ma carte de santé
              </div>
              <div style={{ fontSize: 12, color: C.muted }}>
                Identité · bilans · profil de santé — à partager avec un médecin
              </div>
            </div>
            <button
              onClick={handleExportCarteSante}
              disabled={genPDF}
              style={{
                background: 'var(--color-teal)', color: 'white',
                border: 'none', borderRadius: 12, padding: '9px 16px',
                fontSize: 13, fontWeight: 600, cursor: genPDF ? 'not-allowed' : 'pointer',
                opacity: genPDF ? 0.6 : 1,
              }}
            >
              {genPDF ? 'Génération…' : 'Télécharger PDF →'}
            </button>
          </div>
        </div>
      )}

      {/* Documents partagés explicitement par le praticien */}
      {documentsPatient.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', paddingLeft: 2 }}>
            Partagé par {praticien.nom.split(' ')[0]} ({documentsPatient.length})
          </div>
          {documentsPatient.map(doc => {
            const deplie = documentsDeplies.has(doc.id);
            const long = doc.contenu.length > 320;
            return (
              <div key={doc.id} style={{
                background: 'white', border: `1.5px solid rgba(43,191,191,0.3)`,
                borderRadius: 18, padding: '18px 16px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>
                      📝 {doc.titre}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                      {fmtCourt(doc.date_creation?.slice(0, 10) ?? '')} · {praticien.nom.split(' ')[0]}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(43,191,191,0.1)', color: C.teal, padding: '3px 8px', borderRadius: 20 }}>
                    Partagé
                  </span>
                </div>
                <div style={{
                  fontSize: 13, color: C.text,
                  maxHeight: !deplie && long ? 150 : undefined,
                  overflow: 'hidden', position: 'relative',
                }}>
                  <MarkdownRendu>{doc.contenu}</MarkdownRendu>
                  {!deplie && long && (
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0, height: 44,
                      background: 'linear-gradient(transparent, white)',
                    }} />
                  )}
                </div>
                {long && (
                  <button
                    onClick={() => setDocumentsDeplies(prev => {
                      const next = new Set(prev);
                      next.has(doc.id) ? next.delete(doc.id) : next.add(doc.id);
                      return next;
                    })}
                    style={{
                      marginTop: 6, background: 'none', border: 'none', padding: 0,
                      fontSize: 12, fontWeight: 700, color: C.teal, cursor: 'pointer',
                    }}
                  >
                    {deplie ? 'Voir moins ▲' : 'Voir plus ▾'}
                  </button>
                )}
              </div>
            );
          })}
        </>
      )}

      {/* Factures et avoirs (point D, D2) */}
      {factures.length > 0 && <SectionFactures factures={factures} token={token} avecMarge={documentsPatient.length > 0} />}

      {/* Bilans — résumé en langage patient */}
      {sortedBilans.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', paddingLeft: 2, marginTop: documentsPatient.length > 0 || factures.length > 0 ? 8 : 0 }}>
            Vos bilans ({sortedBilans.length})
          </div>
          {sortedBilans.map((bilan, i) => {
            const isInitial = bilan.type === 'initial';
            return (
              <div key={bilan.id} style={{
                background: 'white', border: `1px solid ${C.border}`,
                borderRadius: 18, padding: '16px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>
                      📊 {isInitial ? 'Bilan initial' : `Bilan de suivi n°${sortedBilans.length - i}`}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                      {fmtCourt(bilan.date)} · Évaluation par {praticien.nom.split(' ')[0]}
                    </div>
                  </div>
                  {i === 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, background: '#E8F8F8', color: C.teal, padding: '3px 8px', borderRadius: 20 }}>
                      Le plus récent
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.6, marginBottom: bilan.messageClient ? 10 : 0 }}>
                  {[
                    bilan.equilibre?.droite != null && `Équilibre : ${bilan.equilibre.droite.toFixed(1)} s`,
                    bilan.chairStand30 != null && `Force jambes : ${bilan.chairStand30} lever${bilan.chairStand30 > 1 ? 's' : ''}`,
                    bilan.handGrip?.droite != null && `Force des mains : ${bilan.handGrip.droite.toFixed(1)} kg`,
                    bilan.tug3m != null && `Marche : ${bilan.tug3m.toFixed(1)} s`,
                    resultatTm6(bilan.tm6).valeur != null && `Endurance : ${resultatTm6(bilan.tm6).texte}`,
                  ].filter(Boolean).map((line, j) => (
                    <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: C.teal }}>·</span> {String(line)}
                    </div>
                  ))}
                </div>
                {bilan.messageClient && (
                  <div style={{ background: C.bg, borderRadius: 10, padding: '10px 12px', fontSize: 13, color: C.text, fontStyle: 'italic', lineHeight: 1.6 }}>
                    💬 "{bilan.messageClient}"
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {!hasContent && (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.dark, marginBottom: 8 }}>
            Pas encore de documents
          </div>
          <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>
            Les documents que {praticien.nom.split(' ')[0]} partage avec vous<br />apparaîtront ici.
          </div>
        </div>
      )}

      {/* Changer de patient — utile sur un appareil partagé entre plusieurs
          personnes (la session reste sinon mémorisée sur cet appareil). */}
      <button
        onClick={() => { purgerSessionPatient(); navigate('/patient', { replace: true }); }}
        style={{
          width: '100%', padding: '14px 16px', marginTop: 4,
          background: 'none', border: `1px solid ${C.border}`,
          borderRadius: 12, cursor: 'pointer',
          fontSize: 13, fontWeight: 600, color: C.muted,
        }}
      >
        🔄 Changer de bénéficiaire
      </button>
    </div>
  );
}
