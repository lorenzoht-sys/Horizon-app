import { Link, useLocation } from 'react-router-dom';
import { Map, HelpCircle, LogOut, Settings, CalendarDays, Route, Layers } from 'lucide-react';

interface Props {
  onShowOnboarding: () => void;
  onLogout: () => void;
}

function settingsIncomplete(): boolean {
  try {
    const raw = localStorage.getItem('settings_praticien');
    if (!raw) return true;
    const s = JSON.parse(raw);
    return !s.siret || !s.numeroSAP;
  } catch {
    return true;
  }
}

export default function Header({ onShowOnboarding, onLogout }: Props) {
  const { pathname } = useLocation();
  const incomplete = settingsIncomplete();

  function navClass(path: string) {
    const active = pathname === path || (path !== '/' && pathname.startsWith(path));
    return `text-sm px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
      active ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
    }`;
  }

  return (
    <header className="bg-dark text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <img src="/logo.png" alt="Mouv'APA" height={32} className="block sm:hidden" style={{ height: 32, width: 'auto' }} />
          <img src="/logo.png" alt="Mouv'APA" height={40} className="hidden sm:block" style={{ height: 40, width: 'auto' }} />
          <span className="hidden sm:block font-heading font-bold text-lg leading-none">Mouv'APA - Suivis</span>
        </Link>
        <nav className="flex items-center gap-1">
          <Link to="/" className={navClass('/')}>
            Tableau de bord
          </Link>
          <Link to="/zones" className={navClass('/zones')}>
            <Layers size={14} />
            <span className="hidden sm:inline">Zones</span>
          </Link>
          <Link to="/agenda" className={navClass('/agenda')} title="Agenda (calendrier + planificateur)">
            <CalendarDays size={14} />
            <span className="hidden sm:inline">Agenda</span>
          </Link>
          <Link to="/tournee" className={navClass('/tournee')} title="Tournée optimisée du jour">
            <Route size={14} />
            <span className="hidden sm:inline">Tournée</span>
          </Link>
          <Link to="/map" className={navClass('/map')}>
            <Map size={14} />
            <span className="hidden sm:inline">Carte</span>
          </Link>
          <Link to="/exercices" className={navClass('/exercices')}>
            Exercices
          </Link>
          <Link to="/settings" className={`${navClass('/settings')} relative`} title="Paramètres">
            <Settings size={16} />
            <span className="hidden sm:inline">Paramètres</span>
            {incomplete && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-warning rounded-full border border-dark" />
            )}
          </Link>
          <button
            onClick={onShowOnboarding}
            className="text-white/60 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition-colors"
            title="Revoir le tutoriel"
          >
            <HelpCircle size={18} />
          </button>
          <button
            onClick={onLogout}
            className="text-white/60 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition-colors"
            title="Se déconnecter"
          >
            <LogOut size={18} />
          </button>
        </nav>
      </div>
    </header>
  );
}
