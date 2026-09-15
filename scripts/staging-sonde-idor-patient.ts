// scripts/staging-sonde-idor-patient.ts
//
// Épreuve rouge/verte des contrôles anti-IDOR de POST /api/patient/seance et
// POST /api/patient/retour-seance ([F-13], [F-14] — docs/RAPPORT_SECURITE.md,
// branche audit-securite-global).
//
// POURQUOI CE SCRIPT EXISTE
// Ces deux routes sont des fonctions serverless : elles se déploient AU MERGE
// sur `main`, sans étape manuelle. Un contrôle trop strict casse la validation
// de séance en production dans la minute qui suit ; un contrôle trop laxiste
// laisse la faille ouverte sans que rien ne le signale. Il faut donc les deux
// sens, exercés sur des données réelles, AVANT le merge.
//
// Chaque contrôle est éprouvé dans les deux sens :
//   - VERT  : un appel légitime, qui doit aboutir (200) ;
//   - ROUGE : le même appel avec un identifiant emprunté à un AUTRE
//             bénéficiaire, qui doit être refusé (404).
// Un contrôle qu'on n'a jamais vu refuser ne prouve rien — corollaire
// « prouver que le contrôle peut échouer » de docs/PLAN-BETA.md.
//
// Les handlers sont appelés EN PROCESS (faux req/res), pas via HTTP : aucun
// déploiement de Preview nécessaire, et le code exercé est exactement celui du
// répertoire de travail — y compris non commité.
//
// Usage :
//   npx tsx scripts/staging-sonde-idor-patient.ts
//
// Écrit sur staging (seances_patient, retours_seance) et nettoie dans un bloc
// finally. Le nettoyage a lieu AUSSI au démarrage : une suite qui écrit dans
// une base partagée nettoie AVANT, pas seulement après (docs/PLAN-BETA.md).

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STAGING_REF = 'nnfkchhtjrferxnwlcxp';
const PRODUCTION_REF = 'rjgzeuywwknubpwigozq';

// Parseur maison plutôt qu'un `source .env.test.local` en shell : ce fichier
// porte des secrets de staging, et un `source` les a déjà fait fuiter une fois.
function loadEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return out;
  }
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function assertStagingTarget(url: string): void {
  if (url.includes(PRODUCTION_REF)) {
    throw new Error('Garde-fou : cette URL pointe vers la référence de projet PRODUCTION. Abandon.');
  }
  if (!url.includes(STAGING_REF)) {
    throw new Error('Garde-fou : impossible de confirmer que cette URL pointe vers staging. Abandon.');
  }
}

type Corps = { error?: string; seancePatientId?: string };
type Reponse = { status: number; body: Corps | null };

// Forme minimale de req/res attendue par les handlers Vercel (voir la
// signature `(req: any, res: any)` de api/patient/*.ts).
type FauxRes = { status: (code: number) => FauxRes; json: (payload: Corps) => FauxRes };
type FauxReq = {
  method: string;
  headers: Record<string, string>;
  body: unknown;
  socket: { remoteAddress: string };
};
type Handler = (req: FauxReq, res: FauxRes) => Promise<unknown>;

function fauxReponse(): { res: FauxRes; lu: () => Reponse } {
  let status = 0;
  let body: Corps | null = null;
  const res: FauxRes = {
    status(code: number) { status = code; return res; },
    json(payload: Corps) { body = payload; return res; },
  };
  return { res, lu: () => ({ status, body }) };
}

function fauxRequete(token: string, corps: unknown): FauxReq {
  return {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': '127.0.0.1' },
    body: corps,
    socket: { remoteAddress: '127.0.0.1' },
  };
}

type Ligne = { controle: string; sens: string; attendu: string; obtenu: string; ok: boolean };
const resultats: Ligne[] = [];

function noter(controle: string, sens: 'VERT' | 'ROUGE', attenduStatus: number, attenduErreur: string | null, r: Reponse): void {
  const attendu = attenduErreur ? `${attenduStatus} ${attenduErreur}` : `${attenduStatus}`;
  const obtenu = r.body?.error ? `${r.status} ${r.body.error}` : `${r.status}`;
  const ok = r.status === attenduStatus && (attenduErreur === null || r.body?.error === attenduErreur);
  resultats.push({ controle, sens, attendu, obtenu, ok });
}

