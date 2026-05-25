import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useParticipants } from '../hooks/useParticipants';
import { useProgramme } from '../hooks/useProgramme';
import { loadExercices } from '../data/exercices';
import PageWrapper from '../components/layout/PageWrapper';
import ExerciceCard from '../programme/ExerciceCard';
import ExerciceConfigModal from '../programme/ExerciceConfigModal';
import AdherenceChart from '../programme/AdherenceChart';
import SuiviCalendar from '../programme/SuiviCalendar';
import { exportProgrammePDF } from '../utils/exportPDF';
import type { Exercice, ExerciceProgramme, CategorieExercice, ProfilHandicap } from '../types';
import { ArrowLeft, Trash2, Edit2, Save, Plus, Activity, FileDown, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

const CATEGORIES: { value: CategorieExercice | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'equilibre', label: '🔵 Équilibre' },
  { value: 'force', label: '🟢 Force' },
  { value: 'mobilite', label: '🟡 Mobilité' },
  { value: 'souplesse', label: '🟠 Souplesse' },
  { value: 'endurance', label: '🔴 Endurance' },
  { value: 'memoire', label: '🟣 Mémoire' },
];

const PROFILS_HANDICAP: { id: ProfilHandicap; label: string; emoji: string }[] = [
  { id: 'fauteuil_roulant', label: 'Fauteuil roulant', emoji: '♿' },
  { id: 'avc_hemiplegie',   label: 'AVC / Hémiplégie', emoji: '🧠' },
  { id: 'parkinson',        label: 'Parkinson',         emoji: '🫸' },
  { id: 'sep',              label: 'Sclérose en plaques', emoji: '🎗️' },
];

const POSITIONS: { id: string; label: string }[] = [
  { id: 'tous',     label: 'Toutes positions' },
  { id: 'fauteuil', label: '♿ Fauteuil' },
  { id: 'assis',    label: '🪑 Assis' },
  { id: 'debout',   label: '🧍 Debout' },
  { id: 'couche',   label: '🛏 Allongé' },
];

