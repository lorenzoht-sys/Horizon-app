import { useState, useMemo, useEffect } from 'react';
import {
  loadExercicesPraticien, saveExercicePersonnalise,
  getExercicesLocaux, migrationExercicesDejaFaite, migrerExercicesLocalStorageVersSupabase,
  loadDossiersExercices, creerDossierExercice, reordonnerDossiersExercices,
  loadMembresDossiers, ajouterExerciceADossier, retirerExerciceDeDossier,
} from '../data/exercices';
import PageWrapper from '../components/layout/PageWrapper';
import ExerciceCard from '../programme/ExerciceCard';
import type {
  CategorieExercice, Exercice, ProfilHandicap, ProfilPathologie,
  DossierExercice, DossierExerciceMembre, TypeExerciceRef,
} from '../types';
import { Plus, X, Package, Folder, FolderPlus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { extractYoutubeId } from '../utils/extractYoutubeId';

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

function refDe(ex: Exercice): { ref: string; type: TypeExerciceRef } {
  return { ref: ex.id, type: ex.custom ? 'personnalise' : 'base' };
}

// ── Rail de dossiers : cible de drop (ajout d'exercice), draggable
// (réordonnancement des dossiers entre eux), cliquable (ouvre la modale). ──

function DossierChip({
  dossier, count, draggedDossierId,
  onDragStartDossier, onDragEndDossier, onDropDossier, onDropExercice, onClick,
}: {
  dossier: DossierExercice;
  count: number;
  draggedDossierId: string | null;
  onDragStartDossier: () => void;
  onDragEndDossier: () => void;
  onDropDossier: () => void;
  onDropExercice: () => void;
  onClick: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <button
      type="button"
      draggable
      onDragStart={e => { e.stopPropagation(); onDragStartDossier(); }}
      onDragEnd={onDragEndDossier}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault();
        setDragOver(false);
        if (draggedDossierId) onDropDossier(); else onDropExercice();
      }}
      onClick={onClick}
      title="Glisser un exercice ici pour l'ajouter — cliquer pour ouvrir"
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border cursor-grab active:cursor-grabbing transition-colors ${
        dragOver ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 bg-white text-gray-700 hover:border-primary/50'
      }`}
    >
      <Folder size={13} className="text-primary flex-shrink-0" />
      {dossier.nom}
      <span className="text-gray-400">({count})</span>
    </button>
  );
}

// ── Modale d'un dossier ouvert : recherche + cases à cocher sur TOUS les
// exercices (base + personnalisés). ──────────────────────────────────────

function DossierModal({
  dossier, exercices, membresRefs, onToggle, onClose,
}: {
  dossier: DossierExercice;
  exercices: Exercice[];
  membresRefs: Set<string>;
  onToggle: (ex: Exercice, checked: boolean) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<CategorieExercice | 'all'>('all');

  const filtres = useMemo(() => exercices.filter(ex => {
    if (catFilter !== 'all' && ex.categorie !== catFilter) return false;
    if (search.trim() && !ex.nom.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  }), [exercices, catFilter, search]);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-heading font-bold text-dark flex items-center gap-2">
              <Folder size={16} className="text-primary" /> {dossier.nom}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Cochez les exercices à ranger dans ce dossier</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-dark"><X size={20} /></button>
        </div>

        <div className="p-4 border-b border-gray-100 flex-shrink-0 space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un exercice…"
              className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {CATEGORIES.map(c => (
              <button
                key={c.value}
                onClick={() => setCatFilter(c.value as CategorieExercice | 'all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  catFilter === c.value ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-2">
          {filtres.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">Aucun exercice ne correspond.</p>
          ) : (
            filtres.map(ex => {
              const { ref, type } = refDe(ex);
              const checked = membresRefs.has(`${type}:${ref}`);
              return (
                <label
                  key={`${type}-${ref}`}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={e => onToggle(ex, e.target.checked)}
                    className="w-4 h-4 accent-primary flex-shrink-0"
                  />
                  <span className="text-sm text-gray-700 flex-1">{ex.nom}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {CATEGORIES.find(c => c.value === ex.categorie)?.label}
                  </span>
                </label>
              );
            })
          )}
        </div>

        <div className="p-4 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full bg-primary text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-dark transition-colors"
          >
            Terminé
          </button>
        </div>
      </div>
    </div>
  );
}

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

  // Dossiers — tous exercices (base + personnalisés) via dossier_exercice_membres
  const [dossiers, setDossiers] = useState<DossierExercice[]>([]);
  const [membres, setMembres] = useState<DossierExerciceMembre[]>([]);
  const [showCreateDossier, setShowCreateDossier] = useState(false);
  const [nouveauDossierNom, setNouveauDossierNom] = useState('');
  const [draggedExercice, setDraggedExercice] = useState<{ ref: string; type: TypeExerciceRef } | null>(null);
  const [draggedDossierId, setDraggedDossierId] = useState<string | null>(null);
  const [dossierOuvertId, setDossierOuvertId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadExercicesPraticien().then(list => {
      if (!cancelled) { setExercices(list); setLoading(false); }
    });
    loadDossiersExercices().then(list => {
      if (!cancelled) setDossiers(list);
    });
    loadMembresDossiers().then(list => {
      if (!cancelled) setMembres(list);
    });
    return () => { cancelled = true; };
  }, []);

  // dossierId → Set("type:ref") pour un lookup O(1) (rail, modale, compteurs).
  const membresParDossier = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const m of membres) {
      const set = map.get(m.dossierId) ?? new Set<string>();
      set.add(`${m.typeExercice}:${m.exerciceRef}`);
      map.set(m.dossierId, set);
    }
    return map;
  }, [membres]);

  async function handleCreerDossier() {
    if (!nouveauDossierNom.trim()) { toast.error('Nom requis'); return; }
    const created = await creerDossierExercice(nouveauDossierNom.trim(), dossiers.length);
    if (!created) { toast.error('Erreur lors de la création du dossier'); return; }
    setDossiers(prev => [...prev, created]);
    setNouveauDossierNom('');
    setShowCreateDossier(false);
    toast.success('Dossier créé !');
  }

  async function handleAjouterADossier(dossierId: string, ref: string, type: TypeExerciceRef) {
    const created = await ajouterExerciceADossier(dossierId, ref, type);
    if (!created) { toast.error("Erreur lors de l'ajout au dossier"); return; }
    setMembres(prev =>
      prev.some(m => m.dossierId === dossierId && m.exerciceRef === ref && m.typeExercice === type)
        ? prev
        : [...prev, created]
    );
  }

  async function handleRetirerDeDossier(dossierId: string, ref: string, type: TypeExerciceRef) {
    const ok = await retirerExerciceDeDossier(dossierId, ref, type);
    if (!ok) { toast.error('Erreur lors du retrait du dossier'); return; }
    setMembres(prev => prev.filter(m => !(m.dossierId === dossierId && m.exerciceRef === ref && m.typeExercice === type)));
  }

  function handleToggleDansModal(ex: Exercice, checked: boolean) {
    if (!dossierOuvertId) return;
    const { ref, type } = refDe(ex);
    if (checked) void handleAjouterADossier(dossierOuvertId, ref, type);
    else void handleRetirerDeDossier(dossierOuvertId, ref, type);
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
  const dossierOuvert = dossiers.find(d => d.id === dossierOuvertId) ?? null;

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

      {/* Rail de dossiers — tous exercices, base et personnalisés */}
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
          <p className="text-xs text-gray-400">Aucun dossier — créez-en un, puis glissez un exercice dessus ou ouvrez-le pour en ajouter par recherche.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {dossiers.map(dossier => (
              <DossierChip
                key={dossier.id}
                dossier={dossier}
                count={membresParDossier.get(dossier.id)?.size ?? 0}
                draggedDossierId={draggedDossierId}
                onDragStartDossier={() => setDraggedDossierId(dossier.id)}
                onDragEndDossier={() => setDraggedDossierId(null)}
                onDropDossier={() => {
                  if (draggedDossierId && draggedDossierId !== dossier.id) void handleReordonnerDossiers(draggedDossierId, dossier.id);
                }}
                onDropExercice={() => {
                  if (draggedExercice) void handleAjouterADossier(dossier.id, draggedExercice.ref, draggedExercice.type);
                }}
                onClick={() => setDossierOuvertId(dossier.id)}
              />
            ))}
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
        {' · glissez une carte sur un dossier pour l\'y ranger'}
      </p>

      {/* Grille unique — base + personnalisés, chaque carte glissable vers un dossier */}
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
            draggable
            onDragStart={() => setDraggedExercice(refDe(ex))}
            onDragEnd={() => setDraggedExercice(null)}
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
                draggable
                onDragStart={() => setDraggedExercice(refDe(ex))}
                onDragEnd={() => setDraggedExercice(null)}
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

      {/* Modale du dossier ouvert */}
      {dossierOuvert && (
        <DossierModal
          dossier={dossierOuvert}
          exercices={exercices}
          membresRefs={membresParDossier.get(dossierOuvert.id) ?? new Set()}
          onToggle={handleToggleDansModal}
          onClose={() => setDossierOuvertId(null)}
        />
      )}
    </PageWrapper>
  );
}
