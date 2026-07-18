import { useState, useMemo, useEffect } from 'react';
import {
  loadExercicesPraticien, saveExercicePersonnalise,
  getExercicesLocaux, migrationExercicesDejaFaite, migrerExercicesLocalStorageVersSupabase,
  loadDossiersExercices, creerDossierExercice, deplacerExercicePersonnalise,
  reordonnerDossiersExercices, reordonnerExercicesPersonnalises,
} from '../data/exercices';
import PageWrapper from '../components/layout/PageWrapper';
import ExerciceCard from '../programme/ExerciceCard';
import type { CategorieExercice, Exercice, ProfilHandicap, ProfilPathologie, DossierExercice } from '../types';
import { Plus, X, Package, Folder, FolderPlus, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { extractYoutubeId } from '../utils/extractYoutubeId';

// ── Sous-composants dossiers (glisser-déposer HTML5 natif, sans dépendance) ──

function ExercicePersonnaliseChip({ exercice, onDragStart, onDragEnd, onDropOnMe }: {
  exercice: Exercice;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOnMe: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={e => { e.stopPropagation(); onDragStart(); }}
      onDragEnd={onDragEnd}
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); onDropOnMe(); }}
      title="Glisser pour déplacer ou réordonner"
      className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-700 cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors"
    >
      <GripVertical size={12} className="text-gray-300" />
      {exercice.nom}
    </div>
  );
}

