// Stockage S3 (Cellar) derrière la même surface que `supabase.storage`
// (2026-11-11, lot « stockage » de la migration HDS).
//
// Le code d'Horizon n'utilise que trois opérations sur un seul bucket privé,
// `factures` (relevé le 2026-11-11) :
//   upload(chemin, octets, { contentType, upsert })   supabase/functions/facturation-pdf
//   download(chemin)                                  supabase/functions/facturation-*
//   createSignedUrl(chemin, duree, { download })      api/_lib/facturesPatient.ts
// Elles sont réécrites ici au-dessus de l'API S3, avec les mêmes formes de
// retour ({ data, error }), pour que ni les routes ni les fonctions ne changent.
// Rien d'autre n'est émulé : une opération non prévue échoue bruyamment.
//
// Signature AWS V4 écrite à la main avec node:crypto : aucune dépendance npm à
// auditer. Vérifiée par les exemples publiés dans la documentation AWS
// (stockageS3.test.mjs).

import crypto from 'node:crypto';

const hmac = (cle, texte) => crypto.createHmac('sha256', cle).update(texte).digest();
const sha256 = donnees => crypto.createHash('sha256').update(donnees).digest('hex');

/** Encodage RFC 3986 exigé par la signature V4 (encodeURIComponent laisse !'()* ). */
export function encoder(texte) {
  return encodeURIComponent(texte).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}
const encoderChemin = chemin => chemin.split('/').map(encoder).join('/');

function horodatage(date) {
  const iso = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return { long: iso, jour: iso.slice(0, 8) };
}

function cleDeSignature(secret, jour, region) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, jour), region), 's3'), 'aws4_request');
}

function signer({ methode, hote, chemin, requete, entetes, empreinteCorps, date, region, cleId, secret }) {
  const { long, jour } = horodatage(date);
  const noms = Object.keys(entetes).map(n => n.toLowerCase()).sort();
  const parNom = Object.fromEntries(Object.entries(entetes).map(([n, v]) => [n.toLowerCase(), String(v).trim()]));
  const canonique = [
    methode,
    encoderChemin(chemin),
    [...requete].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([n, v]) => `${encoder(n)}=${encoder(v)}`).join('&'),
    noms.map(n => `${n}:${parNom[n]}\n`).join(''),
    noms.join(';'),
    empreinteCorps,
  ].join('\n');
  const portee = `${jour}/${region}/s3/aws4_request`;
  const aSigner = ['AWS4-HMAC-SHA256', long, portee, sha256(canonique)].join('\n');
  const signature = hmac(cleDeSignature(secret, jour, region), aSigner).toString('hex');
  return { signature, portee, entetesSignes: noms.join(';'), hote };
}

/** En-tête Authorization d'une requête signée. */
export function signerRequete({ methode, hote, chemin, requete = [], entetes = {}, corps = '', date = new Date(), region, cleId, secret }) {
  const { long } = horodatage(date);
  const empreinteCorps = sha256(corps);
  const tous = { ...entetes, host: hote, 'x-amz-content-sha256': empreinteCorps, 'x-amz-date': long };
  const s = signer({ methode, hote, chemin, requete, entetes: tous, empreinteCorps, date, region, cleId, secret });
  return {
    ...tous,
    authorization: `AWS4-HMAC-SHA256 Credential=${cleId}/${s.portee},SignedHeaders=${s.entetesSignes},Signature=${s.signature}`,
  };
}

