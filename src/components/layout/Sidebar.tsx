import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home, Calendar, Route, Dumbbell, Layers, Settings,
  LogOut, Map, BarChart2,
} from 'lucide-react';
import { IndicateurConnexion, BoutonInstallerApp } from '../pwa/PWAComponents';
import { supabase } from '../../lib/supabase';

interface Props {
  onLogout: () => void;
}

interface PraticienInfo {
  prenom: string;
  nom: string;
  titre: string;
  siret: string | null;
  numero_sap: string | null;
}

const NAV_ITEMS = [
  { path: '/',          icon: Home,      label: 'Tableau de bord', end: true  },
  { path: '/agenda',    icon: Calendar,  label: 'Agenda',          end: false },
  { path: '/tournee',   icon: Route,     label: 'Tournée',         end: false },
  { path: '/exercices', icon: Dumbbell,  label: 'Exercices',       end: false },
  { path: '/zones',     icon: Layers,    label: 'Zones',           end: false },
  { path: '/map',       icon: Map,       label: 'Carte',           end: false },
  { path: '/stats',     icon: BarChart2, label: 'Mes stats',       end: false },
];

export default function Sidebar({ onLogout }: Props) {
  const [praticien, setPraticien] = useState<PraticienInfo | null>(null);

  async function fetchPraticien() {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('praticiens')
      .select('prenom, nom, titre, siret, numero_sap')
      .eq('id', user.id)
      .single();
    if (data) setPraticien(data);
  }

  useEffect(() => {
    fetchPraticien();
    const handler = () => fetchPraticien();
    window.addEventListener('settings_praticien_updated', handler);
    return () => window.removeEventListener('settings_praticien_updated', handler);
  }, []);

  const prenom         = praticien?.prenom || '';
  const nom            = praticien?.nom    || '';
  const titrePraticien = praticien?.titre  || 'Praticien APA';
  const initiales      = `${prenom[0] ?? 'P'}${nom[0] ?? 'C'}`.toUpperCase();
  const incomplete     = !praticien?.siret || !praticien?.numero_sap;

  return (
    <div
      className="fixed left-0 top-0 bottom-0 flex flex-col z-50"
      style={{ width: 220, background: '#032c28' }}
    >
      {/* Logo */}
      <div className="px-5 pt-5 pb-5">
        <NavLink to="/" className="block">
          <img
            src="/logo-horizon.png.png?v=2"
            alt="Horizon"
            style={{ width: 160, height: 'auto', display: 'block' }}
            onError={e => {
              const img = e.target as HTMLImageElement;
              img.src = '/logo-horizon.svg';
              img.style.height = '32px';
            }}
          />
        </NavLink>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm font-medium transition-all no-underline ${
                isActive
                  ? 'sidebar-nav-active text-white'
                  : 'sidebar-nav-item text-white/55'
              }`
            }
            style={{ textDecoration: 'none' }}
          >
            <item.icon size={17} className="flex-shrink-0" />
            {item.label}
          </NavLink>
        ))}

        {/* Paramètres avec indicateur de complétion */}
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm font-medium transition-all relative no-underline ${
              isActive
                ? 'sidebar-nav-active text-white'
                : 'sidebar-nav-item text-white/55'
            }`
          }
          style={{ textDecoration: 'none' }}
        >
          <Settings size={17} className="flex-shrink-0" />
          Paramètres
          {incomplete && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-warning" />
          )}
        </NavLink>
      </nav>

      {/* Profil + déconnexion */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '16px 20px' }}>

        <div className="flex items-center gap-3 mb-3">
          <div
            className="flex-shrink-0 flex items-center justify-center font-bold text-white text-xs rounded-full"
            style={{ width: 34, height: 34, background: '#2BBFBF', fontSize: 11 }}
          >
            {initiales}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white font-semibold truncate" style={{ fontSize: 13 }}>
              {prenom} {nom}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
              {titrePraticien}
            </div>
          </div>
        </div>

        <div className="mb-2.5">
          <IndicateurConnexion />
        </div>

        <div className="mb-2.5">
          <BoutonInstallerApp compact />
        </div>

        <button
          onClick={onLogout}
          className="flex items-center gap-2 w-full text-left transition-colors"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 12, padding: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.75)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.4)'; }}
        >
          <LogOut size={13} />
          Déconnexion
        </button>
      </div>
    </div>
  );
}
