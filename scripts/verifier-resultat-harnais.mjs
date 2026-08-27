// scripts/verifier-resultat-harnais.mjs
//
// Contrôle le rapport JSON produit par `vitest run tests/security` et décide
// si le job doit passer ou échouer. Appelé par le job `audit` de
// .github/workflows/security.yml.
//
// ── Pourquoi ce fichier existe, plutôt qu'un `node -e` dans le YAML ──────
// Cette logique vivait en ligne dans le workflow. Elle contenait un défaut
// que personne ne pouvait voir sans la lire attentivement : le contrôle des
// SKIP était placé APRÈS celui des échecs, qui fait `process.exit(1)`. Or un
// test échoue en permanence (couverture `information_schema`, échec connu et
// accepté — voir docs/PLAN-BETA.md). Le contrôle des skips était donc
// INATTEIGNABLE depuis sa création : un bloc entier du harnais pouvait être
// ignoré sans que rien ne le signale, malgré le nom de l'étape qui promet
// l'inverse. Constaté le 2026-08-27.
//
// Un garde-fou qu'on ne peut pas exécuter hors de la CI ne peut pas être
// vérifié — et c'est exactement ce qui l'a laissé cassé. D'où ce script :
// il s'exécute sur n'importe quel rapport, donc il est testable.
//
// ── Aucune sortie anticipée ──────────────────────────────────────────────
// Le défaut d'origine venait d'un `process.exit(1)` placé avant un autre
// contrôle. Inverser les deux blocs aurait déplacé le problème sans le
// supprimer : le second serait resté inatteignable dès que le premier se
// déclenche. Ce script ne sort donc JAMAIS au milieu — il collecte tout,
// affiche tout, et décide à la fin.
//
// Les SKIP sont affichés en premier parce qu'ils sont plus graves qu'un
// échec : un test qui échoue a au moins tourné et dit quelque chose ; un
// test ignoré ne dit rien et se présente comme du vert.
//
// Usage :
//   node scripts/verifier-resultat-harnais.mjs <rapport.json>

import { readFileSync } from 'fs';

const chemin = process.argv[2];
if (!chemin) {
  console.error('::error::Usage : node scripts/verifier-resultat-harnais.mjs <rapport.json>');
  process.exit(1);
}

let rapport;
try {
  rapport = JSON.parse(readFileSync(chemin, 'utf-8'));
} catch (err) {
  console.error(`::error::Rapport de test illisible (${chemin}) : ${err.message}`);
  process.exit(1);
}

const total = rapport.numTotalTests || 0;
const echecs = rapport.numFailedTests || 0;
const ignores = rapport.numPendingTests || 0;

// Parcourt les assertions du rapport et renvoie les noms de celles dont le
// statut figure dans `statuts`.
function noms(statuts) {
  const out = [];
  for (const fichier of rapport.testResults || []) {
    for (const a of fichier.assertionResults || []) {
      if (statuts.includes(a.status)) out.push(a);
    }
  }
  return out;
}

if (total === 0) {
  console.error('::error::Aucun test trouvé dans tests/security/ — vérifie include dans vitest.config.ts.');
  process.exit(1);
}

let probleme = false;

// ── SKIP ──────────────────────────────────────────────────────────────────
// Un test ignoré n'a pas tourné : il ne prouve rien, mais ne colore rien en
// rouge non plus. C'est le cas le plus dangereux. Note : vitest range aussi
// ici les tests d'une suite dont le `beforeAll` a échoué — ils n'ont jamais
// été exécutés, et doivent être traités comme tels.
if (ignores > 0) {
  for (const a of noms(['pending', 'skipped', 'todo'])) {
    console.error(`::error::SKIP : ${a.fullName}`);
  }
  console.error(
    `::error::${ignores}/${total} test(s) SKIP dans tests/security/ ` +
      `(secrets STAGING_* manquants ou invalides, ou hook de préparation en échec) — ` +
      `voir tests/security/rls.spec.ts. Un skip ne peut jamais être vert ici.`
  );
  probleme = true;
}

// ── ÉCHEC ─────────────────────────────────────────────────────────────────
if (echecs > 0) {
  for (const a of noms(['failed'])) {
    console.error(`::error::ÉCHEC : ${a.fullName}`);
    for (const m of a.failureMessages || []) console.error(m.split('\n')[0]);
  }
  console.error(`::error::${echecs}/${total} test(s) en ÉCHEC dans tests/security/.`);
  probleme = true;
}

if (probleme) process.exit(1);

console.log(`${total} test(s) exécuté(s) avec succès dans tests/security/ — harnais RLS réellement vérifié.`);
