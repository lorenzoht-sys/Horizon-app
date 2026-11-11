# Couche d'accès aux données

Règle (2026-11-11) : **aucune page ni aucun composant ne construit de requête**.
Les requêtes vivent ici, dans `src/hooks/` (un hook par domaine) ou dans les
modules métier de `src/lib/`. Le test `couches.test.ts` échoue si un
`.from('…')` ou un `.rpc('…')` réapparaît dans `src/pages/` ou
`src/components/`.

Pourquoi : changer de source de données (migration HDS, remplacement de
PostgREST par une API) se fait alors dans une couche connue, pas dans des
écrans.

Les fonctions de ce dossier renvoient la requête Supabase telle quelle
(`{ data, error }` une fois attendue) : extraites à l'identique des pages,
elles n'ajoutent ni logique ni transformation. L'appelant vérifie que
Supabase est configuré (`supabase` non nul) avant de les appeler.
