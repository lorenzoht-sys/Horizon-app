import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import {
  SELECT_COURS_PATIENT, SELECT_COURS_PATIENT_SANS_ANNONCE, COLONNES_PARTICIPATION_PATIENT, COLONNES_COURS_PATIENT,
  construireCoursPatient, lireLignesCoursPatient, LIMITE_COURS_PATIENT,
} from './coursPatient.js';

const dossierApi = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Ligne telle que la renvoie PostgREST pour la jointure participation -> cours.
function ligne(over: { cours?: Record<string, unknown>; participation?: Record<string, unknown> } = {}) {
  return {
    statut_presence: 'present',
    ressenti_borg: 6,
    ressenti_bienetre: 2,
    cours_collectifs: {
      id: 'c1', titre: 'Gym douce', date: '2026-09-10', heure_debut: '10:00', duree_minutes: 45, statut: 'realise',
      ...over.cours,
    },
    ...over.participation,
  };
}

describe('colonnes de cours collectifs envoyées au bénéficiaire', () => {
  const colonnes = `${COLONNES_PARTICIPATION_PATIENT}, ${COLONNES_COURS_PATIENT}`.split(',').map(c => c.trim());

  it('ne contiennent aucune donnée interne au praticien', () => {
    // `notes` : note libre du praticien (même défaut que seances.notes, PR #68).
    for (const interdite of [
      'notes', 'participant_id', 'programme_individuel_id', 'created_at',
      'praticien_id', 'structure_id', 'mode_facturation', 'programme_commun_id',
      'presence_annoncee_le',
    ]) {
      expect(colonnes, `« ${interdite} » ne doit jamais quitter le praticien`).not.toContain(interdite);
    }
    expect(SELECT_COURS_PATIENT).not.toMatch(/\*/);
  });

  it('api/patient/me.ts lit les cours par lireLignesCoursPatient, jamais directement', () => {
    const source = readFileSync(path.join(dossierApi, 'patient/me.ts'), 'utf-8');
    expect(source).toMatch(/lireLignesCoursPatient\(supabase, participantId/);
    // Aucune lecture directe de ces tables dans me.ts : elle contournerait la liste fermée.
    expect(source).not.toMatch(/from\('participations_cours_collectifs'\)/);
    expect(source).not.toMatch(/from\('cours_collectifs'\)/);
  });

  it("lireLignesCoursPatient utilise les listes fermées (avec et sans la colonne d'annonce), sans select en clair", () => {
    const source = readFileSync(path.join(dossierApi, '_lib/coursPatient.ts'), 'utf-8');
    expect(source).toMatch(/\.select\(colonnes\)/);
    expect(source).toMatch(/lire\(SELECT_COURS_PATIENT\)/);
    expect(source).toMatch(/lire\(SELECT_COURS_PATIENT_SANS_ANNONCE\)/);
    expect(source).not.toMatch(/\.select\('\*'\)/);
  });

  it("la liste de repli est la même, moins la colonne d'annonce", () => {
    expect(SELECT_COURS_PATIENT).toContain('presence_annoncee');
    expect(SELECT_COURS_PATIENT_SANS_ANNONCE).not.toContain('presence_annoncee');
    expect(SELECT_COURS_PATIENT.replace(', presence_annoncee', '')).toBe(SELECT_COURS_PATIENT_SANS_ANNONCE);
  });
});

describe('construireCoursPatient', () => {
  it("cours réalisé où le bénéficiaire était présent : présence, effort et bien-être", () => {
    const [c] = construireCoursPatient([ligne()]);
    expect(c).toMatchObject({ coursId: 'c1', titre: 'Gym douce', statut: 'realise', presence: 'present', ressentiBorg: 6, ressentiBienetre: 2 });
  });

  // statut_presence vaut « present » PAR DÉFAUT dès l'inscription : ce « présent »
  // n'est constaté par personne tant que le cours n'est pas réalisé.
  it.each(['planifie', 'annule'])("cours %s : AUCUNE présence, même avec le « present » par défaut de la base", (statut) => {
    const [c] = construireCoursPatient([ligne({ cours: { statut } })]);
    expect(c.presence).toBeNull();
    expect(c.ressentiBorg).toBeNull();
    expect(c.ressentiBienetre).toBeNull();
  });

  it('cours réalisé où le bénéficiaire était absent ou excusé : la présence, mais aucun ressenti résiduel', () => {
    for (const statut_presence of ['absent', 'excuse']) {
      const [c] = construireCoursPatient([ligne({ participation: { statut_presence, ressenti_borg: 8, ressenti_bienetre: 4 } })]);
      expect(c.presence).toBe(statut_presence);
      expect(c.ressentiBorg).toBeNull();
      expect(c.ressentiBienetre).toBeNull();
    }
  });

  it("aucune donnée interne ne sort, même si la ligne brute en porte (note du praticien, facturation, praticien)", () => {
    const sale = ligne({
      participation: { notes: 'NOTE-INTERNE-DU-PRATICIEN', participant_id: 'p1', programme_individuel_id: 'x' },
      cours: { praticien_id: 'pr-secret', structure_id: 's-secret', mode_facturation: 'structure', programme_commun_id: 'y' },
    });
    const dto = construireCoursPatient([sale]);
    const json = JSON.stringify(dto);
    for (const fuite of ['NOTE-INTERNE-DU-PRATICIEN', 'pr-secret', 's-secret', 'mode_facturation', 'structure', 'praticien', 'notes']) {
      expect(json, `« ${fuite} » a fuité dans la réponse`).not.toContain(fuite);
    }
    // Le DTO a EXACTEMENT ces clés : un champ ajouté par erreur ferait échouer ce test.
    expect(Object.keys(dto[0]).sort()).toEqual([
      'coursId', 'date', 'dureeMinutes', 'heureDebut', 'presence', 'presenceAnnoncee', 'ressentiBienetre', 'ressentiBorg', 'statut', 'titre',
    ]);
  });

  it('trie du plus récent au plus ancien (date puis heure)', () => {
    const l = (id: string, date: string, heure: string) => ligne({ cours: { id, date, heure_debut: heure } });
    const ids = construireCoursPatient([l('a', '2026-06-01', '10:00'), l('b', '2026-06-08', '09:00'), l('c', '2026-06-08', '14:00')]).map(c => c.coursId);
    expect(ids).toEqual(['c', 'b', 'a']);
  });

  it('ignore une participation dont le cours est introuvable, ou mal formé, au lieu de planter', () => {
    const lignes = [
      { statut_presence: 'present', cours_collectifs: null },
      { statut_presence: 'present' },
      null,
      'texte',
      ligne({ cours: { statut: 'inconnu' } }),
      ligne({ cours: { id: 42 } }),
    ] as unknown[];
    expect(construireCoursPatient(lignes)).toEqual([]);
  });

  it('tolère une relation renvoyée sous forme de tableau', () => {
    const l = { ...ligne(), cours_collectifs: [ligne().cours_collectifs] };
    expect(construireCoursPatient([l])).toHaveLength(1);
  });

  it(`plafonne à ${LIMITE_COURS_PATIENT} cours (les plus récents)`, () => {
    const beaucoup = Array.from({ length: LIMITE_COURS_PATIENT + 20 }, (_, i) =>
      ligne({ cours: { id: `c${i}`, date: `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}` } }));
    const res = construireCoursPatient(beaucoup);
    expect(res).toHaveLength(LIMITE_COURS_PATIENT);
    expect(res[0].date >= res[res.length - 1].date).toBe(true);
  });

  it('aucun cours : liste vide', () => {
    expect(construireCoursPatient([])).toEqual([]);
  });
});

describe('construireCoursPatient — présence annoncée', () => {
  it('la propre réponse du bénéficiaire, distincte de la présence constatée', () => {
    const [c] = construireCoursPatient([ligne({ cours: { statut: 'planifie' }, participation: { presence_annoncee: 'ne_vient_pas' } })]);
    expect(c.presenceAnnoncee).toBe('ne_vient_pas');
    expect(c.presence).toBeNull(); // rien de constaté : le cours n'a pas eu lieu
  });

  it('annoncé « vient » puis constaté absent : les deux coexistent', () => {
    const [c] = construireCoursPatient([ligne({ participation: { statut_presence: 'absent', presence_annoncee: 'vient' } })]);
    expect(c.presenceAnnoncee).toBe('vient');
    expect(c.presence).toBe('absent');
  });

  it('pas de réponse (null), colonne absente ou valeur inconnue : null — jamais « vient » par défaut', () => {
    expect(construireCoursPatient([ligne({ participation: { presence_annoncee: null } })])[0].presenceAnnoncee).toBeNull();
    expect(construireCoursPatient([ligne()])[0].presenceAnnoncee).toBeNull();
    expect(construireCoursPatient([ligne({ participation: { presence_annoncee: 'n_importe_quoi' } })])[0].presenceAnnoncee).toBeNull();
  });

  it("presence_annoncee_le ne sort jamais", () => {
    const json = JSON.stringify(construireCoursPatient([
      ligne({ participation: { presence_annoncee: 'vient', presence_annoncee_le: '2026-09-21T10:00:00Z' } }),
    ]));
    expect(json).not.toContain('presence_annoncee_le');
    expect(json).not.toContain('2026-09-21T10:00:00Z');
  });
});

describe('lireLignesCoursPatient — le bénéficiaire ne perd pas ses cours si la migration manque', () => {
  type Reponse = { data: unknown[] | null; error: { code?: string; message?: string } | null };

  // Faux client : enregistre les colonnes demandées et rejoue des réponses scriptées.
  function fauxClient(reponses: Reponse[]) {
    const demandes: string[] = [];
    const client = {
      from: () => ({
        select: (colonnes: string) => ({
          eq: () => ({
            limit: () => { demandes.push(colonnes); return Promise.resolve(reponses.shift()!); },
          }),
        }),
      }),
    };
    return { client, demandes };
  }

  it("colonne présente : une seule lecture, avec la colonne d'annonce", async () => {
    const { client, demandes } = fauxClient([{ data: [{ ok: 1 }], error: null }]);
    const r = await lireLignesCoursPatient(client, 'p1');
    expect(r.data).toEqual([{ ok: 1 }]);
    expect(demandes).toEqual([SELECT_COURS_PATIENT]);
  });

  it('colonne ABSENTE (42703, constaté) : relit sans elle, rend les cours, et le signale', async () => {
    const signale: string[] = [];
    const { client, demandes } = fauxClient([
      { data: null, error: { code: '42703', message: 'column participations_cours_collectifs.presence_annoncee does not exist' } },
      { data: [{ cours: 1 }, { cours: 2 }], error: null },
    ]);
    const r = await lireLignesCoursPatient(client, 'p1', e => { signale.push(e.message ?? ''); });
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(2); // les cours sont TOUJOURS là
    expect(demandes).toEqual([SELECT_COURS_PATIENT, SELECT_COURS_PATIENT_SANS_ANNONCE]);
    expect(signale).toHaveLength(1); // et l'incident est signalé, pas silencieux
    expect(signale[0]).toContain('presence_annoncee');
  });

  it('attend le signalement avant de relire (Sentry doit avoir le temps de partir en serverless)', async () => {
    const ordre: string[] = [];
    const { client } = fauxClient([{ data: null, error: { code: '42703' } }, { data: [], error: null }]);
    await lireLignesCoursPatient(client, 'p1', async () => { await Promise.resolve(); ordre.push('signalé'); });
    ordre.push('terminé');
    expect(ordre).toEqual(['signalé', 'terminé']);
  });

  it("toute AUTRE erreur n'est pas masquée par le repli : elle est renvoyée telle quelle", async () => {
    const { client, demandes } = fauxClient([{ data: null, error: { code: 'PGRST301', message: 'autre' } }]);
    const r = await lireLignesCoursPatient(client, 'p1');
    expect(r.error?.code).toBe('PGRST301');
    expect(demandes).toHaveLength(1);
  });
});
