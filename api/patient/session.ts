// POST /api/patient/session
//
// Émet un token de session patient (même format/durée dans les deux cas).
// Deux chemins d'entrée, dispatchés selon ce que le client envoie :
//   - { code } dans le body               → connexion patient par code d'accès
//   - Authorization: Bearer <JWT praticien> + { participantId } → accès délégué
//     par le praticien propriétaire, sans code (ex: bouton "Voir l'espace
//     patient" depuis la fiche bénéficiaire).
//
// Fusion de deux anciens endpoints (api/patient/login.ts et
// api/patient/praticien-acces.ts), pour rester sous la limite de fonctions
// serverless du plan Vercel Hobby (12). La logique métier de chaque chemin
// est inchangée — voir api/_lib/patientSession.ts.
//
// Le dispatch se base sur la présence du champ "code" dans le body (envoyé
// systématiquement par patientLogin(), jamais par patientAccesPraticien(),
// voir src/lib/patientApi.ts) plutôt que sur sa validité, pour préserver le
// message d'erreur "Code requis" tel quel en cas de code vide/invalide.

import { getServiceClient, getClientIp, extractBearerToken } from '../_lib/patientAuth.js';
import { connexionParCode, accesViaPraticien } from '../_lib/patientSession.js';
import { withSentry } from '../_lib/sentry.js';

export default withSentry(async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let supabase;
  try {
    supabase = getServiceClient();
  } catch {
    return res.status(500).json({ error: 'Erreur serveur' });
  }

  const body = req.body ?? {};
  const ip = getClientIp(req);

  if (Object.prototype.hasOwnProperty.call(body, 'code')) {
    const { status, body: responseBody } = await connexionParCode(supabase, body.code, ip);
    return res.status(status).json(responseBody);
  }

  const praticienToken = extractBearerToken(req);
  if (praticienToken) {
    const { status, body: responseBody } = await accesViaPraticien(supabase, praticienToken, body.participantId, ip);
    return res.status(status).json(responseBody);
  }

  return res.status(400).json({ error: 'code ou Authorization requis' });
});
