export function useFacturesAValider() { return { brouillons: [{ periode: '2026-10' }, { periode: '2026-10' }], chargement: false } as never; }
export function useFacturesValidees() { return { factures: [{ type: 'facture', statut: 'en_retard' }, { type: 'facture', statut: 'envoyee' }, { type: 'facture', statut: 'validee' }], chargement: false } as never; }
