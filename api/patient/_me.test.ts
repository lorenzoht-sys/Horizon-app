// Filtrage serveur du contrôle de partage bénéficiaire — voir
// supabase/migrations/20260713_visibilite_beneficiaire.sql et
// src/lib/formulationBienveillante.ts. Ce test couvre le point critique :
// un résultat marqué non partagé ne doit atteindre le JSON de réponse sous
// AUCUNE forme, y compris via le chemin de repli
// bilan_initial_data.formulaireFlat.data (lu par getTestsAutonomie() côté
// frontend quand participant.anamnese est vide).
import { describe, it, expect } from 'vitest';
import { filtrerBilan, normaliserPrenomPraticien, retirerColonnes, COLONNES_PARTICIPANT_INTERNES, COLONNES_BILAN_INTERNES } from './me.js';

function bilanBrut(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'b1',
    equilibre_droite: 12.3,
    equilibre_gauche: 11.8,
    chair_stand_30: 9,
    hand_grip_droite: 22,
    hand_grip_gauche: 20,
    tug_3m: 8.5,
    tm6_distance_metres: 350,
    tm6_borg_rpe: 11,
    sedentarite_score: 14,
    sedentarite_profil: 'inactif',
    sedentarite_reponses: { a_sedentarite: 1 },
    fatigue_score: 40,
    fatigue_profil: 'fatigue_probable',
    fatigue_reponses: [1, 2, 3],
    bilan_initial_data: {
      formulaireFlat: {
        data: {
          sedentariteScore: 14,
          sedentariteProfil: 'inactif',
          sedentariteReponses: { a_sedentarite: 1 },
          fatigueScore: 40,
          fatigueProfil: 'fatigue_probable',
          fatigueReponses: [1, 2, 3],
        },
      },
    },
    visible_beneficiaire: {},
    ...overrides,
  };
}

describe('filtrerBilan — résultats physiques', () => {
  it('cache tout par défaut (visible_beneficiaire vide)', () => {
    const r = filtrerBilan(bilanBrut(), false, false);
    expect(r.equilibre_droite).toBeNull();
    expect(r.equilibre_gauche).toBeNull();
    expect(r.chair_stand_30).toBeNull();
    expect(r.hand_grip_droite).toBeNull();
    expect(r.tug_3m).toBeNull();
    expect(r.tm6_distance_metres).toBeNull();
    expect(r.tm6_borg_rpe).toBeNull();
  });

  it('ne laisse passer que les résultats explicitement marqués true', () => {
    const r = filtrerBilan(
      bilanBrut({ visible_beneficiaire: { equilibre: true, mobilite: true } }),
      false, false,
    );
    expect(r.equilibre_droite).toBe(12.3);
    expect(r.equilibre_gauche).toBe(11.8);
    expect(r.tug_3m).toBe(8.5);
    // Non marqués → toujours cachés
    expect(r.chair_stand_30).toBeNull();
    expect(r.hand_grip_droite).toBeNull();
    expect(r.tm6_distance_metres).toBeNull();
  });

  it('un flag à false explicite reste caché (pas seulement absent)', () => {
    const r = filtrerBilan(bilanBrut({ visible_beneficiaire: { force: false } }), false, false);
    expect(r.chair_stand_30).toBeNull();
  });
});

describe('filtrerBilan — sédentarité / fatigue (colonnes ET repli formulaireFlat)', () => {
  it('retire sédentarité des deux emplacements quand non partagée', () => {
    const r = filtrerBilan(bilanBrut(), false, true);
    expect(r.sedentarite_score).toBeNull();
    expect(r.sedentarite_profil).toBeNull();
    expect(r.sedentarite_reponses).toBeNull();
    expect(r.bilan_initial_data.formulaireFlat.data.sedentariteScore).toBeUndefined();
    expect(r.bilan_initial_data.formulaireFlat.data.sedentariteProfil).toBeUndefined();
    expect(r.bilan_initial_data.formulaireFlat.data.sedentariteReponses).toBeUndefined();
  });

  it('retire fatigue des deux emplacements quand non partagée', () => {
    const r = filtrerBilan(bilanBrut(), true, false);
    expect(r.fatigue_score).toBeNull();
    expect(r.fatigue_profil).toBeNull();
    expect(r.bilan_initial_data.formulaireFlat.data.fatigueScore).toBeUndefined();
  });

  it('laisse passer sédentarité ET fatigue quand les deux sont partagées', () => {
    const r = filtrerBilan(bilanBrut(), true, true);
    expect(r.sedentarite_profil).toBe('inactif');
    expect(r.fatigue_profil).toBe('fatigue_probable');
    expect(r.bilan_initial_data.formulaireFlat.data.sedentariteProfil).toBe('inactif');
  });

  it('ne plante pas si bilan_initial_data est absent', () => {
    const r = filtrerBilan(bilanBrut({ bilan_initial_data: null }), false, false);
    expect(r.sedentarite_score).toBeNull();
  });
});

