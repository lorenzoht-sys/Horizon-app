import { useState, useMemo } from 'react';
import { loadExercices, saveCustomExercice } from '../data/exercices';
import PageWrapper from '../components/layout/PageWrapper';
import ExerciceCard from '../programme/ExerciceCard';
import type { CategorieExercice, Exercice } from '../types';
import { Plus, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
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
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Omit<Exercice, 'id'>>(EMPTY_EX);
  const [videoUrl, setVideoUrl] = useState('');
  const videoId = extractYoutubeId(videoUrl);

  const filtered = useMemo(() =>
    catFilter === 'all' ? exercices : exercices.filter(e => e.categorie === catFilter),
    [exercices, catFilter]
  );

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

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap mb-6">
        {CATEGORIES.map(c => (
          <button
            key={c.value}
            onClick={() => setCatFilter(c.value as CategorieExercice | 'all')}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${catFilter === c.value ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-primary/50'}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(ex => (
          <ExerciceCard key={ex.id} exercice={ex} />
        ))}
      </div>

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
              {/* Vidéo YouTube */}
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