const JOURS_LABEL = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export default function ProgrammePage() {
  const { id } = useParams<{ id: string }>();
  const { participants, updateParticipant } = useParticipants();
  const {
    programmes,
    programmeActif,
    createProgramme,
    addExerciceToProgramme,
    removeExerciceFromProgramme,
    calcAdherence,
    getAdherenceParSemaine,
  } = useProgramme(id!);

  const participant = participants.find(p => p.id === id);
  const exercices = useMemo(() => loadExercices(), []);

  const [catFilter, setCatFilter] = useState<CategorieExercice | 'all'>('all');
  const [profilFilter, setProfilFilter] = useState<ProfilHandicap | null>(participant?.profilHandicap ?? null);
  const [positionFilter, setPositionFilter] = useState('tous');
  const [configTarget, setConfigTarget] = useState<Exercice | null>(null);
  const [editingEp, setEditingEp] = useState<ExerciceProgramme | null>(null);
  const [tab, setTab] = useState<'builder' | 'adherence'>('builder');
  const [exportLoading, setExportLoading] = useState(false);

  // Form new programme
  const [titre, setTitre] = useState('');
  const [objectif, setObjectif] = useState('');
  const [message, setMessage] = useState('');
  const [dateDebut, setDateDebut] = useState(new Date().toISOString().slice(0, 10));
  const [showNewForm, setShowNewForm] = useState(!programmeActif);

  const filteredExercices = exercices.filter(ex => {
    if (catFilter !== 'all' && ex.categorie !== catFilter) return false;
    if (profilFilter) {
      const compatible =
        !ex.profilsCompatibles ||
        ex.profilsCompatibles.includes('tous') ||
        ex.profilsCompatibles.includes(profilFilter);
      if (!compatible) return false;
    }
    if (positionFilter !== 'tous' && ex.positionRequise && ex.positionRequise !== 'tous' && ex.positionRequise !== positionFilter) {
      return false;
    }
    return true;
  });

  function handleProfilChange(profil: ProfilHandicap | null) {
    setProfilFilter(profil);
    setPositionFilter('tous');
    if (id) updateParticipant(id, { profilHandicap: profil ?? undefined });
  }

  async function handleExportPDF() {
    if (!programmeActif || !participant) return;
    setExportLoading(true);
    try {
      const settings = (() => {
        try { return { prenom: '', nom: '', email: '', telephone: '', societe: '', logoPraticien: '', ...JSON.parse(localStorage.getItem('settings_praticien') || '{}') }; }
        catch { return { prenom: '', nom: '', email: '', telephone: '', societe: '', logoPraticien: '' }; }
      })();
      const fileName = `MouvAPA_Programme_${participant.nom}_${participant.prenom}_${programmeActif.dateDebut}.pdf`;
      await exportProgrammePDF({ programme: programmeActif, exercices, participant, settings }, fileName);
      toast.success('Programme PDF exporté !');
    } catch {
      toast.error('Erreur lors de l\'export PDF');
    } finally {
      setExportLoading(false);
    }
  }

  function handleCreateProgramme() {
    if (!titre.trim()) { toast.error('Donnez un titre au programme'); return; }
    createProgramme({ titre, objectif, messageMotivation: message, dateDebut, exercices: [] });
    setShowNewForm(false);
    toast.success('Programme créé !');
  }

  function handleAddExercice(ep: Omit<ExerciceProgramme, 'ordre'>) {
    if (!programmeActif) return;
    addExerciceToProgramme(programmeActif.id, ep);
    toast.success('Exercice ajouté !');
  }

  function calcDureeTotal(prog: typeof programmeActif) {
    if (!prog) return 0;
    return prog.exercices.reduce((acc, ep) => {
      const ex = exercices.find(e => e.id === ep.exerciceId);
      return acc + (ex?.dureeEstimeeMinutes ?? 5);
    }, 0);
  }

  if (!participant) {
    return <PageWrapper><div className="text-center py-20 text-gray-400">Participant introuvable</div></PageWrapper>;
  }

  const adherenceData = programmeActif ? getAdherenceParSemaine(programmeActif) : [];
  const adherenceGlobale = programmeActif ? calcAdherence(programmeActif) : null;

  return (
    <PageWrapper>
      <Link to={`/participant/${id}`} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-primary mb-6 transition-colors">
        <ArrowLeft size={15} />
        {participant.prenom} {participant.nom}
      </Link>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-heading font-bold text-dark text-2xl">Programme d'exercices</h1>
          <p className="text-sm text-gray-500">{participant.prenom} {participant.nom}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {programmeActif && programmeActif.exercices.length > 0 && (
            <button
              onClick={handleExportPDF}
              disabled={exportLoading}
              className="flex items-center gap-2 border border-primary text-primary px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary hover:text-white transition-colors disabled:opacity-60"
            >
              {exportLoading ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />}
              {exportLoading ? 'Génération...' : 'Imprimer le programme'}
            </button>
          )}
          {!showNewForm && (
            <button
              onClick={() => setShowNewForm(true)}
              className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-dark transition-colors"
            >
              <Plus size={15} />
              Nouveau programme
            </button>
          )}
        </div>
      </div>

      {/* Form nouveau programme */}
      {showNewForm && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
          <h2 className="font-heading font-semibold text-dark mb-4">Créer un nouveau programme</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-dark mb-1">Titre du programme *</label>
              <input
                value={titre}
                onChange={e => setTitre(e.target.value)}
                placeholder="ex: Programme Équilibre & Force — T1"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-dark mb-1">Date de début</label>
              <input
                type="date"
                value={dateDebut}
                onChange={e => setDateDebut(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-semibold text-dark mb-1">Objectif</label>
            <input
              value={objectif}
              onChange={e => setObjectif(e.target.value)}
              placeholder="ex: Améliorer l'équilibre et réduire le risque de chute"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div className="mb-5">
            <label className="block text-xs font-semibold text-dark mb-1">Message de motivation pour le patient</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={2}
              placeholder="ex: Bravo d'avoir commencé ! Chaque séance vous rapproche de vos objectifs."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
            />
          </div>
          <div className="flex gap-3">
            {programmeActif && (
              <button onClick={() => setShowNewForm(false)} className="border border-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm hover:bg-gray-50 transition-colors">
                Annuler
              </button>
            )}
            <button onClick={handleCreateProgramme} className="flex items-center gap-2 bg-primary text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-dark transition-colors">
              <Save size={15} />
              Créer le programme
            </button>
          </div>
        </div>
      )}

      {programmeActif && !showNewForm && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
            {(['builder', 'adherence'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-white text-dark shadow-sm' : 'text-gray-500 hover:text-dark'}`}
              >
                {t === 'builder' ? 'Constructeur' : 'Suivi adhérence'}
              </button>
            ))}
          </div>

          {tab === 'builder' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Bibliothèque */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h2 className="font-heading font-semibold text-dark mb-3">Bibliothèque d'exercices</h2>

                {/* Filtres profil handicap */}
                <div className="flex gap-1 flex-wrap mb-2">
                  {PROFILS_HANDICAP.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleProfilChange(profilFilter === p.id ? null : p.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${profilFilter === p.id ? 'bg-teal-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      {p.emoji} {p.label}
                    </button>
                  ))}
                </div>

                {/* Filtre position (visible si profil actif) */}
                {profilFilter && (
                  <div className="flex gap-1 flex-wrap mb-2">
                    {POSITIONS.map(pos => (
                      <button
                        key={pos.id}
                        onClick={() => setPositionFilter(pos.id)}
                        className={`px-2 py-0.5 rounded-lg text-xs font-medium border transition-colors ${positionFilter === pos.id ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                      >
                        {pos.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Filtres catégories */}
                <div className="flex gap-1 flex-wrap mb-3">
                  {CATEGORIES.map(c => (
                    <button
                      key={c.value}
                      onClick={() => setCatFilter(c.value as CategorieExercice | 'all')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${catFilter === c.value ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                <div className="text-xs text-gray-400 mb-2">
                  {filteredExercices.length} exercice{filteredExercices.length > 1 ? 's' : ''}
                  {profilFilter && ' compatibles avec ce profil'}
                </div>

                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {filteredExercices.map(ex => (
                    <ExerciceCard
                      key={ex.id}
                      exercice={ex}
                      onAdd={() => setConfigTarget(ex)}
                      compact
                      profilHandicap={profilFilter ?? undefined}
                    />
                  ))}
                </div>
              </div>

              {/* Programme en cours */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-start justify-between mb-1">
                  <h2 className="font-heading font-semibold text-dark">{programmeActif.titre}</h2>
                </div>
                {programmeActif.objectif && (
                  <p className="text-xs text-gray-500 mb-3">🎯 {programmeActif.objectif}</p>
                )}

                {programmeActif.exercices.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <Activity size={40} className="mx-auto mb-3 opacity-20" />
                    <p className="text-sm">Ajoutez des exercices depuis la bibliothèque</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[440px] overflow-y-auto pr-1">
                    {[...programmeActif.exercices]
                      .sort((a, b) => a.ordre - b.ordre)
                      .map((ep) => {
                        const ex = exercices.find(e => e.id === ep.exerciceId);
                        if (!ex) return null;
                        return (
                          <div key={ep.exerciceId} className="flex items-start gap-3 bg-gray-50 rounded-xl p-3">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-dark text-sm">{ex.nom}</div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                {ep.series} séries
                                {ep.repetitions ? ` × ${ep.repetitions} rép.` : ep.dureeSecondes ? ` × ${ep.dureeSecondes}s` : ''}
                                {' · '}
                                {ep.frequenceParSemaine.map(d => JOURS_LABEL[d]).join(' ')}
                              </div>
                              {ep.notePersonnalisee && (
                                <p className="text-xs text-secondary mt-1 italic">"{ep.notePersonnalisee}"</p>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={() => { setConfigTarget(ex); setEditingEp(ep); }}
                                className="p-1.5 text-gray-400 hover:text-primary transition-colors rounded-lg hover:bg-white"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => { removeExerciceFromProgramme(programmeActif.id, ep.exerciceId); toast.success('Retiré du programme'); }}
                                className="p-1.5 text-gray-400 hover:text-danger transition-colors rounded-lg hover:bg-white"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}

                {programmeActif.exercices.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between text-xs text-gray-500">
                    <span>{programmeActif.exercices.length} exercice{programmeActif.exercices.length > 1 ? 's' : ''}</span>
                    <span>~{calcDureeTotal(programmeActif)} min par séance</span>
                  </div>
                )}

                {programmeActif.messageMotivation && (
                  <div className="mt-4 bg-secondary/10 rounded-xl p-3">
                    <p className="text-xs text-dark italic">💬 "{programmeActif.messageMotivation}"</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'adherence' && (
            <div className="space-y-6">
              {/* Stats globales */}
              {adherenceGlobale && adherenceGlobale.prevu > 0 && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
                    <div className="text-3xl font-heading font-bold text-success">{adherenceGlobale.taux}%</div>
                    <div className="text-xs text-gray-500 mt-1">Adhérence globale</div>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
                    <div className="text-3xl font-heading font-bold text-primary">{adherenceGlobale.fait}</div>
                    <div className="text-xs text-gray-500 mt-1">Séances réalisées</div>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
                    <div className="text-3xl font-heading font-bold text-dark">{adherenceGlobale.prevu}</div>
                    <div className="text-xs text-gray-500 mt-1">Séances prévues</div>
                  </div>
                </div>
              )}

              {/* Graphique adhérence */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h2 className="font-heading font-semibold text-dark mb-4">Adhérence par semaine</h2>
                <AdherenceChart data={adherenceData} />
              </div>

              {/* Calendrier */}
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h2 className="font-heading font-semibold text-dark mb-4">Calendrier des 28 derniers jours</h2>
                <SuiviCalendar programme={programmeActif} />
              </div>

              {/* Ressentis */}
              {(() => {
                const signalements: { date: string; exerciceId: string; ressenti: string; note?: string }[] = [];
                for (const semaine of programmeActif.suiviSemaines) {
                  for (const [date, jours] of Object.entries(semaine.jours)) {
                    for (const j of jours) {
                      if (j.ressenti && j.ressenti !== 'bien') {
                        signalements.push({ date, exerciceId: j.exerciceId, ressenti: j.ressenti, note: j.notePatient });
                      }
                    }
                  }
                }
                if (signalements.length === 0) return null;
                return (
                  <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <h2 className="font-heading font-semibold text-dark mb-3">Ressentis signalés</h2>
                    <div className="space-y-2">
                      {signalements.slice(-10).reverse().map((s, i) => {
                        const ex = exercices.find(e => e.id === s.exerciceId);
                        const badge = s.ressenti === 'douleur' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning';
                        return (
                          <div key={i} className="flex items-start gap-3 text-sm">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge}`}>
                              {s.ressenti === 'douleur' ? '🔴 Douleur' : s.ressenti === 'difficile' ? '🟠 Difficile' : '🟡 Moyen'}
                            </span>
                            <span className="text-gray-700">{ex?.nom ?? s.exerciceId}</span>
                            <span className="text-gray-400 text-xs ml-auto">{new Date(s.date).toLocaleDateString('fr-FR')}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </>
      )}

      {/* Historique des programmes */}
      {programmes.filter(p => !p.actif).length > 0 && (
        <div className="mt-8">
          <h2 className="font-heading font-semibold text-dark mb-3 text-sm text-gray-500 uppercase tracking-wide">Programmes précédents</h2>
          <div className="space-y-2">
            {programmes.filter(p => !p.actif).map(p => (
              <div key={p.id} className="bg-white rounded-xl border border-gray-100 p-4 flex justify-between items-center text-sm">
                <div>
                  <span className="font-medium text-dark">{p.titre}</span>
                  <span className="text-gray-400 ml-3">{p.exercices.length} exercices</span>
                </div>
                <span className="text-xs text-gray-400">{new Date(p.dateCreation).toLocaleDateString('fr-FR')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal config exercice */}
      {configTarget && (
        <ExerciceConfigModal
          exercice={configTarget}
          initial={editingEp ?? undefined}
          defaultNote={!editingEp && profilFilter ? configTarget.adaptations?.[profilFilter] : undefined}
          onConfirm={(ep) => {
            if (programmeActif) {
              if (editingEp) {
                removeExerciceFromProgramme(programmeActif.id, editingEp.exerciceId);
                addExerciceToProgramme(programmeActif.id, ep);
              } else {
                handleAddExercice(ep);
              }
            }
            setEditingEp(null);
          }}
          onClose={() => { setConfigTarget(null); setEditingEp(null); }}
        />
      )}

    </PageWrapper>
  );
}