function DossierSection({
  dossier, exercices, draggedDossierId,
  onDragStartDossier, onDragEndDossier, onDropDossier, onDropVide,
  onDragStartExercice, onDragEndExercice, onDropExercice,
}: {
  dossier: DossierExercice;
  exercices: Exercice[];
  draggedDossierId: string | null;
  onDragStartDossier: () => void;
  onDragEndDossier: () => void;
  onDropDossier: () => void;
  onDropVide: () => void;
  onDragStartExercice: (id: string) => void;
  onDragEndExercice: () => void;
  onDropExercice: (ex: Exercice) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      draggable
      onDragStart={e => { e.stopPropagation(); onDragStartDossier(); }}
      onDragEnd={onDragEndDossier}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault();
        setDragOver(false);
        if (draggedDossierId) onDropDossier(); else onDropVide();
      }}
      className={`border rounded-xl p-3 transition-colors cursor-grab active:cursor-grabbing ${
        dragOver ? 'border-primary bg-primary/5' : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <GripVertical size={14} className="text-gray-300" />
        <Folder size={14} className="text-primary" />
        <span className="text-sm font-semibold text-dark">{dossier.nom}</span>
        <span className="text-xs text-gray-400">({exercices.length})</span>
      </div>
      {exercices.length === 0 ? (
        <p className="text-xs text-gray-400 pl-6">Glissez un exercice personnalisé ici</p>
      ) : (
        <div className="flex flex-wrap gap-2 pl-1">
          {exercices.map(ex => (
            <ExercicePersonnaliseChip
              key={ex.id}
              exercice={ex}
              onDragStart={() => onDragStartExercice(ex.id)}
              onDragEnd={onDragEndExercice}
              onDropOnMe={() => onDropExercice(ex)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const CATEGORIES: { value: CategorieExercice | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'equilibre', label: '🔵 Équilibre' },
  { value: 'force', label: '🟢 Force' },
  { value: 'mobilite', label: '🟡 Mobilité' },
  { value: 'souplesse', label: '🟠 Souplesse' },
  { value: 'endurance', label: '🔴 Endurance' },
  { value: 'memoire', label: '🟣 Mémoire' },
];

const PROFILS_HANDICAP: { id: ProfilHandicap; label: string; emoji: string; color: string }[] = [
  { id: 'fauteuil_roulant', label: 'Fauteuil roulant',    emoji: '♿',  color: '#1A5F9E' },
  { id: 'avc_hemiplegie',   label: 'AVC / Hémiplégie',    emoji: '🧠', color: '#8B5CF6' },
  { id: 'parkinson',        label: 'Parkinson',            emoji: '🫸', color: '#F59E0B' },
  { id: 'sep',              label: 'Sclérose en plaques',  emoji: '🎗️', color: '#1D9E75' },
];

const PROFILS_PATHOLOGIE: { id: ProfilPathologie; label: string; emoji: string; color: string }[] = [
  { id: 'obesite',         label: 'Obésité',              emoji: '⚖️', color: '#EF8C00' },
  { id: 'diabete',         label: 'Diabète (T1/T2)',       emoji: '🩸', color: '#E85050' },
  { id: 'prothese_hanche', label: 'Prothèse hanche',      emoji: '🦴', color: '#6B7280' },
  { id: 'prothese_genou',  label: 'Prothèse genou',       emoji: '🦿', color: '#059669' },
];

const POSITIONS: { id: string; label: string }[] = [
  { id: 'tous',     label: 'Toutes positions' },
  { id: 'fauteuil', label: '♿ Fauteuil' },
  { id: 'assis',    label: '🪑 Assis' },
  { id: 'debout',   label: '🧍 Debout' },
  { id: 'couche',   label: '🛏 Allongé' },
];

const EMPTY_EX: Omit<Exercice, 'id'> = {
  nom: '',
  categorie: 'force',
  description: '',
  consigneSecurite: '',
  niveaux: { debutant: '', intermediaire: '', avance: '' },
  materielNecessaire: '',
  dureeEstimeeMinutes: 5,
};

export default function ExercicesPage() {
  const [exercices, setExercices] = useState<Exercice[]>([]);
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState<CategorieExercice | 'all'>('all');
  const [profilFilter, setProfilFilter] = useState<ProfilHandicap | ProfilPathologie | null>(null);
  const [positionFilter, setPositionFilter] = useState('tous');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Omit<Exercice, 'id'>>(EMPTY_EX);
  const [videoUrl, setVideoUrl] = useState('');
  const videoId = extractYoutubeId(videoUrl);

  // Bandeau de migration localStorage → Supabase : le nombre d'exercices
  // locaux est figé au montage (pas besoin de le recalculer en direct), le
  // rejet ("Plus tard") n'est que pour la session en cours — pas de flag
  // posé, le bandeau réapparaîtra au prochain chargement de la page.
  const [exercicesLocaux] = useState(() => getExercicesLocaux());
  const [bandeauRejete, setBandeauRejete] = useState(false);
  const [migrationFaite, setMigrationFaite] = useState(() => migrationExercicesDejaFaite());
  const [migrating, setMigrating] = useState(false);
  const showBandeauMigration = exercicesLocaux.length > 0 && !migrationFaite && !bandeauRejete;

  // Dossiers d'exercices personnalisés
  const [dossiers, setDossiers] = useState<DossierExercice[]>([]);
  const [showCreateDossier, setShowCreateDossier] = useState(false);
  const [nouveauDossierNom, setNouveauDossierNom] = useState('');
  const [draggedExerciceId, setDraggedExerciceId] = useState<string | null>(null);
  const [draggedDossierId, setDraggedDossierId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadExercicesPraticien().then(list => {
      if (!cancelled) { setExercices(list); setLoading(false); }
    });
    loadDossiersExercices().then(list => {
      if (!cancelled) setDossiers(list);
    });
    return () => { cancelled = true; };
  }, []);

  async function handleCreerDossier() {
    if (!nouveauDossierNom.trim()) { toast.error('Nom requis'); return; }
    const created = await creerDossierExercice(nouveauDossierNom.trim(), dossiers.length);
    if (!created) { toast.error('Erreur lors de la création du dossier'); return; }
    setDossiers(prev => [...prev, created]);
    setNouveauDossierNom('');
    setShowCreateDossier(false);
    toast.success('Dossier créé !');
  }

  async function handleDeplacerExercice(exerciceId: string, dossierId: string | null) {
    const ok = await deplacerExercicePersonnalise(exerciceId, dossierId);
    if (!ok) { toast.error('Erreur lors du déplacement'); return; }
    setExercices(prev => prev.map(ex => ex.id === exerciceId ? { ...ex, dossierId: dossierId ?? undefined } : ex));
  }

  async function handleReordonnerExercicesDossier(dossierId: string | null, sourceId: string, targetId: string) {
    const items = exercices
      .filter(ex => ex.custom && (ex.dossierId ?? null) === dossierId)
      .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
    const sourceIdx = items.findIndex(e => e.id === sourceId);
    const targetIdx = items.findIndex(e => e.id === targetId);
    if (sourceIdx === -1 || targetIdx === -1 || sourceIdx === targetIdx) return;
    const reordered = [...items];
    const [moved] = reordered.splice(sourceIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    const withOrdre = reordered.map((e, i) => ({ id: e.id, ordre: i }));
    setExercices(prev => prev.map(ex => {
      const found = withOrdre.find(w => w.id === ex.id);
      return found ? { ...ex, ordre: found.ordre } : ex;
    }));
    const ok = await reordonnerExercicesPersonnalises(withOrdre);
    if (!ok) toast.error('Erreur lors du tri des exercices');
  }

  function handleDropSurExercice(targetEx: Exercice, targetDossierId: string | null) {
    if (!draggedExerciceId || draggedExerciceId === targetEx.id) return;
    const draggedEx = exercices.find(e => e.id === draggedExerciceId);
    if (!draggedEx) return;
    if ((draggedEx.dossierId ?? null) === targetDossierId) {
      void handleReordonnerExercicesDossier(targetDossierId, draggedExerciceId, targetEx.id);
    } else {
      void handleDeplacerExercice(draggedExerciceId, targetDossierId);
    }
  }

  async function handleReordonnerDossiers(sourceId: string, targetId: string) {
    const sourceIdx = dossiers.findIndex(d => d.id === sourceId);
    const targetIdx = dossiers.findIndex(d => d.id === targetId);
    if (sourceIdx === -1 || targetIdx === -1 || sourceIdx === targetIdx) return;
    const reordered = [...dossiers];
    const [moved] = reordered.splice(sourceIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    const withOrdre = reordered.map((d, i) => ({ ...d, ordre: i }));
    setDossiers(withOrdre);
    const ok = await reordonnerDossiersExercices(withOrdre.map(d => ({ id: d.id, ordre: d.ordre })));
    if (!ok) toast.error('Erreur lors du tri des dossiers');
  }

  async function handleImporterExercicesLocaux() {
    setMigrating(true);
    try {
      const result = await migrerExercicesLocalStorageVersSupabase();
      if (!result) {
        toast.error("Erreur lors de l'import — réessayez dans un instant");
        return;
      }
      setMigrationFaite(true);
      toast.success(`${result.count} exercice${result.count > 1 ? 's' : ''} importé${result.count > 1 ? 's' : ''} dans votre bibliothèque en ligne !`);
      setExercices(await loadExercicesPraticien());
    } finally {
      setMigrating(false);
    }
  }

  const { compatible, incompatibles } = useMemo(() => {
    const parCategorie = exercices.filter(ex =>
      catFilter === 'all' || ex.categorie === catFilter
    );

    if (!profilFilter) {
      return { compatible: parCategorie, incompatibles: [] as Exercice[] };
    }

    const isCompatible = (ex: Exercice) => {
      const profilOk =
        !ex.profilsCompatibles ||
        ex.profilsCompatibles.includes('tous') ||
        ex.profilsCompatibles.includes(profilFilter);
      const posOk =
        positionFilter === 'tous' ||
        !ex.positionRequise ||
        ex.positionRequise === 'tous' ||
        ex.positionRequise === positionFilter;
      return profilOk && posOk;
    };

    const isIncompatible = (ex: Exercice) =>
      !!ex.profilsCompatibles &&
      !ex.profilsCompatibles.includes('tous') &&
      !ex.profilsCompatibles.includes(profilFilter);

    const comp = parCategorie.filter(isCompatible).sort((a, b) => {
      const aSpec = a.profilsCompatibles?.includes(profilFilter) && !a.profilsCompatibles.includes('tous');
      const bSpec = b.profilsCompatibles?.includes(profilFilter) && !b.profilsCompatibles.includes('tous');
      if (aSpec && !bSpec) return -1;
      if (!aSpec && bSpec) return 1;
      return 0;
    });

    const incompat = parCategorie.filter(isIncompatible);

    return { compatible: comp, incompatibles: incompat };
  }, [exercices, catFilter, profilFilter, positionFilter]);

  function handleProfilChange(profil: ProfilHandicap | ProfilPathologie) {
    if (profilFilter === profil) {
      setProfilFilter(null);
      setPositionFilter('tous');
    } else {
      setProfilFilter(profil);
      setPositionFilter('tous');
    }
  }

  async function handleAdd() {
    if (!form.nom.trim()) { toast.error('Nom requis'); return; }
    const created = await saveExercicePersonnalise({ ...form, videoYoutubeId: videoId ?? undefined });
    if (!created) { toast.error("Erreur lors de l'ajout de l'exercice"); return; }
    setExercices(await loadExercicesPraticien());
    setForm(EMPTY_EX);
    setVideoUrl('');
    setShowForm(false);
    toast.success('Exercice ajouté à la bibliothèque !');
  }

  const profilActif = profilFilter ? PROFILS_HANDICAP.find(p => p.id === profilFilter) : null;

  return (
    <PageWrapper>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-heading font-bold text-dark text-2xl">Bibliothèque d'exercices</h1>
          <p className="text-sm text-gray-500">{exercices.length} exercices disponibles</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-dark transition-colors"
        >
          <Plus size={15} />
          Ajouter un exercice
        </button>
      </div>

      {/* Bandeau migration localStorage → Supabase */}
      {showBandeauMigration && (
        <div className="flex items-center gap-3 rounded-xl px-4 py-3 mb-4 bg-amber-50 border border-amber-200">
          <Package size={20} className="text-amber-600 flex-shrink-0" />
          <div className="flex-1 text-sm text-amber-800">
            📦 Vous avez {exercicesLocaux.length} exercice{exercicesLocaux.length > 1 ? 's' : ''} personnalisé{exercicesLocaux.length > 1 ? 's' : ''} enregistré{exercicesLocaux.length > 1 ? 's' : ''} localement sur cet appareil. Les importer vers votre bibliothèque en ligne pour les retrouver partout ?
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleImporterExercicesLocaux}
              disabled={migrating}
              className="bg-amber-600 text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              {migrating ? 'Import…' : `Importer mes ${exercicesLocaux.length} exercice${exercicesLocaux.length > 1 ? 's' : ''}`}
            </button>
            <button
              onClick={() => setBandeauRejete(true)}
              disabled={migrating}
              className="text-xs text-amber-700 hover:text-amber-900 px-2 py-2 disabled:opacity-50"
            >
              Plus tard ✕
            </button>
          </div>
        </div>
      )}

      {/* Dossiers d'exercices personnalisés */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-dark uppercase tracking-wide flex items-center gap-2">
            <Folder size={14} /> Mes dossiers
          </h2>
          <button
            onClick={() => setShowCreateDossier(true)}
            className="text-xs font-semibold text-primary flex items-center gap-1 hover:text-dark transition-colors"
          >
            <FolderPlus size={14} /> Créer un dossier
          </button>
        </div>

        {showCreateDossier && (
          <div className="flex items-center gap-2 mb-3">
            <input
              autoFocus
              value={nouveauDossierNom}
              onChange={e => setNouveauDossierNom(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreerDossier()}
              placeholder="Nom du dossier"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
            />
            <button onClick={handleCreerDossier} className="bg-primary text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-dark transition-colors">
              Créer
            </button>
            <button
              onClick={() => { setShowCreateDossier(false); setNouveauDossierNom(''); }}
              className="text-gray-400 text-xs px-2 hover:text-gray-600"
            >
              Annuler
            </button>
          </div>
        )}

        {dossiers.length === 0 && !showCreateDossier ? (
          <p className="text-xs text-gray-400">Aucun dossier — créez-en un pour organiser vos exercices personnalisés.</p>
        ) : (
          <div className="space-y-3">
            {dossiers.map(dossier => (
              <DossierSection
                key={dossier.id}
                dossier={dossier}
                exercices={exercices
                  .filter(ex => ex.custom && ex.dossierId === dossier.id)
                  .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))}
                draggedDossierId={draggedDossierId}
                onDragStartDossier={() => setDraggedDossierId(dossier.id)}
                onDragEndDossier={() => setDraggedDossierId(null)}
                onDropDossier={() => {
                  if (draggedDossierId && draggedDossierId !== dossier.id) void handleReordonnerDossiers(draggedDossierId, dossier.id);
                }}
                onDropVide={() => {
                  if (draggedExerciceId) void handleDeplacerExercice(draggedExerciceId, dossier.id);
                }}
                onDragStartExercice={id => setDraggedExerciceId(id)}
                onDragEndExercice={() => setDraggedExerciceId(null)}
                onDropExercice={ex => handleDropSurExercice(ex, dossier.id)}
              />
            ))}
          </div>
        )}

        {/* Exercices personnalisés sans dossier — cible de drop pour "en sortir" */}
        {exercices.some(ex => ex.custom && !ex.dossierId) && (
          <div
            className="mt-3 border border-dashed border-gray-200 rounded-xl p-3"
            onDragOver={e => { if (draggedExerciceId) e.preventDefault(); }}
            onDrop={() => { if (draggedExerciceId) void handleDeplacerExercice(draggedExerciceId, null); }}
          >
            <div className="text-xs font-semibold text-gray-400 uppercase mb-2">Sans dossier</div>
            <div className="flex flex-wrap gap-2">
              {exercices
                .filter(ex => ex.custom && !ex.dossierId)
                .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
                .map(ex => (
                  <ExercicePersonnaliseChip
                    key={ex.id}
                    exercice={ex}
                    onDragStart={() => setDraggedExerciceId(ex.id)}
                    onDragEnd={() => setDraggedExerciceId(null)}
                    onDropOnMe={() => handleDropSurExercice(ex, null)}
                  />
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Filtres profil handicap */}
      <div className="flex gap-1 flex-wrap mb-1">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide self-center mr-1">Profil handicap :</span>
        {PROFILS_HANDICAP.map(p => (
          <button
            key={p.id}
            onClick={() => handleProfilChange(p.id)}
            style={profilFilter === p.id ? { background: p.color, color: 'white', border: 'none' } : {}}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
              profilFilter === p.id
                ? ''
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-transparent'
            }`}
          >
            {p.emoji} {p.label}
          </button>
        ))}
      </div>

      {/* Filtres profil pathologique */}
      <div className="flex gap-1 flex-wrap mb-2">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide self-center mr-1">Pathologie :</span>
        {PROFILS_PATHOLOGIE.map(p => (
          <button
            key={p.id}
            onClick={() => handleProfilChange(p.id)}
            style={profilFilter === p.id ? { background: p.color, color: 'white', border: 'none' } : {}}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
              profilFilter === p.id
                ? ''
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-transparent'
            }`}
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
              className={`px-2 py-0.5 rounded-lg text-xs font-medium border transition-colors ${
                positionFilter === pos.id
                  ? 'border-teal-500 bg-teal-50 text-teal-700'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              {pos.label}
            </button>
          ))}
        </div>
      )}

      {/* Bandeau profil actif */}
      {profilActif && (
        <div
          className="flex items-center gap-3 rounded-xl px-4 py-2.5 mb-3"
          style={{ background: profilActif.color + '18', border: `1px solid ${profilActif.color}40` }}
        >
          <span className="text-xl">{profilActif.emoji}</span>
          <div className="flex-1">
            <span className="text-sm font-semibold" style={{ color: profilActif.color }}>
              Filtre actif : {profilActif.label}
            </span>
            <div className="text-xs mt-0.5" style={{ color: profilActif.color + 'AA' }}>
              Exercices spécifiques en premier · Exercices universels · Non recommandés grisés
            </div>
          </div>
          <button
            onClick={() => { setProfilFilter(null); setPositionFilter('tous'); }}
            className="transition-colors"
            style={{ color: profilActif.color + '80' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Filtres catégorie */}
      <div className="flex gap-2 flex-wrap mb-4">
        {CATEGORIES.map(c => (
          <button
            key={c.value}
            onClick={() => setCatFilter(c.value as CategorieExercice | 'all')}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
              catFilter === c.value
                ? 'bg-primary text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-primary/50'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Compteur */}
      <p className="text-xs text-gray-400 mb-4">
        {compatible.length} exercice{compatible.length > 1 ? 's' : ''}
        {profilActif ? ` compatible${compatible.length > 1 ? 's' : ''} avec ce profil` : ' disponibles'}
        {incompatibles.length > 0 && ` · ${incompatibles.length} non recommandé${incompatibles.length > 1 ? 's' : ''}`}
      </p>

      {/* Grille exercices compatibles */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {compatible.map(ex => (
          <ExerciceCard
            key={ex.id}
            exercice={ex}
            profilHandicap={
              profilFilter && ['fauteuil_roulant','avc_hemiplegie','parkinson','sep'].includes(profilFilter)
                ? profilFilter as ProfilHandicap
                : undefined
            }
          />
        ))}
      </div>
      )}

      {/* Section exercices non recommandés */}
      {incompatibles.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs text-gray-400 font-medium whitespace-nowrap">
              Non recommandés pour ce profil ({incompatibles.length})
            </span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {incompatibles.map(ex => (
              <ExerciceCard
                key={ex.id}
                exercice={ex}
                incompatible
              />
            ))}
          </div>
        </div>
      )}

      {/* Modal ajout */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-heading font-bold text-dark">Nouvel exercice</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-dark"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-dark mb-1">Nom *</label>
                  <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-dark mb-1">Catégorie</label>
                  <select value={form.categorie} onChange={e => setForm(f => ({ ...f, categorie: e.target.value as CategorieExercice }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary">
                    {CATEGORIES.filter(c => c.value !== 'all').map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-dark mb-1">Description</label>
                <textarea value={form.description} rows={2} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-dark mb-1">Consigne de sécurité</label>
                <input value={form.consigneSecurite} onChange={e => setForm(f => ({ ...f, consigneSecurite: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
              </div>
              {(['debutant', 'intermediaire', 'avance'] as const).map(n => (
                <div key={n}>
                  <label className="block text-xs font-semibold text-dark mb-1 capitalize">Niveau {n}</label>
                  <input value={form.niveaux[n]} onChange={e => setForm(f => ({ ...f, niveaux: { ...f.niveaux, [n]: e.target.value } }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-dark mb-1">Matériel</label>
                  <input value={form.materielNecessaire} onChange={e => setForm(f => ({ ...f, materielNecessaire: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-dark mb-1">Durée (min)</label>
                  <input type="number" min={1} value={form.dureeEstimeeMinutes} onChange={e => setForm(f => ({ ...f, dureeEstimeeMinutes: +e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-dark mb-1">Lien vidéo de démonstration (YouTube)</label>
                <input
                  value={videoUrl}
                  onChange={e => setVideoUrl(e.target.value)}
                  placeholder="Collez l'URL YouTube ici…"
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors ${
                    videoUrl && !videoId ? 'border-danger focus:border-danger' : 'border-gray-200 focus:border-primary'
                  }`}
                />
                {videoUrl && !videoId && (
                  <p className="text-xs text-danger mt-1">Lien YouTube non reconnu</p>
                )}
                {videoId && (
                  <div className="mt-2 relative rounded-lg overflow-hidden">
                    <img
                      src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
                      alt="Aperçu vidéo"
                      className="w-full rounded-lg object-cover"
                      style={{ maxHeight: 120 }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="bg-black/60 text-white rounded-full px-3 py-1 text-xs">▶ Aperçu OK</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors">Annuler</button>
                <button onClick={handleAdd} className="flex-1 bg-primary text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-dark transition-colors">Ajouter</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
