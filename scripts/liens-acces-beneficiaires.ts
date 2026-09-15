// scripts/liens-acces-beneficiaires.ts
//
// Fabrique les liens d'accès direct au portail bénéficiaire, sur le domaine
// canonique :
//
//     https://app.horizon-suivi.fr/patient/<id>?code=<code_acces>
//
// ── Pourquoi ce script existe (incident du 29/08/2026) ──────────────────
// `app.horizon-suivi.fr` a été attaché au projet Vercel le 2026-08-29 à
// 14h25. Depuis, `*.vercel.app` redirige vers lui en 307. Les bénéficiaires
// dont le service worker était déjà enregistré sur l'ancienne origine y
// chargent toujours l'application depuis le cache : leurs appels API partent
// alors en cross-origin, perdent l'en-tête `Authorization`, et échouent.
//
// Un lien direct sur le bon domaine règle les deux problèmes d'un geste :
// il remet le bénéficiaire sur l'origine canonique ET le connecte, sans lui
// faire épeler une URL ni un code au téléphone.
//
// ── Ce script ne touche AUCUNE base de données ──────────────────────────
// Même règle que scripts/regenerer-codes-acces-structure.ts : toute lecture
// de la production part du SQL Editor, lancée à la main. Ce script consomme
// un export JSON et n'a besoin d'aucun identifiant de connexion.
//
// Requête à lancer dans le SQL Editor de PRODUCTION, puis exporter en JSON :
//
//     SELECT p.id, p.prenom, p.nom, p.code_acces
//       FROM public.participants p
//      WHERE p.code_acces IS NOT NULL
//      ORDER BY p.nom, p.prenom;
//
//   (Restreindre avec `AND p.structure_id IS NOT NULL` pour ne viser que les
//    bénéficiaires rattachés à une structure.)
//
// ── ⚠️ CE QUE CE SCRIPT PRODUIT EST UN LOT D'IDENTIFIANTS ───────────────
// Un lien porte le code d'accès, qui ouvre le dossier de santé du
// bénéficiaire EN ÉCRITURE et n'expire pas. Le fichier de sortie a donc
// exactement la sensibilité d'une liste de mots de passe :
//
//   - il ne doit JAMAIS entrer dans le dépôt (le script refuse d'écrire
//     dedans, voir `assertHorsDepot`) ;
//   - chaque lien part à SON bénéficiaire, individuellement — jamais une
//     liste complète dans un message de groupe, un document partagé ou une
//     pièce jointe unique ;
//   - le fichier se supprime une fois les envois faits.
//
// ── Limite connue, à dire au bénéficiaire ───────────────────────────────
// L'application ne retire PAS le `?code=` de l'URL après connexion (vérifié
// le 2026-09-03 : aucun `replaceState` ni `navigate` de nettoyage dans
// `EspacePatient.tsx`). Le code reste donc visible dans la barre d'adresse
// et dans l'historique du navigateur. C'est acceptable sur l'appareil
// personnel du bénéficiaire, ça ne l'est pas sur un poste partagé — d'où la
// colonne « code seul » ci-dessous, pour ceux à qui il vaut mieux dicter le
// code et laisser taper.
// Le nettoyage de l'URL est un lot à part (docs/PLAN-BETA.md).
//
// ── Usage ───────────────────────────────────────────────────────────────
//   npx tsx scripts/liens-acces-beneficiaires.ts \
//     --participants <chemin/vers/participants.json> \
//     --out <dossier HORS dépôt>
//   [--domaine https://app.horizon-suivi.fr]

import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RACINE_DEPOT = path.resolve(__dirname, '..');

// Domaine canonique par défaut. Explicitement surchargeable : si le domaine
// change un jour, on ne veut pas qu'un script oublié fabrique en silence des
// liens vers une origine morte — c'est précisément l'incident du 29/08.
const DOMAINE_PAR_DEFAUT = 'https://app.horizon-suivi.fr';

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// Deux niveaux, et la distinction compte.
//
// UTILISABLE : 8 caractères alphanumériques majuscules. C'est ce que la
// route de connexion accepte réellement (`connexionParCode` fait
// `trim().toUpperCase()` puis une égalité stricte) — donc le seul critère
// qui décide si un lien va marcher.
//
// CANONIQUE : l'alphabet du générateur (src/utils/codeAcces.ts), qui exclut
// 0/O et 1/I/L pour rester dictable au téléphone.
//
// Un code hors alphabet canonique est PARFAITEMENT VALIDE — les codes de
// démonstration et de seed en sont (`DEMO2P01` porte un 0 et un 1). Une
// première version de ce script refusait le lot entier dans ce cas : un
// bénéficiaire aurait été privé de son lien parce que son code avait été
// créé à la main. C'est un avertissement, pas une erreur.
const CODE_UTILISABLE = /^[A-Z0-9]{8}$/;
const CODE_CANONIQUE  = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;

type Ligne = { id: string; prenom?: string; nom?: string; code_acces?: string };

function argument(nom: string): string | undefined {
  const i = process.argv.indexOf(nom);
  return i === -1 ? undefined : process.argv[i + 1];
}

// Garde-fou de diffusion : le fichier produit est une liste d'identifiants.
// L'écrire dans le dépôt, c'est un `git add -A` distrait entre lui et un
// commit public.
function assertHorsDepot(dossier: string): void {
  const resolu = path.resolve(dossier);
  const relatif = path.relative(RACINE_DEPOT, resolu);
  const dansLeDepot = relatif === '' || (!relatif.startsWith('..') && !path.isAbsolute(relatif));
  if (dansLeDepot) {
    throw new Error(
      `Refus d'écrire dans le dépôt (${resolu}).\n` +
      `Ce fichier contient les codes d'accès en clair : il doit être écrit ` +
      `hors du dépôt, et supprimé une fois les envois faits.`
    );
  }
}

