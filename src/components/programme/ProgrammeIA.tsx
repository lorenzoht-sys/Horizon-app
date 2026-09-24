import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Bot, X, ChevronLeft, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import type { Participant, JourProgramme } from '../../types';
import type { ProgrammeIA } from '../../utils/genererProgrammeIA';
import { inputStyle, labelStyle, btnPrimary, btnSecondary, NIVEAU_STYLE, JOUR_COURT } from './ProgrammeWizard';
import { libelleAge } from '../../lib/age';
import { useDevice } from '../../hooks/useDevice';

// Écrans de génération de programme par IA — partagés entre ProgrammePage.tsx
// (desktop, bouton "Générer avec l'IA" du header) et ParticipantProfile.tsx
// (mobile, bouton du même nom dans la carte "Programme" vide — la fiche
// fusionnée, seule route mobile où ces écrans sont atteignables : voir
// useProgrammeIA.ts). L'orchestration (state, appels genererProgrammeIA.ts)
// vit dans useProgrammeIA.ts, pas ici — ce fichier ne contient que l'UI.

export interface ConfigIA {
  objectif: string;
  objectifPersonnalise: string;
  frequence: number;
  duree: number;
  niveau: 1 | 2 | 3;
}

export const EMPTY_CONFIG_IA: ConfigIA = {
  objectif: 'equilibre',
  objectifPersonnalise: '',
  frequence: 3,
  duree: 45,
  niveau: 2,
};

export const OBJECTIFS_IA: { value: string; label: string }[] = [
  { value: 'equilibre',    label: 'Équilibre et prévention des chutes' },
  { value: 'force',        label: 'Renforcement musculaire' },
  { value: 'endurance',    label: 'Endurance et cardio' },
  { value: 'souplesse',    label: 'Souplesse et mobilité' },
  { value: 'autonomie',    label: 'Autonomie quotidienne' },
  { value: 'confiance',    label: "Confiance et reprise d'activité" },
  { value: 'personnalise', label: 'Personnalisé' },
];

const JOURS_IA: JourProgramme[] = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

