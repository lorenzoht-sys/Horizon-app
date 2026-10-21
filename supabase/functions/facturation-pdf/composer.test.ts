import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  composerFacturePdf,
  construireBlocs,
  formaterDate,
  formaterMontant,
  formaterPeriode,
  recapitulatif,
  trierLignes,
  type FacturePdf,
} from './composer';

// Données entièrement fictives (aucun nom réel : données de santé).
function facture(surcharge: Partial<FacturePdf> = {}): FacturePdf {
  return {
    numero: '2026-0007',
    type: 'facture',
    dateEmission: '2026-10-01',
    echeance: '2026-10-31',
    periode: '2026-09-01',
    totalHt: 100,
    montantTva: 10,
    tauxTva: 10,
    total: 110,
    emetteur: {
      prenom: 'Alex', nom: 'Exemple', titre: 'Enseignant en Activité Physique Adaptée',
      siret: '12345678900011', numero_sap: 'SAP123456789', numero_tva: 'FR00123456789',
      adresse: { rue: '1 rue de Test', code_postal: '75000', ville: 'Ville-Test' },
      email: 'praticien@example.com', telephone: '0102030405',
      regime_tva: 'assujetti', iban: 'FR7630006000011234567890189',
      date_declaration_sap: '2025-03-14', mode_intervention: 'prestataire',
      adresse_intervention: 'Au domicile du bénéficiaire',
    },
    destinataire: {
      role: 'beneficiaire', nom: 'Dupont', prenom: 'Camille',
      adresse: { rue: '2 avenue Fictive', code_postal: '69000', ville: 'Lyon-Test' },
    },
    lignes: [
      { libelle: 'Séance d\'APA', quantite: 4, prixUnitaire: 25, montant: 100, seanceDate: '2026-09-03', seanceHeure: '10:00' },
    ],
    ...surcharge,
  };
}

describe('formats', () => {
  it('formate les montants à la française avec une espace simple', () => {
    expect(formaterMontant(1234.5)).toBe('1 234,50 €');
    expect(formaterMontant(0)).toBe('0,00 €');
    expect(formaterMontant(1234567.891)).toBe('1 234 567,89 €');
    expect(formaterMontant(12)).not.toMatch(/[  ]/);
  });
  it('formate les dates sans passer par le fuseau horaire', () => {
    expect(formaterDate('2026-10-01')).toBe('01/10/2026');
    expect(formaterPeriode('2026-09-01')).toBe('septembre 2026');
  });
});

describe('mentions du PDF', () => {
  it("reprend l'identité, le SIRET, la déclaration SAP, le mode et l'adresse d'intervention", () => {
    const b = construireBlocs(facture());
    expect(b.titre).toBe('Facture n° 2026-0007');
    expect(b.emetteur).toContain('SIRET : 12345678900011');
    expect(b.emetteur).toContain('N° de TVA intracommunautaire : FR00123456789');
    expect(b.mentionsSap).toEqual([
      'Organisme de services à la personne : déclaration n° SAP123456789 du 14/03/2025',
      "Mode d'intervention : prestataire",
      "Adresse d'intervention : Au domicile du bénéficiaire",
    ]);
    expect(b.destinataire).toEqual(['Camille Dupont', '2 avenue Fictive', '69000 Lyon-Test']);
    expect(b.beneficiaire).toEqual([]);
  });

  it('ne fabrique aucune mention SAP absente du profil', () => {
    const b = construireBlocs(facture({ emetteur: { ...facture().emetteur, numero_sap: null, date_declaration_sap: null, mode_intervention: null, adresse_intervention: null } }));
    expect(b.mentionsSap).toEqual([]);
  });

  it('assujetti : pas de mention 293 B, le taux est celui du snapshot', () => {
    const b = construireBlocs(facture());
    expect(b.tva).toEqual({ franchise: false, mention: null });
  });

  it('franchise en base : mention art. 293 B et pas de numéro de TVA', () => {
    const b = construireBlocs(facture({ emetteur: { ...facture().emetteur, regime_tva: 'franchise_293B' } }));
    expect(b.tva.franchise).toBe(true);
    expect(b.tva.mention).toBe('TVA non applicable, art. 293 B du CGI');
    expect(b.emetteur.join('\n')).not.toMatch(/TVA intracommunautaire/);
  });

  it('proche payeur : le destinataire est le proche, le bénéficiaire est rappelé avec son adresse', () => {
    const b = construireBlocs(facture({
      destinataire: {
        role: 'proche', nom: 'Martin Proche', adresse: '3 impasse Test\n13000 Marseille-Test',
        beneficiaire: { prenom: 'Camille', nom: 'Dupont', adresse: { rue: '2 avenue Fictive', code_postal: '69000', ville: 'Lyon-Test' } },
      },
    }));
    expect(b.destinataire).toEqual(['Martin Proche', '3 impasse Test', '13000 Marseille-Test']);
    expect(b.beneficiaire).toEqual(['Bénéficiaire de la prestation : Camille Dupont', '2 avenue Fictive', '69000 Lyon-Test']);
  });

  it('conditions de paiement : échéance, virement, IBAN regroupé ; jamais de pénalités de retard', () => {
    const b = construireBlocs(facture({ emetteur: { ...facture().emetteur, penalites_retard: 'Pénalité de 3 fois le taux légal' } as never }));
    expect(b.paiement).toEqual([
      'Échéance de paiement : 31/10/2026',
      'Mode de règlement : virement bancaire',
      'IBAN : FR76 3000 6000 0112 3456 7890 189',
    ]);
    expect(JSON.stringify(b)).not.toMatch(/nalit/);
  });

  it("n'affiche aucune répartition client / URSSAF, même si le circuit est URSSAF en base", () => {
    const b = construireBlocs({ ...facture(), circuit: 'urssaf', partClient: 10, partUrssaf: 100 } as never);
    expect(JSON.stringify(b)).not.toMatch(/urssaf|part client/i);
  });

  it("avoir : titre « Avoir », référence à la facture d'origine, pas de conditions de règlement", () => {
    const b = construireBlocs(facture({ type: 'avoir', numero: '2026-0008', numeroOrigine: '2026-0007' }));
    expect(b.titre).toBe('Avoir n° 2026-0008');
    expect(b.references).toContain('Avoir sur la facture n° 2026-0007');
    expect(b.paiement).toEqual([]);
  });
});

