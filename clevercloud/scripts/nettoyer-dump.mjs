#!/usr/bin/env node
// Nettoie un script SQL issu de Supabase (pg_dump du schéma public, ou nos
// migrations) pour qu'il se restaure sur le PostgreSQL de Clever Cloud
// (2026-11-09, socle de la migration HDS).
//
// Usage : node clevercloud/scripts/nettoyer-dump.mjs entree.sql sortie.sql [rapport.md]
//
// Retire, instruction par instruction (jamais à la ligne près, pour ne pas
// couper un corps de fonction) :
//   - les extensions propres à Supabase ou créées ailleurs (pg_cron, pg_net,
//     supabase_vault, pg_graphql, pgsodium, pg_stat_statements, et pgcrypto /
//     uuid-ossp, créées par sql/01_compat_auth.sql) ;
//   - les changements de propriétaire (le propriétaire sera l'utilisateur de
//     l'add-on) et les droits accordés aux rôles internes de Supabase ;
//   - la publication Realtime (inutilisée par le code) ;
//   - toute instruction qui vise directement les schémas storage, vault, net,
//     cron ou realtime (le stockage passe sur Cellar, le cron dans l'appli).
// Le trigger trg_auth_users_role_par_defaut est GARDÉ : il ne lit que NEW.id,
// que fournit la table auth.users de sql/01_compat_auth.sql.
// Les fonctions dont le CORPS cite ces schémas sont conservées mais listées
// dans le rapport : elles compilent (check_function_bodies = off) mais
// échoueraient à l'exécution, il faut les adapter.
//
// Le script ne lit que des fichiers locaux et n'ouvre aucune connexion.
// Les dumps restent hors du dépôt (clevercloud/_dumps/ est ignoré par git).

import fs from 'node:fs';

/** Découpe en instructions, en respectant chaînes, commentaires et $tag$…$tag$. */
export function decouper(sql) {
  const instructions = [];
  let debut = 0;
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === '-' && sql[i + 1] === '-') {
      const fin = sql.indexOf('\n', i);
      i = fin < 0 ? sql.length : fin + 1;
    } else if (c === '/' && sql[i + 1] === '*') {
      const fin = sql.indexOf('*/', i + 2);
      i = fin < 0 ? sql.length : fin + 2;
    } else if (c === "'") {
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") { i++; break; }
        else i++;
      }
    } else if (c === '"') {
      const fin = sql.indexOf('"', i + 1);
      i = fin < 0 ? sql.length : fin + 1;
    } else if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (m) {
        const fin = sql.indexOf(m[0], i + m[0].length);
        i = fin < 0 ? sql.length : fin + m[0].length;
      } else i++;
    } else if (c === ';') {
      instructions.push(sql.slice(debut, i + 1));
      debut = i + 1;
      i++;
    } else if (c === '\\' && (i === 0 || sql[i - 1] === '\n')) {
      // méta-commande psql (\restrict, \unrestrict de pg_dump ≥ 17.6) : une ligne.
      const fin = sql.indexOf('\n', i);
      instructions.push(sql.slice(debut, fin < 0 ? sql.length : fin + 1));
      i = fin < 0 ? sql.length : fin + 1;
      debut = i;
    } else i++;
  }
  if (sql.slice(debut).trim()) instructions.push(sql.slice(debut));
  return instructions;
}

/** Texte de l'instruction sans commentaires, corps $…$ ni chaînes. */
function squelette(instr) {
  return instr
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1\$/g, ' $corps$ ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/\s+/g, ' ')
    .trim();
}

