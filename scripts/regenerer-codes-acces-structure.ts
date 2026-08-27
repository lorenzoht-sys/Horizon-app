// scripts/regenerer-codes-acces-structure.ts
//
// Prépare la régénération des `code_acces` des bénéficiaires rattachés à une
// structure, dont les codes ont été exposés par le portail structure avant
// le correctif du 2026-08-27 (api/structure/data.ts renvoyait `select('*')`,
// donc `code_acces`, à quiconque détenait le lien de la structure).
//
// ── Ce script ne touche AUCUNE base de données ──────────────────────────
// C'est délibéré. L'écriture visée est en PRODUCTION, et la règle du projet
// est que toute écriture en production part du SQL Editor, lancée à la main
// (docs/PLAN-BETA.md). Ce script se contente donc de :
//   1. générer des codes neufs,
//   2. écrire le SQL `UPDATE` à coller,
//   3. écrire à part la liste « bénéficiaire → nouveau code » à
//      recommuniquer.
// Il n'a besoin d'aucun identifiant de connexion, et ne peut rien casser.
//
// ── Codes générés avec crypto, pas Math.random ──────────────────────────
// `src/utils/codeAcces.ts` utilise `Math.random()` — un PRNG non
// cryptographique, prédictible pour qui observe assez de tirages du même
// contexte (chantier annexe ouvert, voir docs/PLAN-BETA.md). Puisque ces
// codes-ci remplacent des codes compromis, ils sont tirés de
// `crypto.randomInt()`. Même alphabet et même longueur : rien ne change
// pour le bénéficiaire qui doit le lire au téléphone.
//
// ── Mode d'emploi ───────────────────────────────────────────────────────
// 1. Dans le SQL Editor de PRODUCTION, lister les bénéficiaires concernés :
//
//      SELECT id, prenom, nom FROM public.participants
//       WHERE structure_id IS NOT NULL ORDER BY nom, prenom;
//
//    Exporter le résultat en JSON, l'enregistrer HORS DU DÉPÔT.
//
// 2. Lancer ce script :
//
//      npx tsx scripts/regenerer-codes-acces-structure.ts \
//        --participants <chemin/vers/participants.json> \
//        --out <dossier/de/sortie>
//
// 3. Relire le `.sql` produit, le coller dans le SQL Editor de production.
// 4. Recommuniquer les nouveaux codes depuis le `.txt` produit, puis le
//    supprimer. Ce fichier contient des identifiants en clair : il ne doit
//    ni entrer dans le dépôt, ni transiter par une messagerie.

import { randomInt } from 'crypto';
import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import path from 'path';

// Identiques à src/utils/codeAcces.ts : 0/O et 1/I/L exclus, pour que le
// code reste dictable au téléphone.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const LONGUEUR = 8;

