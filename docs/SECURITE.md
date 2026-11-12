# Sécurité d'Horizon : état des mesures

État au 12/11/2026, établi par relecture du code et des migrations. Ce
document décrit ce qui est en place et ce qui reste ouvert ; il ne remplace
pas un audit externe ni un test d'intrusion.

## Mesures en place

### Base de données
- RLS activée sur les 62 tables du schéma `public`, 138 politiques. Six
  tables n'ont aucune politique : elles ne sont accessibles qu'au serveur
  (compteurs de facture, limites de tentatives, logos).
- Privilèges par défaut retirés au rôle `anon` sur les tables ; toute nouvelle
  table reçoit un `REVOKE` puis un `GRANT` ciblé (règle du 2026-08-29).
- Toutes les fonctions `SECURITY DEFINER` fixent leur `search_path`.
- Règles métier sensibles en base : factures inaltérables et numérotées par
  trigger, consentement RGPD exigé à la création d'un bénéficiaire,
  suppression bloquée s'il existe un historique financier, journal d'audit.
- Écritures cloisonnées entre praticiens (12/11/2026, #192 et #193) : une
  ligne ne peut référencer qu'un bénéficiaire, un contrat, une séance, un
  cours, une structure, un modèle ou un dossier auquel son auteur a accès, et
  une facture ne peut porter que le bénéficiaire de son propre contrat
  (trigger `factures_coherence_beneficiaire`). Cinq migrations
  (`20261102100000` à `20261106100000`), appliquées au staging et à la
  production le 12/11/2026. Contrôle préalable en production : aucune
  écriture croisée n'avait eu lieu.
- Harnais RLS : 225 cas exécutés contre le staging à chaque PR
  (`tests/security/`), dont les écritures croisées par clé étrangère. Un
  harnais ignoré fait échouer la CI.

### Accès
| Espace | Mécanisme | Protections |
| --- | --- | --- |
| Praticien | Supabase Auth, e-mail et mot de passe | RLS par `auth.uid()` ; page d'inscription retirée de l'application, comptes créés sur invitation ; déconnexion après 60 minutes d'inactivité, préavis de 2 minutes |
| Patient | code de 8 caractères tiré par `crypto` (alphabet de 31, tirage sans biais, 39,7 bits), puis jeton signé HS256 valable 30 jours | 5 tentatives par 15 minutes et par IP, connexions journalisées ; chaque route patient tire l'identité du jeton, jamais du corps de la requête |
| Structure | jeton de 256 bits en en-tête, avec date d'expiration | accès journalisés, données limitées aux bénéficiaires de la structure |
| Administration | rôle `admin` dans `user_roles`, vérifié côté serveur | |
| Tâches planifiées | secret partagé, comparaison à temps constant | |

### Application
- En-têtes : HSTS (2 ans), `X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy` (`no-referrer` sur les espaces patient et structure),
  `Permissions-Policy`, `Cache-Control: no-store` sur les routes `api/`.
- Aucun `dangerouslySetInnerHTML`, `eval` ni `innerHTML` dans `src/` et `api/`.
- Cache de la PWA limité aux fichiers statiques et aux polices : aucune
  réponse d'API n'est mise en cache.
- Assistant IA : données pseudonymisées avant envoi, taille du prompt
  plafonnée, message système de cadrage contre l'injection, limite de
  requêtes par praticien.
- Sentry en production seulement, sans donnée personnelle
  (`sendDefaultPii: false`, nettoyage avant envoi).
- Secrets serveur jamais préfixés `VITE_` ; recherche de secrets dans le
  bundle à chaque build.

### Chaîne de développement
- CI sur chaque PR : build, typecheck, tests unitaires, harnais RLS, e2e.
- `gitleaks` sur chaque push et sur l'historique complet chaque semaine ;
  `npm audit` sur les dépendances de production.
- Deux tests d'architecture : aucune requête dans les écrans ; identité du
  praticien lue à un seul endroit (`docs/ARCHITECTURE.md`).
- Aucune écriture en production par script : migrations versionnées,
  appliquées à la main (`CHECKLIST_RELEASE.md`).

## Points ouverts

| # | Sujet | Constat | Piste |
| --- | --- | --- | --- |
| 1 | Hébergement | Supabase et Vercel ne sont pas certifiés HDS | migration Clever Cloud (`clevercloud/README.md`) |
| 2 | Sous-traitants | Anthropic (assistant) et Resend (envoi des factures) reçoivent des données de santé | décision à prendre ; pour Resend, envoyer un lien plutôt que le PDF |
| 3 | CSP | déclarée en `Report-Only` : rien n'est bloqué | PR #184 : e2e complet passé avec la CSP appliquée ; exports et imports hors e2e à valider à la main sur le Preview (liste dans la PR) |
| 4 | Praticiens | pas de double authentification (la déconnexion après 60 minutes d'inactivité est en place, #188) | MFA (TOTP), à prévoir avec le fournisseur d'identité de la cible HDS |
| 5 | Patients | le code d'accès est le seul facteur, n'expire pas, et la session dure 30 jours | durée de session plus courte ou renouvellement du code, à décider |
| 6 | Icônes | feuille de style Tabler chargée depuis un CDN en `@latest`, sans contrôle d'intégrité | figer la version ou l'héberger avec l'application |
| 7 | Dépôt GitHub | public ; alertes Dependabot et protection de la branche `main` non vérifiables depuis la CI | réglages du dépôt à revoir |
| 8 | ESLint | absent de la CI | corriger les erreurs existantes puis l'ajouter |
| 9 | Inscription | la page est retirée, mais le réglage « inscriptions ouvertes » du projet Supabase n'est pas visible depuis le code | vérifier dans le tableau de bord que les inscriptions sont fermées |
| 10 | Portail structure | pas de limite de requêtes sur `api/structure/data` | faible, vu la taille du jeton ; à ajouter par cohérence |