const EXTENSIONS_RETIREES = /CREATE EXTENSION (IF NOT EXISTS )?"?(pg_cron|pg_net|supabase_vault|pg_graphql|pgsodium|pg_stat_statements|pgcrypto|uuid-ossp|pgjwt)"?/i;
const ROLES_INTERNES = /"?(supabase_[a-z_]+|postgres|authenticator|dashboard_user|pgbouncer|pgsodium_[a-z_]+)"?/i;
const SCHEMAS_SUPABASE = /(^|[\s(,])"?(storage|vault|net|cron|realtime|supabase_functions|graphql|graphql_public|pgsodium)"?\s*\.\s*"?[a-z_]/i;

const CORPS_A_ADAPTER = /\b(storage|vault|net|cron)\s*\.\s*[a-z_]/i;

export const REGLES = [
  { nom: 'extension Supabase ou recréée par la compatibilité', teste: s => EXTENSIONS_RETIREES.test(s) },
  { nom: 'commentaire sur extension', teste: s => /^COMMENT ON EXTENSION/i.test(s) },
  { nom: 'changement de propriétaire', teste: s => /^ALTER .* OWNER TO /i.test(s) },
  {
    nom: 'droits pour un rôle interne Supabase',
    teste: s => /^(GRANT|REVOKE) /i.test(s) && new RegExp(`\\b(TO|FROM) (.*,\\s*)?${ROLES_INTERNES.source}`, 'i').test(s),
  },
  { nom: 'privilèges par défaut d\'un rôle interne', teste: s => /^ALTER DEFAULT PRIVILEGES FOR ROLE /i.test(s) && ROLES_INTERNES.test(s) },
  { nom: 'publication Realtime', teste: s => /^(CREATE|ALTER) PUBLICATION/i.test(s) },
  // Blocs DO de nos migrations (contrôles finaux) qui lisent storage/vault/net/cron :
  // ils vérifient un état propre à Supabase, sans objet sur Clever Cloud.
  { nom: 'bloc DO qui lit un schéma Supabase', teste: (s, brut) => /^DO /i.test(s) && CORPS_A_ADAPTER.test(brut) },
  { nom: 'instruction sur un schéma Supabase (storage, vault, net, cron…)', teste: s => SCHEMAS_SUPABASE.test(s) && !/^CREATE (OR REPLACE )?FUNCTION/i.test(s) },
];

export function nettoyer(sql) {
  const garde = [];
  const retirees = [];
  const aAdapter = [];
  for (const instr of decouper(sql)) {
    const s = squelette(instr);
    if (!s || s === ';') { garde.push(instr); continue; }
    const regle = REGLES.find(r => r.teste(s, instr));
    if (regle) {
      retirees.push({ regle: regle.nom, extrait: s.slice(0, 160) });
      // On garde une trace dans la sortie, sans le contenu.
      garde.push(`\n-- [nettoyer-dump] retiré : ${regle.nom}\n`);
      continue;
    }
    if (/^CREATE (OR REPLACE )?FUNCTION/i.test(s) && CORPS_A_ADAPTER.test(instr)) {
      const nom = /FUNCTION\s+([^\s(]+)/i.exec(s)?.[1] ?? '?';
      aAdapter.push(nom);
    }
    garde.push(instr);
  }
  return { sql: garde.join(''), retirees, aAdapter: [...new Set(aAdapter)] };
}

export function rapport({ retirees, aAdapter }, source) {
  const parRegle = new Map();
  for (const r of retirees) parRegle.set(r.regle, [...(parRegle.get(r.regle) ?? []), r.extrait]);
  let md = `# Nettoyage de ${source}\n\n${retirees.length} instruction(s) retirée(s).\n`;
  for (const [regle, extraits] of parRegle) {
    md += `\n## ${regle} (${extraits.length})\n\n${extraits.map(e => `- \`${e.replace(/`/g, "'")}\``).join('\n')}\n`;
  }
  md += `\n## Fonctions conservées dont le corps cite storage/vault/net/cron (${aAdapter.length})\n\n`;
  md += aAdapter.length ? aAdapter.map(f => `- ${f}`).join('\n') + '\n' : 'Aucune.\n';
  return md;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const [entree, sortie, fichierRapport] = process.argv.slice(2);
  if (!entree || !sortie) {
    console.error('Usage : node clevercloud/scripts/nettoyer-dump.mjs entree.sql sortie.sql [rapport.md]');
    process.exit(2);
  }
  const resultat = nettoyer(fs.readFileSync(entree, 'utf8'));
  fs.writeFileSync(sortie, resultat.sql);
  const md = rapport(resultat, entree);
  if (fichierRapport) fs.writeFileSync(fichierRapport, md);
  console.log(`${resultat.retirees.length} instruction(s) retirée(s), ${resultat.aAdapter.length} fonction(s) à adapter.`);
}
