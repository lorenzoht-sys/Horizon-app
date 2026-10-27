// Rappel discret sous les zones de texte libre envoyées à l'IA (lot F sécurité
// HDS, 2026-10-27). Depuis la pseudonymisation (#157), l'identité du
// bénéficiaire ne part plus vers Anthropic, sauf si le praticien la saisit ou
// la dicte lui-même : ce texte libre n'est volontairement pas filtré (un
// filtre de noms donnerait un faux sentiment de sécurité). D'où ce rappel,
// sans blocage ni détection.
import type { CSSProperties } from 'react';

export const TEXTE_RAPPEL_NOMS_IA = "Évitez de citer le nom du bénéficiaire : il est déjà connu d'Horizon.";

export default function RappelNomsIA({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <p
      data-testid="rappel-noms-ia"
      className={className}
      style={{ fontSize: 11, lineHeight: 1.4, color: '#9CA3AF', margin: 0, ...style }}
    >
      {TEXTE_RAPPEL_NOMS_IA}
    </p>
  );
}
