import type { Participant, Bilan } from '../../types';
import ComparisonTable from '../charts/ComparisonTable';

interface Props {
  participant: Participant;
  bilan: Bilan;
  initial: Bilan | null;
}

function calcAge(dateNaissance: string): number {
  const today = new Date();
  const birth = new Date(dateNaissance);
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth()) age--;
  return age;
}

function loadSettings() {
  try { return JSON.parse(localStorage.getItem('settings_praticien') || '{}'); } catch { return {}; }
}

export default function PrintableReport({ participant, bilan, initial }: Props) {
  const age = calcAge(participant.dateNaissance);
  const bilanNum = participant.bilans.findIndex(b => b.id === bilan.id) + 1;
  const settings = loadSettings();
  const praticienNom = settings.prenom && settings.nom ? `${settings.prenom} ${settings.nom}` : 'Pierre Clavier';
  const praticienTitre = settings.titre || 'Enseignant APA';
  const praticienEmail = settings.email || '';

  return (
    <div
      id="printable-report"
      style={{ display: 'none', width: '794px', padding: '40px', fontFamily: 'Nunito, sans-serif', background: '#fff' }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '2px solid #1A5F9E' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#0D2B4B', borderRadius: 10, padding: '6px 14px' }}>
          <img src="/logo.png" alt="Mouv'APA" style={{ height: 48, width: 'auto', display: 'block' }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#ffffff', fontFamily: 'Poppins, sans-serif', lineHeight: 1.2 }}>Mouv'APA - Suivis</div>
            <div style={{ fontSize: 11, color: '#2BBFBF' }}>Activité Physique Adaptée</div>
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: '#6B7280' }}>
          <div>Généré le {new Date().toLocaleDateString('fr-FR')}</div>
          <div>{praticienNom}, {praticienTitre}</div>
        </div>
      </div>

      {/* Patient info */}
      <div style={{ background: '#E8F4FD', borderRadius: 12, padding: '16px 20px', marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#0D2B4B' }}>
          FICHE DE SUIVI — {participant.prenom.toUpperCase()} {participant.nom.toUpperCase()}
        </div>
        <div style={{ display: 'flex', gap: 32, marginTop: 8, fontSize: 13, color: '#374151' }}>
          <span>Âge : <strong>{age} ans</strong></span>
          <span>Bilan n° {bilanNum}</span>
          <span>Date : {new Date(bilan.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          {participant.pathologie && <span>Contexte : {participant.pathologie}</span>}
        </div>
      </div>

      {/* Tableau comparatif */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1A5F9E', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
          Résultats comparatifs
        </div>
        <ComparisonTable current={bilan} previous={initial} />
      </div>

      {/* Notes pro */}
      {bilan.notesProfessionnelles && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Notes professionnelles
          </div>
          <div style={{ fontSize: 12, color: '#4B5563', lineHeight: 1.6, padding: '12px 16px', background: '#F9FAFB', borderRadius: 8, borderLeft: '3px solid #1A5F9E' }}>
            {bilan.notesProfessionnelles}
          </div>
        </div>
      )}

      {/* Profil enrichi (bilan initial) */}
      {bilan.profilEnrichi && (() => {
        const p = bilan.profilEnrichi!;
        const stats = [
          p.chutes12mois !== null && `Chutes / 12 mois : ${p.chutes12mois}`,
          p.peurDeTomber !== null && `Peur de tomber : ${p.peurDeTomber}/10`,
          p.douleursNiveau !== null && `Douleur : ${p.douleursNiveau}/10${p.douleursLocalisation ? ` (${p.douleursLocalisation})` : ''}`,
          p.nbMedicaments !== null && `Médicaments / jour : ${p.nbMedicaments}`,
          p.anticoagulants === true && `Anticoagulants : Oui`,
          p.activiteHebdoHeures !== null && `Activité physique : ${p.activiteHebdoHeures}h/sem`,
          p.motivationScore !== null && `Motivation : ${p.motivationScore}/10`,
        ].filter(Boolean) as string[];
        if (stats.length === 0 && !p.objectifsPersonnels && p.questionsPerso.length === 0) return null;
        return (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Profil patient — bilan initial
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', marginBottom: stats.length ? 10 : 0 }}>
              {stats.map((s, i) => (
                <span key={i} style={{ fontSize: 12, color: '#4B5563' }}>{s}</span>
              ))}
            </div>
            {p.objectifsPersonnels && (
              <div style={{ fontSize: 12, color: '#4B5563', lineHeight: 1.6, marginBottom: 6 }}>
                <strong>Objectifs :</strong> {p.objectifsPersonnels}
              </div>
            )}
            {p.questionsPerso.length > 0 && (
              <div style={{ fontSize: 12, color: '#4B5563', lineHeight: 1.8 }}>
                {p.questionsPerso.map(q => (
                  <div key={q.id}><strong>{q.label} :</strong> {q.valeur === null ? '—' : q.valeur === true ? 'Oui' : q.valeur === false ? 'Non' : String(q.valeur)}{q.type === 'note' ? '/10' : ''}</div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Message client */}
      {bilan.messageClient && (
        <div style={{ background: 'linear-gradient(135deg, #E0F7F7, #D1F5F5)', borderRadius: 12, padding: '16px 20px', border: '1px solid #2BBFBF' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0D2B4B', marginBottom: 8 }}>💬 Message pour vous</div>
          <div style={{ fontSize: 13, color: '#1A5F9E', lineHeight: 1.7 }}>{bilan.messageClient}</div>
        </div>
      )}
      {/* Footer RGPD */}
      <div style={{ marginTop: 28, paddingTop: 10, borderTop: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 9, color: '#9CA3AF' }}>
          Données traitées conformément au RGPD{praticienEmail ? ` · Droit d'accès et de rectification : ${praticienEmail}` : ''}
        </div>
        {participant.rgpd?.consentementObtenu && (
          <div style={{ fontSize: 9, color: '#9CA3AF' }}>
            Consentement obtenu le {new Date(participant.rgpd.consentementDate).toLocaleDateString('fr-FR')}
          </div>
        )}
      </div>
    </div>
  );
}