function main(): void {
  const fichierParticipants = argument('--participants');
  const dossierSortie = argument('--out');
  const domaine = (argument('--domaine') ?? DOMAINE_PAR_DEFAUT).replace(/\/+$/, '');

  if (!fichierParticipants || !dossierSortie) {
    throw new Error(
      'Usage : npx tsx scripts/liens-acces-beneficiaires.ts ' +
      '--participants <fichier.json> --out <dossier hors dépôt> [--domaine <url>]\n' +
      'Les deux premiers arguments sont obligatoires — pas de chemin par défaut, ' +
      "pour qu'aucune liste d'identifiants ne parte dans un dossier que personne ne relira."
    );
  }
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(domaine)) {
    throw new Error(`Domaine invalide : ${domaine} (attendu : https://…, sans chemin).`);
  }
  if (!existsSync(dossierSortie) || !statSync(dossierSortie).isDirectory()) {
    throw new Error(`Dossier de sortie introuvable : ${dossierSortie}`);
  }
  assertHorsDepot(dossierSortie);

  const brut = JSON.parse(readFileSync(fichierParticipants, 'utf-8')) as Ligne[];
  if (!Array.isArray(brut) || brut.length === 0) {
    throw new Error("Le fichier de participants est vide ou n'est pas un tableau JSON.");
  }

  // On refuse le lot entier plutôt que d'ignorer les lignes douteuses : un
  // bénéficiaire silencieusement absent de la sortie, c'est un bénéficiaire
  // qui ne reçoit jamais son lien et que personne ne relance.
  const problemes: string[] = [];
  const avertissements: string[] = [];
  brut.forEach((l, i) => {
    if (!l.id || !UUID.test(l.id)) problemes.push(`ligne ${i + 1} : id absent ou invalide`);
    if (!l.code_acces) {
      problemes.push(`ligne ${i + 1} (${l.nom ?? '?'}) : code_acces absent`);
    } else if (!CODE_UTILISABLE.test(l.code_acces)) {
      problemes.push(`ligne ${i + 1} (${l.nom ?? '?'}) : code_acces inutilisable (attendu 8 caractères A-Z0-9)`);
    } else if (!CODE_CANONIQUE.test(l.code_acces)) {
      avertissements.push(`${l.prenom ?? '?'} ${l.nom ?? '?'} : code hors alphabet du générateur (0/O ou 1/I/L) — le lien fonctionne, mais le code est pénible à dicter`);
    }
  });
  if (problemes.length > 0) {
    throw new Error(`Export inexploitable :\n  - ${problemes.join('\n  - ')}`);
  }

  const doublons = brut.map(l => l.id).filter((id, i, t) => t.indexOf(id) !== i);
  if (doublons.length > 0) {
    throw new Error(`Identifiants en double dans l'export : ${[...new Set(doublons)].join(', ')}`);
  }

  const horodatage = new Date().toISOString().replace(/[:.]/g, '-');
  const lien = (l: Ligne) =>
    `${domaine}/patient/${l.id}?code=${encodeURIComponent(l.code_acces as string)}`;

  const sortie = [
    'LIENS D\'ACCÈS BÉNÉFICIAIRES — DOCUMENT SENSIBLE, À SUPPRIMER APRÈS ENVOI',
    '',
    `Généré le ${new Date().toISOString()} par scripts/liens-acces-beneficiaires.ts`,
    `Domaine : ${domaine}`,
    `${brut.length} bénéficiaire(s).`,
    '',
    'Chaque lien contient le code d\'accès de la personne. Un code ouvre son',
    'dossier de santé EN ÉCRITURE et n\'expire pas : traiter cette liste comme',
    'une liste de mots de passe.',
    '',
    '  - envoyer chaque lien À SON destinataire, individuellement ;',
    '  - jamais la liste entière dans un message de groupe ou un document partagé ;',
    '  - supprimer ce fichier une fois les envois faits.',
    '',
    'Le code reste visible dans la barre d\'adresse et l\'historique après',
    'ouverture. Sur un poste partagé, préférer dicter le « code seul » et',
    `laisser la personne le saisir sur ${domaine}/patient`,
    '',
    '─'.repeat(78),
    '',
    ...brut.flatMap(l => [
      `${(l.prenom ?? '?')} ${(l.nom ?? '?')}`,
      `  lien      : ${lien(l)}`,
      `  code seul : ${l.code_acces}`,
      '',
    ]),
  ].join('\n');

  const chemin = path.join(dossierSortie, `liens-acces-${horodatage}.txt`);
  writeFileSync(chemin, sortie, 'utf-8');

  // Le chemin, jamais le contenu : ce script peut tourner dans un terminal
  // dont l'historique est conservé, ou partagé sur un écran.
  console.log(`${brut.length} lien(s) écrit(s) dans :\n  ${chemin}`);
  if (avertissements.length > 0) {
    console.log(`\n${avertissements.length} avertissement(s) — aucun ne bloque :`);
    for (const a of avertissements) console.log(`  - ${a}`);
  }
  console.log('\nCe fichier contient des identifiants en clair. À supprimer après envoi.');
}

try {
  main();
} catch (err) {
  console.error('Erreur :', err instanceof Error ? err.message : err);
  process.exit(1);
}