async function main(): Promise<void> {
  const parsed = loadEnvFile(path.resolve(__dirname, '../.env.test.local'));
  for (const [k, v] of Object.entries(parsed)) {
    if (!(k in process.env)) process.env[k] = v;
  }

  const url = process.env.SUPABASE_TEST_URL;
  const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_TEST_URL / SUPABASE_TEST_SERVICE_ROLE_KEY introuvables dans .env.test.local.');
  }
  if (!process.env.PATIENT_SESSION_SECRET) {
    throw new Error('PATIENT_SESSION_SECRET introuvable dans .env.test.local.');
  }
  assertStagingTarget(url);

  // Les handlers lisent ces deux noms-là (api/_lib/patientAuth.ts). Fixés en
  // process uniquement, jamais écrits dans un fichier.
  process.env.VITE_SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;

  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { signPatientToken } = await import('../api/_lib/patientAuth.js');
  const handlerSeance = (await import('../api/patient/seance.js')).default as unknown as Handler;
  const handlerRetour = (await import('../api/patient/retour-seance.js')).default as unknown as Handler;

  // ── Deux bénéficiaires témoins, pris dans les données réelles de staging ──
  const { data: lignes, error: lignesErr } = await db
    .from('programme_seances')
    .select('id, programme_id, programmes!inner(id, participant_id, type)')
    .not('programmes.type', 'is', null);
  if (lignesErr) throw lignesErr;

  type LigneSeance = { id: string; programme_id: string; programmes: { participant_id: string } };
  const parParticipant = new Map<string, { programmeId: string; seanceIds: string[] }>();
  for (const l of (lignes ?? []) as unknown as LigneSeance[]) {
    const pid = l.programmes.participant_id;
    if (!parParticipant.has(pid)) parParticipant.set(pid, { programmeId: l.programme_id, seanceIds: [] });
    const entree = parParticipant.get(pid)!;
    if (entree.programmeId === l.programme_id) entree.seanceIds.push(l.id);
  }
  const participants = [...parParticipant.entries()];
  if (participants.length < 2) {
    throw new Error(
      `Il faut deux bénéficiaires porteurs d'un programme V2 sur staging pour éprouver ` +
      `l'emprunt d'identifiant (trouvés : ${participants.length}). Rejouer scripts/staging-reseed.ts.`
    );
  }
  const [idA, dataA] = participants[0];
  const [idB, dataB] = participants[1];

  const exercicesDe = async (seanceId: string): Promise<string[]> => {
    const { data } = await db.from('programme_exercices').select('id').eq('seance_id', seanceId);
    return (data ?? []).map((e: { id: string }) => e.id);
  };
  const seanceA = dataA.seanceIds[0];
  const seanceB = dataB.seanceIds[0];
  const exsA = await exercicesDe(seanceA);
  const exsB = await exercicesDe(seanceB);
  if (exsA.length === 0 || exsB.length === 0) {
    throw new Error('Les deux séances témoins doivent porter au moins un exercice.');
  }

  console.log(`Bénéficiaire A : ${idA}  (programme ${dataA.programmeId}, séance ${seanceA}, ${exsA.length} ex.)`);
  console.log(`Bénéficiaire B : ${idB}  (programme ${dataB.programmeId}, séance ${seanceB}, ${exsB.length} ex.)`);
  console.log('Le JWT est toujours celui de A. Le sens ROUGE emprunte un identifiant de B.\n');

  const tokenA = await signPatientToken(idA);
  const DATE = new Date().toISOString().split('T')[0];

  // Nettoyage AVANT autant qu'APRÈS : une exécution précédente interrompue
  // laisserait une ligne du jour qui ferait échouer le sens VERT sur la
  // contrainte d'unicité (23505) — et on lirait ça comme une régression.
  const nettoyer = async (): Promise<number> => {
    const { data: aSupprimer } = await db
      .from('seances_patient')
      .select('id')
      .in('participant_id', [idA, idB])
      .eq('date_seance', DATE);
    const ids = (aSupprimer ?? []).map((s: { id: string }) => s.id);
    if (ids.length > 0) {
      await db.from('retours_seance').delete().in('seance_id', ids);
      await db.from('exercices_realises').delete().in('seance_patient_id', ids);
      await db.from('seances_patient').delete().in('id', ids);
    }
    return ids.length;
  };

  const nettoyesAvant = await nettoyer();
  if (nettoyesAvant > 0) console.log(`[nettoyage initial] ${nettoyesAvant} ligne(s) du jour retirée(s).`);

  const corpsSeance = (o: Partial<{ programmeId: string; seanceId: string; exercices: string[] }> = {}) => ({
    programmeId: o.programmeId ?? dataA.programmeId,
    seanceId: o.seanceId ?? seanceA,
    dateSeance: DATE,
    statut: 'terminee',
    exercices: (o.exercices ?? exsA).map(id => ({ id, realise: true })),
  });

  // Nettoyage entre CHAQUE appel de /seance, et pas seulement au début.
  // Sans ça, un appel qui aboutit (le cas d'un contrôle absent, donc
  // exactement ce qu'on cherche à détecter) laisse une ligne qui fait échouer
  // l'appel suivant sur la contrainte d'unicité (23505,
  // 20260622_unique_seances_patient.sql). On lirait alors « refusé » là où le
  // contrôle n'a rien refusé du tout — la sonde se mentirait à elle-même dans
  // le sens rassurant.
  const appelSeance = async (corps: unknown): Promise<Reponse> => {
    await nettoyer();
    const { res, lu } = fauxReponse();
    await handlerSeance(fauxRequete(tokenA, corps), res);
    return lu();
  };
  const appelRetour = async (corps: unknown): Promise<Reponse> => {
    const { res, lu } = fauxReponse();
    await handlerRetour(fauxRequete(tokenA, corps), res);
    return lu();
  };

  try {
    // ── 1. Le programme appartient-il au bénéficiaire du JWT ? ──
    noter('1. programmeId appartient au bénéficiaire', 'ROUGE', 404, 'Programme introuvable',
      await appelSeance(corpsSeance({ programmeId: dataB.programmeId })));

    // ── 2. La séance appartient-elle à CE programme ? ──
    noter('2. seanceId appartient au programme', 'ROUGE', 404, 'Séance introuvable',
      await appelSeance(corpsSeance({ seanceId: seanceB })));

    // ── 3. [F-14] Les exercices appartiennent-ils à CETTE séance ? ──
    // Un exercice légitime PLUS un exercice de B : un contrôle écrit
    // « au moins un id valide » laisserait passer ce lot.
    noter('3. [F-14] exercices appartiennent à la séance', 'ROUGE', 404, 'Exercice introuvable',
      await appelSeance(corpsSeance({ exercices: [exsA[0], exsB[0]] })));

    // Sens VERT des trois : le parcours réel du bénéficiaire A.
    const vert = await appelSeance(corpsSeance());
    noter('1-3. parcours légitime de bout en bout', 'VERT', 200, null, vert);
    const seancePatientA = vert.body?.seancePatientId as string | undefined;

    // ── 4. [F-13] Le retour se rattache-t-il à SA propre séance ? ──
    // Une séance appartenant à B, créée pour l'occasion via service_role.
    const { data: spB, error: spBErr } = await db
      .from('seances_patient')
      .insert({
        participant_id: idB,
        programme_id: dataB.programmeId,
        seance_id: seanceB,
        date_seance: DATE,
        statut: 'terminee',
      })
      .select('id')
      .single();
    if (spBErr) throw spBErr;

    noter('4. [F-13] seanceId du retour appartient au bénéficiaire', 'ROUGE', 404, 'Séance introuvable',
      await appelRetour({ seanceId: (spB as { id: string }).id, borgRpe: 6, bienEtre: 2 }));

    if (!seancePatientA) {
      resultats.push({
        controle: '4. [F-13] retour légitime',
        sens: 'VERT',
        attendu: '200',
        obtenu: 'non joué (la séance légitime n\'a pas abouti)',
        ok: false,
      });
    } else {
      noter('4. [F-13] retour légitime', 'VERT', 200, null,
        await appelRetour({ seanceId: seancePatientA, borgRpe: 6, bienEtre: 2 }));
    }
  } finally {
    const n = await nettoyer();
    console.log(`[nettoyage final] ${n} ligne(s) seances_patient retirée(s), retours et exercices compris.\n`);
  }

  const large = Math.max(...resultats.map(r => r.controle.length));
  console.log(`  SENS    RÉSULTAT  ${'CONTRÔLE'.padEnd(large)}  ATTENDU  →  OBTENU`);
  console.log('  ' + '─'.repeat(large + 58));
  for (const r of resultats) {
    console.log(`  ${r.sens.padEnd(6)}  ${r.ok ? '   OK   ' : ' ÉCHEC  '}  ${r.controle.padEnd(large)}  ${r.attendu}  →  ${r.obtenu}`);
  }
  console.log('');

  const echecs = resultats.filter(r => !r.ok).length;
  if (echecs > 0) {
    console.error(`>>> ${echecs} contrôle(s) NON CONFORME(S) <<<`);
    process.exit(1);
  }
  console.log('>>> CONFORME — les 4 contrôles refusent l\'identifiant emprunté et laissent passer le parcours légitime <<<');
}

main().catch(err => {
  console.error('Erreur :', err instanceof Error ? err.message : err);
  process.exit(1);
});
