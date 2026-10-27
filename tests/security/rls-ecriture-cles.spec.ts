// tests/security/rls-ecriture-cles.spec.ts
//
// Lot J sécurité HDS (2026-10-27) : écritures croisées par CLÉ ÉTRANGÈRE.
//
// Le harnais principal (rls.spec.ts) a montré, sur quatre tables, des règles
// d'écriture qui vérifient « la ligne porte mon praticien_id » mais jamais
// « l'objet référencé m'appartient » (bénéficiaire, cours, structure…). Une
// analyse de toutes les policies (PR #166) a trouvé le même motif sur bien
// d'autres tables. Ce fichier le TESTE, table par table et clé par clé :
//
//   1. B insère une ligne à son nom qui pointe vers un objet de A ;
//   2. B repointe une de SES lignes vers un objet de A (mise à jour) ;
//   3. A écrit toujours normalement sur ses propres objets (contrôle positif).
//
// Chaque tentative est vérifiée en relisant la base en service_role, par
// l'identifiant fixé ici (une erreur PostgREST ne prouve rien à elle seule).
// Une tentative qui réussit est une FUITE : le test est alors listé dans
// FUITES_CONSTATEES et passe en `it.fails` (vert tant que la fuite existe,
// rouge le jour où elle est corrigée — retirer alors l'entrée).
//
// ── Autonome ────────────────────────────────────────────────────────────
// Contrairement à rls.spec.ts, ce fichier ne dépend d'aucun jeu de données :
// il crée DEUX praticiens fictifs et tous leurs objets (bénéficiaires E2E,
// structures, contrats, séances…) en service_role, puis les supprime par
// identifiant. Il tourne donc aussi bien sur le staging (CI, security.yml)
// que sur la base Supabase LOCALE (`supabase start`), avec :
//   SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY / SUPABASE_TEST_SERVICE_ROLE_KEY
// Jamais la production : ce fichier crée et supprime des comptes.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const URL = process.env.SUPABASE_TEST_URL;
const ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const ACTIF = Boolean(URL && ANON_KEY && SERVICE_KEY);

// Fuites constatées, clé « table.colonne:tentative » (tentative = insertion |
// repointage). Voir l'en-tête. Toute entrée est une FUITE CONSTATÉE.
// FUITE CONSTATÉE — toutes les clés ci-dessous, en insertion ET en
// repointage : constaté le 2026-10-27 sur la base locale (schéma de main),
// puis par le harnais en CI sur le staging. Cause commune : le WITH CHECK
// ne vérifie que praticien_id = auth.uid() (ou le bénéficiaire, pour les
// tables patient), jamais l'appartenance de l'objet référencé.
// Une liste par famille : chaque migration (K1, K2, K3) ne vide que la
// sienne, sans toucher aux lignes des autres.
const CLES_EN_FUITE_BENEFICIAIRE: string[] = [
  'bilans.participant_id', 'contrats.participant_id', 'seances.participant_id', 'programmes.participant_id',
  'notes_seances.participant_id', 'comptes_rendus_seances.participant_id', 'bilans_brouillons.participant_id',
  'factures_suivi.participant_id', 'assistant_logs.patient_id', 'seances.contrat_id', 'notes_seances.seance_id',
];

const CLES_EN_FUITE_STRUCTURE: string[] = [
  'participants.structure_id', 'documents_partages.structure_id', 'cours_collectifs.structure_id',
  'templates_structure.structure_id', 'factures_suivi.structure_id', 'cours_collectifs.programme_commun_id',
];

const CLES_EN_FUITE_FAIBLE: string[] = [
  'dossier_exercice_membres.dossier_id', 'exercices_personnalises.dossier_id',
  'participations_cours_collectifs.programme_individuel_id', 'seances_patient.programme_id',
  'seances_patient.seance_id', 'exercices_realises.exercice_id',
];

