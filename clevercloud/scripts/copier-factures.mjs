#!/usr/bin/env node
// Copie des PDF de factures du stockage Supabase vers Cellar (2026-11-12,
// lot « stockage » de la migration HDS, point 3 de clevercloud/README.md).
//
// Pourquoi un script dédié plutôt qu'un outil S3 générique : la liste qui
// fait foi n'est pas le contenu du bucket mais la colonne `factures.pdf_path`
// (une facture validée est inaltérable, son PDF doit exister à l'arrivée).
// Le script part donc de la base, et contrôle chaque fichier par son
// empreinte SHA-256 après relecture depuis Cellar.
//
// Sûretés :
//   - sans `--executer`, rien n'est écrit : le script compte et compare ;
//   - un fichier déjà présent à l'arrivée n'est jamais écrasé (upsert: false) :
//     identique, il est compté « déjà copié » ; différent, c'est une anomalie ;
//   - rien n'est supprimé, ni à la source ni à l'arrivée ;
//   - les chemins (`<id praticien>/<numéro>.pdf`) ne contiennent aucun nom ;
//     le rapport ne liste que les chemins en anomalie.
//
// Usage (sur le poste de Lorenzo, qui saisit lui-même les secrets) :
//   SOURCE_SUPABASE_URL=… SOURCE_SUPABASE_SERVICE_ROLE_KEY=… \
//   CELLAR_ADDON_HOST=… CELLAR_ADDON_KEY_ID=… CELLAR_ADDON_KEY_SECRET=… \
//   node clevercloud/scripts/copier-factures.mjs            # contrôle seul
//   node clevercloud/scripts/copier-factures.mjs --executer # copie + contrôle
// Code de sortie : 0 si tout est identique à l'arrivée, 1 sinon.

import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { configurationS3, creerStockageS3 } from '../serveur/stockageS3.mjs';

const BUCKET = 'factures';
const PAGE = 500;
const sha256 = octets => crypto.createHash('sha256').update(octets).digest('hex');

/** Chemins `pdf_path` non nuls de la table `factures`, lus par PostgREST en service_role. */
export async function listerChemins({ url, cle, requeter = fetch }) {
  const chemins = [];
  for (let debut = 0; ; debut += PAGE) {
    // Tri par id : pagination stable même si des factures sont validées pendant la lecture.
    const rep = await requeter(`${url}/rest/v1/factures?select=pdf_path&pdf_path=not.is.null&order=id.asc`, {
      headers: { apikey: cle, authorization: `Bearer ${cle}`, range: `${debut}-${debut + PAGE - 1}`, 'range-unit': 'items' },
    });
    if (!rep.ok) throw new Error(`Lecture de factures.pdf_path refusée (${rep.status})`);
    const lignes = await rep.json();
    for (const l of lignes) chemins.push(l.pdf_path);
    if (lignes.length < PAGE) break;
  }
  const uniques = [...new Set(chemins)];
  if (uniques.length !== chemins.length) throw new Error(`${chemins.length - uniques.length} chemin(s) pdf_path en double dans factures : à examiner avant toute copie.`);
  return uniques;
}

/** Octets d'un PDF dans le stockage Supabase, ou null s'il est absent. */
export async function lireSource({ url, cle, requeter = fetch }, chemin) {
  const rep = await requeter(`${url}/storage/v1/object/${BUCKET}/${chemin.split('/').map(encodeURIComponent).join('/')}`, {
    headers: { apikey: cle, authorization: `Bearer ${cle}` },
  });
  if (rep.status === 404 || rep.status === 400) return null;
  if (!rep.ok) throw new Error(`Lecture source refusée (${rep.status})`);
  return Buffer.from(await rep.arrayBuffer());
}

/**
 * Copie (si `executer`) puis contrôle. Renvoie le bilan ; ne lève que sur une
 * erreur qui empêche de conclure (source injoignable, liste illisible).
 */
export async function copierFactures({ source, arrivee, executer = false, journal = () => {} }) {
  const chemins = await listerChemins(source);
  const bilan = { attendus: chemins.length, copies: 0, dejaCopies: 0, aCopier: 0, anomalies: [] };
  const anomalie = (chemin, motif) => bilan.anomalies.push({ chemin, motif });

  for (const [i, chemin] of chemins.entries()) {
    const octets = await lireSource(source, chemin);
    if (!octets) { anomalie(chemin, 'absent du stockage source'); continue; }
    const attendu = sha256(octets);

    const present = await arrivee.download(chemin);
    if (present.data) {
      const trouve = sha256(Buffer.from(await present.data.arrayBuffer()));
      if (trouve === attendu) bilan.dejaCopies++;
      else anomalie(chemin, "présent à l'arrivée avec un contenu différent (non écrasé)");
      continue;
    }
    if (present.error?.message !== 'Object not found') { anomalie(chemin, `lecture à l'arrivée : ${present.error?.message}`); continue; }

    if (!executer) { bilan.aCopier++; continue; }

    const ecrit = await arrivee.upload(chemin, octets, { contentType: 'application/pdf', upsert: false });
    if (ecrit.error) { anomalie(chemin, `écriture : ${ecrit.error.message}`); continue; }
    // Relecture : c'est le contenu réellement stocké qui est comparé, pas l'accusé d'écriture.
    const relu = await arrivee.download(chemin);
    const empreinte = relu.data ? sha256(Buffer.from(await relu.data.arrayBuffer())) : null;
    if (empreinte === attendu) bilan.copies++;
    else anomalie(chemin, 'empreinte différente après copie');

    if ((i + 1) % 50 === 0) journal(`  ${i + 1} / ${chemins.length}`);
  }
  bilan.complet = bilan.anomalies.length === 0 && bilan.aCopier === 0 && bilan.copies + bilan.dejaCopies === bilan.attendus;
  return bilan;
}

async function principal() {
  const executer = process.argv.includes('--executer');
  const url = process.env.SOURCE_SUPABASE_URL?.replace(/\/+$/, '');
  const cle = process.env.SOURCE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) throw new Error('SOURCE_SUPABASE_URL et SOURCE_SUPABASE_SERVICE_ROLE_KEY sont obligatoires.');
  const conf = configurationS3();
  if (!conf) throw new Error('CELLAR_ADDON_HOST, CELLAR_ADDON_KEY_ID et CELLAR_ADDON_KEY_SECRET sont obligatoires.');

  console.log(executer ? 'Copie puis contrôle.' : 'Contrôle seul (ajouter --executer pour copier).');
  const bilan = await copierFactures({
    source: { url, cle },
    arrivee: creerStockageS3(conf).from(BUCKET),
    executer,
    journal: console.log,
  });
  console.log(`Factures avec PDF : ${bilan.attendus}`);
  console.log(`  copiées maintenant : ${bilan.copies}`);
  console.log(`  déjà à l'arrivée, identiques : ${bilan.dejaCopies}`);
  console.log(`  restant à copier : ${bilan.aCopier}`);
  console.log(`  anomalies : ${bilan.anomalies.length}`);
  for (const a of bilan.anomalies) console.log(`    ${a.chemin} : ${a.motif}`);
  console.log(bilan.complet ? "Arrivée complète et identique à la source." : "Arrivée INCOMPLÈTE ou différente : ne pas basculer.");
  process.exit(bilan.complet ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  principal().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
