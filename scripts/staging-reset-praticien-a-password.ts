// scripts/staging-reset-praticien-a-password.ts
//
// Réinitialise le mot de passe de staging.praticien@example.com (praticien A)
// via supabase.auth.admin.updateUserById() — clé service_role
// (SUPABASE_TEST_URL / SUPABASE_TEST_SERVICE_ROLE_KEY, déjà dans
// .env.test.local), sans passer par un email de récupération.
//
// La nouvelle valeur est générée ici (aléatoire, cryptographique) et
// n'est JAMAIS affichée dans la sortie de ce script — écrite uniquement
// dans un fichier hors dépôt (dossier scratchpad de la session), pour
// être posée en secret GitHub sans jamais passer par le chat.
//
// Garde-fou anti-prod sur SUPABASE_TEST_URL, même principe que les scripts
// précédents sur STAGING_DATABASE_URL.
//
// Usage :
//   npx tsx scripts/staging-reset-praticien-a-password.ts

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STAGING_REF = 'nnfkchhtjrferxnwlcxp';
const PRODUCTION_REF = 'rjgzeuywwknubpwigozq';
const PRATICIEN_A_EMAIL = 'staging.praticien@example.com';

const OUT_DIR = 'C:\\Users\\loren\\AppData\\Local\\Temp\\claude\\C--Users-loren-OneDrive-Bureau-Claude-code-Mouvtrack\\8609b0b7-4a3a-481e-bd1b-6da7d9bee500\\scratchpad';

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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function assertStagingUrl(url: string): void {
  if (url.includes(PRODUCTION_REF)) {
    throw new Error('Garde-fou : SUPABASE_TEST_URL pointe vers la référence de projet PRODUCTION. Abandon.');
  }
  if (!url.includes(STAGING_REF)) {
    throw new Error('Garde-fou : impossible de confirmer que SUPABASE_TEST_URL pointe vers staging (réf. non reconnue). Abandon.');
  }
}

function generatePassword(): string {
  const random = crypto.randomBytes(24).toString('base64url');
  return `Staging-${random}!Aa1`;
}

async function main() {
  const envPath = path.resolve(__dirname, '../.env.test.local');
  const parsed = loadEnvFile(envPath);
  for (const [key, value] of Object.entries(parsed)) {
    if (!(key in process.env)) process.env[key] = value;
  }

  const url = process.env.SUPABASE_TEST_URL;
  const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(`SUPABASE_TEST_URL / SUPABASE_TEST_SERVICE_ROLE_KEY introuvables (ni dans ${envPath}, ni dans l'environnement).`);
  }
  assertStagingUrl(url);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: listData, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) throw new Error(`Impossible de lister les utilisateurs : ${listErr.message}`);
  const user = listData.users.find(u => u.email === PRATICIEN_A_EMAIL);
  if (!user) throw new Error(`Utilisateur ${PRATICIEN_A_EMAIL} introuvable sur ce projet.`);

  const newPassword = generatePassword();

  const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, { password: newPassword });
  if (updateErr) throw new Error(`Échec de la mise à jour du mot de passe : ${updateErr.message}`);

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `praticien-a-password-${Date.now()}.txt`);
  writeFileSync(outPath, newPassword, 'utf-8');

  console.log(`Mot de passe réinitialisé avec succès pour ${PRATICIEN_A_EMAIL}.`);
  console.log(`Valeur écrite (jamais affichée ici) dans : ${outPath}`);
  console.log('Supprime ce fichier une fois le secret GitHub posé.');
}

main().catch(err => {
  console.error('Erreur :', err instanceof Error ? err.message : err);
  process.exit(1);
});
