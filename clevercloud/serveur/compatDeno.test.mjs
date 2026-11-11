// `node --test clevercloud/` : les Edge Functions tournent dans le serveur Node
// sans être modifiées. Fonctions factices dans un dossier temporaire, puis les
// trois vraies fonctions du dépôt quand les dépendances npm sont installées.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { creerServeur } from './serveur.mjs';

let base, serveur, fauxS3, objets;

before(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'horizon-fonctions-'));
  const ecrire = (rel, contenu) => {
    fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
    fs.writeFileSync(path.join(tmp, rel), contenu);
  };
  // Faux paquet @supabase/supabase-js : il suffit qu'il soit résolu.
  ecrire('node_modules/@supabase/supabase-js/package.json', '{"name":"@supabase/supabase-js","type":"module","main":"index.js"}');
  ecrire('node_modules/@supabase/supabase-js/index.js', `export const createClient = (url, cle) => ({
    url, cle, lire() { return 'lu avec ' + this.cle; },
    get storage() { return { from: () => ({ download: async () => ({ data: null, error: { message: 'stockage Supabase' } }) }) }; },
  });`);
  // Fonction au format actuel : Deno.serve, import nu, TypeScript, import en .ts.
  ecrire('functions/moderne/aide.ts', 'export interface Corps { nom: string }\nexport const saluer = (c: Corps): string => `bonjour ${c.nom}`;');
  ecrire('functions/moderne/index.ts', `import { createClient } from "@supabase/supabase-js";
import { saluer, type Corps } from "./aide.ts";
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "access-control-allow-origin": "*" } });
  const corps = await req.json() as Corps;
  const client = createClient("http://base", Deno.env.get("CLE_TEST") ?? "absente");
  const { data, error } = await client.storage.from("factures").download(corps.nom);
  return new Response(JSON.stringify({
    message: saluer(corps), lecture: client.lire(), secret: req.headers.get("x-secret"),
    fichier: data ? new TextDecoder().decode(await data.arrayBuffer()) : null, erreur: error?.message ?? null,
  }), { status: 201, headers: { "content-type": "application/json", "x-fonction": "moderne" } });
});`);
  // Fonction à l'ancien format (analyser-seance) : imports par URL.
  ecrire('functions/ancienne/index.ts', `import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
serve(async (_req: Request) => new Response(createClient("u", "k").lire()));`);
  ecrire('functions/_shared/index.ts', 'throw new Error("ne doit pas être chargé");');
  // Route api/ : même client adapté, pour l'URL signée de api/_lib/facturesPatient.ts.
  ecrire('api/facture.js', `import { createClient } from "@supabase/supabase-js";
export default async (req, res) => {
  const { data } = await createClient("u", "k").storage.from("factures").createSignedUrl("p1/F-1.pdf", 60, { download: "Facture-F-1.pdf" });
  res.status(200).json(data);
};`);

  // Faux Cellar : le stockage des fonctions doit y aller, pas chez Supabase.
  objets = new Map([['/factures/Camille', Buffer.from('PDF fictif')]]);
  fauxS3 = http.createServer((req, res) => {
    const o = objets.get(req.url);
    res.statusCode = o && /^AWS4-HMAC-SHA256 /.test(req.headers.authorization ?? '') ? 200 : 404;
    res.end(o);
  });
  await new Promise(r => fauxS3.listen(0, '127.0.0.1', r));
  process.env.CELLAR_ADDON_HOST = `127.0.0.1:${fauxS3.address().port}`;
  process.env.CELLAR_ADDON_KEY_ID = 'cle';
  process.env.CELLAR_ADDON_KEY_SECRET = 'secret';
  process.env.STOCKAGE_S3_SCHEMA = 'http';
  process.env.CLE_TEST = 'cle-de-service';

  serveur = creerServeur({
    dossierApi: path.join(tmp, 'api'), dossierStatique: tmp, dossierFonctions: path.join(tmp, 'functions'),
    servirFront: false, regles: [],
  });
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${serveur.address().port}`;
});

after(() => { serveur?.close(); fauxS3?.close(); });

test('fonction Deno.serve : TypeScript, variables, corps, en-têtes, stockage S3', async () => {
  const rep = await fetch(`${base}/functions/v1/moderne`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-secret': 's3cr3t' }, body: JSON.stringify({ nom: 'Camille' }),
  });
  assert.equal(rep.status, 201);
  assert.equal(rep.headers.get('x-fonction'), 'moderne');
  assert.deepEqual(await rep.json(), {
    message: 'bonjour Camille', lecture: 'lu avec cle-de-service', secret: 's3cr3t', fichier: 'PDF fictif', erreur: null,
  });
});

test('route api/ : l\'URL signée pointe vers le stockage S3', async () => {
  const { signedUrl } = await (await fetch(`${base}/api/facture`)).json();
  assert.ok(signedUrl.startsWith(`http://${process.env.CELLAR_ADDON_HOST}/factures/p1/F-1.pdf?response-content-disposition=`));
  assert.match(signedUrl, /X-Amz-Expires=60&/);
});

