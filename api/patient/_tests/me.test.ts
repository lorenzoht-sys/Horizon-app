// Filtrage serveur du contrôle de partage bénéficiaire — voir
// supabase/migrations/20260713_visibilite_beneficiaire.sql et
// src/lib/formulationBienveillante.ts. Ce test couvre le point critique :
// un résultat marqué non partagé ne doit atteindre le JSON de réponse sous
// AUCUNE forme, y compris via le chemin de repli
// bilan_initial_data.formulaireFlat.data (lu par getTestsAutonomie() côté
// frontend quand participant.anamnese est vide).
import { describe, it, expect } from 'vitest';
import { filtrerBilan } from '../me.js';

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