describe('normaliserPrenomPraticien', () => {
  it('renvoie le prénom nettoyé', () => {
    expect(normaliserPrenomPraticien(' Pierre ')).toBe('Pierre');
  });
  it('renvoie null pour une valeur vide ou non textuelle', () => {
    expect(normaliserPrenomPraticien('')).toBeNull();
    expect(normaliserPrenomPraticien('  ')).toBeNull();
    expect(normaliserPrenomPraticien(null)).toBeNull();
    expect(normaliserPrenomPraticien(42)).toBeNull();
  });
});

// ── Colonnes internes (2026-11-12) ──────────────────────────────────────────

describe('colonnes internes jamais envoyées au bénéficiaire', () => {
  it('retire du participant les coordonnées bancaires, le consentement et les champs de travail du praticien', () => {
    const ligne: Record<string, unknown> = {
      id: 'p1', prenom: 'Test', nom: 'E2E', anamnese: { autonomie: {} }, profil_handicap: 'senior',
      visibilite_beneficiaire: { bilans: true }, message_beneficiaire: 'Bravo',
      iban: 'FR76…', bic: 'XXXXFRPP', rgpd: { consentementObtenu: true }, droit_image: true,
      tags: ['à surveiller'], contexte_clinic: 'note interne', tests_actifs: ['tug'],
      code_portail: '1234A', personne_contact: 'voisine', coordonnees_lat: 48.1, coordonnees_lng: 2.3,
      beneficiaire_sap: true,
    };
    const rendu = retirerColonnes(ligne, COLONNES_PARTICIPANT_INTERNES);
    for (const c of COLONNES_PARTICIPANT_INTERNES) expect(rendu, c).not.toHaveProperty(c);
    // Ce que les écrans et les PDF du bénéficiaire lisent reste intact.
    expect(rendu).toMatchObject({
      id: 'p1', prenom: 'Test', nom: 'E2E', profil_handicap: 'senior',
      visibilite_beneficiaire: { bilans: true }, message_beneficiaire: 'Bravo',
    });
    expect(rendu.anamnese).toEqual({ autonomie: {} });
  });

  it('filtrerBilan retire les scores cognitifs et les notes de travail, MÊME quand tout est partagé', () => {
    const bilan = bilanBrut({
      visible_beneficiaire: { equilibre: true, force: true, handGrip: true, mobilite: true, endurance: true },
      moca_score: 21, memoire_score_immediat: 3, memoire_score_differe: 2, memoire_dubois: { a: 1 },
      berg_data: { total: 40 }, adl_data: {}, iadl_data: {}, apley_data: {}, douleur_eva: 6,
      marche10m_habituel: 9.1, marche10m_max: 7.2,
      points_vigilance: 'chute récente', objectifs_suivants: 'x', notes_bilan: { a: 'b' }, profil_enrichi: {},
    });
    const rendu = filtrerBilan(bilan, true, true);
    for (const c of COLONNES_BILAN_INTERNES) expect(rendu, c).not.toHaveProperty(c);
    // Les résultats partagés, eux, passent toujours.
    expect(rendu.equilibre_droite).toBe(12.3);
    expect(rendu.tug_3m).toBe(8.5);
  });

  it('les deux listes ne retirent rien de ce que le chemin bénéficiaire lit', () => {
    // Garde-fou : ces colonnes sont lues par l'espace bénéficiaire ou ses PDF
    // (relevé du 2026-11-12). Les ajouter aux listes casserait un écran.
    const lues = [
      'prenom', 'nom', 'date_naissance', 'anamnese', 'traitements', 'antecedents_structures', 'profil_handicap',
      'visibilite_beneficiaire', 'message_beneficiaire', 'taille', 'poids', 'medecin_traitant', 'objectifs_patient',
      'message_client', 'interpretation_ia', 'notes_professionnelles', 'tinetti_data', 'souplesse_valeur',
      'bilan_initial_data', 'visible_beneficiaire', 'tm6_distance_metres', 'chair_stand_30', 'tug_3m',
    ];
    const retirees = new Set<string>([...COLONNES_PARTICIPANT_INTERNES, ...COLONNES_BILAN_INTERNES]);
    for (const c of lues) expect(retirees.has(c), c).toBe(false);
  });
});