export function ConfigIAModal({
  participant, config, onChange, onGenerer, onClose, generating, error,
  questions, chargementQuestions, reponses, onReponseChange,
  precisionsLibres, onPrecisionsLibresChange,
}: {
  participant: Participant;
  config: ConfigIA;
  onChange: (c: Partial<ConfigIA>) => void;
  onGenerer: () => void;
  onClose: () => void;
  generating: boolean;
  error: string | null;
  /** Questions ciblées sur des capacités absentes du profil — voir
   *  genererQuestionsClarification(). Un échec au chargement n'empêche pas
   *  de générer le programme (tableau vide, pas de blocage). */
  questions: string[];
  chargementQuestions: boolean;
  reponses: string[];
  onReponseChange: (index: number, valeur: string) => void;
  /** Texte libre optionnel, en plus des questions ciblées ci-dessus — injecté
   *  dans construirePrompt() (genererProgrammeIA.ts), clairement identifié
   *  pour l'IA. */
  precisionsLibres: string;
  onPrecisionsLibresChange: (valeur: string) => void;
}) {
  const age = libelleAge(participant.dateNaissance);

  const chip = (active: boolean): CSSProperties => ({
    flex: 1, padding: '9px 6px', fontSize: 13, fontWeight: 700, borderRadius: 10,
    cursor: 'pointer', textAlign: 'center',
    border: active ? '2px solid var(--color-teal)' : '1px solid #E0EEEE',
    background: active ? '#F0F9F9' : 'white',
    color: active ? 'var(--color-teal)' : '#6B7280',
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', zIndex: 1100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
      <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        <div style={{ background: 'var(--color-ink)', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'white' }}>🤖 Générer un programme avec l'IA</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
              Pour {participant.prenom} {participant.nom} · {age}{participant.pathologie ? ` · ${participant.pathologie}` : ''}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>L'IA s'adaptera automatiquement au profil du bénéficiaire.</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer', color: 'white', flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18, maxHeight: '64vh', overflowY: 'auto' }}>
          {generating ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🤖</div>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#0D2B2B' }}>L'IA génère le programme…</p>
              <p style={{ fontSize: 13, color: '#94A3B8', marginTop: 6 }}>Analyse du profil de {participant.prenom} en cours (quelques secondes).</p>
            </div>
          ) : (
            <>
              <div>
                <label style={labelStyle}>Objectif principal *</label>
                <select value={config.objectif} onChange={e => onChange({ objectif: e.target.value })} style={inputStyle}>
                  {OBJECTIFS_IA.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {config.objectif === 'personnalise' && (
                  <input
                    value={config.objectifPersonnalise}
                    onChange={e => onChange({ objectifPersonnalise: e.target.value })}
                    placeholder="Décrivez l'objectif souhaité…"
                    style={{ ...inputStyle, marginTop: 8 }}
                  />
                )}
              </div>

              <div>
                <label style={labelStyle}>Fréquence *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[2, 3, 4, 5].map(f => (
                    <button key={f} type="button" onClick={() => onChange({ frequence: f })} style={chip(config.frequence === f)}>{f}x/sem</button>
                  ))}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Durée par séance *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[30, 45, 60, 90].map(d => (
                    <button key={d} type="button" onClick={() => onChange({ duree: d })} style={chip(config.duree === d)}>{d} min</button>
                  ))}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Niveau de difficulté *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {([1, 2, 3] as const).map(n => {
                    const s = NIVEAU_STYLE[String(n) as '1' | '2' | '3'];
                    return (
                      <button key={n} type="button" onClick={() => onChange({ niveau: n })} style={chip(config.niveau === n)}>
                        {s.emoji} {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ borderTop: '1px solid #E0EEEE', paddingTop: 14 }}>
                <label style={labelStyle}>Quelques précisions sur {participant.prenom}</label>
                {chargementQuestions ? (
                  <p style={{ fontSize: 12, color: '#94A3B8' }}>Préparation des questions…</p>
                ) : questions.length === 0 ? (
                  <p style={{ fontSize: 12, color: '#94A3B8' }}>
                    Aucune question complémentaire — le profil enregistré suffit.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {questions.map((q, i) => (
                      <div key={i}>
                        <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>{q}</div>
                        <input
                          value={reponses[i] ?? ''}
                          onChange={e => onReponseChange(i, e.target.value)}
                          placeholder="Votre réponse (facultatif)…"
                          style={inputStyle}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid #E0EEEE', paddingTop: 14 }}>
                <label style={labelStyle}>Autres précisions pour ce programme</label>
                <textarea
                  value={precisionsLibres}
                  onChange={e => onPrecisionsLibresChange(e.target.value)}
                  placeholder="Tout détail utile que les questions ci-dessus n'auraient pas couvert (facultatif)…"
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ borderTop: '1px solid #E0EEEE', paddingTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                  Données transmises à l'IA
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: '#374151' }}>
                  <div>✅ Pathologie et antécédents</div>
                  <div>✅ Traitements et allergies déclarés</div>
                  <div>✅ Derniers scores fonctionnels (si bilan disponible)</div>
                  <div>✅ Programmes existants (pour éviter les doublons)</div>
                </div>
              </div>

              {error && (
                <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#991B1B' }}>
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {!generating && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid #E5E7EB', display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ ...btnSecondary, flex: 1, justifyContent: 'center' }}>Annuler</button>
            <button onClick={onGenerer} style={{ ...btnPrimary, flex: 2, justifyContent: 'center' }}>
              <Bot size={14} /> Générer le programme
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function PreviewIAModal({
  programme, onChange, onValider, onRegenerer, onModifierConfig, onClose, saving,
}: {
  programme: ProgrammeIA;
  onChange: (p: ProgrammeIA) => void;
  onValider: () => void;
  onRegenerer: () => void;
  onModifierConfig: () => void;
  onClose: () => void;
  saving: boolean;
}) {
  const { isMobile } = useDevice();
  const nbSeancesSemaine = JOURS_IA.filter(j => programme.planning[j] && programme.planning[j] !== 'repos').length;

  // Réorganisation des exercices par glisser-déposer — HTML5 natif (draggable
  // + onDragStart/onDragOver/onDrop), pas de librairie : le drag-and-drop de
  // /agenda-v2 (addon react-big-calendar) est spécifique au modèle calendrier
  // (créneaux horaires/dates), non réutilisable pour une simple liste
  // réordonnable. Volontairement limité à l'intérieur d'une même séance
  // (dragInfo.seanceIndex !== si → drop ignoré) : pas de déplacement d'une
  // séance à l'autre, comme demandé.
  const [dragInfo, setDragInfo] = useState<{ seanceIndex: number; exerciceIndex: number } | null>(null);

  function reordonnerExercices(seanceIndex: number, from: number, to: number) {
    if (from === to || to < 0) return;
    const seances = programme.seances.map((s, i) => {
      if (i !== seanceIndex) return s;
      if (to >= s.exercices.length) return s;
      const exercices = [...s.exercices];
      const [deplace] = exercices.splice(from, 1);
      exercices.splice(to, 0, deplace);
      return { ...s, exercices };
    });
    onChange({ ...programme, seances });
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', zIndex: 1150, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
      <div style={{ background: 'white', borderRadius: 20, width: '100%', maxWidth: 640, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>

        <div style={{ padding: '20px 24px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#0D2B2B' }}>🤖 Programme généré — à valider</div>
              <div style={{ fontSize: 13, color: '#94A3B8', marginTop: 2 }}>Vérifiez et ajustez avant de créer le programme</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button onClick={onRegenerer} style={btnSecondary} title="Regénérer avec la même configuration">
                🔄 Regénérer
              </button>
              <button onClick={onClose} style={{ background: '#F1F5F9', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer' }}>
                <X size={16} color="#94A3B8" />
              </button>
            </div>
          </div>
        </div>

        <div style={{ padding: '0 24px', maxHeight: '58vh', overflowY: 'auto' }}>
          {/* Nom et message éditables */}
          <div style={{ marginBottom: 16 }}>
            <input
              value={programme.nom}
              onChange={e => onChange({ ...programme, nom: e.target.value })}
              style={{ fontSize: 16, fontWeight: 700, border: 'none', borderBottom: '1.5px solid var(--color-teal)', width: '100%', padding: '4px 0', outline: 'none', color: '#0D2B2B', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
            />
            <input
              value={programme.message_motivation}
              onChange={e => onChange({ ...programme, message_motivation: e.target.value })}
              placeholder="Message de motivation pour le bénéficiaire…"
              style={{ fontSize: 13, color: '#6B7280', border: 'none', width: '100%', padding: '6px 0', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
            />
          </div>

          {/* Planning visuel */}
          <div style={{ marginBottom: 16, padding: 12, background: '#F8FAFA', borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Planning</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {JOURS_IA.map(jour => {
                const actif = !!programme.planning[jour] && programme.planning[jour] !== 'repos';
                return (
                  <div key={jour} style={{
                    textAlign: 'center', flex: 1, padding: '8px 4px', borderRadius: 8,
                    background: actif ? 'var(--color-teal)' : 'transparent',
                    border: actif ? 'none' : '1px solid #E0EEEE',
                    color: actif ? 'white' : '#94A3B8', fontSize: 11,
                  }}>
                    <div style={{ fontWeight: 700 }}>{JOUR_COURT[jour]}</div>
                    <div style={{ fontSize: 12, marginTop: 2 }}>{actif ? '●' : '○'}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 8, textAlign: 'center' }}>
              {nbSeancesSemaine} séance{nbSeancesSemaine > 1 ? 's' : ''}/semaine
            </div>
          </div>

          {/* Séances et exercices */}
          {programme.seances.map((seance, si) => (
            <div key={si} style={{ marginBottom: 14, border: '1px solid #E0EEEE', borderRadius: 12, padding: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#0D2B2B', marginBottom: 10 }}>{seance.nom}</div>
              {seance.exercices.map((ex, ei) => {
                const niv = (['1', '2', '3'].includes(String(ex.niveau)) ? String(ex.niveau) : '2') as '1' | '2' | '3';
                const s = NIVEAU_STYLE[niv];
                const qty = ex.series && ex.repetitions ? `${ex.series} × ${ex.repetitions} rép.`
                  : ex.series && ex.duree_secondes ? `${ex.series} × ${ex.duree_secondes}s`
                  : ex.duree_secondes ? `${Math.round(ex.duree_secondes / 60)} min` : '';

                // Le drag-and-drop HTML5 natif (desktop, ci-dessous) ne
                // fonctionne pas au toucher sans polyfill dédié. Sur mobile,
                // deux boutons ▲/▼ appellent la MÊME reordonnerExercices() —
                // même capacité de réorganisation, mécanisme adapté au
                // tactile plutôt que supprimé.
                if (isMobile) {
                  return (
                    <div
                      key={ei}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                        borderBottom: ei < seance.exercices.length - 1 ? '1px solid #F1F5F9' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                        <button
                          onClick={() => reordonnerExercices(si, ei, ei - 1)}
                          disabled={ei === 0}
                          aria-label="Monter"
                          style={{ background: 'none', border: 'none', padding: 2, cursor: ei === 0 ? 'default' : 'pointer', opacity: ei === 0 ? 0.25 : 1 }}
                        >
                          <ChevronUp size={14} color="#94A3B8" />
                        </button>
                        <button
                          onClick={() => reordonnerExercices(si, ei, ei + 1)}
                          disabled={ei === seance.exercices.length - 1}
                          aria-label="Descendre"
                          style={{ background: 'none', border: 'none', padding: 2, cursor: ei === seance.exercices.length - 1 ? 'default' : 'pointer', opacity: ei === seance.exercices.length - 1 ? 0.25 : 1 }}
                        >
                          <ChevronDown size={14} color="#94A3B8" />
                        </button>
                      </div>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: s.bg, color: s.color, flexShrink: 0 }}>{s.emoji}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#0D2B2B' }}>{ex.nom}</span>
                        {qty && <span style={{ fontSize: 12, color: '#94A3B8', marginLeft: 8 }}>{qty}</span>}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--color-teal)', flexShrink: 0 }}>{ex.categorie}</span>
                    </div>
                  );
                }

                const enSurvol = dragInfo && dragInfo.seanceIndex === si && dragInfo.exerciceIndex !== ei;
                return (
                  <div
                    key={ei}
                    draggable
                    onDragStart={() => setDragInfo({ seanceIndex: si, exerciceIndex: ei })}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault();
                      if (dragInfo && dragInfo.seanceIndex === si) reordonnerExercices(si, dragInfo.exerciceIndex, ei);
                      setDragInfo(null);
                    }}
                    onDragEnd={() => setDragInfo(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                      borderBottom: ei < seance.exercices.length - 1 ? '1px solid #F1F5F9' : 'none',
                      background: enSurvol ? '#F0F9F9' : 'transparent',
                      cursor: 'grab',
                    }}
                  >
                    <GripVertical size={14} color="#CBD5E1" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: s.bg, color: s.color, flexShrink: 0 }}>{s.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#0D2B2B' }}>{ex.nom}</span>
                      {qty && <span style={{ fontSize: 12, color: '#94A3B8', marginLeft: 8 }}>{qty}</span>}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--color-teal)', flexShrink: 0 }}>{ex.categorie}</span>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Conseils généraux */}
          {programme.conseils_generaux && (
            <div style={{ padding: 12, background: '#E1F5EE', borderRadius: 10, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0F6E56', marginBottom: 4 }}>💡 Conseils généraux</div>
              <div style={{ fontSize: 13, color: '#085041' }}>{programme.conseils_generaux}</div>
            </div>
          )}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #E5E7EB', display: 'flex', gap: 10 }}>
          <button onClick={onModifierConfig} style={btnSecondary}>
            <ChevronLeft size={14} /> Modifier la config
          </button>
          <button onClick={onValider} disabled={saving} style={{ ...btnPrimary, flex: 1, justifyContent: 'center', opacity: saving ? 0.7 : 1 }}>
            {saving ? '⏳ Création en cours…' : '✅ Valider et créer le programme'}
          </button>
        </div>
      </div>
    </div>
  );
}
