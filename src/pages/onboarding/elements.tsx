// Briques visuelles de l'accueil praticien (OnboardingPage).
import type { ReactNode, InputHTMLAttributes } from 'react';
import { Check } from 'lucide-react';

export function Champ({ libelle, aide, requis, children }: {
  libelle: string; aide?: string; requis?: boolean; children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink">
        {libelle}
        {requis && <span className="ml-0.5 text-teal-dark" aria-hidden>*</span>}
      </span>
      {children}
      {aide && <span className="mt-1.5 block text-xs leading-relaxed text-ink-2">{aide}</span>}
    </label>
  );
}

export function Saisie({ icone, ...props }: InputHTMLAttributes<HTMLInputElement> & { icone?: ReactNode }) {
  return (
    <div className="relative">
      {icone && (
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3">{icone}</span>
      )}
      <input
        {...props}
        className={`w-full rounded-md border border-black/10 bg-white py-3 text-[15px] text-ink shadow-[0_1px_2px_rgba(0,0,0,0.03)] outline-none transition placeholder:text-ink-3 focus:border-teal focus:ring-4 focus:ring-teal/15 ${icone ? 'pl-10 pr-4' : 'px-4'}`}
      />
    </div>
  );
}

/** Grande carte à choisir (métier, lieu, statut). `multiple` : case à cocher plutôt que bouton radio. */
export function CarteChoix({ choisi, onClick, icone, titre, aide, multiple, testid }: {
  choisi: boolean; onClick: () => void; icone?: ReactNode; titre: string; aide?: string; multiple?: boolean; testid?: string;
}) {
  return (
    <button
      type="button"
      role={multiple ? 'checkbox' : 'radio'}
      aria-checked={choisi}
      data-testid={testid}
      onClick={onClick}
      className={`group relative flex w-full ${aide ? 'items-start' : 'items-center'} gap-3 rounded-md border p-3.5 text-left transition
        ${choisi
          ? 'border-teal bg-teal-light/70 shadow-[0_0_0_3px_rgba(43,184,154,0.15)]'
          : 'border-black/10 bg-white hover:border-teal/50 hover:bg-teal-light/30'}`}
    >
      {icone && (
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-sm transition
          ${choisi ? 'bg-teal text-white' : 'bg-surface-2 text-teal-dark group-hover:bg-teal-light'}`}>
          {icone}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold leading-snug text-ink">{titre}</span>
        {aide && <span className="mt-0.5 block text-xs leading-snug text-ink-2">{aide}</span>}
      </span>
      <span className={`${aide ? 'mt-0.5' : ''} flex h-5 w-5 shrink-0 items-center justify-center border transition
        ${multiple ? 'rounded-[6px]' : 'rounded-full'}
        ${choisi ? 'border-teal bg-teal text-white' : 'border-black/15 bg-white text-transparent'}`}>
        <Check size={13} strokeWidth={3} />
      </span>
    </button>
  );
}

/** Pastille à bascule (publics accompagnés). */
export function Puce({ choisie, onClick, children }: { choisie: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={choisie}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-medium transition
        ${choisie
          ? 'border-teal bg-teal text-white shadow-teal'
          : 'border-black/10 bg-white text-ink hover:border-teal/50'}`}
    >
      {choisie && <Check size={13} strokeWidth={3} />}
      {children}
    </button>
  );
}