test('pré-requête CORS transmise à la fonction', async () => {
  const rep = await fetch(`${base}/functions/v1/moderne`, { method: 'OPTIONS' });
  assert.equal(rep.status, 200);
  assert.equal(rep.headers.get('access-control-allow-origin'), '*');
});

test('fonction à imports par URL (deno.land, esm.sh)', async () => {
  const rep = await fetch(`${base}/functions/v1/ancienne`);
  assert.equal(await rep.text(), 'lu avec k');
});

test('fonction inconnue ou dossier partagé : 404', async () => {
  assert.equal((await fetch(`${base}/functions/v1/absente`)).status, 404);
  assert.equal((await fetch(`${base}/functions/v1/_shared`)).status, 404);
});

test('corps trop gros : 413', async () => {
  const rep = await fetch(`${base}/functions/v1/moderne`, { method: 'POST', body: 'x'.repeat(1_100_000) });
  assert.equal(rep.status, 413);
});

// Les trois vraies fonctions : elles doivent se charger sous Node et refuser un
// appel non authentifié. Ignoré sans `npm ci` (pdf-lib, supabase-js absents).
test('les Edge Functions du dépôt se chargent et refusent un appel anonyme', { skip: !fs.existsSync('node_modules/@supabase/supabase-js') && 'dépendances npm absentes' }, async () => {
  process.env.ORIGINES_AUTORISEES = 'https://app.exemple.fr';
  process.env.FACTURATION_WEBHOOK_SECRET = 'secret-de-test';
  const reel = creerServeur({ dossierApi: '/inexistant', dossierStatique: '/inexistant', servirFront: false, regles: [] });
  await new Promise(r => reel.listen(0, '127.0.0.1', r));
  try {
    const url = `http://127.0.0.1:${reel.address().port}/functions/v1`;
    const post = (nom, entetes = {}) => fetch(`${url}/${nom}`, { method: 'POST', headers: { 'content-type': 'application/json', ...entetes }, body: '{}' });
    assert.equal((await post('analyser-seance', { origin: 'https://app.exemple.fr' })).status, 401);
    assert.equal((await post('facturation-envoi', { origin: 'https://app.exemple.fr' })).status, 401);
    assert.equal((await post('analyser-seance', { origin: 'https://ailleurs.exemple' })).status, 403);
    assert.equal((await post('facturation-pdf', { 'x-facturation-secret': 'faux' })).status, 401);
  } finally {
    reel.close();
  }
});

// Le compositeur de factures dépend de pdf-lib et de fontkit, chargés ici par
// Node et non par Deno : on vérifie qu'un PDF sort réellement. Données fictives.
test('le PDF de facture se compose sous Node', { skip: !fs.existsSync('node_modules/pdf-lib') && 'dépendances npm absentes' }, async () => {
  const { composerFacturePdf } = await import('../../supabase/functions/facturation-pdf/composer.ts');
  const octets = await composerFacturePdf({
    numero: '2026-0007', type: 'facture', dateEmission: '2026-10-01', echeance: '2026-10-31', periode: '2026-09-01',
    totalHt: 100, montantTva: 10, tauxTva: 10, total: 110,
    emetteur: {
      prenom: 'Alex', nom: 'Exemple', titre: 'Enseignant en Activité Physique Adaptée',
      siret: '12345678900011', numero_sap: 'SAP123456789', numero_tva: 'FR00123456789',
      adresse: { rue: '1 rue de Test', code_postal: '75000', ville: 'Ville-Test' },
      email: 'praticien@example.com', telephone: '0102030405',
      regime_tva: 'assujetti', iban: 'FR7630006000011234567890189',
      date_declaration_sap: '2025-03-14', mode_intervention: 'prestataire',
      adresse_intervention: 'Au domicile du bénéficiaire',
    },
    destinataire: { role: 'beneficiaire', nom: 'Dupont', prenom: 'Camille', adresse: { rue: '2 avenue Fictive', code_postal: '69000', ville: 'Lyon-Test' } },
    lignes: [{ libelle: "Séance d'APA", quantite: 4, prixUnitaire: 25, montant: 100, seanceDate: '2026-09-03', seanceHeure: '10:00' }],
  });
  assert.equal(Buffer.from(octets.slice(0, 5)).toString(), '%PDF-');
  assert.ok(octets.length > 1_000, `PDF de ${octets.length} octets`);
});
