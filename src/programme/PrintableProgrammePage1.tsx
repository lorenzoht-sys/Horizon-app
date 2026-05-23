import { useState, useEffect } from 'react';
import type { Participant, Programme, Exercice, CategorieExercice } from '../types';

interface Props {
  participant: Participant;
  programme: Programme;
  exercices: Exercice[];
}

const CAT: Record<CategorieExercice, { icon: string; label: string; color: string }> = {
  equilibre: { icon: '↕',  label: 'Équilibre', color: '#185FA5' },
  force:     { icon: '💪', label: 'Force',      color: '#3B6D11' },
  mobilite:  { icon: '🔄', label: 'Mobilité',   color: '#BA7517' },
  souplesse: { icon: '🤸', label: 'Souplesse',  color: '#993556' },
  endurance: { icon: '🚶', label: 'Endurance',  color: '#0F6E56' },
  memoire:   { icon: '🧠', label: 'Mémoire',    color: '#534AB7' },
};

const JOURS = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const NIVEAUX = { debutant: 'Débutant', intermediaire: 'Intermédiaire', avance: 'Avancé' };

export default function PrintableProgrammePage1({ participant, programme, exercices }: Props) {
  const [logoSrc, setLogoSrc] = useState('/logo.png');
  const sorted = [...programme.exercices].sort((a, b) => a.ordre - b.ordre);

  useEffect(() => {
    fetch('/logo.png')
      .then(r => r.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onload = e => setLogoSrc(e.target?.result as string);
        reader.readAsDataURL(blob);
      })
      .catch(() => {});
  }, []);

  return (
    <div
      id="pp-page1"
      style={{
        display: 'none',
        width: '794px',
        padding: '40px',
        fontFamily: 'Nunito, sans-serif',
        background: '#ffffff',
        boxSizing: 'border-box',
        color: '#111827',
      }}
    >
      {/* ── EN-TÊTE ── */}
      <div style={{
        background: '#0D2B4B', borderRadius: 12,
        padding: '16px 22px', marginBottom: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={logoSrc} alt="" style={{ height: 44, width: 'auto', display: 'block' }} />
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 16, lineHeight: 1.2 }}>Mouv'APA - Suivis</div>
            <div style={{ color: '#2BBFBF', fontSize: 11, marginTop: 2 }}>mouvapa.com</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 20, lineHeight: 1.2 }}>
            {participant.prenom} {participant.nom}
          </div>
          <div style={{ color: '#93C5FD', fontSize: 12, marginTop: 3 }}>{programme.titre}</div>
          <div style={{ color: '#93C5FD', fontSize: 12, marginTop: 1 }}>
            Depuis le {new Date(programme.dateDebut).toLocaleDateString('fr-FR')}
          </div>
        </div>
      </div>

      {/* ── OBJECTIF ── */}
      {programme.objectif && (
        <div style={{
          borderLeft: '4px solid #639922', paddingLeft: 14,
          marginBottom: 12,
        }}>
          <div style={{ fontWeight: 700, color: '#3B6D11', fontSize: 13, marginBottom: 2 }}>🎯 Objectif</div>
          <div style={{ color: '#374151', fontSize: 13, lineHeight: 1.5 }}>{programme.objectif}</div>
        </div>
      )}

      {/* ── MESSAGE DE PIERRE ── */}
      {programme.messageMotivation && (
        <div style={{
          borderLeft: '4px solid #2BBFBF', paddingLeft: 14, marginBottom: 20,
        }}>
          <div style={{ color: '#085041', fontSize: 13, fontStyle: 'italic', lineHeight: 1.6 }}>
            💌 &ldquo;{programme.messageMotivation}&rdquo;
          </div>
        </div>
      )}

      {/* ── EXERCICES ── */}
      {sorted.map((ep, idx) => {
        const ex = exercices.find(e => e.id === ep.exerciceId);
        if (!ex) return null;
        const cat = CAT[ex.categorie];
        const series = `${ep.series} série${ep.series > 1 ? 's' : ''} · ${ep.repetitions ? ep.repetitions + ' rép.' : ep.dureeSecondes + 's'}`;

        return (
          <div
            key={ep.exerciceId}
            style={{
              background: '#ffffff',
              border: '1px solid #E8F4FD',
              borderRadius: 12,
              padding: '14px 18px',
              marginBottom: 10,
            }}
          >
            {/* EN-TÊTE : titre + séries */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#0D2B4B', lineHeight: 1.3 }}>
                {idx + 1}. {ex.nom}
              </span>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#666', whiteSpace: 'nowrap', marginLeft: 14 }}>
                {series}
              </span>
            </div>

            {/* CATÉGORIE — texte simple */}
            <span style={{ fontSize: 12, color: cat.color, display: 'inline-block', marginBottom: 10 }}>
              {cat.icon} {cat.label}
            </span>

            {/* SÉPARATEUR */}
            <div style={{ borderTop: '1px solid #E8F4FD', marginBottom: 10 }} />

            {/* DESCRIPTION */}
            <p style={{ fontSize: 13, color: '#333', margin: '0 0 4px', lineHeight: 1.5 }}>
              {ex.description}
            </p>

            {/* NIVEAU */}
            <p style={{ fontSize: 12, color: '#1A5F9E', fontStyle: 'italic', margin: '0 0 8px' }}>
              {NIVEAUX[ep.niveau]} : {ex.niveaux[ep.niveau]}
            </p>

            {/* ALERTE SÉCURITÉ */}
            {ex.consigneSecurite && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', margin: '0 0 6px' }}>
                <span style={{ fontSize: 13 }}>⚠️</span>
                <span style={{ fontSize: 12, color: '#993C1D', lineHeight: 1.5 }}>{ex.consigneSecurite}</span>
              </div>
            )}

            {/* CITATION PIERRE */}
            {ep.notePersonnalisee && (
              <p style={{ fontSize: 12, color: '#555', fontStyle: 'italic', margin: '0 0 10px' }}>
                &ldquo;{ep.notePersonnalisee}&rdquo;
              </p>
            )}

            {/* JOURS — texte souligné, pas de bulle */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
              {[1, 2, 3, 4, 5, 6, 7].map(d => {
                const actif = ep.frequenceParSemaine.includes(d);
                return (
                  <span key={d} style={{
                    fontSize: 11,
                    fontWeight: actif ? 600 : 400,
                    color: actif ? '#1A5F9E' : '#B4B2A9',
                    borderBottom: actif ? '2px solid #1A5F9E' : 'none',
                    padding: '2px 4px',
                  }}>
                    {JOURS[d]}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
