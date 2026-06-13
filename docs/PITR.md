# Sauvegardes et restauration ponctuelle (PITR) — Tâche 8

PITR (**Point-in-Time Recovery**) permet de restaurer la base de données
Supabase de production à n'importe quel instant dans une fenêtre récente
(par exemple "il y a 2 heures", avant une migration ratée ou une suppression
accidentelle). C'est le filet de sécurité ultime pour une application qui
gère des données de santé.

⚠️ Comme pour les autres procédures : **rien n'a été activé par Claude**.
Vérifier/activer PITR est une action sur le projet Supabase de production,
à faire toi-même (Lorenzo).

## Étape 1 — Vérifier l'état actuel

1. Va sur https://supabase.com/dashboard/project/rjgzeuywwknubpwigozq
   (projet de production, organisation `horizon-app`).
2. **Settings > Add-ons** (ou **Database > Backups** selon la version du
   dashboard).
3. Regarde si **Point in Time Recovery** est listé comme actif, et quelle
   est la **fenêtre de rétention** (ex. 7 jours).

Par défaut, les projets Supabase sur le plan gratuit n'ont **pas** de PITR
(seulement des sauvegardes quotidiennes sur les plans payants, sans
restauration "à la minute"). Si le projet est sur le plan **Pro** ou
supérieur, PITR peut être activé en complément.

## Étape 2 — Activer PITR (si pas déjà actif)

1. Dans **Settings > Add-ons > Point in Time Recovery**, choisis une durée de
   rétention (7 jours est un bon point de départ).
2. Confirme l'activation. Il peut y avoir un coût supplémentaire selon le
   plan — vérifie la tarification affichée avant de confirmer.
3. Le PITR met un peu de temps à devenir pleinement opérationnel (le temps
   qu'un premier point de base soit établi).

Si le projet est encore sur le plan **gratuit** et que passer au plan Pro
n'est pas envisageable immédiatement : au minimum, planifie des **exports
manuels réguliers** en attendant (voir Étape 4).

## Étape 3 — Tester une restauration (sans impacter la prod)

Ne jamais tester une restauration "pour de vrai" sur le projet de
production. Pour vérifier que PITR fonctionne :

1. Supabase permet de restaurer vers un **nouveau projet** (clone) à un
   instant donné, sans toucher au projet d'origine.
2. Si cette option est disponible dans ton plan, fais un essai une fois après
   l'activation, pour confirmer que la fonctionnalité répond bien — puis
   supprime le projet clone.

## Étape 4 — Filet de sécurité complémentaire : export manuel du schéma

Indépendamment de PITR, il est utile de garder un **instantané du schéma**
à jour dans le dépôt (pas les données, juste la structure) :

```bash
supabase link --project-ref rjgzeuywwknubpwigozq
supabase db dump --schema public -f supabase/schema_dump_reference.sql
```

Voir `supabase/migrations/README.md` ("Générer un instantané de référence du
schéma actuel") — ce fichier n'est pas une migration, juste une référence
pour comparer/diagnostiquer en cas de problème.

## Quand utiliser PITR

- Une migration appliquée par erreur (`supabase db push`) corrompt des
  données.
- Une suppression accidentelle de lignes importantes (ex. participants,
  bilans).
- Avant toute opération risquée (migration qui modifie/supprime des
  colonnes existantes) : note l'heure exacte avant de lancer l'opération,
  pour savoir où restaurer si besoin.

## Procédure de restauration (en cas de besoin réel)

1. Ne pas paniquer, ne pas relancer d'opérations supplémentaires sur la base.
2. Dans le dashboard Supabase du projet de production : **Settings >
   Add-ons > Point in Time Recovery > Restore**.
3. Choisis l'instant juste **avant** l'incident.
4. Supabase guide la restauration (peut nécessiter de créer un nouveau
   projet temporaire pour vérifier les données avant de basculer).
5. Une fois la restauration confirmée, vérifie les variables d'environnement
   Vercel (`VITE_SUPABASE_URL`, clés API) si un nouveau projet a été créé.