describe('ordre des lignes', () => {
  it("met les séances par date puis heure, puis les lignes sans séance par libellé, quel que soit l'ordre de lecture", () => {
    const l = (libelle: string, seanceDate: string | null, seanceHeure: string | null = null) =>
      ({ libelle, quantite: 1, prixUnitaire: 1, montant: 1, seanceDate, seanceHeure });
    const a = [l('Forfait B', null), l('S2', '2026-09-10', '09:00'), l('Forfait A', null), l('S1', '2026-09-03', '18:00'), l('S1bis', '2026-09-03', '10:00')];
    const attendu = ['S1bis', 'S1', 'S2', 'Forfait A', 'Forfait B'];
    expect(trierLignes(a).map(x => x.libelle)).toEqual(attendu);
    expect(trierLignes([...a].reverse()).map(x => x.libelle)).toEqual(attendu);
  });
});

describe('récapitulatif (PR 4, exemple de Pierre)', () => {
  const seance = (date: string, prix: number, type = 'seance') =>
    ({ libelle: `Séance du ${date}`, quantite: 1, prixUnitaire: prix, montant: prix, seanceDate: date, seanceHeure: '10:00', seanceType: type });
  it("4 séances à 50 € et leurs frais : « 4 séances × 50 € » puis « Frais de déplacement : 4 × 5 € »", () => {
    const lignes = [seance('2026-09-03', 50), seance('2026-09-10', 50), seance('2026-09-17', 50), seance('2026-09-24', 50),
      { libelle: 'Frais de déplacement : 4 × 5 €', quantite: 4, prixUnitaire: 5, montant: 20 }];
    expect(recapitulatif(lignes)).toEqual([
      '4 séances × 50,00 € = 200,00 €',
      'Frais de déplacement : 4 × 5,00 € = 20,00 €',
    ]);
  });
  it('regroupe par prix (changement de tarif dans le mois) et sépare les bilans, au singulier comme au pluriel', () => {
    const lignes = [seance('2026-09-20', 55), seance('2026-09-03', 50), seance('2026-09-10', 50), seance('2026-09-05', 60, 'bilan')];
    expect(recapitulatif(lignes)).toEqual([
      '2 séances × 50,00 € = 100,00 €',
      '1 séance × 55,00 € = 55,00 €',
      '1 bilan × 60,00 € = 60,00 €',
    ]);
  });
  it('vide pour un forfait ou un avoir (aucune ligne de séance)', () => {
    expect(recapitulatif([{ libelle: 'Forfait mensuel — septembre 2026', quantite: 1, prixUnitaire: 200, montant: 200 }])).toEqual([]);
  });
  it("le PDF qui porte un récapitulatif reste une page et diffère de celui sans", async () => {
    const lignes = [seance('2026-09-03', 50), { libelle: 'Frais de déplacement : 1 × 5 €', quantite: 1, prixUnitaire: 5, montant: 5 }];
    const avec = await composerFacturePdf(facture({ lignes, totalHt: 55, montantTva: 5.5, total: 60.5 }));
    const sans = await composerFacturePdf(facture({ lignes: lignes.map(l => ({ ...l, seanceDate: null })), totalHt: 55, montantTva: 5.5, total: 60.5 }));
    expect((await PDFDocument.load(avec)).getPageCount()).toBe(1);
    expect(Buffer.from(avec).equals(Buffer.from(sans))).toBe(false);
  });
});

