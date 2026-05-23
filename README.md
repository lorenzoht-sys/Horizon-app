# Mouv'APA - Suivis

Application web de suivi des bilans fonctionnels pour Pierre Clavier, enseignant en Activité Physique Adaptée.

## Démarrage rapide

```bash
npm install
npm run dev
```

Ouvre ensuite [http://localhost:5173](http://localhost:5173) dans ton navigateur.

## Fonctionnalités

### Bilans fonctionnels
- **Tableau de bord** : liste de tous les participants avec indicateurs "bilan à faire"
- **Profil participant** : historique des bilans, radar, courbes de progression
- **Saisie de bilan** : formulaire en 4 étapes avec comparaison temps réel vs bilan précédent
- **Graphiques** : radar (profil fonctionnel) + courbes d'évolution
- **Export PDF** : fiche de suivi complète avec tableau comparatif et message client
- **Espace client** : lien partageable en lecture seule (onglets Progrès + Programme)

### Module Programme d'exercices
- **Bibliothèque** (`/exercices`) : 22 exercices APA couvrant 6 catégories (équilibre, force, mobilité, souplesse, endurance, mémoire) + ajout d'exercices personnalisés
- **Constructeur de programme** (`/participant/:id/programme`) : interface deux colonnes, configuration niveau/séries/jours pour chaque exercice
- **Suivi adhérence** : graphique par semaine + calendrier coloré des 28 derniers jours
- **Vue patient** : programme du jour avec boutons "J'ai fait", ressenti, envoi bilan (accessible via lien client)

## Données de démo

L'application démarre avec 2 participants de démo :
- **Gérard Martin** — 3 bilans (initial + T1 + T2) + 1 programme actif
- **Monique Dubois** — 2 bilans (initial + T1) + 1 programme actif

Pour tester la vue client Gérard : `http://localhost:5173/client/demo-token-gerard-martin`
Pour tester la vue client Monique : `http://localhost:5173/client/demo-token-monique-dubois`

## Sauvegarde des données

Toutes les données sont stockées en **localStorage** (aucun serveur requis).

- **Exporter** : bouton téléchargement ↓ sur le tableau de bord → fichier `.json`
- **Importer** : bouton ↑ sur le tableau de bord → sélectionner un fichier `.json`

## Partage de l'espace client

Sur le profil d'un participant → "Lien client" → copie l'URL unique à envoyer au patient.
L'URL ressemble à : `http://localhost:5173/client/[token-unique]`

## Build de production

```bash
npm run build
```

Les fichiers sont générés dans le dossier `dist/`.

## Stack technique

- React 19 + Vite + TypeScript
- Tailwind CSS 3 (thème Mouv'APA)
- Recharts (courbes + radar)
- jsPDF + html2canvas (export PDF)
- React Router v6
- Lucide React (icônes)
