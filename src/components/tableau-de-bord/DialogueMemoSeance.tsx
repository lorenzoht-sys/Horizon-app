import { useEffect, useRef, useState } from 'react';

// « Modifier le mémo » du prochain rendez-vous (retour de Pierre du 2026-11-24 : compléter vite
// « fatigue lors de la dernière séance, objectifs de travail, équilibre »). Sans migration : on
// écrit l'objectif et la note de LA séance (colonnes `objectif` et `notes` de seances, internes au
// praticien, jamais envoyées au bénéficiaire : voir api/_lib/colonnesSeancesExposees.ts). Un mémo
// permanent du bénéficiaire, qui suivrait d'une séance à l'autre, demandera une colonne : après HDS.
// Partagé par le tableau de bord et l'accueil mobile.

const RACCOURCIS = [
  'Fatigue lors de la dernière séance',
  'Travailler l’équilibre',
  'Douleur à surveiller',
  'Augmenter l’intensité',
  'Refaire le TUG',
];

export function DialogueMemoSeance({ nom, objectifInitial, noteInitiale, onEnregistrer, onAnnuler }: {
  nom: string;
  objectifInitial: string;
  noteInitiale: string;
  onEnregistrer: (v: { objectif: string; notes: string }) => Promise<boolean>;
  onAnnuler: () => void;
}) {
  const [objectif, setObjectif] = useState(objectifInitial);
  const [notes, setNotes] = useState(noteInitiale);
  const [enCours, setEnCours] = useState(false);
  const champ = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { champ.current?.focus(); }, []);

  function ajouter(texte: string) {
    setNotes(n => (n.trim() ? `${n.trim()}\n${texte}` : texte));
    champ.current?.focus();
  }

  async function enregistrer() {
    setEnCours(true);
    const ok = await onEnregistrer({ objectif: objectif.trim(), notes: notes.trim() });
    setEnCours(false);
    if (ok) onAnnuler();
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-black/40"
      onClick={enCours ? undefined : onAnnuler}>
      <div role="dialog" aria-modal="true" aria-labelledby="memo-titre"
        className="w-full max-w-md bg-white rounded-[20px] shadow-2xl p-5 flex flex-col gap-3.5"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === 'Escape' && !enCours) onAnnuler(); }}>
        <div>
          <h2 id="memo-titre" className="m-0 text-base font-extrabold" style={{ color: 'var(--color-ink)' }}>Mémo de la séance</h2>
          <p className="m-0 mt-0.5 text-[13px]" style={{ color: 'var(--color-ink-2)' }}>
            {nom} · visible de vous seul, jamais du bénéficiaire.
          </p>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold" style={{ color: '#147A64' }}>Objectif de la séance</span>
          <input type="text" value={objectif} onChange={e => setObjectif(e.target.value)} maxLength={200}
            placeholder="Ex. : travailler le passage assis-debout"
            className="h-11 rounded-[12px] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            style={{ border: '1.5px solid #D5E4E6' }} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold" style={{ color: '#147A64' }}>Note pour la séance</span>
          <textarea ref={champ} value={notes} onChange={e => setNotes(e.target.value)} rows={4} maxLength={2000}
            placeholder="Fatigue, douleur, ce qui a bien marché la dernière fois…"
            className="rounded-[12px] px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            style={{ border: '1.5px solid #D5E4E6' }} />
        </label>

        <div className="flex flex-wrap gap-1.5" aria-label="Ajouter rapidement">
          {RACCOURCIS.map(r => (
            <button key={r} type="button" onClick={() => ajouter(r)}
              className="min-h-9 px-2.5 rounded-full text-xs font-semibold hover:brightness-95" style={{ background: '#E6F5F1', color: '#147A64' }}>
              + {r}
            </button>
          ))}
        </div>

        <div className="flex gap-2 mt-1">
          <button type="button" onClick={onAnnuler} disabled={enCours}
            className="flex-1 h-12 rounded-[12px] bg-white text-sm font-bold disabled:opacity-60" style={{ border: '1.5px solid #D5E4E6', color: '#3D4C5A' }}>
            Annuler
          </button>
          <button type="button" onClick={() => void enregistrer()} disabled={enCours}
            className="flex-1 h-12 rounded-[12px] text-white text-sm font-bold disabled:opacity-60" style={{ background: '#1A9A7F' }}>
            {enCours ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
