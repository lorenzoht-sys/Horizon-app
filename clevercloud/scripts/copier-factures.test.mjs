// `node --test clevercloud/scripts/` : copie des PDF de factures contre une
// fausse source Supabase et un faux S3, tous deux en mémoire.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { copierFactures, listerChemins } from './copier-factures.mjs';
import { creerStockageS3 } from '../serveur/stockageS3.mjs';

const pdf = texte => Buffer.from(`%PDF-${texte}`);

async function ecouter(gestionnaire) {
  const serveur = http.createServer(gestionnaire);
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  return { serveur, hote: `127.0.0.1:${serveur.address().port}` };
}

/** Fausse source : PostgREST (`factures.pdf_path`, paginé par Range) et stockage. */
async function fausseSource(chemins, fichiers) {
  const vus = [];
  const { serveur, hote } = await ecouter((req, res) => {
    vus.push({ url: req.url, auth: req.headers.authorization });
    if (req.url.startsWith('/rest/v1/factures')) {
      const [debut, fin] = req.headers.range.split('-').map(Number);
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify(chemins.slice(debut, fin + 1).map(pdf_path => ({ pdf_path }))));
    }
    const cle = decodeURIComponent(req.url.replace('/storage/v1/object/factures/', ''));
    if (!fichiers.has(cle)) { res.statusCode = 404; return res.end(); }
    res.end(fichiers.get(cle));
  });
  return { serveur, vus, source: { url: `http://${hote}`, cle: 'cle-service' } };
}

async function fauxS3({ alterer } = {}) {
  const objets = new Map();
  const { serveur, hote } = await ecouter(async (req, res) => {
    const morceaux = [];
    for await (const m of req) morceaux.push(m);
    if (req.method === 'PUT') {
      const octets = Buffer.concat(morceaux);
      objets.set(req.url, alterer?.(req.url) ? Buffer.concat([octets, Buffer.from('x')]) : octets);
      return res.end();
    }
    const o = objets.get(req.url);
    if (!o) { res.statusCode = 404; return res.end(); }
    res.end(req.method === 'HEAD' ? undefined : o);
  });
  const arrivee = creerStockageS3({ hote, region: 'us-east-1', cleId: 'c', secret: 's', schema: 'http' }).from('factures');
  return { serveur, objets, arrivee };
}

test('contrôle seul : rien n\'est écrit, tout est « à copier »', async () => {
  const fichiers = new Map([['p1/F-1.pdf', pdf('un')], ['p1/F-2.pdf', pdf('deux')]]);
  const s = await fausseSource([...fichiers.keys()], fichiers);
  const a = await fauxS3();
  try {
    const bilan = await copierFactures({ source: s.source, arrivee: a.arrivee });
    assert.deepEqual({ ...bilan, anomalies: bilan.anomalies.length }, { attendus: 2, copies: 0, dejaCopies: 0, aCopier: 2, anomalies: 0, complet: false });
    assert.equal(a.objets.size, 0);
    assert.ok(s.vus.every(v => v.auth === 'Bearer cle-service'));
  } finally { s.serveur.close(); a.serveur.close(); }
});

test('copie, puis rejeu sans effet : les fichiers identiques sont comptés « déjà copiés »', async () => {
  const fichiers = new Map([['p1/F-1.pdf', pdf('un')], ['p2/F-1.pdf', pdf('autre praticien')]]);
  const s = await fausseSource([...fichiers.keys()], fichiers);
  const a = await fauxS3();
  try {
    const premier = await copierFactures({ source: s.source, arrivee: a.arrivee, executer: true });
    assert.equal(premier.copies, 2);
    assert.equal(premier.complet, true);
    assert.deepEqual(a.objets.get('/factures/p2/F-1.pdf'), pdf('autre praticien'));

    const second = await copierFactures({ source: s.source, arrivee: a.arrivee, executer: true });
    assert.deepEqual({ copies: second.copies, dejaCopies: second.dejaCopies, complet: second.complet }, { copies: 0, dejaCopies: 2, complet: true });
  } finally { s.serveur.close(); a.serveur.close(); }
});

test('anomalies : PDF absent de la source, contenu différent à l\'arrivée (jamais écrasé), écriture altérée', async () => {
  const fichiers = new Map([['p1/F-1.pdf', pdf('un')], ['p1/F-3.pdf', pdf('trois')], ['p1/F-4.pdf', pdf('quatre')]]);
  const s = await fausseSource(['p1/F-1.pdf', 'p1/F-2.pdf', 'p1/F-3.pdf', 'p1/F-4.pdf'], fichiers);
  const a = await fauxS3({ alterer: url => url.endsWith('F-4.pdf') });
  a.objets.set('/factures/p1/F-3.pdf', pdf('autre contenu'));
  try {
    const bilan = await copierFactures({ source: s.source, arrivee: a.arrivee, executer: true });
    assert.equal(bilan.copies, 1);
    assert.equal(bilan.complet, false);
    assert.deepEqual(bilan.anomalies.map(x => x.chemin), ['p1/F-2.pdf', 'p1/F-3.pdf', 'p1/F-4.pdf']);
    assert.match(bilan.anomalies[0].motif, /absent du stockage source/);
    assert.match(bilan.anomalies[1].motif, /non écrasé/);
    assert.match(bilan.anomalies[2].motif, /empreinte différente/);
    assert.deepEqual(a.objets.get('/factures/p1/F-3.pdf'), pdf('autre contenu'));
  } finally { s.serveur.close(); a.serveur.close(); }
});

test('liste : pagination au-delà d\'une page, doublon refusé', async () => {
  const chemins = Array.from({ length: 1201 }, (_, i) => `p1/F-${i}.pdf`);
  const s = await fausseSource(chemins, new Map());
  try {
    assert.equal((await listerChemins(s.source)).length, 1201);
  } finally { s.serveur.close(); }
  const d = await fausseSource(['p1/F-1.pdf', 'p1/F-1.pdf'], new Map());
  try {
    await assert.rejects(listerChemins(d.source), /en double/);
  } finally { d.serveur.close(); }
});
