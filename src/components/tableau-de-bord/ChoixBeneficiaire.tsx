import { useEffect, useRef, useState } from 'react';
import { X, Search } from 'lucide-react';
import type { Participant } from '../../types';
import { filtrerParNom } from '../../lib/archivage';

// « Pour qui ? » : actions rapides du tableau de bord (Nouveau bilan, Dicter une séance).
// Les personnes vues aujourd'hui sont proposées en premier : c'est presque toujours elles.

export function ChoixBeneficiaire({ titre, participants, suggeres, onChoisir, onFermer }: {
  titre: string;
  participants: Participant[];
  /** Identifiants proposés en tête (rendez-vous du jour). */
  suggeres: string[];
  onChoisir: (p: Participant) => void;
  onFermer: () => void;
}) {
  const [recherche, setRecherche] = useState('');
  const champ = useRef<HTMLInputElement>(null);
  useEffect(() => { champ.current?.focus(); }, []);

  const filtres = filtrerParNom(participants, recherche);
  const enTete = recherche ? [] : suggeres.map(id => filtres.find(p => p.id === id)).filter((p): p is Participant => !!p);
  const reste = filtres.filter(p => !enTete.includes(p));

  const ligne = (p: Participant) => (
    <li key={p.id}>
      <button type="button" onClick={() => onChoisir(p)} className="w-full text-left px-3 py-2.5 rounded-[10px] text-sm font-semibold hover:bg-gray-50" style={{ color: 'var(--color-ink)' }}>
        {p.prenom} {p.nom}{p.adresseVille && <span className="font-normal" style={{ color: 'var(--color-ink-2)' }}> · {p.adresseVille}</span>}
      </button>
    </li>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onFermer}>
      <div role="dialog" aria-modal="true" aria-labelledby="titre-choix" className="bg-white rounded-[20px] shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') onFermer(); }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 id="titre-choix" className="m-0 font-heading font-extrabold text-lg">{titre}</h2>
          <button type="button" onClick={onFermer} aria-label="Fermer" className="w-9 h-9 rounded-[10px] flex items-center justify-center hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="px-5 pb-3 relative">
          <Search size={16} className="absolute left-8 top-1/2 -translate-y-1/2 -mt-1.5" style={{ color: 'var(--color-ink-2)' }} aria-hidden="true" />
          <input ref={champ} value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Rechercher un bénéficiaire…" aria-label="Rechercher un bénéficiaire"
            className="w-full h-[42px] pl-10 pr-3 rounded-[10px] text-sm focus:outline-none focus:ring-[3px] focus:ring-primary/15" style={{ border: '1.5px solid #E2EEEE' }} />
        </div>
        <div className="overflow-y-auto px-3 pb-4">
          {enTete.length > 0 && (
            <>
              <p className="m-0 px-3 pt-1 pb-1 text-xs font-bold" style={{ color: 'var(--color-ink-2)' }}>Vu(e)s aujourd’hui</p>
              <ul className="list-none m-0 p-0">{enTete.map(ligne)}</ul>
              <p className="m-0 px-3 pt-3 pb-1 text-xs font-bold" style={{ color: 'var(--color-ink-2)' }}>Tous les bénéficiaires</p>
            </>
          )}
          {reste.length === 0 && enTete.length === 0
            ? <p className="m-0 px-3 py-4 text-sm" style={{ color: 'var(--color-ink-2)' }}>Aucun bénéficiaire ne correspond.</p>
            : <ul className="list-none m-0 p-0">{reste.map(ligne)}</ul>}
        </div>
      </div>
    </div>
  );
}
