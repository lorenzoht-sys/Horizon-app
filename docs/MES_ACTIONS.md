# Mes actions — ce que Lorenzo doit faire lui-même

Ce fichier liste les actions de l'audit sécurité qui ne peuvent pas être
faites depuis le code (réglages de dashboard, décisions humaines, secrets à
manipuler toi-même). Complété au fil de l'audit — voir
`docs/RAPPORT_SECURITE.md` pour le détail des findings correspondants.

## Sécurité / configuration externe

- [ ] **Vérifier la région du projet Sentry (US vs EU)** — donnée de santé
  qui transiterait par des serveurs hors UE sans base légale documentée
  est un point de conformité RGPD, pas seulement technique. Ce n'est pas
  visible depuis le code (`src/lib/sentry.ts` / `api/_lib/sentry.ts`),
  c'est un réglage du dashboard Sentry (Organization Settings > Region,
  au moment de la création du projet). Si le projet est en région US et
  que Sentry est activé en production (voir `docs/SENTRY.md`), il faut
  soit migrer vers un projet EU, soit documenter la base légale du
  transfert.
