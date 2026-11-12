// `node --test clevercloud/serveur/` : reprise des PDF de factures, contre un
// faux PostgREST et une fausse fonction facturation-pdf.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repriseFacturesActive, passerReprise, demarrerRepriseFactures, ESSAIS_MAX } from './repriseFactures.mjs';

const reponse = (status, corps) => ({ ok: status >= 200 && status < 300, status, json: async () => corps });

/** Faux réseau : `sansPdf` = ids renvoyés par PostgREST ; `statuts` = réponse de la fonction par id. */
function fauxReseau(sansPdf, statuts = {}) {
  const appels = [];
  const appeler = async (url, options = {}) => {
    appels.push({ url, options });
    if (url.includes('/factures?')) return reponse(200, sansPdf.map(id => ({ id })));
    const id = JSON.parse(options.body).facture_id;
    const statut = statuts[id] ?? 200;
    if (statut === 200) sansPdf.splice(sansPdf.indexOf(id), 1);
    return reponse(statut, {});
  };
  return { appels, appeler };
}
const base = { port: 8080, postgrest: 'http://pg', cleService: 'cle', secret: 'secret-partage' };

test('activation : interrupteur explicite, instance 0 seulement', () => {
  assert.equal(repriseFacturesActive({}), false);
  assert.equal(repriseFacturesActive({ REPRISE_FACTURES_PDF: '1' }), true);
  assert.equal(repriseFacturesActive({ REPRISE_FACTURES_PDF: '1', INSTANCE_NUMBER: '2' }), false);
  // Variables manquantes : pas de démarrage, pas d'exception.
  assert.equal(demarrerRepriseFactures({ port: 1, env: { REPRISE_FACTURES_PDF: '1' } }), null);
});

test('un passage : lit en service_role les factures validées sans PDF et appelle la fonction avec le secret', async () => {
  const { appels, appeler } = fauxReseau(['f1', 'f2']);
  const bilan = await passerReprise({ ...base, echecs: new Map(), appeler });
  assert.deepEqual(bilan, { vues: 2, faites: 2 });

  const lecture = appels[0];
  assert.match(lecture.url, /^http:\/\/pg\/factures\?select=id&pdf_path=is\.null&statut=in\.\(validee,envoyee,payee,en_retard\)/);
  assert.equal(lecture.options.headers.authorization, 'Bearer cle');
  // Jamais de brouillon : il n'a pas de numéro, la fonction le refuserait.
  assert.doesNotMatch(lecture.url, /brouillon/);

  const appel = appels[1];
  assert.equal(appel.url, 'http://127.0.0.1:8080/functions/v1/facturation-pdf');
  assert.equal(appel.options.headers['x-facturation-secret'], 'secret-partage');
  assert.deepEqual(JSON.parse(appel.options.body), { facture_id: 'f1' });
});

test('une facture en échec est retentée, puis abandonnée après ESSAIS_MAX sans bloquer les autres', async () => {
  const sansPdf = ['casse', 'saine'];
  const { appels, appeler } = fauxReseau(sansPdf, { casse: 500 });
  const echecs = new Map();
  assert.deepEqual(await passerReprise({ ...base, echecs, appeler }), { vues: 2, faites: 1 });
  for (let i = 1; i < ESSAIS_MAX; i++) await passerReprise({ ...base, echecs, appeler });
  assert.equal(echecs.get('casse'), ESSAIS_MAX);

  const avant = appels.length;
  assert.deepEqual(await passerReprise({ ...base, echecs, appeler }), { vues: 0, faites: 0 });
  // Seule la lecture a eu lieu : plus aucun appel à la fonction pour la facture abandonnée.
  assert.equal(appels.length, avant + 1);
});

test('lecture refusée : le passage échoue bruyamment, rien n\'est appelé', async () => {
  const appels = [];
  const appeler = async url => { appels.push(url); return reponse(401, {}); };
  await assert.rejects(passerReprise({ ...base, echecs: new Map(), appeler }), /refusée \(401\)/);
  assert.equal(appels.length, 1);
});

test('démarrage : passages enchaînés sans chevauchement, arrêt propre', async () => {
  const { appels, appeler } = fauxReseau(['f1']);
  const env = { REPRISE_FACTURES_PDF: '1', POSTGREST_URL: 'http://pg/', SUPABASE_SERVICE_ROLE_KEY: 'cle', FACTURATION_WEBHOOK_SECRET: 's' };
  const reprise = demarrerRepriseFactures({ port: 8080, env, appeler, intervalle: 5 });
  await new Promise(r => setTimeout(r, 60));
  reprise.arreter();
  const fige = appels.length;
  await new Promise(r => setTimeout(r, 30));
  assert.equal(appels.length, fige);
  assert.equal(appels.filter(a => a.url.includes('/functions/v1/')).length, 1);
  assert.ok(appels[0].url.startsWith('http://pg/factures?'));
});
