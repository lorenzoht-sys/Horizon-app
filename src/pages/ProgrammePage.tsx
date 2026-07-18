import { useState, useMemo, useEffect } from 'react';
import type { CSSProperties } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { ArrowLeft, Plus, Bot, Trash2, ChevronLeft, X, Activity } from 'lucide-react';
import { useParticipants } from '../hooks/useParticipants';
import { useProgramme } from '../hooks/useProgramme';
import { useProgrammeV2 } from '../hooks/useProgrammeV2';
import { useActivitesHorsProgramme } from '../hooks/useActivitesHorsProgramme';
import PageWrapper from '../components/layout/PageWrapper';
import { toast } from 'sonner';
import type { JourProgramme, ProgrammeV2, Participant, Bilan } from '../types';
import { JOURS_PROGRAMME as JP } from '../types';
import { loadExercicesPraticien } from '../data/exercices';
import { TESTS_ETALONS } from '../data/testsEtalons';
import type { Exercice } from '../types';
import {
  genererQuestionsClarification, genererProgrammeStructure, versPayloadCreateProgramme,
  type ProgrammeIA,
} from '../utils/genererProgrammeIA';
import {
  ProgrammeWizardModal, EMPTY_WIZARD, inputStyle, labelStyle,
  btnPrimary, btnSecondary, NIVEAU_STYLE, JOUR_COURT,
  type WizardData, type FormSeance,
} from '../components/programme/ProgrammeWizard';

function progV2ToWizard(prog: ProgrammeV2): WizardData {
  const seances: FormSeance[] = prog.seances
    .sort((a, b) => a.ordre - b.ordre)
    .map(s => ({
      tempId: s.id,
      nom: s.nom,
      exercices: s.exercices
        .sort((a, b) => a.ordre - b.ordre)
        .map(ex => ({
          tempId: ex.id,
          nom: ex.nom,
          categorie: ex.categorie ?? 'Équilibre',
          description: ex.description ?? '',
          conseilSecurite: ex.conseilSecurite ?? '',
          mode: (ex.dureeSecondes != null && (ex.series == null || ex.series === undefined))
            ? 'total'
            : ex.dureeSecondes != null
            ? 'duree'
            : 'reps',
          series: ex.series ?? 3,
          repetitions: ex.repetitions ?? 10,
          dureeSecondes: ex.dureeSecondes ?? 30,
          exerciceId: ex.exerciceId,
          niveau: ex.niveau,
        })),
    }));

  const planning: Partial<Record<JourProgramme, string | null>> = {};
  for (const p of prog.planning) {
    planning[p.jour] = p.seanceId;
  }

  return {
    nom: prog.nom,
    type: prog.type,
    objectif: prog.objectif ?? '',
    objectifSeancesAutonomes: prog.objectifSeancesAutonomes != null ? String(prog.objectifSeancesAutonomes) : '',
    messageMotivation: prog.messageMotivation ?? '',
    seances,
    planning,
  };
}

// ── Génération de programme par IA ───────────────────────────────────────────

interface ConfigIA {
  objectif: string;
  objectifPersonnalise: string;
  frequence: number;
  duree: number;
  niveau: 1 | 2 | 3;
}

const EMPTY_CONFIG_IA: ConfigIA = {
  objectif: 'equilibre',
  objectifPersonnalise: '',
  frequence: 3,
  duree: 45,
  niveau: 2,
};

const OBJECTIFS_IA: { value: string; label: string }[] = [
  { value: 'equilibre',    label: 'Équilibre et prévention des chutes' },
  { value: 'force',        label: 'Renforcement musculaire' },
  { value: 'endurance',    label: 'Endurance et cardio' },
  { value: 'souplesse',    label: 'Souplesse et mobilité' },
  { value: 'autonomie',    label: 'Autonomie quotidienne' },
  { value: 'confiance',    label: "Confiance et reprise d'activité" },
  { value: 'personnalise', label: 'Personnalisé' },
];

const JOURS_IA: JourProgramme[] = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

function calcAgeIA(dateNaissance: string): number {
  if (!dateNaissance) return 0;
  return Math.floor((Date.now() - new Date(dateNaissance).getTime()) / (365.25 * 24 * 3600 * 1000));
}

