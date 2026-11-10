#!/usr/bin/env node
// Cartographie automatique d'Horizon (2026-11-10).
//
// Produit docs/CARTOGRAPHIE-DONNEES.md : qui lit ou écrit quelle table, par
// quel chemin (front direct, RPC, route API, Edge Function), avec quelles
// protections en base (politiques RLS, triggers), où sont les fichiers lourds
// et ce que couvrent les tests. Le but : qu'un développeur qui découvre le
// projet (ou prépare la migration HDS) sache quel fil tire quel nœud, sans
// lire 330 fichiers.
//
// Lecture seule, aucune dépendance : `node scripts/cartographie.mjs`.
// À relancer après chaque chantier ; la CI ne l'exécute pas.

import fs from 'node:fs';
import path from 'node:path';

const RACINE = process.cwd();
const SORTIE = path.join(RACINE, 'docs', 'CARTOGRAPHIE-DONNEES.md');

function lister(dossier, filtre) {
  const res = [];
  const parcourir = d => {
    if (!fs.existsSync(d)) return;
    for (const nom of fs.readdirSync(d)) {
      if (nom === 'node_modules' || nom.startsWith('.')) continue;
      const p = path.join(d, nom);
      if (fs.statSync(p).isDirectory()) parcourir(p);
      else if (filtre(p)) res.push(path.relative(RACINE, p));
    }
  };
  parcourir(path.join(RACINE, dossier));
  return res.sort();
}

const lire = f => fs.readFileSync(path.join(RACINE, f), 'utf8');
const lignes = f => lire(f).split('\n').length;
const estTest = f => /\.test\.|\.spec\.|(^|\/)_[^/]*\.test/.test(f);
const code = f => /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts');

const front = lister('src', f => code(f) && !estTest(f));
const api = lister('api', f => code(f) && !estTest(f));
const routes = api.filter(f => !f.includes('/_lib/') && !path.basename(f).startsWith('_'));
const fonctions = lister('supabase/functions', f => code(f) && !estTest(f));
const migrations = lister('supabase/migrations', f => f.endsWith('.sql'));

