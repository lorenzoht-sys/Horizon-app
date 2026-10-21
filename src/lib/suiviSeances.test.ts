import { describe, expect, it } from 'vitest';
import { LIBELLES_MOTIF, dateCourte, lireLigneSuivi, regrouper } from './suiviSeances';

const brut = (surcharge: Record<string, unknown> = {}) => ({
  seance_id: 's1', date: '2026-09-03', heure_debut: '10:00', type: 'seance', participant_id: 'p1', contrat_id: 'c1',
  etat: 'facturee', motif: null, facture_id: 'f1', numero: '2026-0001', avant_debut_contrat: false, ...surcharge,
});

describe('suivi des séances', () => {
  it('lit une ligne de suivi_facturation_seances', () => {
    expect(lireLigneSuivi(brut())).toEqual({
      seanceId: 's1', date: '2026-09-03', heure: '10:00', type: 'seance', participantId: 'p1', contratId: 'c1',
      etat: 'facturee', motif: null, factureId: 'f1', numero: '2026-0001', avantDebutContrat: false,
    });
    expect(lireLigneSuivi(brut({ avant_debut_contrat: true })).avantDebutContrat).toBe(true);
    expect(lireLigneSuivi(brut({ avant_debut_contrat: null })).avantDebutContrat).toBe(false);
  });
  it('un état inconnu est traité comme « à corriger », un motif inconnu est ignoré', () => {
    const l = lireLigneSuivi(brut({ etat: 'bizarre', motif: 'inconnu', facture_id: null, numero: null }));
    expect(l.etat).toBe('a_facturer');
    expect(l.motif).toBeNull();
  });
  it('regroupe dans l\'ordre d\'affichage, à corriger d\'abord, chaque groupe par date et heure', () => {
    const lignes = [
      brut({ seance_id: 'a', date: '2026-09-10' }),
      brut({ seance_id: 'b', etat: 'a_facturer', motif: 'sans_tarif', date: '2026-09-20' }),
      brut({ seance_id: 'c', etat: 'a_facturer', motif: 'sans_contrat', date: '2026-09-05', heure_debut: '18:00' }),
      brut({ seance_id: 'd', etat: 'a_facturer', motif: 'sans_contrat', date: '2026-09-05', heure_debut: '09:00' }),
      brut({ seance_id: 'e', etat: 'non_facturable', motif: 'beneficiaire_sap' }),
    ].map(lireLigneSuivi);
    const g = regrouper(lignes);
    expect(g.map(x => x.etat)).toEqual(['a_facturer', 'en_preparation', 'facturee', 'non_facturable']);
    expect(g[0].lignes.map(l => l.seanceId)).toEqual(['d', 'c', 'b']);
    expect(g[1].lignes).toEqual([]);
    expect(g[2].lignes.map(l => l.seanceId)).toEqual(['a']);
  });
  it('chaque motif a une phrase, et la date courte se lit « JJ/MM à HH:MM »', () => {
    for (const m of Object.keys(LIBELLES_MOTIF)) expect(LIBELLES_MOTIF[m as keyof typeof LIBELLES_MOTIF].length).toBeGreaterThan(10);
    expect(dateCourte(lireLigneSuivi(brut({ heure_debut: '10:00:00' })))).toBe('03/09 à 10:00');
  });
});
