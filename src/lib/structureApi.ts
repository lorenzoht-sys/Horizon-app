// Client fetch pour /api/structure/data (T5 — sécurisation Horizon).
// Remplace l'accès Supabase anonyme par token (createStructurePortailClient) :
// le token est transmis dans l'en-tête "x-structure-token" et validé côté
// serveur (clé service_role, jamais exposée ici).

interface StructureDataResponse {
  structure: { id: string; nom: string; actif: boolean; tarifSeance: number };
  praticien: { prenom: string; nom: string; titre?: string | null; email?: string | null; telephone?: string | null } | null;
  participants: Record<string, unknown>[];
  seances: Record<string, unknown>[];
  factures: FactureStructure[];
  documents: DocumentPartage[];
}

// Lignes de documents_partages et factures_suivi renvoyées par la route,
// limitées aux colonnes que le portail lit.
export interface DocumentPartage {
  id: string; participant_id: string; type_document: string; date_document: string; contenu: string | null;
}
export interface FactureStructure {
  id: string; statut: string; montant_total: number | string; nb_seances: number;
  periode_mois: number; periode_annee: number; date_envoi: string | null;
}

export async function fetchStructureData(token: string): Promise<{ ok: true; data: StructureDataResponse } | { ok: false }> {
  try {
    const res = await fetch('/api/structure/data', {
      headers: { 'x-structure-token': token },
    });
    if (!res.ok) return { ok: false };
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false };
  }
}
