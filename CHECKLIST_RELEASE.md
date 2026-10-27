# Checklist avant mise en production

À suivre avant de merger une branche sur `main` (ou de fusionner
`consolidation` → `main`). Cette checklist ne remplace pas la relecture du
code : elle vérifie que les vérifications automatiques et les étapes
manuelles connues ont bien été faites.

## 1. Vérifications automatiques (locales ou via CI)

- [ ] `npx tsc --noEmit` (front `src/`) — aucune erreur.
- [ ] `npm run typecheck:api` — aucune erreur sur `api/`.
- [ ] `npm run typecheck:e2e` — aucune erreur sur `e2e/`.
- [ ] `npm run build` — build de production réussi.
- [ ] CI GitHub Actions verte sur la branche (job `build` obligatoire ; job
      `e2e` si l'environnement de staging est configuré, voir
      `e2e/README.md`).

## 2. Base de données (Supabase)

- [ ] Tous les fichiers `supabase/migrations/*.sql` nouveaux depuis le
      dernier déploiement ont été relus.
- [ ] Ces migrations ont été appliquées **manuellement** sur le projet de
      production (`supabase db push`, ou copier-coller dans le SQL Editor —
      voir `supabase/migrations/README.md`). **Claude ne doit jamais exécuter
      de SQL sur la base de production.**
- [ ] `supabase/migrations/README.md` est à jour (section "État actuel de
      l'historique" reflète les migrations effectivement appliquées).

## 3. Contrôle d'appartenance (routes API et policies RLS)

Règle d'origine (F-13/F-14, 2026-08-19, `docs/RAPPORT_SECURITE.md`),
retirée par erreur de cette checklist puis réintégrée le 2026-10-27 :

- [ ] Pour toute route `api/*` nouvelle ou modifiée : **tout identifiant
      reçu du client** (body, query, header — pas l'identité elle-même,
      celle vérifiée par le JWT/token) qui référence une ligne en base a
      un contrôle d'appartenance explicite avant lecture/écriture — une
      requête qui filtre à la fois par cet identifiant ET par l'identité
      vérifiée, pas juste par l'identifiant seul.
- [ ] Une contrainte de clé étrangère n'est **jamais** considérée comme
      suffisante à elle seule : une FK prouve qu'une ligne existe, jamais
      qu'elle appartient à l'appelant.
- [ ] En cas d'échec du contrôle, la route répond `404`, jamais `403` (qui
      confirme l'existence d'une ressource d'un tiers) ni un comportement
      qui distingue "id inexistant" de "id existant mais pas à vous" par
      un canal observable (code HTTP, message, timing).

Règle apprise des fuites d'écriture du 2026-10-27 (PR #164, #166 à #170,
voir `docs/SECURITE_ECRITURE_RLS.md`) :

- [ ] **Toute policy d'écriture (`INSERT`, `UPDATE`, `ALL`) qui référence
      une clé étrangère vérifie l'appartenance de l'objet référencé**
      (bénéficiaire, contrat, séance, structure, cours, modèle…), pas
      seulement `praticien_id = auth.uid()`. Le `WITH CHECK` est explicite.
- [ ] Toute nouvelle table qui porte une clé étrangère vers un objet d'un
      praticien a son test d'écriture croisée dans
      `tests/security/rls-ecriture-cles.spec.ts` (insertion et repointage
      par un autre praticien, plus l'écriture légitime du propriétaire).

## 4. Variables d'environnement (Vercel)

- [ ] `.env.example` est à jour si de nouvelles variables ont été ajoutées.
- [ ] Les nouvelles variables sont configurées dans Vercel, avec le bon
      périmètre d'environnement :
  - **Production** : vraies valeurs (base de prod, secrets de prod).
  - **Preview** : valeurs de staging (voir
    `supabase/migrations/SETUP_STAGING.md`), jamais les secrets de prod.
- [ ] Aucun secret (clé API, mot de passe, token) n'est commité dans le code
      (voir audit des secrets dans `RAPPORT_SECURISATION.md`, T8).

## 5. Vérification manuelle "site en marche"

Sur un déploiement de Preview (ou en local avec les variables de staging) :

- [ ] **Espace praticien** : connexion, ouverture d'un participant, d'un
      bilan, du programme et de l'agenda — pas d'erreur console.
- [ ] **Espace patient** (`/patient`) : connexion avec un code de test,
      consultation du programme, validation d'une séance.
- [ ] **Portail structure** (`/structure/:token`) : ouverture du lien de
      test, données affichées correctement.
- [ ] Si la modification touche l'export PDF, l'assistant IA, ou l'import
      Excel : tester ce parcours spécifiquement (non couvert par tous les
      tests E2E).

## 6. Supervision

- [ ] Si Sentry est configuré (`docs/SENTRY.md`), vérifier qu'aucune
      régression de confidentialité n'a été introduite (pas de nouvelle
      donnée de santé transmise via `beforeSend`/`beforeBreadcrumb`).

## 7. Après le merge sur `main`

- [ ] Vérifier le déploiement de Production sur Vercel (build réussi,
      pas d'erreur au démarrage).
- [ ] Refaire rapidement le tour "site en marche" (section 5) sur l'URL de
      production.
- [ ] Si une migration a été appliquée juste avant : vérifier qu'un point de
      restauration récent existe (voir `docs/PITR.md`).
