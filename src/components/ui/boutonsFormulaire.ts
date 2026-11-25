// Charte graphique des formulaires (25/11/2026). Fichier séparé du composant
// EtapesFormulaire pour garder le rechargement à chaud (react-refresh).

/** Classes des boutons de navigation des formulaires (charte : 44 px, rayon 12). */
export const BTN_PRINCIPAL =
  'min-h-[44px] px-6 rounded-[12px] font-semibold text-white bg-[color:var(--vert-action)] hover:bg-[color:var(--vert-action-appui)] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed';
export const BTN_SECONDAIRE =
  'min-h-[44px] px-5 rounded-[12px] font-semibold bg-white border border-[color:var(--trait-champ)] text-[color:var(--encre)] hover:bg-[color:var(--surface-douce)] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed';
