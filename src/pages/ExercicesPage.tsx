import { useState, useMemo } from 'react';
import { loadExercices, saveCustomExercice } from '../data/exercices';
import PageWrapper from '../components/layout/PageWrapper';
import ExerciceCard from '../programme/ExerciceCard';
import type { CategorieExercice, Exercice, ProfilHandicap, ProfilPathologie } from '../types';
import { Plus, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
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

export default function ExercicesPage() {
  const [exercices, setExercices] = useState(() => loadExercices());
  const [catFilter, setCatFilter] = useState<CategorieExercice | 'all'>('all');
  const [profilFilter, setProfilFilter] = useState<ProfilHandicap | ProfilPathologie | null>(null);
  const [positionFilter, setPositionFilter] = useState('tous');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Omit<Exercice, 'id'>>(EMPTY_EX);
  const [videoUrl, setVideoUrl] = useState('');
  const videoId = extractYoutubeId(videoUrl);

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

  function handleAdd() {
    if (!form.nom.trim()) { toast.error('Nom requis'); return; }
    const newEx: Exercice = { ...form, id: uuidv4(), custom: true, videoYoutubeId: videoId ?? undefined };
    saveCustomExercice(newEx);
    setExercices(loadExercices());
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
