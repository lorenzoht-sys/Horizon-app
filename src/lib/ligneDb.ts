// Ligne brute lue par le client Supabase.
//
// Le dépôt n'a pas encore de types générés pour la base (`supabase gen types`).
// En attendant, une ligne est typée `any` ICI SEULEMENT (27/11/2026), et chaque
// conversion (src/lib/mappers.ts, quelques hooks) la transforme aussitôt en type
// métier. Remplacer cet alias par les types générés fera apparaître à la
// compilation chaque colonne mal nommée ou mal convertie.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LigneDb = any;