const CLES_EN_FUITE = [...CLES_EN_FUITE_BENEFICIAIRE, ...CLES_EN_FUITE_STRUCTURE, ...CLES_EN_FUITE_FAIBLE];
const MOTIF = "WITH CHECK sans contrôle d'appartenance de l'objet référencé";
export const FUITES_CONSTATEES: Record<string, string> = {
  ...Object.fromEntries(CLES_EN_FUITE.flatMap(c => [[`${c}:insertion`, MOTIF], [`${c}:repointage`, MOTIF]])),
  ...(CLES_EN_FUITE_STRUCTURE.length ? {
    // FUITE CONSTATÉE — participants_update ne vérifie pas l'organisation.
    'participants.organisation_id:repointage': "participants_update sans contrôle d'appartenance à l'organisation",
    // FUITE CONSTATÉE — conséquence visible : le portail de la structure de A
    // affiche le bénéficiaire et le document de B.
    'portail-structure:beneficiaire-de-B': 'participants.structure_id et documents_partages.structure_id non vérifiés',
  } : {}),
};

type Ligne = Record<string, unknown>;
type Proprio = 'A' | 'B';

interface Objets {
  praticien: string;
  participant: string;
  structure: string;
  contrat: string;
  seance: string;
  programme: string;
  programmeSeance: string;
  programmeExercice: string;
  seancePatient: string;
  cours: string;
  modele: string;
  dossier: string;
}