/** URL présignée (signature dans la chaîne de requête), valable `duree` secondes. */
export function urlPresignee({ methode = 'GET', schema = 'https', hote, chemin, requete = [], duree, date = new Date(), region, cleId, secret }) {
  const { long, jour } = horodatage(date);
  const params = [
    ...requete,
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${cleId}/${jour}/${region}/s3/aws4_request`],
    ['X-Amz-Date', long],
    ['X-Amz-Expires', String(duree)],
    ['X-Amz-SignedHeaders', 'host'],
  ];
  const s = signer({ methode, hote, chemin, requete: params, entetes: { host: hote }, empreinteCorps: 'UNSIGNED-PAYLOAD', date, region, cleId, secret });
  const chaine = [...params, ['X-Amz-Signature', s.signature]].map(([n, v]) => `${encoder(n)}=${encoder(v)}`).join('&');
  return `${schema}://${hote}${encoderChemin(chemin)}?${chaine}`;
}

/**
 * Configuration lue dans l'environnement. L'add-on Cellar de Clever Cloud
 * expose CELLAR_ADDON_HOST, CELLAR_ADDON_KEY_ID et CELLAR_ADDON_KEY_SECRET.
 * Sans CELLAR_ADDON_HOST, on renvoie null : le stockage Supabase reste utilisé.
 */
export function configurationS3(env = process.env) {
  if (!env.CELLAR_ADDON_HOST) return null;
  if (!env.CELLAR_ADDON_KEY_ID || !env.CELLAR_ADDON_KEY_SECRET) {
    throw new Error('CELLAR_ADDON_HOST est défini sans CELLAR_ADDON_KEY_ID / CELLAR_ADDON_KEY_SECRET.');
  }
  return {
    hote: env.CELLAR_ADDON_HOST,
    cleId: env.CELLAR_ADDON_KEY_ID,
    secret: env.CELLAR_ADDON_KEY_SECRET,
    // Cellar accepte n'importe quelle région dans la signature ; à confirmer en recette.
    region: env.STOCKAGE_S3_REGION ?? 'us-east-1',
    schema: env.STOCKAGE_S3_SCHEMA ?? 'https',
  };
}

const erreur = (message, statut) => ({ data: null, error: { message, statusCode: String(statut ?? '') } });

/** Même surface que `supabase.storage`, limitée aux trois opérations utilisées. */
export function creerStockageS3(conf, { requeter = fetch, maintenant = () => new Date() } = {}) {
  const { hote, region, cleId, secret, schema } = conf;

  async function appeler(methode, chemin, { entetes = {}, corps } = {}) {
    const signes = signerRequete({ methode, hote, chemin, entetes, corps: corps ?? '', date: maintenant(), region, cleId, secret });
    const { host: _hote, ...aEnvoyer } = signes;
    return requeter(`${schema}://${hote}${encoderChemin(chemin)}`, { method: methode, headers: aEnvoyer, body: corps });
  }

  return {
    from(bucket) {
      // Adressage par chemin (/bucket/clé) : pas de sous-domaine par bucket à déclarer.
      const cheminDe = cle => `/${bucket}/${String(cle).replace(/^\/+/, '')}`;
      return {
        async upload(cle, octets, { contentType = 'application/octet-stream', upsert = false } = {}) {
          try {
            if (!upsert) {
              // Supabase refuse d'écraser un fichier existant quand upsert vaut false.
              // facturation-pdf s'appuie dessus (« le fichier existant gagne »).
              const tete = await appeler('HEAD', cheminDe(cle));
              if (tete.status === 200) return erreur('The resource already exists', 409);
            }
            const corps = Buffer.from(octets);
            const rep = await appeler('PUT', cheminDe(cle), { entetes: { 'content-type': contentType }, corps });
            if (!rep.ok) return erreur(`Écriture refusée (${rep.status})`, rep.status);
            return { data: { path: cle }, error: null };
          } catch (e) {
            return erreur(e instanceof Error ? e.message : 'Écriture impossible');
          }
        },
        async download(cle) {
          try {
            const rep = await appeler('GET', cheminDe(cle));
            if (!rep.ok) return erreur(rep.status === 404 ? 'Object not found' : `Lecture refusée (${rep.status})`, rep.status);
            return { data: await rep.blob(), error: null };
          } catch (e) {
            return erreur(e instanceof Error ? e.message : 'Lecture impossible');
          }
        },
        async createSignedUrl(cle, duree, { download } = {}) {
          const requete = download
            ? [['response-content-disposition', `attachment; filename="${String(download === true ? cle.split('/').pop() : download).replace(/["\\\r\n]/g, '')}"`]]
            : [];
          const signedUrl = urlPresignee({ schema, hote, chemin: cheminDe(cle), requete, duree, date: maintenant(), region, cleId, secret });
          return { data: { signedUrl }, error: null };
        },
      };
    },
  };
}