function genererCodeSolide(): string {
  let code = '';
  for (let i = 0; i < LONGUEUR; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

function argument(nom: string): string | undefined {
  const i = process.argv.indexOf(nom);
  return i === -1 ? undefined : process.argv[i + 1];
}

type Ligne = { id: string; prenom?: string; nom?: string };

function main(): void {
  const fichierParticipants = argument('--participants');
  const dossierSortie = argument('--out');

  if (!fichierParticipants || !dossierSortie) {
    throw new Error(
      'Usage : npx tsx scripts/regenerer-codes-acces-structure.ts ' +
        '--participants <fichier.json> --out <dossier>\n' +
        'Les deux arguments sont obligatoires — pas de chemin par défaut, pour ' +
        "qu'aucune sortie ne parte dans un dossier que personne ne relira."
    );
  }
  if (!existsSync(dossierSortie) || !statSync(dossierSortie).isDirectory()) {
    throw new Error(`Dossier de sortie introuvable : ${dossierSortie}`);
  }

  const brut = JSON.parse(readFileSync(fichierParticipants, 'utf-8')) as Ligne[];
  if (!Array.isArray(brut) || brut.length === 0) {
    throw new Error('Le fichier de participants est vide ou n\'est pas un tableau JSON.');
  }

  const UUID = /^[0-9a-fA-F-]{36}$/;
  for (const l of brut) {
    if (!l.id || !UUID.test(l.id)) {
      throw new Error(`Identifiant de participant invalide dans le fichier : ${JSON.stringify(l)}`);
    }
  }

  // Unicité entre les codes générés ici. L'unicité vis-à-vis des codes
  // existants est garantie par idx_participants_code_acces : en cas de
  // collision (probabilité de l'ordre de 10⁻¹¹), l'UPDATE échoue
  // bruyamment et il suffit de relancer ce script.
  const codes = new Set<string>();
  const attributions = brut.map(l => {
    let code = genererCodeSolide();
    while (codes.has(code)) code = genererCodeSolide();
    codes.add(code);
    return { ...l, code };
  });

  const horodatage = new Date().toISOString().replace(/[:.]/g, '-');

  const sql = [
    '-- Régénération des codes d\'accès exposés par le portail structure',
    `-- Généré le ${new Date().toISOString()} par scripts/regenerer-codes-acces-structure.ts`,
    `-- ${attributions.length} bénéficiaire(s) rattaché(s) à une structure.`,
    '--',
    '-- À RELIRE avant exécution, puis à coller dans le SQL Editor de PRODUCTION.',
    '-- Chaque UPDATE est ciblé sur un id précis : aucun WHERE large, aucune',
    '-- possibilité de toucher un bénéficiaire non concerné.',
    '--',
    '-- Après exécution, les anciens codes cessent immédiatement de fonctionner :',
    '-- les bénéficiaires concernés ne pourront plus se connecter tant que le',
    '-- nouveau code ne leur a pas été communiqué.',
    '',
    'BEGIN;',
    '',
    ...attributions.map(a =>
      `UPDATE public.participants SET code_acces = '${a.code}' WHERE id = '${a.id}'; ` +
      `-- ${(a.prenom ?? '?').replace(/[\r\n]/g, '')} ${(a.nom ?? '?').replace(/[\r\n]/g, '')}`
    ),
    '',
    '-- Contrôle avant validation : doit renvoyer exactement ' + attributions.length + '.',
    'SELECT count(*) AS mis_a_jour FROM public.participants',
    ` WHERE id IN (${attributions.map(a => `'${a.id}'`).join(', ')})`,
    `   AND code_acces IN (${attributions.map(a => `'${a.code}'`).join(', ')});`,
    '',
    '-- Si le compte est bon : COMMIT;   sinon : ROLLBACK;',
    'COMMIT;',
    '',
  ].join('\n');

  const liste = [
    'CODES D\'ACCÈS À RECOMMUNIQUER — DOCUMENT SENSIBLE',
    '',
    'Chaque ligne est un identifiant de connexion en clair.',
    'À supprimer dès que les bénéficiaires ont été prévenus.',
    'Ne jamais committer, ne jamais envoyer par messagerie.',
    '',
    `Généré le ${new Date().toISOString()}`,
    '',
    ...attributions.map(a => `${(a.prenom ?? '?')} ${(a.nom ?? '?')} : ${a.code}`),
    '',
  ].join('\n');

  const cheminSql = path.join(dossierSortie, `regeneration-codes-${horodatage}.sql`);
  const cheminListe = path.join(dossierSortie, `codes-a-recommuniquer-${horodatage}.txt`);

  writeFileSync(cheminSql, sql, 'utf-8');
  writeFileSync(cheminListe, liste, 'utf-8');

  // Aucun code n'est affiché ici : la sortie console peut finir dans un log,
  // un historique de terminal ou une transcription.
  console.log(`${attributions.length} code(s) généré(s).`);
  console.log(`  SQL à relire puis coller  : ${cheminSql}`);
  console.log(`  Liste à recommuniquer     : ${cheminListe}  (à supprimer après usage)`);
}

main();
