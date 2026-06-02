import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home, Calendar, Route, Dumbbell, Layers, Settings,
  LogOut, Map, BarChart2, Bot,
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
  { path: '/exercices',  icon: Dumbbell,  label: 'Exercices',       end: false },
  { path: '/assistant',  icon: Bot,       label: 'Mon assistant',   end: false },
  { path: '/zones',      icon: Layers,    label: 'Zones',           end: false },
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
      style={{ width: 220, background: '#0D2B2B' }}
    >
      {/* Logo */}
      <div style={{ padding: '32px 20px 20px' }}>
        <NavLink to="/" className="block">
          <img
            src="/logo-horizon.png.png?v=2"
            alt="Horizon"
            style={{ width: 150, height: 'auto', display: 'block' }}
            onError={e => {
              const img = e.target as HTMLImageElement;
              img.src = '/logo-horizon.svg';
              img.style.height = '32px';
            }}
          />
        </NavLink>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-hide" style={{ padding: '0 12px 8px' }}>
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            className={({ isActive }) =>
              `sidebar-nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium no-underline${
                isActive ? ' sidebar-nav-active' : ''
              }`
            }
            style={{ textDecoration: 'none', display: 'flex', marginBottom: 3 }}
          >
            <item.icon size={17} className="flex-shrink-0" />
            {item.label}
          </NavLink>
        ))}

        {/* Paramètres avec indicateur de complétion */}
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `sidebar-nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium relative no-underline${
              isActive ? ' sidebar-nav-active' : ''
            }`
          }
          style={{ textDecoration: 'none', display: 'flex', marginBottom: 3 }}
        >
          <Settings size={17} className="flex-shrink-0" />
          Paramètres
          {incomplete && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-warning" />
          )}
        </NavLink>
      </nav>

      {/* Section praticien */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '16px 16px 20px' }}>

        {/* Avatar + infos + dot en ligne */}
        <div className="flex items-center gap-3 mb-3">
          <div
            className="flex-shrink-0 flex items-center justify-center font-bold text-white rounded-full"
            style={{ width: 36, height: 36, background: '#2BBFBF', fontSize: 12 }}
          >
            {initiales}
          </div>
          <div className="flex-1 min-w-0">
            <div
              className="text-white font-semibold truncate"
              style={{ fontSize: 13, lineHeight: 1.3 }}
            >
              {prenom} {nom}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.3 }}>
              {titrePraticien}
            </div>
          </div>
          <span
            className="online-pulse flex-shrink-0 rounded-full"
            style={{ width: 7, height: 7, background: '#27AE60', display: 'inline-block' }}
          />
        </div>

        <div className="mb-2">
          <IndicateurConnexion />
        </div>
        <div className="mb-3">
          <BoutonInstallerApp compact />
        </div>

        {/* Déconnexion — icône seule + tooltip natif */}
        <button
          onClick={onLogout}
          title="Déconnexion"
          className="flex items-center justify-center rounded-lg"
          style={{
            width: 32, height: 32,
            background: 'rgba(255,255,255,0.05)',
            border: 'none',
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.35)',
            transition: 'all 150ms cubic-bezier(0.4,0,0.2,1)',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.10)';
            (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.70)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
            (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)';
          }}
        >
          <LogOut size={14} />
        </button>
      </div>
    </div>
  );
}