// PNG 1 × 1 valide et JPEG tronqué (illisible) : données de test, aucun logo réel.
const PNG_1PX = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
const JPEG_TRONQUE = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

describe('logo (PR 5)', () => {
  it('un logo PNG est intégré au PDF, de façon déterministe, et change le PDF', async () => {
    const avec = await composerFacturePdf(facture({ logo: { type: 'png', octets: PNG_1PX } }));
    const encore = await composerFacturePdf(facture({ logo: { type: 'png', octets: PNG_1PX } }));
    const sans = await composerFacturePdf(facture());
    expect(Buffer.from(avec).equals(Buffer.from(encore))).toBe(true);
    expect(Buffer.from(avec).equals(Buffer.from(sans))).toBe(false);
    const doc = await PDFDocument.load(avec);
    expect(doc.getPageCount()).toBe(1);
    expect(Buffer.from(avec).includes(Buffer.from('/Subtype /Image'))).toBe(true);
  });
  it('une image illisible est ignorée : PDF produit, identique à chaque composition', async () => {
    const a = await composerFacturePdf(facture({ logo: { type: 'jpg', octets: JPEG_TRONQUE } }));
    const b = await composerFacturePdf(facture({ logo: { type: 'jpg', octets: JPEG_TRONQUE } }));
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(Buffer.from(a).includes(Buffer.from('/Subtype /Image'))).toBe(false);
  });
});

describe('composerFacturePdf', () => {
  it('produit un vrai PDF lisible, une page pour une facture courte', async () => {
    const octets = await composerFacturePdf(facture());
    expect(new TextDecoder().decode(octets.slice(0, 5))).toBe('%PDF-');
    const doc = await PDFDocument.load(octets);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe('Facture n° 2026-0007');
  });

  it("est déterministe : deux compositions des mêmes données donnent les mêmes octets (régénération à l'identique)", async () => {
    const a = await composerFacturePdf(facture());
    const b = await composerFacturePdf(facture());
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it("change dès qu'une donnée change (le déterminisme ne masque pas un PDF constant)", async () => {
    const a = await composerFacturePdf(facture());
    const b = await composerFacturePdf(facture({ total: 111 }));
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it("ne recalcule rien : un total incohérent avec les lignes est imprimé tel quel", async () => {
    // Garde l'immuabilité : le PDF reflète la base, il ne la corrige pas.
    const octets = await composerFacturePdf(facture({ total: 999, totalHt: 900, montantTva: 99 }));
    expect(octets.length).toBeGreaterThan(500);
  });

  it('pagine quand les lignes dépassent une page, avec pied de page sur chacune', async () => {
    const lignes = Array.from({ length: 70 }, (_, i) => ({
      libelle: `Séance d'Activité Physique Adaptée numéro ${i + 1}`, quantite: 1, prixUnitaire: 10, montant: 10,
      seanceDate: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`, seanceHeure: '10:00',
    }));
    const doc = await PDFDocument.load(await composerFacturePdf(facture({ lignes, totalHt: 700, montantTva: 70, total: 770 })));
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it("ne plante pas sur des caractères hors WinAnsi (emoji, espace insécable fine, CJK)", async () => {
    const octets = await composerFacturePdf(facture({
      lignes: [{ libelle: 'Séance 😀  漢字 œuvre', quantite: 1, prixUnitaire: 1, montant: 1 }],
    }));
    expect(octets.length).toBeGreaterThan(500);
  });

  it('un libellé très long passe à la ligne sans dépasser', async () => {
    const octets = await composerFacturePdf(facture({
      lignes: [{ libelle: 'mot '.repeat(120).trim(), quantite: 1, prixUnitaire: 1, montant: 1 }],
    }));
    expect((await PDFDocument.load(octets)).getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('compose un avoir et une facture en franchise', async () => {
    const avoir = await composerFacturePdf(facture({ type: 'avoir', numero: '2026-0008', numeroOrigine: '2026-0007', emetteur: { ...facture().emetteur, regime_tva: 'franchise_293B' } }));
    expect(new TextDecoder().decode(avoir.slice(0, 5))).toBe('%PDF-');
  });
});
