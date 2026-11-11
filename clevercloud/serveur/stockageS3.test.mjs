// `node --test clevercloud/` : signature V4 contrôlée par les exemples publiés
// dans la documentation AWS (« Signature Calculations for the Authorization
// Header » et « Authenticating Requests: Using Query Parameters »), puis les
// trois opérations contre un faux S3 en mémoire.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { signerRequete, urlPresignee, creerStockageS3, configurationS3 } from './stockageS3.mjs';

const AWS = {
  hote: 'examplebucket.s3.amazonaws.com', region: 'us-east-1',
  cleId: 'AKIAIOSFODNN7EXAMPLE', secret: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  date: new Date('2013-05-24T00:00:00Z'),
};

test('signature V4 : exemple AWS « GET Object » (en-tête Authorization)', () => {
  const e = signerRequete({ ...AWS, methode: 'GET', chemin: '/test.txt', entetes: { range: 'bytes=0-9' } });
  assert.match(e.authorization, /Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41$/);
  assert.match(e.authorization, /SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,/);
});

test('signature V4 : exemple AWS d\'URL présignée', () => {
  const url = urlPresignee({ ...AWS, chemin: '/test.txt', duree: 86400 });
  assert.match(url, /X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404$/);
  assert.ok(url.startsWith('https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&'));
});

test('configuration : absente sans CELLAR_ADDON_HOST, stricte sinon', () => {
  assert.equal(configurationS3({}), null);
  assert.throws(() => configurationS3({ CELLAR_ADDON_HOST: 'h' }));
  assert.equal(configurationS3({ CELLAR_ADDON_HOST: 'h', CELLAR_ADDON_KEY_ID: 'a', CELLAR_ADDON_KEY_SECRET: 'b' }).region, 'us-east-1');
});

test('upload, download et URL signée contre un faux S3', async () => {
  const objets = new Map();
  const vus = [];
  const faux = http.createServer(async (req, res) => {
    vus.push({ methode: req.method, url: req.url, auth: req.headers.authorization });
    const morceaux = [];
    for await (const m of req) morceaux.push(m);
    if (req.method === 'PUT') { objets.set(req.url, { octets: Buffer.concat(morceaux), type: req.headers['content-type'] }); return res.end(); }
    const o = objets.get(req.url.split('?')[0]);
    if (!o) { res.statusCode = 404; return res.end(); }
    res.setHeader('content-type', o.type);
    res.end(req.method === 'HEAD' ? undefined : o.octets);
  });
  await new Promise(r => faux.listen(0, '127.0.0.1', r));
  try {
    const hote = `127.0.0.1:${faux.address().port}`;
    const stockage = creerStockageS3({ hote, region: 'us-east-1', cleId: 'cle', secret: 'secret', schema: 'http' });
    const factures = stockage.from('factures');
    const octets = new Uint8Array([37, 80, 68, 70]);

    const ecrit = await factures.upload('p1/F-2026-0001.pdf', octets, { contentType: 'application/pdf', upsert: false });
    assert.deepEqual(ecrit, { data: { path: 'p1/F-2026-0001.pdf' }, error: null });
    assert.equal(objets.get('/factures/p1/F-2026-0001.pdf').type, 'application/pdf');
    assert.ok(vus.every(v => /^AWS4-HMAC-SHA256 Credential=cle\//.test(v.auth)));

    // upsert: false n'écrase jamais un fichier existant.
    const double = await factures.upload('p1/F-2026-0001.pdf', new Uint8Array([0]), { upsert: false });
    assert.equal(double.error.statusCode, '409');
    assert.equal(objets.get('/factures/p1/F-2026-0001.pdf').octets.length, 4);

    const lu = await factures.download('p1/F-2026-0001.pdf');
    assert.deepEqual(new Uint8Array(await lu.data.arrayBuffer()), octets);
    assert.equal((await factures.download('absent.pdf')).error.message, 'Object not found');

    const { data } = await factures.createSignedUrl('p1/F-2026-0001.pdf', 300, { download: 'Facture-F-2026-0001.pdf' });
    assert.match(data.signedUrl, /^http:\/\/127\.0\.0\.1:\d+\/factures\/p1\/F-2026-0001\.pdf\?response-content-disposition=attachment%3B%20filename%3D%22Facture-F-2026-0001\.pdf%22&X-Amz-Algorithm=/);
    assert.match(data.signedUrl, /X-Amz-Expires=300&/);
    assert.equal((await fetch(data.signedUrl)).status, 200);
  } finally {
    faux.close();
  }
});
