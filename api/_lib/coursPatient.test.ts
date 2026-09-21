import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import {
  SELECT_COURS_PATIENT, COLONNES_PARTICIPATION_PATIENT, COLONNES_COURS_PATIENT,
  construireCoursPatient, LIMITE_COURS_PATIENT,
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
    ]) {
      expect(colonnes, `« ${interdite} » ne doit jamais quitter le praticien`).not.toContain(interdite);
    }
    expect(SELECT_COURS_PATIENT).not.toMatch(/\*/);
  });

  it('api/patient/me.ts lit ces tables avec la liste commune, sans select en clair', () => {
    const source = readFileSync(path.join(dossierApi, 'patient/me.ts'), 'utf-8');
    const appel = /from\('participations_cours_collectifs'\)\s*\.select\(([^)]*)\)/s.exec(source);
    expect(appel, 'lecture de participations_cours_collectifs introuvable dans me.ts').not.toBeNull();
    expect(appel![1].trim()).toBe('SELECT_COURS_PATIENT');
    // Et aucune lecture directe de cours_collectifs, qui contournerait la liste.
    expect(source).not.toMatch(/from\('cours_collectifs'\)/);
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
      'coursId', 'date', 'dureeMinutes', 'heureDebut', 'presence', 'ressentiBienetre', 'ressentiBorg', 'statut', 'titre',
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