// ── Accès aux données ────────────────────────────────────────────────────────
const RE_TABLE = /\.from\(\s*['"`]([a-z_][a-z0-9_]*)['"`]\s*\)/g;
const RE_RPC = /\.rpc\(\s*['"`]([a-z_][a-z0-9_]*)['"`]/g;
const RE_BUCKET = /storage\s*\.from\(\s*['"`]([a-z0-9_-]+)['"`]\s*\)/g;

function acces(fichiers) {
  const tables = new Map();
  const rpc = new Map();
  for (const f of fichiers) {
    const t = lire(f).replace(RE_BUCKET, '');
    for (const m of t.matchAll(RE_TABLE)) tables.set(m[1], new Set([...(tables.get(m[1]) ?? []), f]));
    for (const m of t.matchAll(RE_RPC)) rpc.set(m[1], new Set([...(rpc.get(m[1]) ?? []), f]));
  }
  return { tables, rpc };
}

const accesFront = acces(front);
const accesApi = acces(api);
const accesFonctions = acces(fonctions);

// ── Base : tables, politiques, triggers (état cumulé des migrations) ─────────
const sql = migrations.map(lire).join('\n');
const tablesBase = new Set(
  [...sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"?public"?\."?([a-z_0-9]+)"?/gi)].map(m => m[1]),
);
const politiques = new Map();
for (const m of sql.matchAll(/CREATE POLICY\s+"?([^"\s]+)"?\s+ON\s+"?public"?\."?([a-z_0-9]+)"?/gi)) {
  politiques.set(m[2], new Set([...(politiques.get(m[2]) ?? []), m[1]]));
}
const triggers = new Map();
for (const m of sql.matchAll(/CREATE (?:OR REPLACE )?(?:CONSTRAINT )?TRIGGER\s+"?([a-z_0-9]+)"?[\s\S]{0,200}?\bON\s+"?public"?\."?([a-z_0-9]+)"?/gi)) {
  triggers.set(m[2], new Set([...(triggers.get(m[2]) ?? []), m[1]]));
}

// ── Services externes ────────────────────────────────────────────────────────
const RE_EXTERNE = /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi;
const IGNORER = /(^|\.)(supabase\.co|deno\.land|esm\.sh|exemple\.fr|example\.(com|test)|w3\.org|schema\.org|localhost|github\.com|vercel\.app)$/i;
function externes(fichiers) {
  const hotes = new Map();
  for (const f of fichiers) {
    for (const m of lire(f).matchAll(RE_EXTERNE)) {
      const h = m[1].toLowerCase();
      if (IGNORER.test(h)) continue;
      hotes.set(h, new Set([...(hotes.get(h) ?? []), f]));
    }
  }
  return hotes;
}

// ── Tests ────────────────────────────────────────────────────────────────────
const testsUnitaires = lister('.', f => /\.test\.(ts|tsx|mjs)$/.test(f) && !f.startsWith('e2e/'));
const specsE2e = lister('e2e', f => f.endsWith('.spec.ts'));
const libs = lister('src/lib', f => code(f) && !estTest(f));
const libsSansTest = libs.filter(f => !fs.existsSync(path.join(RACINE, f.replace(/\.tsx?$/, '.test.ts'))));

// ── Rendu ────────────────────────────────────────────────────────────────────
const court = f => f.replace(/^src\//, '').replace(/\.(ts|tsx)$/, '');
const liste = set => [...set].map(court).join(', ');

let md = `# Cartographie des données d'Horizon (générée)

Générée par \`node scripts/cartographie.mjs\` le ${new Date().toISOString().slice(0, 10)}.
Ne pas modifier à la main : relancer le script après chaque chantier.

## Chiffres clés

| Élément | Nombre |
| --- | --- |
| Fichiers du front (hors tests) | ${front.length} (${front.reduce((s, f) => s + lignes(f), 0).toLocaleString('fr-FR')} lignes) |
| Routes API (\`api/\`) | ${routes.length} |
| Edge Functions | ${new Set(fonctions.map(f => f.split('/')[2])).size} |
| Tables (schéma public) | ${tablesBase.size} |
| Tables lues ou écrites directement par le front | ${accesFront.tables.size} |
| Fonctions SQL appelées en RPC par le front | ${accesFront.rpc.size} |
| Tests unitaires | ${testsUnitaires.length} fichiers |
| Scénarios e2e | ${specsE2e.length} fichiers |

## Table par table

Colonne « Front » : fichiers qui lisent ou écrivent la table via \`supabase.from()\`
(PostgREST, protégé par la RLS). Colonne « Serveur » : routes \`api/\` et Edge
Functions (clé \`service_role\`, RLS contournée : le contrôle est dans le code).

| Table | Politiques RLS | Triggers | Front | Serveur |
| --- | --- | --- | --- | --- |
`;
for (const t of [...tablesBase].sort()) {
  const fr = accesFront.tables.get(t);
  const srv = new Set([...(accesApi.tables.get(t) ?? []), ...(accesFonctions.tables.get(t) ?? [])]);
  md += `| \`${t}\` | ${politiques.get(t)?.size ?? 0} | ${triggers.get(t)?.size ?? 0} | ${fr ? liste(fr) : '—'} | ${srv.size ? liste(srv) : '—'} |\n`;
}

const inconnues = [...accesFront.tables.keys(), ...accesApi.tables.keys()].filter(t => !tablesBase.has(t));
if (inconnues.length) {
  md += `\nTables citées dans le code mais absentes des migrations (vues, tables d'un autre schéma ou noms obsolètes) : ${[...new Set(inconnues)].map(t => `\`${t}\``).join(', ')}.\n`;
}

md += `\n## Fonctions SQL appelées en RPC\n\n| Fonction | Appelée depuis |\n| --- | --- |\n`;
const toutesRpc = new Map();
for (const src of [accesFront.rpc, accesApi.rpc, accesFonctions.rpc]) {
  for (const [k, v] of src) toutesRpc.set(k, new Set([...(toutesRpc.get(k) ?? []), ...v]));
}
for (const [k, v] of [...toutesRpc].sort()) md += `| \`${k}\` | ${liste(v)} |\n`;

md += `\n## Accès directs par couche du front\n\nPlus les accès sont regroupés dans \`hooks/\`, plus un changement de source de données est localisé.\n\n| Couche | Fichiers avec accès direct | Appels \`.from()\` |\n| --- | --- | --- |\n`;
for (const couche of ['hooks', 'pages', 'components', 'lib', 'data', 'utils']) {
  const fichiers = front.filter(f => f.startsWith(`src/${couche}/`));
  let nbFichiers = 0;
  let nbAppels = 0;
  for (const f of fichiers) {
    const n = [...lire(f).replace(RE_BUCKET, '').matchAll(RE_TABLE)].length;
    if (n) { nbFichiers++; nbAppels += n; }
  }
  md += `| \`src/${couche}/\` | ${nbFichiers} | ${nbAppels} |\n`;
}
const appelsAuth = front.filter(f => /supabase!?\.auth\.|client\.auth\./.test(lire(f)));
md += `\nAppels à Supabase Auth (\`supabase.auth.*\`) : ${appelsAuth.map(f => `\`${court(f)}\``).join(', ')}.\n`;

md += `\n## Routes serveur\n\nLes tables d'une route incluent celles de ses helpers \`api/_lib/\` importés, comptés au niveau du fichier : la liste peut être un peu plus large que ce que la route utilise réellement.\n\n| Route | Tables | RPC | Services externes |\n| --- | --- | --- | --- |\n`;
const libApi = api.filter(f => f.includes('/_lib/'));
for (const r of routes) {
  // Une route utilise ses helpers _lib : on suit un niveau d'import.
  const imports = [...lire(r).matchAll(/from '(\.[^']+)'/g)]
    .map(m => path.relative(RACINE, path.resolve(path.dirname(path.join(RACINE, r)), m[1].replace(/\.js$/, '.ts'))))
    .filter(f => libApi.includes(f));
  const perimetre = [r, ...imports];
  const a = acces(perimetre);
  const e = externes(perimetre);
  md += `| \`/${r.replace(/\.ts$/, '')}\` | ${[...a.tables.keys()].sort().join(', ') || '—'} | ${[...a.rpc.keys()].sort().join(', ') || '—'} | ${[...e.keys()].join(', ') || '—'} |\n`;
}

md += `\n## Edge Functions\n\n| Fonction | Tables | Services externes |\n| --- | --- | --- |\n`;
for (const nom of [...new Set(fonctions.map(f => f.split('/')[2]))]) {
  const fs_ = fonctions.filter(f => f.split('/')[2] === nom);
  const a = acces(fs_);
  md += `| \`${nom}\` | ${[...a.tables.keys()].sort().join(', ') || '—'} | ${[...externes(fs_).keys()].join(', ') || '—'} |\n`;
}

md += `\n## Services externes appelés depuis le navigateur\n\n| Hôte | Fichiers |\n| --- | --- |\n`;
for (const [h, f] of [...externes(front)].sort()) md += `| ${h} | ${liste(f)} |\n`;

md += `\n## Fichiers les plus lourds (plus de 800 lignes)\n\nCe sont les zones où une modification a le plus de chances d'avoir des effets de bord.\n\n| Fichier | Lignes | Tables touchées directement |\n| --- | --- | --- |\n`;
for (const f of front.map(f => [f, lignes(f)]).filter(([, n]) => n > 800).sort((a, b) => b[1] - a[1])) {
  const t = [...accesFront.tables].filter(([, s]) => s.has(f[0])).map(([k]) => k);
  md += `| \`${f[0]}\` | ${f[1].toLocaleString('fr-FR')} | ${t.length ? t.join(', ') : '—'} |\n`;
}

md += `\n## Couverture de tests\n\n`;
md += `- ${testsUnitaires.length} fichiers de tests unitaires (Vitest), ${specsE2e.length} scénarios e2e (Playwright), plus le harnais RLS (\`tests/security/\`).\n`;
md += `- Modules de \`src/lib/\` sans test unitaire à côté (${libsSansTest.length} sur ${libs.length}) : ${libsSansTest.map(f => `\`${court(f)}\``).join(', ') || 'aucun'}.\n`;

fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
fs.writeFileSync(SORTIE, md);
console.log(`Cartographie écrite dans ${path.relative(RACINE, SORTIE)}`);
