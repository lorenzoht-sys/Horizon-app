import { useState, lazy, Suspense, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useParticipants } from '../hooks/useParticipants';
import { useAgenda } from '../hooks/useAgenda';
import { useContrats } from '../hooks/useContrats';
import ParticipantCard from '../components/participant/ParticipantCard';
import ParticipantForm from '../components/participant/ParticipantForm';
import ImportExcelModal from '../components/import/ImportExcelModal';
import PageWrapper from '../components/layout/PageWrapper';
import { Plus, Search, Users, BarChart3, FileSpreadsheet, X, CalendarDays, MapPin, ChevronRight, NotebookPen } from 'lucide-react';
import { useJournalSeance } from '../hooks/useJournalSeance';
import { RESSENTI_CONFIG } from '../components/journal/NoteSeanceModal';
import { getAllBrouillons } from '../hooks/useBrouillonBilan';
import toast from 'react-hot-toast';

const MiniMap = lazy(() => import('../components/map/MiniMap'));

export default function Dashboard() {
  const { participants, addParticipant } = useParticipants();
  const { seancesDuJour, patientsARelancer } = useAgenda();
  const { contratsARenouveler } = useContrats();
  const { notes } = useJournalSeance();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.state?.openNewParticipant) {
      setShowForm(true);
      navigate('/', { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  const filtered = participants.filter(p =>
    `${p.prenom} ${p.nom}`.toLowerCase().includes(search.toLowerCase())
  );

  const needsBilan = participants.filter(p => {
    const last = p.bilans.at(-1);
    return !last || (Date.now() - new Date(last.date).getTime()) / 86400000 > 85;
  }).length;

  const thisMonthBilans = participants.reduce((acc, p) => {
    return acc + p.bilans.filter(b => {
      const d = new Date(b.date);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, 0);

  return (
    <>
      <PageWrapper>
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-2xl p-5 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Participants</span>
              <Users size={16} className="text-primary" />
            </div>
            <div className="text-3xl font-heading font-bold text-dark">{participants.length}</div>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Bilans ce mois</span>
              <BarChart3 size={16} className="text-secondary" />
            </div>
            <div className="text-3xl font-heading font-bold text-dark">{thisMonthBilans}</div>
          </div>
          <div className={`rounded-2xl p-5 border ${needsBilan > 0 ? 'bg-warning/10 border-warning/20' : 'bg-white border-gray-100'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Bilans à faire</span>
              <span className={`text-lg ${needsBilan > 0 ? 'text-warning' : 'text-gray-300'}`}>⚠</span>
            </div>
            <div className={`text-3xl font-heading font-bold ${needsBilan > 0 ? 'text-warning' : 'text-dark'}`}>{needsBilan}</div>
          </div>
        </div>

        {/* Alertes contrats à renouveler */}
        {contratsARenouveler.length > 0 && (
          <div className="mb-6 bg-orange-50 border border-orange-200 rounded-2xl px-5 py-4">
            <div className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">
              ⚠️ {contratsARenouveler.length} contrat{contratsARenouveler.length > 1 ? 's' : ''} se termine{contratsARenouveler.length > 1 ? 'nt' : ''} bientôt
            </div>
            <div className="space-y-1">
              {contratsARenouveler.map(c => {
                const p = participants.find(x => x.id === c.participantId);
                const joursRestants = Math.ceil((new Date(c.dateFin).getTime() - Date.now()) / 86400000);
                return (
                  <div key={c.id} className="flex items-center justify-between text-sm">
                    <span className="text-orange-800">
                      <span className="font-medium">{p ? `${p.prenom} ${p.nom}` : '—'}</span>
                      {' '}— dans {joursRestants} jour{joursRestants > 1 ? 's' : ''}
                    </span>
                    {p && (
                      <Link
                        to={`/participant/${p.id}/contrat/nouveau`}
                        className="text-xs text-orange-700 underline hover:text-orange-900 font-medium"
                      >
                        Renouveler →
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un participant..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
          </div>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            <FileSpreadsheet size={16} />
            <span className="hidden sm:inline">Import Excel</span>
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-dark transition-colors"
          >
            <Plus size={16} />
            Nouveau participant
          </button>
        </div>

        {/* Grid participants */}
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Users size={56} className="mx-auto mb-4 opacity-20" />
            <p className="font-medium text-lg">Aucun participant trouvé</p>
            <p className="text-sm mt-1">
              {search ? 'Essayez un autre nom' : 'Commencez par ajouter un participant'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(p => <ParticipantCard key={p.id} participant={p} />)}
          </div>
        )}

        {/* Widget agenda */}
        {(() => {
          const today = new Date().toISOString().slice(0, 10);
          const seancesAujourdhui = seancesDuJour(today);
          const aRelancer = patientsARelancer(21);
          if (seancesAujourdhui.length === 0 && aRelancer.length === 0) return null;
          return (
            <div className="mt-8 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <CalendarDays size={18} className="text-primary" />
                  <h2 className="font-heading font-semibold text-dark">Prochaines séances</h2>
                </div>
                <Link to="/agenda" className="text-xs text-primary hover:text-dark flex items-center gap-1 transition-colors">
                  Voir l'agenda <ChevronRight size={14} />
                </Link>
              </div>

              {seancesAujourdhui.length > 0 ? (
                <div className="space-y-2 mb-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Aujourd'hui — {seancesAujourdhui.length} séance{seancesAujourdhui.length > 1 ? 's' : ''}
                  </p>
                  {seancesAujourdhui.slice(0, 4).map(s => {
                    const p = participants.find(x => x.id === s.participantId);
                    return (
                      <div key={s.id} className="flex items-center gap-3 py-1">
                        <span className="text-sm font-semibold text-primary w-14 flex-shrink-0">{s.heureDebut}</span>
                        <span className="text-sm font-medium text-dark">{p ? `${p.prenom} ${p.nom}` : '—'}</span>
                        {p?.adresseVille && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <MapPin size={11} />{p.adresseVille}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400 mb-3">Aucune séance planifiée aujourd'hui.</p>
              )}

              {aRelancer.length > 0 && (
                <p className="text-xs text-warning font-medium">
                  ⚠️ {aRelancer.length} patient{aRelancer.length > 1 ? 's' : ''} sans séance depuis plus de 3 semaines
                </p>
              )}
            </div>
          );
        })()}

        {/* Widget bilans en cours (brouillons) */}
        {(() => {
          const brouillons = getAllBrouillons();
          if (brouillons.length === 0) return null;
          return (
            <div className="mt-6 bg-white rounded-2xl border border-amber-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">📋</span>
                <h2 className="font-heading font-semibold text-dark">
                  Bilans en cours
                  <span className="ml-2 bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">{brouillons.length}</span>
                </h2>
              </div>
              <div className="space-y-2">
                {brouillons.map(b => {
                  const p = participants.find(x => x.id === b.participantId);
                  const mins = Math.floor((Date.now() - new Date(b.dateDerniereModif).getTime()) / 60000);
                  const modifLabel = mins < 60 ? `il y a ${mins} min` : mins < 1440 ? `il y a ${Math.floor(mins / 60)}h` : `il y a ${Math.floor(mins / 1440)}j`;
                  return (
                    <div key={b.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-dark truncate">
                          {p ? `${p.prenom} ${p.nom}` : 'Patient inconnu'}
                        </div>
                        <div className="text-xs text-gray-400">
                          {b.completionPct}% complété · Étape {b.etapeActuelle + 1} · {modifLabel}
                        </div>
                        <div className="h-1 bg-gray-100 rounded-full mt-1.5 w-24 overflow-hidden">
                          <div className="h-full rounded-full bg-amber-400" style={{ width: `${b.completionPct}%` }} />
                        </div>
                      </div>
                      {p && (
                        <Link
                          to={`/participant/${p.id}/bilan/new`}
                          className="ml-3 flex-shrink-0 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors"
                        >
                          Reprendre →
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Widget journal — dernières notes */}
        {(() => {
          const today = new Date().toISOString().slice(0, 10);
          const notesAujourdhui = notes
            .filter(n => n.date === today)
            .sort((a, b) => b.heureDebut.localeCompare(a.heureDebut));
          if (notesAujourdhui.length === 0) return null;
          const alertesDouleur = notesAujourdhui.filter(n => n.alertes.douleurSignalee);
          return (
            <div className="mt-8 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <NotebookPen size={18} className="text-secondary" />
                  <h2 className="font-heading font-semibold text-dark">Dernières notes</h2>
                </div>
                <span className="text-xs text-gray-400">
                  Aujourd'hui — {notesAujourdhui.length} note{notesAujourdhui.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-2 mb-3">
                {notesAujourdhui.slice(0, 5).map(note => {
                  const p = participants.find(x => x.id === note.participantId);
                  const r = note.ressenti ? RESSENTI_CONFIG[note.ressenti] : null;
                  return (
                    <div key={note.id} className="flex items-center gap-3 py-1">
                      <span className="text-sm font-medium text-dark flex-shrink-0 w-28 truncate">
                        {p ? `${p.prenom} ${p.nom[0]}.` : '—'}
                      </span>
                      {r && <span className="text-xs flex-shrink-0">{r.emoji} {r.label}</span>}
                      {note.note && (
                        <span className="text-xs text-gray-400 truncate flex-1">
                          "{note.note.length > 45 ? note.note.slice(0, 45) + '…' : note.note}"
                        </span>
                      )}
                      {p && (
                        <Link to={`/participant/${p.id}`} className="text-xs text-primary hover:text-dark flex-shrink-0 flex items-center gap-1 transition-colors">
                          Fiche <ChevronRight size={11} />
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
              {alertesDouleur.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700 font-medium">
                  ⚠️ {alertesDouleur.length} alerte{alertesDouleur.length > 1 ? 's' : ''} douleur signalée{alertesDouleur.length > 1 ? 's' : ''} aujourd'hui
                </div>
              )}
            </div>
          );
        })()}

        {/* Widget carte — en bas de page */}
        {participants.some(p => p.coordonnees) && (
          <div className="mt-8">
            <Suspense fallback={<div className="h-[260px] bg-gray-100 rounded-2xl animate-pulse" />}>
              <MiniMap participants={participants} />
            </Suspense>
          </div>
        )}
      </PageWrapper>

      {/* Modal nouveau participant */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="font-heading font-bold text-dark text-lg">Nouveau participant</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-dark transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <ParticipantForm
                onSubmit={async (data) => {
                  const p = await addParticipant(data);
                  setShowForm(false);
                  if (p) {
                    toast.success(`${data.prenom} ${data.nom} ajouté(e) !`);
                    navigate(`/participant/${p.id}`);
                  } else {
                    toast.error('Erreur lors de l\'ajout du patient');
                  }
                }}
                onCancel={() => setShowForm(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal import Excel */}
      {showImport && <ImportExcelModal onClose={() => setShowImport(false)} />}
    </>
  );
}
