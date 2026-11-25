// Aperçu vivant de l'en-tête des documents (comptes rendus, contrats,
// factures), qui se remplit à mesure que le praticien répond. C'est la
// réponse visible à « pourquoi on me demande ça ? ».
import { UserRound } from 'lucide-react';
import { initialesPraticien } from '../../lib/initiales';
import type { ReponsesOnboarding } from '../../lib/onboarding';

const Trait = ({ largeur }: { largeur: string }) => (
  <div className="h-1.5 rounded-full bg-ink/[0.07]" style={{ width: largeur }} />
);

export default function ApercuDocument({ r, titre }: { r: ReponsesOnboarding; titre: string }) {
  const initiales = initialesPraticien(r.prenom, r.nom);
  const nomComplet = [r.prenom.trim(), r.nom.trim().toLocaleUpperCase('fr-FR')].filter(Boolean).join(' ');
  const ville = [r.adresseCodePostal.trim(), r.adresseVille.trim()].filter(Boolean).join(' ');
  const siret = r.statut !== 'salarie' && r.siret.trim() ? r.siret.trim() : '';
  return (
    <div className="rounded-lg bg-white p-5 text-left shadow-[0_18px_50px_rgba(5,40,34,0.35)]" aria-hidden>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-light text-sm font-bold text-teal-dark">
          {initiales || <UserRound size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold text-ink">
            {nomComplet || <span className="text-ink-3">Votre nom</span>}
            {r.statut === 'ei' && nomComplet && <span className="ml-1.5 text-[11px] font-semibold text-ink-2">EI</span>}
          </div>
          <div className="truncate text-xs text-teal-dark">{titre || <span className="text-ink-3">Votre métier</span>}</div>
          {r.societe.trim() && r.statut !== 'salarie' && <div className="truncate text-xs text-ink-2">{r.societe.trim()}</div>}
        </div>
      </div>
      <div className="mt-3 space-y-0.5 border-t border-dashed border-black/10 pt-3 text-[11px] leading-relaxed text-ink-2">
        {r.adresseRue.trim() || ville
          ? <div className="truncate">{[r.adresseRue.trim(), ville].filter(Boolean).join(', ')}</div>
          : <Trait largeur="70%" />}
        {r.telephone.trim() ? <div>{r.telephone.trim()}</div> : <div className="pt-1"><Trait largeur="40%" /></div>}
        {siret && <div className="font-mono">SIRET {siret}</div>}
      </div>
      <div className="mt-4 rounded-sm bg-surface-2 px-3 py-2.5">
        <div className="text-[11px] font-bold uppercase tracking-wide text-ink">Compte rendu de bilan</div>
        <div className="mt-2 space-y-1.5"><Trait largeur="92%" /><Trait largeur="80%" /><Trait largeur="64%" /></div>
      </div>
    </div>
  );
}
