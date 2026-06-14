// scripts/backfill-code-acces.ts
//
// Attribue un code_acces unique aux participants existants qui n'en ont pas
// (colonne ajoutée par
// supabase/migrations/20260614_add_code_acces_participants.sql).
//
// À lancer UNE FOIS, après avoir appliqué la migration ci-dessus.
//
// Usage (PowerShell) :
//   $env:VITE_SUPABASE_URL = "https://xxxx.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY = "eyJ..."   (clé service_role — jamais le anon key)
//   npx tsx scripts/backfill-code-acces.ts
//
// La clé service_role est nécessaire : elle contourne RLS, ce script doit
// voir et modifier TOUS les participants, de tous les praticiens.

import { createClient } from '@supabase/supabase-js';
import { genererCodeAcces } from '../src/utils/codeAcces.ts';

const MAX_TENTATIVES = 10;

interface ParticipantRow {
  id: string;
  prenom: string;
  nom: string;
  code_acces: string | null;
}

async function main() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Variables manquantes : VITE_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requises.');
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: participants, error } = await supabase
    .from('participants')
    .select('id, prenom, nom, code_acces')
    .returns<ParticipantRow[]>();

  if (error) throw error;

  const codesExistants = new Set(
    participants.map(p => p.code_acces).filter((c): c is string => Boolean(c))
  );

  const aTraiter = participants.filter(p => !p.code_acces);
  console.log(`${participants.length} participant(s) au total, ${aTraiter.length} sans code d'accès.`);

  const resultats: { prenom: string; nom: string; code: string }[] = [];

  for (const p of aTraiter) {
    let code = '';
    for (let tentative = 0; tentative < MAX_TENTATIVES; tentative++) {
      const candidat = genererCodeAcces();
      if (codesExistants.has(candidat)) continue;

      const { error: updateError } = await supabase
        .from('participants')
        .update({ code_acces: candidat })
        .eq('id', p.id);

      if (!updateError) {
        code = candidat;
        codesExistants.add(candidat);
        break;
      }
      if (updateError.code !== '23505') throw updateError;
      // collision improbable sur l'index unique : on réessaie avec un autre code
    }
    if (!code) {
      throw new Error(`Impossible de générer un code unique pour ${p.prenom} ${p.nom} (id ${p.id}) après ${MAX_TENTATIVES} tentatives.`);
    }
    resultats.push({ prenom: p.prenom, nom: p.nom, code });
  }

  console.log('\nNouveaux codes attribués :\n');
  for (const r of resultats) {
    console.log(`  ${r.prenom} ${r.nom}`.padEnd(40) + r.code);
  }
  console.log(`\n${resultats.length} code(s) d'accès généré(s).`);
}

main().catch(err => {
  console.error('Erreur :', err);
  process.exit(1);
});
