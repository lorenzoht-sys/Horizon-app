# Dépendance `xlsx` — état et options (2026-08-19)

Pas d'arbitrage ici — les faits, pour que Lorenzo tranche.

## Ce que `xlsx` traite chez nous, exactement

**Rien côté structures, rien côté serveur.** Usage unique, 100% côté
client (navigateur), réservé au praticien authentifié :

- `src/components/import/ImportExcelModal.tsx:45` — `XLSX.read(buffer, ...)`
  parse le fichier **importé par le praticien** (bouton "Import/Export
  bénéficiaires", `Dashboard.tsx`) pour créer des participants en masse.
  Formats acceptés : `.xlsx`, `.xls`, `.csv` (`ImportExcelModal.tsx:35`).
  C'est le seul appel qui lit un fichier dont le contenu n'est pas
  contrôlé par nous (le praticien choisit un fichier sur sa machine).
- `src/utils/excelImport.ts` — `XLSX.utils.book_new()`/`writeFile()` pour
  **générer** un template (`downloadTemplate()`) et **exporter** la liste
  des patients (`exportPatientsExcel()`) : ces chemins écrivent des
  fichiers, ils ne parsent rien d'externe — pas concernés par les CVE
  ci-dessous (l'avis GHSA le confirme explicitement : "workflows that do
  not read arbitrary files ... are unaffected").
- Aucun usage dans `api/*` — confirmé, `xlsx` n'est même pas une
  dépendance du projet `api/tsconfig.json`.

**Portée du risque** : un praticien authentifié important un fichier
malveillant expose son propre navigateur/onglet (pas notre serveur —
tout tourne côté client). Pas un vecteur d'accès à de la donnée d'un
autre praticien ou d'un patient. Scénario réaliste : fichier reçu d'un
tiers (email, clé USB, collègue) puis importé sans le savoir infecté.

## CVE ouvertes (version installée : `xlsx@0.18.5`, confirmé `npm ls xlsx`)

| CVE / Advisory | Type | Versions affectées | Version corrigée | Où | Sévérité |
|---|---|---|---|---|---|
| CVE-2023-30533 ([GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6)) | Prototype Pollution — déclenché en lisant un fichier forgé | Toutes ≤ 0.19.2 (donc 0.18.5 affectée) | 0.19.3 | **Jamais publiée sur npm** — uniquement via `https://cdn.sheetjs.com/` | High (CVSS 7.8) |
| [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) | ReDoS — regex inefficace, consomme le CPU | < 0.20.2 (donc 0.18.5 affectée) | 0.20.2 | **Jamais publiée sur npm** — uniquement via `https://cdn.sheetjs.com/` | High (CVSS 7.5) |

Les deux avis disent la même chose : *"a non-vulnerable version cannot be
found via npm, as the repository hosted on GitHub and the npm package
`xlsx` are no longer maintained."* Ce n'est pas un oubli de mise à jour —
SheetJS a arrêté de publier les correctifs sur le registre npm public ;
la version corrigée existe, mais ailleurs. C'est pour ça que
`npm audit fix` (LOT C) n'a rien pu faire ici alors qu'il a résolu les 10
autres vulnérabilités du projet.

## Options, sans arbitrage

**Option A — Rester sur `xlsx`, changer la source d'installation.**
Remplacer `"xlsx": "^0.18.5"` par une URL vers le tarball SheetJS CDN (ex.
`"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"`), toujours
distribué par l'éditeur d'origine — corrige les deux CVE, zéro changement
de code (même API). Contrepartie : dépendance à une URL tierce hors
registre npm (le tarball n'est plus vérifiable via les mécanismes
standards npm — signature/provenance du registre), et `package-lock.json`
référence alors un hôte externe plutôt qu'un registre.

**Option B — Migrer vers `exceljs`.** Activement utilisé (11,5M
téléchargements/semaine), aucune vulnérabilité ouverte sur sa dernière
version publiée (4.4.0, Snyk vérifié 2026-08-19). Nuance à ne pas ignorer :
aucune nouvelle version publiée sur npm depuis plus de 12 mois — pas
abandonné au sens de SheetJS (le dépôt reste actif), mais pas un rythme de
publication soutenu non plus. Support `.csv` à vérifier (ExcelJS cible
surtout `.xlsx` ; nos imports acceptent aussi `.xls`/`.csv`,
`ImportExcelModal.tsx:35` — un remplacement toucherait `excelImport.ts`
et `ImportExcelModal.tsx`, pas juste `package.json`).

**Option C — Ne rien faire, réduire le risque autrement.** Le vecteur
réel est "praticien importe un fichier reçu d'un tiers" — un
avertissement dans l'UI d'import ("n'importez que des fichiers dont vous
connaissez la provenance") réduit l'exposition sans toucher au code, mais
ne corrige pas la vulnérabilité elle-même.

Aucune des trois n'est appliquée — décision à prendre par Lorenzo.