function ConfigIAModal({
  participant, config, onChange, onGenerer, onClose, generating, error,
  questions, chargementQuestions, reponses, onReponseChange,
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
}) {
  const age = calcAgeIA(participant.dateNaissance);

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
              Pour {participant.prenom} {participant.nom} · {age} ans{participant.pathologie ? ` · ${participant.pathologie}` : ''}
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

function PreviewIAModal({
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
  const nbSeancesSemaine = JOURS_IA.filter(j => programme.planning[j] && programme.planning[j] !== 'repos').length;

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
                return (
                  <div key={ei} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                    borderBottom: ei < seance.exercices.length - 1 ? '1px solid #F1F5F9' : 'none',
                  }}>
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

// ── Modale de sélection d'exercice ────────────────────────────────────────────


// ── Carte programme V2 ───────────────────────────────────────────────────────

function ProgrammeCard({ prog, seancesAutonomes, onToggle, onDelete, onEdit }: {
  prog: ProgrammeV2;
  seancesAutonomes: { count: number; dates: string[] } | null;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const jourActifs = JP.filter(j => prog.planning.some(p => p.jour === j));
  const totalEx = prog.seances.reduce((sum, s) => sum + s.exercices.length, 0);
  const date = new Date(prog.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const objectifAutonome = prog.objectifSeancesAutonomes;
  const nbAutonomes = seancesAutonomes?.count ?? 0;
  const pctAutonome = objectifAutonome ? Math.min(100, Math.round((nbAutonomes / objectifAutonome) * 100)) : 0;

  return (
    <div style={{
      background: 'white',
      border: `1px solid ${prog.actif ? 'rgba(43,191,191,0.25)' : '#E5E7EB'}`,
      borderRadius: 16,
      padding: '16px 18px',
      marginBottom: 12,
      opacity: prog.actif ? 1 : 0.7,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#0D2B2B' }}>🏋️ {prog.nom}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: prog.actif ? '#DCFCE7' : '#F1F5F9',
              color: prog.actif ? '#16A34A' : '#6B7280',
            }}>
              {prog.actif ? '✅ Actif' : 'Inactif'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 6 }}>
            {jourActifs.length > 0
              ? jourActifs.map(j => JOUR_COURT[j]).join(' · ')
              : 'Pas de planning'
            }
            {totalEx > 0 && ` · ${totalEx} exercice${totalEx > 1 ? 's' : ''}`}
          </div>
          <div style={{ fontSize: 11, color: '#CBD5E1' }}>Mis à jour le {date}</div>
        </div>
      </div>

      {objectifAutonome && (
        <div style={{ background: '#F8FBFB', border: '1px solid #E0EEEE', borderRadius: 12, padding: '10px 12px', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 6 }}>
            <span style={{ fontWeight: 700, color: '#0D2B2B' }}>🏃 Séances autonomes</span>
            <span style={{ fontWeight: 700, color: 'var(--color-teal)' }}>{nbAutonomes} / {objectifAutonome}</span>
          </div>
          <div style={{ height: 6, background: '#E0EEEE', borderRadius: 6, overflow: 'hidden', marginBottom: seancesAutonomes?.dates.length ? 8 : 0 }}>
            <div style={{ height: '100%', width: `${pctAutonome}%`, background: 'var(--color-teal)', borderRadius: 6, transition: 'width 0.4s ease' }} />
          </div>
          {seancesAutonomes && seancesAutonomes.dates.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
              {seancesAutonomes.dates.map(d => (
                <span key={d} style={{ fontSize: 10, color: '#64748B', background: 'white', border: '1px solid #E0EEEE', borderRadius: 6, padding: '2px 6px' }}>
                  {new Date(d + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
        <button onClick={onEdit} style={{ ...btnSmall, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
          ✏️ Modifier
        </button>
        <button onClick={onToggle} style={{
          ...btnSmall,
          background: prog.actif ? '#FEF3C7' : '#DCFCE7',
          color: prog.actif ? '#92400E' : '#166534',
          border: prog.actif ? '1px solid #FDE68A' : '1px solid #BBF7D0',
        }}>
          {prog.actif ? 'Désactiver' : 'Activer'}
        </button>
        {confirmDelete ? (
          <>
            <button onClick={onDelete} style={{ ...btnSmall, background: '#FEE2E2', color: '#991B1B', border: '1px solid #FECACA' }}>
              Confirmer la suppression
            </button>
            <button onClick={() => setConfirmDelete(false)} style={{ ...btnSmall }}>Annuler</button>
          </>
        ) : (
          <button onClick={() => setConfirmDelete(true)} style={{ ...btnSmall }}>
            <Trash2 size={11} /> Supprimer
          </button>
        )}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const btnSmall: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: '#F1F5F9',
  color: '#374151',
  border: '1px solid #E5E7EB',
  borderRadius: 8,
  padding: '5px 10px',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
};

// ── Activités hors programme (tests étalons & exercices libres) ───────────────
// Complément ponctuel au programme structuré ci-dessus. Rien n'est visible
// côté patient sans activation explicite ici, pour CE patient précisément.

function SectionActivitesHorsProgramme({ participant, hook }: {
  participant: Participant;
  hook: ReturnType<typeof useActivitesHorsProgramme>;
}) {
  const {
    loading, testsActivations, testsResultats,
    exercicesActivations, exercicesValidations,
    toggleTestEtalon, assignerExerciceLibre, toggleExerciceLibre,
  } = hook;
  const [confirmActivation, setConfirmActivation] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  if (loading) return <div className="text-center py-12 text-gray-400">Chargement…</div>;

  return (
    <div className="space-y-6">
      {/* Tests étalons chronométrés */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-3">
          Tests étalons chronométrés
        </div>
        <div className="space-y-2">
          {TESTS_ETALONS.map(test => {
            const actif = testsActivations[test.id] ?? false;
            const resultats = testsResultats.filter(r => r.testId === test.id).sort((a, b) => a.dateTest.localeCompare(b.dateTest));
            const chartData = resultats.map(r => ({
              date: new Date(r.dateTest + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
              valeur: r.valeur,
            }));
            const pendingConfirm = confirmActivation === test.id;
            return (
              <div key={test.id} className="rounded-xl border border-gray-200/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-[14px] text-gray-800">{test.nom}</div>
                    <div className="text-[12px] text-gray-400">{test.dureeSecondes}s · {test.unite}</div>
                  </div>
                  {!pendingConfirm && (
                    <button
                      onClick={() => actif ? toggleTestEtalon(test.id, false) : setConfirmActivation(test.id)}
                      className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border ${actif ? 'bg-[#DCFCE7] text-[#166534] border-[#BBF7D0]' : 'bg-gray-100 text-gray-600 border-gray-200'}`}
                    >
                      {actif ? 'Activé' : 'Désactivé'}
                    </button>
                  )}
                </div>
                {pendingConfirm && (
                  <div className="mt-3 rounded-lg bg-[#FFF7E6] border border-[#FDE68A] p-3 text-[12px] text-[#92400E]">
                    ⚠️ Vérifiez l'absence de contre-indication chez {participant.prenom} avant d'activer ce test physique.
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => { void toggleTestEtalon(test.id, true); setConfirmActivation(null); }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
                        style={{ background: 'var(--color-teal)' }}
                      >
                        Activer
                      </button>
                      <button onClick={() => setConfirmActivation(null)} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200">
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
                {chartData.length >= 2 ? (
                  <div className="mt-3">
                    <ResponsiveContainer width="100%" height={120}>
                      <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }} />
                        <Line type="monotone" dataKey="valeur" stroke="var(--color-teal)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : resultats.length > 0 && (
                  <div className="mt-2 text-[12px] text-gray-500">
                    Dernier résultat : {resultats[resultats.length - 1].valeur} {test.unite}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Exercices libres hors programme */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
            Exercices libres hors programme
          </div>
          <button
            onClick={() => setShowPicker(true)}
            className="text-xs font-medium text-primary border border-primary/30 hover:bg-primary/5 px-3 py-1.5 rounded-lg transition-colors"
          >
            + Assigner un exercice
          </button>
        </div>
        {exercicesActivations.length === 0 ? (
          <div className="text-[13px] text-gray-400">Aucun exercice libre assigné pour le moment.</div>
        ) : (
          <div className="space-y-2">
            {exercicesActivations.map(ex => {
              const dernier = exercicesValidations
                .filter(v => v.exerciceId === ex.exerciceId && v.fait)
                .sort((a, b) => b.date.localeCompare(a.date))[0];
              return (
                <div key={ex.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200/70 p-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-[14px] text-gray-800">{ex.nom}</div>
                    <div className="text-[12px] text-gray-400">
                      {dernier
                        ? `Dernière fois fait : ${new Date(dernier.date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
                        : 'Jamais marqué fait'}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleExerciceLibre(ex.exerciceId, !ex.actif)}
                    className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border ${ex.actif ? 'bg-[#DCFCE7] text-[#166534] border-[#BBF7D0]' : 'bg-gray-100 text-gray-600 border-gray-200'}`}
                  >
                    {ex.actif ? 'Activé' : 'Désactivé'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showPicker && (
        <PickerExerciceLibreModal
          onClose={() => setShowPicker(false)}
          onPick={async ex => { await assignerExerciceLibre(ex); setShowPicker(false); }}
        />
      )}
    </div>
  );
}

function PickerExerciceLibreModal({ onClose, onPick }: {
  onClose: () => void;
  onPick: (ex: Exercice) => void;
}) {
  const [search, setSearch] = useState('');
  const [allExercices, setAllExercices] = useState<Exercice[]>([]);
  useEffect(() => { loadExercicesPraticien().then(setAllExercices); }, []);
  const filtered = useMemo(() => allExercices.filter(ex => {
    if (!search) return true;
    const q = search.toLowerCase();
    return ex.nom.toLowerCase().includes(q) || (ex.description ?? '').toLowerCase().includes(q);
  }), [allExercices, search]);

  return (
    <div className="fixed inset-0 bg-black/50 z-[1200] flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-[480px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="font-semibold text-[15px] text-[#0D2B2B]">Assigner un exercice libre</div>
          <button onClick={onClose} className="text-gray-400"><X size={18} /></button>
        </div>
        <div className="p-4 border-b border-gray-100 flex-shrink-0">
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un exercice…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Aucun exercice correspondant</div>
          ) : filtered.map(ex => (
            <div key={ex.id} className="flex items-center justify-between gap-3 border border-gray-100 rounded-lg p-2.5">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-gray-800">{ex.nom}</div>
                <div className="text-[11px] text-gray-400 truncate">{ex.description}</div>
              </div>
              <button
                onClick={() => onPick(ex)}
                className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
                style={{ background: 'var(--color-teal)' }}
              >
                Assigner
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function ProgrammePage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { participants } = useParticipants();
  const { programmes: progsV2, loading, seancesAutonomesStats, createProgramme, updateProgramme, toggleActif, deleteProgrammeV2 } = useProgrammeV2(id!);
  const { programmes: progsV1, programmeActif: progV1Actif } = useProgramme(id!);
  const activitesHorsProgramme = useActivitesHorsProgramme(id!);

  const participant = participants.find(p => p.id === id);

  // Handoff depuis "Mon assistant" (AssistantPage.tsx) : programme déjà
  // généré (mêmes fonctions partagées, voir genererProgrammeIA.ts), on
  // rouvre directement l'écran de relecture existant plutôt que d'en
  // construire un second. On efface l'état de navigation après lecture pour
  // ne pas rouvrir la preview sur un retour arrière / rechargement.
  const [showPreviewIA, setShowPreviewIA] = useState(false);
  const [programmePreview, setProgrammePreview] = useState<ProgrammeIA | null>(null);
  useEffect(() => {
    const state = location.state as { programmeGenereIA?: ProgrammeIA } | null;
    if (state?.programmeGenereIA) {
      setProgrammePreview(state.programmeGenereIA);
      setShowPreviewIA(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [wizardData, setWizardData] = useState<WizardData>(EMPTY_WIZARD);
  const [saving, setSaving] = useState(false);
  const [editingProgId, setEditingProgId] = useState<string | null>(null);

  const [showConfigIA, setShowConfigIA] = useState(false);
  const [configIA, setConfigIA] = useState<ConfigIA>(EMPTY_CONFIG_IA);
  const [generatingIA, setGeneratingIA] = useState(false);
  const [errorIA, setErrorIA] = useState<string | null>(null);
  const [savingIA, setSavingIA] = useState(false);

  // Questions de clarification (genererQuestionsClarification) — un échec au
  // chargement n'empêche pas de générer : questions reste un tableau vide.
  const [questionsIA, setQuestionsIA] = useState<string[]>([]);
  const [reponsesIA, setReponsesIA] = useState<string[]>([]);
  const [chargementQuestionsIA, setChargementQuestionsIA] = useState(false);

  function updateConfigIA(patch: Partial<ConfigIA>) {
    setConfigIA(prev => ({ ...prev, ...patch }));
  }

  function updateReponseIA(index: number, valeur: string) {
    setReponsesIA(prev => {
      const next = [...prev];
      next[index] = valeur;
      return next;
    });
  }

  async function ouvrirConfigIA() {
    setConfigIA(EMPTY_CONFIG_IA);
    setErrorIA(null);
    setShowConfigIA(true);
    setQuestionsIA([]);
    setReponsesIA([]);
    if (!participant) return;
    setChargementQuestionsIA(true);
    try {
      const questions = await genererQuestionsClarification(participant);
      setQuestionsIA(questions);
      setReponsesIA(questions.map(() => ''));
    } catch {
      // Non bloquant — Pierre peut générer sans réponses de clarification.
      setQuestionsIA([]);
    } finally {
      setChargementQuestionsIA(false);
    }
  }

  function fermerConfigIA() {
    setShowConfigIA(false);
    setErrorIA(null);
  }

  async function genererProgrammeIA() {
    if (!participant) return;
    if (configIA.objectif === 'personnalise' && !configIA.objectifPersonnalise.trim()) {
      setErrorIA("Précisez l'objectif personnalisé.");
      return;
    }

    setGeneratingIA(true);
    setErrorIA(null);

    try {
      const bilans = (participant.bilans ?? []) as Bilan[];
      const dernierBilan = bilans.length
        ? [...bilans].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
        : null;

      const objectifLabel = configIA.objectif === 'personnalise'
        ? (configIA.objectifPersonnalise || 'objectif personnalisé du patient')
        : OBJECTIFS_IA.find(o => o.value === configIA.objectif)?.label ?? configIA.objectif;

      const reponsesTexte = questionsIA
        .map((q, i) => (reponsesIA[i]?.trim() ? `- ${q}\n  Réponse : ${reponsesIA[i].trim()}` : null))
        .filter(Boolean)
        .join('\n');

      const catalogue = await loadExercicesPraticien();

      const parsed = await genererProgrammeStructure(
        participant,
        { objectif: objectifLabel, frequence: configIA.frequence, duree: configIA.duree, niveau: configIA.niveau },
        reponsesTexte,
        catalogue,
        dernierBilan,
        progsV2,
      );

      setProgrammePreview(parsed);
      setShowConfigIA(false);
      setShowPreviewIA(true);
    } catch (err: any) {
      setErrorIA(err?.message || "Une erreur est survenue lors de la génération.");
    } finally {
      setGeneratingIA(false);
    }
  }

  function fermerPreviewIA() {
    setShowPreviewIA(false);
    setProgrammePreview(null);
  }

  function modifierConfigDepuisPreview() {
    setShowPreviewIA(false);
    setShowConfigIA(true);
  }

  async function regenererIA() {
    setShowPreviewIA(false);
    setProgrammePreview(null);
    setShowConfigIA(true);
    await genererProgrammeIA();
  }

  async function handleValiderEtCreerIA() {
    if (!programmePreview) return;
    setSavingIA(true);
    try {
      const payload = versPayloadCreateProgramme(programmePreview, 'domicile', uuidv4);
      const ok = await createProgramme(payload);

      if (ok) {
        toast.success('Programme généré et créé avec succès 🎉');
        setShowPreviewIA(false);
        setProgrammePreview(null);
        setShowConfigIA(false);
        setConfigIA(EMPTY_CONFIG_IA);
      } else {
        toast.error('Erreur lors de la création du programme');
      }
    } catch {
      toast.error('Erreur lors de la création du programme');
    } finally {
      setSavingIA(false);
    }
  }

  function updateWizard(patch: Partial<WizardData>) {
    setWizardData(prev => ({ ...prev, ...patch }));
  }

  function openWizard() {
    setWizardData(EMPTY_WIZARD);
    setEditingProgId(null);
    setStep(1);
    setShowWizard(true);
  }

  function openEditWizard(prog: ProgrammeV2) {
    setWizardData(progV2ToWizard(prog));
    setEditingProgId(prog.id);
    setStep(1);
    setShowWizard(true);
  }

  function closeWizard() {
    setShowWizard(false);
    setEditingProgId(null);
    setStep(1);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const objectifSeancesAutonomes = wizardData.objectifSeancesAutonomes.trim()
        ? Number(wizardData.objectifSeancesAutonomes)
        : undefined;
      const payload = {
        nom: wizardData.nom,
        objectif: wizardData.objectif || undefined,
        objectifSeancesAutonomes: objectifSeancesAutonomes != null && objectifSeancesAutonomes > 0 ? objectifSeancesAutonomes : undefined,
        messageMotivation: wizardData.messageMotivation || undefined,
        type: wizardData.type,
        seances: wizardData.seances.map(s => ({
          tempId: s.tempId,
          nom: s.nom,
          exercices: s.exercices.map(ex => ({
            nom: ex.nom,
            categorie: ex.categorie || undefined,
            description: ex.description || undefined,
            conseilSecurite: ex.conseilSecurite || undefined,
            series: ex.mode !== 'total' ? ex.series : undefined,
            repetitions: ex.mode === 'reps' ? ex.repetitions : undefined,
            dureeSecondes: (ex.mode === 'duree' || ex.mode === 'total') ? ex.dureeSecondes : undefined,
            exerciceId: ex.exerciceId || undefined,
            niveau: ex.niveau || undefined,
          })),
        })),
        planning: wizardData.planning,
      };

      if (editingProgId) {
        const ok = await updateProgramme(editingProgId, payload);
        if (ok) {
          toast.success('Programme mis à jour !');
          closeWizard();
        } else {
          toast.error('Erreur lors de la mise à jour');
        }
      } else {
        const ok = await createProgramme(payload);
        if (ok) {
          toast.success('Programme créé et partagé avec le bénéficiaire !');
          closeWizard();
        } else {
          toast.error('Erreur lors de la création du programme');
        }
      }
    } finally {
      setSaving(false);
    }
  }

  if (!participant) {
    return <PageWrapper><div className="text-center py-20 text-gray-400">Participant introuvable</div></PageWrapper>;
  }

  // V1 programmes without a type (old flat structure)
  const progsV1Only = progsV1.filter(p => !progsV2.some(p2 => p2.id === p.id));

  return (
    <PageWrapper>
      <Link to={`/participant/${id}`} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-primary mb-6 transition-colors">
        <ArrowLeft size={15} />
        {participant.prenom} {participant.nom}
      </Link>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0D2B2B', marginBottom: 2 }}>
            Programmes de {participant.prenom} {participant.nom}
          </h1>
          <p style={{ fontSize: 13, color: '#94A3B8' }}>
            {progsV2.filter(p => p.actif).length + (progV1Actif ? 1 : 0)} programme{progsV2.filter(p => p.actif).length > 1 ? 's' : ''} actif{progsV2.filter(p => p.actif).length > 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={ouvrirConfigIA}
            style={{ ...btnSecondary, gap: 6 }}
          >
            <Bot size={14} /> Générer avec l'IA
          </button>
          <button onClick={openWizard} style={btnPrimary}>
            <Plus size={14} /> Créer un programme
          </button>
        </div>
      </div>

      {/* Programmes V2 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94A3B8', fontSize: 14 }}>Chargement…</div>
      ) : progsV2.length === 0 && progsV1Only.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'white', border: '1px dashed #E0EEEE', borderRadius: 18 }}>
          <Activity size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.2 }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0D2B2B', marginBottom: 8 }}>Aucun programme</div>
          <div style={{ fontSize: 13, color: '#94A3B8', marginBottom: 20, lineHeight: 1.6 }}>
            Créez un premier programme d'exercices<br />pour {participant.prenom}.
          </div>
          <button onClick={openWizard} style={btnPrimary}><Plus size={14} /> Créer un programme</button>
        </div>
      ) : (
        <>
          {progsV2.filter(p => p.actif).length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                Programmes actifs ({progsV2.filter(p => p.actif).length})
              </h2>
              {progsV2.filter(p => p.actif).map(prog => (
                <ProgrammeCard
                  key={prog.id}
                  prog={prog}
                  seancesAutonomes={seancesAutonomesStats[prog.id] ?? null}
                  onToggle={() => toggleActif(prog.id, false)}
                  onDelete={() => deleteProgrammeV2(prog.id).then(() => toast.success('Programme supprimé'))}
                  onEdit={() => openEditWizard(prog)}
                />
              ))}
            </section>
          )}

          {progsV2.filter(p => !p.actif).length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                Programmes inactifs
              </h2>
              {progsV2.filter(p => !p.actif).map(prog => (
                <ProgrammeCard
                  key={prog.id}
                  prog={prog}
                  seancesAutonomes={seancesAutonomesStats[prog.id] ?? null}
                  onToggle={() => toggleActif(prog.id, true)}
                  onDelete={() => deleteProgrammeV2(prog.id).then(() => toast.success('Programme supprimé'))}
                  onEdit={() => openEditWizard(prog)}
                />
              ))}
            </section>
          )}

          {/* Anciens programmes V1 (sans planning) */}
          {progsV1Only.length > 0 && (
            <section>
              <h2 style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                Anciens programmes
              </h2>
              {progsV1Only.map(p => (
                <div key={p.id} style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#0D2B2B' }}>{p.titre}</div>
                    <div style={{ fontSize: 12, color: '#94A3B8' }}>{p.exercices.length} exercice{p.exercices.length > 1 ? 's' : ''}</div>
                  </div>
                  <span style={{ fontSize: 11, color: '#CBD5E1' }}>Ancien format</span>
                </div>
              ))}
            </section>
          )}
        </>
      )}

      {/* ── Activités complémentaires (tests étalons + exercices libres) ───── */}
      {/* Hors programme structuré ci-dessus — données et tables distinctes,   */}
      {/* simplement regroupées visuellement sur cette même page.             */}
      <div style={{ marginTop: 36, background: 'white', border: '1px solid #E0EEEE', borderRadius: 18, padding: '20px 22px' }}>
        <h2 style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>
          Activités complémentaires
        </h2>
        <SectionActivitesHorsProgramme participant={participant} hook={activitesHorsProgramme} />
      </div>

      {/* ── Wizard overlay ─────────────────────────────────────────────────── */}
      {showWizard && (
        <ProgrammeWizardModal
          step={step}
          onStepChange={setStep}
          data={wizardData}
          onChange={updateWizard}
          onClose={closeWizard}
          onSave={handleSave}
          saving={saving}
          isEditing={!!editingProgId}
          participant={participant}
        />
      )}

      {showConfigIA && participant && (
        <ConfigIAModal
          participant={participant}
          config={configIA}
          onChange={updateConfigIA}
          onGenerer={genererProgrammeIA}
          onClose={fermerConfigIA}
          generating={generatingIA}
          error={errorIA}
          questions={questionsIA}
          chargementQuestions={chargementQuestionsIA}
          reponses={reponsesIA}
          onReponseChange={updateReponseIA}
        />
      )}

      {showPreviewIA && programmePreview && (
        <PreviewIAModal
          programme={programmePreview}
          onChange={setProgrammePreview}
          onValider={handleValiderEtCreerIA}
          onRegenerer={regenererIA}
          onModifierConfig={modifierConfigDepuisPreview}
          onClose={fermerPreviewIA}
          saving={savingIA}
        />
      )}
    </PageWrapper>
  );
}
