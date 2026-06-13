# Protéger la branche `main` (Tâche 8)

Objectif : empêcher qu'une modification (la tienne ou celle d'un futur
collaborateur) parte directement en production sans passer par une pull
request et sans que la CI soit verte.

⚠️ Comme pour les autres procédures de configuration : **aucune de ces
étapes n'a été exécutée par Claude**. C'est une configuration GitHub à faire
toi-même (Lorenzo), une seule fois.

## Étape 1 — Ouvrir les règles de protection

Sur https://github.com — dépôt du projet — **Settings > Branches > Branch
protection rules > Add rule** (ou **Add branch protection rule**).

Dans **Branch name pattern**, indique `main`.

## Étape 2 — Règles recommandées

Coche au minimum :

- **Require a pull request before merging**
  - Empêche tout `git push` direct sur `main` : tout changement passe par
    une PR.
  - Optionnel : **Require approvals** (1) si tu travailles un jour avec
    quelqu'un d'autre. Seul, tu peux laisser ce champ à 0 — l'important est
    d'obliger le passage par une PR (et donc par la CI).

- **Require status checks to pass before merging**
  - Recherche et sélectionne le check **`build`** (job défini dans
    `.github/workflows/ci.yml`) — il exécute `npm run build`,
    `typecheck:api` et `typecheck:e2e` sur chaque PR.
  - Le job `e2e` est conditionnel (actif seulement si l'environnement de
    staging est configuré, voir `e2e/README.md`) : ne le marque comme requis
    que si tu as fini la mise en place du staging et que tu vois ce check
    apparaître régulièrement dans les PRs.
  - Coche également **Require branches to be up to date before merging**
    pour éviter de merger une branche qui n'a pas encore vu les derniers
    changements de `main`.

- **Do not allow bypassing the above settings**
  - Applique aussi ces règles aux administrateurs (toi-même) — évite les
    "exceptions" qui finissent par devenir la norme.

## Étape 3 — Optionnel mais recommandé

- **Require linear history** : interdit les merge commits "désordonnés",
  utile si tu veux un historique `main` propre (squash & merge).
- **Require conversation resolution before merging** : oblige à traiter
  chaque commentaire de review avant de merger.

## Étape 4 — Vérifier

1. Crée une branche de test, modifie un fichier trivial (ex. un commentaire),
   ouvre une PR vers `main`.
2. Vérifie que le bouton "Merge" est grisé jusqu'à ce que le check `build`
   soit vert.
3. Vérifie qu'un `git push` direct sur `main` (depuis ta machine) est refusé
   par GitHub avec un message expliquant la règle de protection.

## Et la branche `consolidation` ?

Pas de protection nécessaire : c'est une branche de travail. La protection
ne concerne que `main` (déploiement de production sur Vercel).