const rgpd = { consentementObtenu: true, droitAcces: true, droitRectification: true, droitEffacement: true, methodeConsentement: 'ecrit', consentementDate: '2026-10-27' };
const nonce = () => `rls-ecr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe.skipIf(!ACTIF)('Écriture croisée par clé étrangère (lot J)', () => {
  let admin: SupabaseClient;
  const client: Partial<Record<Proprio, SupabaseClient>> = {};
  const o = {} as Record<Proprio, Objets>;
  let organisationA: string;
  let organisationPartagee: string;
  let beneficiaireArchiveA: string;
  let objetsOrganisation: Objets;
  const aSupprimer: [string, string][] = []; // [table, id], supprimés à l'envers

  async function inserer(table: string, ligne: Ligne): Promise<string> {
    const id = (ligne.id as string) ?? randomUUID();
    const { error } = await admin.from(table).insert({ ...ligne, id });
    if (error) throw new Error(`Fixture ${table} impossible à créer : ${error.message}`);
    aSupprimer.push([table, id]);
    return id;
  }

  async function creerPraticien(p: Proprio): Promise<void> {
    const email = `rls-ecriture-${p.toLowerCase()}-${Date.now()}@example.invalid`;
    const password = `Rls-Ecr-${randomUUID()}!Aa1`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(`Création praticien ${p} impossible : ${error?.message}`);
    const praticien = data.user.id;
    await admin.from('praticiens').insert({ id: praticien, prenom: 'RLS-Ecriture', nom: `Praticien ${p}`, email });
    const c = createClient(URL as string, ANON_KEY as string, { auth: { persistSession: false } });
    const { error: e } = await c.auth.signInWithPassword({ email, password });
    if (e) throw new Error(`Connexion praticien ${p} impossible : ${e.message}`);
    client[p] = c;

    const participant = await inserer('participants', { praticien_id: praticien, prenom: 'E2E', nom: `RLS-Ecriture ${p}`, code_acces: `RLE${p}${Math.floor(Math.random() * 1e6)}`, rgpd });
    const structure = await inserer('structures', { praticien_id: praticien, nom: `RLS-Ecriture structure ${p}`, contact_email: 'rls-ecriture@example.invalid', token_acces: nonce(), actif: true });
    const contrat = await inserer('contrats', { praticien_id: praticien, participant_id: participant, date_debut: '2099-01-01', date_fin: '2099-12-31' });
    const seance = await inserer('seances', { praticien_id: praticien, participant_id: participant, date: '2099-01-10', heure_debut: '10:00', heure_fin: '11:00', type: 'seance', statut: 'planifiee' });
    const programme = await inserer('programmes', { praticien_id: praticien, participant_id: participant, date_debut: '2099-01-01', titre: 'RLS-Ecriture' });
    const programmeSeance = await inserer('programme_seances', { programme_id: programme, nom: 'Séance A' });
    const programmeExercice = await inserer('programme_exercices', { seance_id: programmeSeance, nom: 'Exercice' });
    const seancePatient = await inserer('seances_patient', { participant_id: participant, programme_id: programme, seance_id: programmeSeance, date_seance: '2099-01-11', statut: 'terminee' });
    const cours = await inserer('cours_collectifs', { praticien_id: praticien, titre: 'RLS-Ecriture', date: '2099-01-12', heure_debut: '10:00', duree_minutes: 45, mode_facturation: 'individuel' });
    const modele = await inserer('programmes_modeles', { praticien_id: praticien, nom: 'RLS-Ecriture modèle' });
    const dossier = await inserer('dossiers_exercices', { praticien_id: praticien, nom: 'RLS-Ecriture dossier' });
    o[p] = { praticien, participant, structure, contrat, seance, programme, programmeSeance, programmeExercice, seancePatient, cours, modele, dossier };
  }

  beforeAll(async () => {
    admin = createClient(URL as string, SERVICE_KEY as string, { auth: { persistSession: false } });
    await creerPraticien('A');
    await creerPraticien('B');
    // Organisation dont A est administrateur ; B n'en est PAS membre.
    organisationA = await inserer('organisations', { nom: 'RLS-Ecriture organisation A', statut: 'active', actif: true });
    await inserer('organisation_membres', { organisation_id: organisationA, user_id: o.A.praticien, role: 'admin', actif: true });

    // Cas légitimes : bénéficiaire ARCHIVÉ de A, et organisation partagée
    // dont B est membre (intervenant) avec un bénéficiaire de l'organisation
    // créé par A, son contrat et sa séance.
    beneficiaireArchiveA = await inserer('participants', { praticien_id: o.A.praticien, prenom: 'E2E', nom: 'RLS-Ecriture archivé', code_acces: `RLA${Math.floor(Math.random() * 1e7)}`, rgpd, archive: true });
    organisationPartagee = await inserer('organisations', { nom: 'RLS-Ecriture organisation partagée', statut: 'active', actif: true });
    await inserer('organisation_membres', { organisation_id: organisationPartagee, user_id: o.B.praticien, role: 'intervenant', actif: true });
    const pOrg = await inserer('participants', { praticien_id: o.A.praticien, prenom: 'E2E', nom: 'RLS-Ecriture organisation', code_acces: `RLG${Math.floor(Math.random() * 1e7)}`, rgpd, organisation_id: organisationPartagee });
    const kOrg = await inserer('contrats', { praticien_id: o.A.praticien, participant_id: pOrg, date_debut: '2099-01-01', date_fin: '2099-12-31' });
    const seOrg = await inserer('seances', { praticien_id: o.A.praticien, participant_id: pOrg, contrat_id: kOrg, date: '2099-01-20', heure_debut: '10:00', heure_fin: '11:00', type: 'seance', statut: 'planifiee' });
    objetsOrganisation = { ...o.A, participant: pOrg, contrat: kOrg, seance: seOrg };
  }, 120_000);

  afterAll(async () => {
    if (!admin) return;
    // À l'envers de la création, par identifiant précis (les cascades font le reste).
    for (const [table, id] of [...aSupprimer].reverse()) await admin.from(table).delete().eq('id', id);
    for (const p of ['A', 'B'] as const) {
      if (o[p]?.praticien) {
        await admin.from('praticiens').delete().eq('id', o[p].praticien);
        await admin.auth.admin.deleteUser(o[p].praticien);
      }
    }
  }, 120_000);

  async function relire(table: string, id: string): Promise<Ligne | null> {
    const { data } = await admin.from(table).select('*').eq('id', id).maybeSingle();
    return (data as Ligne | null) ?? null;
  }
  async function supprimer(table: string, id: string) {
    await admin.from(table).delete().eq('id', id);
  }

  // ── Les cas ────────────────────────────────────────────────────────────
  // `ligne(proprio, cible)` : une ligne appartenant à `proprio` dont la clé
  // testée pointe vers l'objet de `cible`. Les autres clés pointent toujours
  // vers les objets du propriétaire, pour ne tester qu'une clé à la fois.
  interface Cas {
    table: string;
    colonne: string;
    famille: 'beneficiaire' | 'structure' | 'faible';
    ecrivain: (p: Proprio) => SupabaseClient;
    ligne: (proprio: Objets, cible: Objets) => Ligne;
    /** Valeur de la clé pour la cible (ce que B essaie d'y mettre). */
    valeur: (cible: Objets) => string;
  }
  const parPraticien = (p: Proprio) => client[p]!;

  const CAS: Cas[] = [
    // ── Bénéficiaire non vérifié ───────────────────────────────────────
    { table: 'bilans', colonne: 'participant_id', famille: 'beneficiaire', ecrivain: parPraticien,
      ligne: (p, c) => ({ praticien_id: p.praticien, participant_id: c.participant, date: '2099-02-01', type: 'initial' }), valeur: c => c.participant },
    { table: 'contrats', colonne: 'participant_id', famille: 'beneficiaire', ecrivain: parPraticien,
      ligne: (p, c) => ({ praticien_id: p.praticien, participant_id: c.participant, date_debut: '2099-02-01', date_fin: '2099-03-01' }), valeur: c => c.participant },
    { table: 'seances', colonne: 'participant_id', famille: 'beneficiaire', ecrivain: parPraticien,
      ligne: (p, c) => ({ praticien_id: p.praticien, participant_id: c.participant, date: '2099-02-02', heure_debut: '10:00', heure_fin: '11:00', type: 'seance', statut: 'planifiee' }), valeur: c => c.participant },
    { table: 'programmes', colonne: 'participant_id', famille: 'beneficiaire', ecrivain: parPraticien,
      ligne: (p, c) => ({ praticien_id: p.praticien, participant_id: c.participant, date_debut: '2099-02-01', titre: 'RLS-Ecriture' }), valeur: c => c.participant },
    { table: 'notes_seances', colonne: 'participant_id', famille: 'beneficiaire', ecrivain: parPraticien,
      ligne: (p, c) => ({ praticien_id: p.praticien, participant_id: c.participant, date: '2099-02-01', note: 'RLS-Ecriture' }), valeur: c => c.participant },
    { table: 'comptes_rendus_seances', colonne: 'participant_id', famille: 'beneficiaire', ecrivain: parPraticien,
      ligne: (p, c) => ({ praticien_id: p.praticien, participant_id: c.participant, date_seance: '2099-02-01', observations: 'RLS-Ecriture' }), valeur: c => c.participant },
    { table: 'bilans_brouillons', colonne: 'participant_id', famille: 'beneficiaire', ecrivain: parPraticien,
      ligne: (p, c) => ({ praticien_id: p.praticien, participant_id: c.participant }), valeur: c => c.participant },
    { table: 'factures_suivi', colonne: 'participant_id', famille: 'beneficiaire', ecrivain: parPraticien,
      ligne: (p, c) => ({ praticien_id: p.praticien, participant_id: c.participant }), valeur: c => c.participant },
    { table: 'assistant_logs', colonne: 'patient_id', famille: 'beneficiaire', ecrivain: parPraticien,
      ligne: (p, c) => ({ praticien_id: p.praticien, patient_id: c.participant, question: 'RLS-Ecriture', reponse: 'RLS-Ecriture' }), valeur: c => c.participant },
    { table: 'seances', colonne: 'contrat_id', famille: 'beneficiaire', ecrivain: parPraticien,
      ligne: (p, c) => ({ praticien_id: p.praticien, participant_id: p.participant, contrat_id: c.contrat, date: '2099-02-03', heure_debut: '10:00', heure_fin: '11:00', type: 'seance', statut: 'planifiee' }), valeur: c => c.contrat },
    { table: 'notes_seances', colonne: 'seance_id', famille: 'beneficiaire', ecrivain: parPraticien,
      ligne: (p, c) => ({ praticien_id: p.praticien, participant_id: p.participant, seance_id: c.seance, date: '2099-02-01', note: 'RLS-Ecriture' }), valeur: c => c.seance },

    // ── Structure d'un autre praticien ─────────────────────────────────
    { table: 'participants', colonne: 'structure_id', famille: 'structure', ecrivain: parPraticien,
      ligne: (p, c) => ({ praticien_id: p.praticien, prenom: 'E2E', nom: 'RLS-Ecriture structure', code_acces: `RLS${Math.floor(Math.random() * 1e7)}`, rgpd, structure_id: c.structure }), valeur: c => c.structure },
    { table: 'documents_partages', colonne: 'structure_id', famille: 'structure', ecrivain: parPraticien,
      ligne: (p, c) => ({ participant_id: p.participant, structure_id: c.structure, type_document: 'compte_rendu', contenu: 'RLS-Ecriture', date_document: '2099-02-01' }), valeur: c => c.structure },
    { table: 'cours_collectifs', colonne: 'structure_id', famille: 'structure', ecrivain: parPraticien,
      ligne: (p, c) => ({ praticien_id: p.praticien, titre: 'RLS-Ecriture', date: '2099-02-04', heure_debut: '10:00', duree_minutes: 45, mode_facturation: 'structure', structure_id: c.structure }), valeur: c => c.structure },
    { table: 'templates_structure', colonne: 'structure_id', famille: 'structure', ecrivain: parPraticien,
      ligne: (p, c) => ({ praticien_id: p.praticien, nom: 'RLS-Ecriture', contenu_texte: 'RLS-Ecriture', structure_id: c.structure }), valeur: c => c.structure },
    { table: 'factures_suivi', colonne: 'structure_id', famille: 'structure', ecrivain: parPraticien,
      ligne: (p, c) => ({ praticien_id: p.praticien, structure_id: c.structure }), valeur: c => c.structure },

    // ── Portée plus faible ─────────────────────────────────────────────
    { table: 'dossier_exercice_membres', colonne: 'dossier_id', famille: 'faible', ecrivain: parPraticien,
      ligne: (p, c) => ({ praticien_id: p.praticien, dossier_id: c.dossier, exercice_ref: nonce(), type_exercice: 'base' }), valeur: c => c.dossier },
    { table: 'exercices_personnalises', colonne: 'dossier_id', famille: 'faible', ecrivain: parPraticien,
      ligne: (p, c) => ({ praticien_id: p.praticien, dossier_id: c.dossier, nom: 'RLS-Ecriture', categorie: 'equilibre', description: 'RLS-Ecriture', niveaux: {}, duree_estimee_minutes: 5 }), valeur: c => c.dossier },
    { table: 'cours_collectifs', colonne: 'programme_commun_id', famille: 'faible', ecrivain: parPraticien,
      ligne: (p, c) => ({ praticien_id: p.praticien, titre: 'RLS-Ecriture', date: '2099-02-05', heure_debut: '10:00', duree_minutes: 45, mode_facturation: 'individuel', programme_commun_id: c.modele }), valeur: c => c.modele },
    { table: 'participations_cours_collectifs', colonne: 'programme_individuel_id', famille: 'faible', ecrivain: parPraticien,
      ligne: (p, c) => ({ cours_id: p.cours, participant_id: p.participant, programme_individuel_id: c.modele }), valeur: c => c.modele },
    { table: 'seances_patient', colonne: 'programme_id', famille: 'faible', ecrivain: parPraticien,
      ligne: (p, c) => ({ participant_id: p.participant, programme_id: c.programme, date_seance: '2099-02-06', statut: 'terminee' }), valeur: c => c.programme },
    { table: 'seances_patient', colonne: 'seance_id', famille: 'faible', ecrivain: parPraticien,
      ligne: (p, c) => ({ participant_id: p.participant, seance_id: c.programmeSeance, date_seance: '2099-02-07', statut: 'terminee' }), valeur: c => c.programmeSeance },
    { table: 'exercices_realises', colonne: 'exercice_id', famille: 'faible', ecrivain: parPraticien,
      ligne: (p, c) => ({ seance_patient_id: p.seancePatient, exercice_id: c.programmeExercice, realise: true }), valeur: c => c.programmeExercice },
  ];

  /** Tables dont on a vérifié l'écriture croisée ici (pour le rapport et la PR). */
  it('chaque cas cible une table et une colonne distinctes', () => {
    const cles = CAS.map(c => `${c.table}.${c.colonne}`);
    expect(new Set(cles).size).toBe(cles.length);
  });

  for (const c of CAS) {
    const cle = `${c.table}.${c.colonne}`;

    const fInsertion = FUITES_CONSTATEES[`${cle}:insertion`];
    (fInsertion ? it.fails : it)(`${cle} — B n'insère pas de ligne pointant vers l'objet de A${fInsertion ? ` — FUITE CONSTATÉE : ${fInsertion}` : ''}`, async () => {
      const id = randomUUID();
      await c.ecrivain('B').from(c.table).insert({ ...c.ligne(o.B, o.A), id });
      const lu = await relire(c.table, id);
      if (lu) await supprimer(c.table, id);
      expect(lu, `B a inséré dans ${c.table} une ligne dont ${c.colonne} pointe vers un objet de A`).toBeNull();
    });

    const fRepointage = FUITES_CONSTATEES[`${cle}:repointage`];
    (fRepointage ? it.fails : it)(`${cle} — B ne repointe pas sa ligne vers l'objet de A${fRepointage ? ` — FUITE CONSTATÉE : ${fRepointage}` : ''}`, async () => {
      const id = await inserer(c.table, c.ligne(o.B, o.B));
      await c.ecrivain('B').from(c.table).update({ [c.colonne]: c.valeur(o.A) }).eq('id', id);
      const lu = await relire(c.table, id);
      expect(lu?.[c.colonne], `B a repointé ${c.colonne} de sa ligne de ${c.table} vers un objet de A`).toBe(c.valeur(o.B));
    });

    it(`${cle} — A écrit normalement sur ses propres objets`, async () => {
      const id = randomUUID();
      const { error } = await c.ecrivain('A').from(c.table).insert({ ...c.ligne(o.A, o.A), id });
      const lu = await relire(c.table, id);
      if (lu) await supprimer(c.table, id);
      expect(error?.message ?? null, `A n'a pas pu écrire dans ${c.table}`).toBeNull();
      expect(lu, `ligne légitime de A absente de ${c.table}`).not.toBeNull();
    });
  }

  // Cas légitimes à préserver par les correctifs (famille bénéficiaire).
  for (const c of CAS.filter(x => x.famille === 'beneficiaire')) {
    const cle = `${c.table}.${c.colonne}`;
    it(`${cle} — A écrit sur son bénéficiaire ARCHIVÉ`, async () => {
      const id = randomUUID();
      const objets = { ...o.A, participant: beneficiaireArchiveA };
      const { error } = await c.ecrivain('A').from(c.table).insert({ ...c.ligne(objets, objets), id });
      const lu = await relire(c.table, id);
      if (lu) await supprimer(c.table, id);
      expect(error?.message ?? null, `écriture refusée sur un bénéficiaire archivé dans ${c.table}`).toBeNull();
      expect(lu).not.toBeNull();
    });
    it(`${cle} — B, membre de l'organisation, écrit sur un bénéficiaire de l'organisation`, async () => {
      const id = randomUUID();
      // Ligne au nom de B ; bénéficiaire, contrat et séance de l'organisation.
      const proprio = { ...objetsOrganisation, praticien: o.B.praticien };
      const { error } = await c.ecrivain('B').from(c.table).insert({ ...c.ligne(proprio, objetsOrganisation), id });
      const lu = await relire(c.table, id);
      if (lu) await supprimer(c.table, id);
      expect(error?.message ?? null, `écriture de membre d'organisation refusée dans ${c.table}`).toBeNull();
      expect(lu).not.toBeNull();
    });
  }

  // participants.organisation_id : B rattache SON bénéficiaire à une
  // organisation dont il n'est pas membre — ses données deviendraient
  // accessibles aux membres de cette organisation (acces_participant).
  const fOrg = FUITES_CONSTATEES['participants.organisation_id:repointage'];
  (fOrg ? it.fails : it)(`participants.organisation_id — B ne rattache pas son bénéficiaire à l'organisation de A${fOrg ? ` — FUITE CONSTATÉE : ${fOrg}` : ''}`, async () => {
    const id = await inserer('participants', { praticien_id: o.B.praticien, prenom: 'E2E', nom: 'RLS-Ecriture orga', code_acces: `RLO${Math.floor(Math.random() * 1e7)}`, rgpd });
    await client.B!.from('participants').update({ organisation_id: organisationA }).eq('id', id);
    expect((await relire('participants', id))?.organisation_id ?? null, 'B a rattaché son bénéficiaire à l\'organisation de A').toBeNull();
  });

  // De bout en bout : ce que voit la structure de A dans son portail
  // (api/structure/data.ts, appelé directement, en service_role comme en
  // production) après la tentative de B.
  const fPortail = FUITES_CONSTATEES['portail-structure:beneficiaire-de-B'];
  (fPortail ? it.fails : it)(`portail de la structure de A — n'affiche ni le bénéficiaire ni le document de B${fPortail ? ` — FUITE CONSTATÉE : ${fPortail}` : ''}`, async () => {
    const pB = await inserer('participants', { praticien_id: o.B.praticien, prenom: 'E2E', nom: 'RLS-Ecriture portail', code_acces: `RLP${Math.floor(Math.random() * 1e7)}`, rgpd });
    await client.B!.from('participants').update({ structure_id: o.A.structure }).eq('id', pB);
    const docId = randomUUID();
    await client.B!.from('documents_partages').insert({ id: docId, participant_id: pB, structure_id: o.A.structure, type_document: 'compte_rendu', contenu: 'RLS-Ecriture', date_document: '2099-02-01' });
    try {
      // Le portail lit VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY : ceux de
      // la base de test (staging ou locale), jamais ceux de la production.
      process.env.VITE_SUPABASE_URL = URL;
      process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
      const { default: handler } = await import('../../api/structure/data.js');
      const { data: s } = await admin.from('structures').select('token_acces').eq('id', o.A.structure).single();
      let corps: any = null;
      let statut = 0;
      const res = { status(n: number) { statut = n; return this; }, json(b: unknown) { corps = b; return this; }, setHeader() { return this; } };
      await handler({ method: 'GET', headers: { 'x-structure-token': s!.token_acces, 'x-forwarded-for': '203.0.113.7' } }, res);
      expect(statut).toBe(200);
      const ids = (corps.participants as { id: string }[]).map(p => p.id);
      const docs = (corps.documents as { id: string }[]).map(d => d.id);
      expect(ids, 'le portail de la structure de A affiche un bénéficiaire de B').not.toContain(pB);
      expect(docs, 'le portail de la structure de A affiche un document de B').not.toContain(docId);
    } finally {
      await supprimer('documents_partages', docId);
    }
  });
});
