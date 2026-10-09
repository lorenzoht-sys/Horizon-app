import { describe, it, expect } from 'vitest';
import {
  adresseBeneficiaireManquante,
  erreurSystemique,
  formaterDate,
  formaterEuro,
  libellePeriode,
  libelleTva,
  lireBrouillon,
  lireFactureValidee,
  nomFichierFacture,
  dateCivileParis,
  dateOuvertureValidation,
  estValidable,
  premierJourMoisSuivant,
  separerBrouillons,
  type FactureBrouillon,
  lireProfil,
  messageValidationLisible,
  profilFacturationManquant,
  trierLignes,
  validerEnSerie,
  type LigneBrouillon,
  type ProfilFacturation,
} from './facturesAValider';

const profilComplet: ProfilFacturation = {
  nom: 'Dupont', siret: '00000000000018', regimeTva: 'franchise_293B', tauxTva: null,
  adresseRue: '1 rue Test', adresseCodePostal: '00000', adresseVille: 'Villetest',
  facturationAdresseRue: null, facturationCodePostal: null, facturationVille: null,
};

describe('formats', () => {
  it('période, date et montant en français', () => {
    expect(libellePeriode('2026-09-01')).toBe('septembre 2026');
    expect(libellePeriode('2027-02-01')).toBe('février 2027');
    expect(formaterDate('2026-03-05')).toBe('05/03/2026');
    expect(formaterEuro(1234.5).replace(/\s/g, ' ')).toBe('1 234,50 €');
    expect(formaterEuro(0).replace(/\s/g, ' ')).toBe('0,00 €');
  });
});

describe('profilFacturationManquant : mêmes exigences que valider_facture', () => {
  it('un profil complet n\'a rien de manquant', () => {
    expect(profilFacturationManquant(profilComplet)).toEqual([]);
  });
  it('liste SIRET, nom, régime de TVA et adresse quand ils manquent (espaces seuls = vide)', () => {
    expect(profilFacturationManquant({ ...profilComplet, siret: null, regimeTva: null })).toEqual(['SIRET', 'régime de TVA']);
    expect(profilFacturationManquant({ ...profilComplet, siret: '   ', nom: '' })).toEqual(['SIRET', 'nom']);
    expect(profilFacturationManquant({ ...profilComplet, adresseVille: null })).toEqual(['adresse']);
  });
  it('l\'adresse de facturation prime sur celle du profil, partielle ou non', () => {
    const p = { ...profilComplet, adresseRue: null, adresseCodePostal: null, adresseVille: null };
    expect(profilFacturationManquant(p)).toEqual(['adresse']);
    expect(profilFacturationManquant({ ...p, facturationAdresseRue: '2 rue B', facturationCodePostal: '00001', facturationVille: 'Ailleurs' })).toEqual([]);
    // Même coalesce que le serveur, champ par champ, sur NULL seulement : un champ de facturation
    // NULL retombe sur le profil, un champ de facturation VIDE ('') le masque et fait refuser.
    expect(profilFacturationManquant({ ...profilComplet, facturationAdresseRue: '2 rue B' })).toEqual([]);
    expect(profilFacturationManquant({ ...profilComplet, facturationAdresseRue: '' })).toEqual(['adresse']);
    expect(profilFacturationManquant({ ...profilComplet, facturationVille: '  ' })).toEqual(['adresse']);
  });
  it('profil illisible', () => {
    expect(profilFacturationManquant(null)).toEqual(['profil introuvable']);
  });
});

describe('adresse du bénéficiaire', () => {
  const b = { prenom: 'A', nom: 'B', adresseRue: '10 rue', adresseCodePostal: '00000', adresseVille: 'V' };
  it('complète : rien', () => expect(adresseBeneficiaireManquante(b)).toEqual([]));
  it('nomme ce qui manque', () => {
    expect(adresseBeneficiaireManquante({ ...b, adresseRue: null })).toEqual(['rue']);
    expect(adresseBeneficiaireManquante({ ...b, adresseCodePostal: ' ', adresseVille: null })).toEqual(['code postal', 'ville']);
  });
});

describe('libelleTva', () => {
  it('affiche le taux d\'un assujetti, avec une virgule', () => {
    expect(libelleTva({ ...profilComplet, regimeTva: 'assujetti', tauxTva: 5.5 }, 4.95)).toBe('TVA (5,5 %)');
    expect(libelleTva({ ...profilComplet, regimeTva: 'assujetti', tauxTva: 10 }, 9)).toBe('TVA (10 %)');
  });
  it('indique « non applicable » en franchise ou sans TVA', () => {
    expect(libelleTva(profilComplet, 0)).toBe('TVA non applicable');
    expect(libelleTva(null, 0)).toBe('TVA non applicable');
    expect(libelleTva(null, 3)).toBe('TVA');
  });
});

describe('trierLignes', () => {
  const l = (id: string, date: string | null, heure: string | null, libelle = id): LigneBrouillon =>
    ({ id, libelle, quantite: 1, prixUnitaire: 10, montant: 10, seanceDate: date, seanceHeure: heure });
  it('séances par date puis heure, forfait (sans séance) à la fin', () => {
    const t = trierLignes([l('forfait', null, null), l('b', '2026-09-10', '14:00'), l('a', '2026-09-03', '09:00'), l('c', '2026-09-10', '09:30')]);
    expect(t.map(x => x.id)).toEqual(['a', 'c', 'b', 'forfait']);
  });
  it('ne modifie pas le tableau d\'origine', () => {
    const src = [l('b', '2026-09-10', '14:00'), l('a', '2026-09-03', '09:00')];
    trierLignes(src);
    expect(src.map(x => x.id)).toEqual(['b', 'a']);
  });
});

describe('lecture des réponses PostgREST', () => {
  it('lit un brouillon avec bénéficiaire et lignes triées (relations en objet ou en tableau)', () => {
    const f = lireBrouillon({
      id: 'f1', periode: '2026-09-01', circuit: 'classique', total_ht: '90.00', montant_tva: '9.00', total: '99.00',
      participants: { prenom: 'Alice', nom: 'Test', adresse_rue: '1 rue', adresse_code_postal: '00000', adresse_ville: 'V' },
      lignes_facture: [
        { id: 'l2', libelle: 'Séance du 10/09/2026', quantite: '1.00', prix_unitaire: '45.00', montant: '45.00', seances: { date: '2026-09-10', heure_debut: '10:00' } },
        { id: 'l1', libelle: 'Séance du 03/09/2026', quantite: '1.00', prix_unitaire: '45.00', montant: '45.00', seances: [{ date: '2026-09-03', heure_debut: '10:00' }] },
      ],
    });
    expect(f).toMatchObject({ id: 'f1', totalHt: 90, montantTva: 9, total: 99, circuit: 'classique', beneficiaire: { prenom: 'Alice', adresseVille: 'V' } });
    expect(f.lignes.map(x => x.id)).toEqual(['l1', 'l2']);
  });
  it('un circuit inconnu retombe sur « classique » ; un forfait n\'a pas de séance', () => {
    const f = lireBrouillon({ id: 'f', periode: '2026-09-01', circuit: '???', participants: null, lignes_facture: [{ id: 'l', libelle: 'Forfait mensuel', quantite: 1, prix_unitaire: 120, montant: 120, seances: null }] });
    expect(f.circuit).toBe('classique');
    expect(f.lignes[0]).toMatchObject({ seanceDate: null, montant: 120 });
    expect(f.beneficiaire).toMatchObject({ prenom: '', nom: '', adresseRue: null });
  });
  it('lit une facture validée et un profil', () => {
    expect(lireFactureValidee({ id: 'f', numero: '2026-0001', periode: '2026-09-01', date_emission: '2026-10-02', statut: 'validee', total: '99.00', participants: { prenom: 'A', nom: 'B' } }))
      .toEqual({ id: 'f', numero: '2026-0001', periode: '2026-09-01', dateEmission: '2026-10-02', statut: 'validee', total: 99, beneficiaire: { prenom: 'A', nom: 'B' }, pdfPath: null });
    expect(lireFactureValidee({ id: 'f', numero: '2026-0001', periode: '2026-09-01', date_emission: '2026-10-02', statut: 'validee', total: '99.00', pdf_path: 'p/2026-0001.pdf', participants: null }).pdfPath).toBe('p/2026-0001.pdf');
    expect(lireProfil({ nom: 'D', siret: 'S', regime_tva: 'assujetti', taux_tva: '10.00', adresse_rue: 'r' }))
      .toMatchObject({ nom: 'D', regimeTva: 'assujetti', tauxTva: 10, adresseRue: 'r', adresseVille: null });
    expect(lireProfil(null)).toBeNull();
  });
});

describe('messageValidationLisible', () => {
  it('traduit les noms techniques du profil incomplet', () => {
    expect(messageValidationLisible('Profil de facturation incomplet : siret, regime_tva')).toBe('Profil de facturation incomplet : SIRET, régime de TVA');
    expect(messageValidationLisible('Profil de facturation incomplet : adresse')).toBe('Profil de facturation incomplet : adresse');
  });
  it('laisse passer les autres messages tels quels', () => {
    expect(messageValidationLisible('Adresse du bénéficiaire incomplète (mention obligatoire) : rue')).toBe('Adresse du bénéficiaire incomplète (mention obligatoire) : rue');
    expect(messageValidationLisible('Accès refusé à cette facture')).toBe('Accès refusé à cette facture');
  });
});

describe('validerEnSerie', () => {
  const ok = (numero: string) => ({ numero });

  it('valide dans l\'ordre, l\'une après l\'autre, jamais en parallèle', async () => {
    const ordre: string[] = [];
    let simultanes = 0;
    let max = 0;
    const bilan = await validerEnSerie(['a', 'b', 'c'], async id => {
      simultanes++; max = Math.max(max, simultanes);
      ordre.push(id);
      await Promise.resolve();
      simultanes--;
      return ok(`2026-000${ordre.length}`);
    });
    expect(ordre).toEqual(['a', 'b', 'c']);
    expect(max).toBe(1);
    expect(bilan.validees.map(v => v.numero)).toEqual(['2026-0001', '2026-0002', '2026-0003']);
    expect(bilan).toMatchObject({ erreurs: [], interrompue: false, nonTraitees: [] });
  });

  it('une erreur propre à une facture n\'arrête pas les suivantes', async () => {
    const bilan = await validerEnSerie(['a', 'b', 'c'], async id =>
      id === 'b' ? { erreur: 'Adresse du bénéficiaire incomplète (mention obligatoire) : rue' } : ok(`n-${id}`));
    expect(bilan.validees.map(v => v.id)).toEqual(['a', 'c']);
    expect(bilan.erreurs).toEqual([{ id: 'b', message: expect.stringContaining('Adresse du bénéficiaire') }]);
    expect(bilan.interrompue).toBe(false);
  });

  it('une erreur systémique (profil incomplet, accès refusé) arrête le lot et nomme les factures non tentées', async () => {
    const appels: string[] = [];
    const bilan = await validerEnSerie(['a', 'b', 'c', 'd'], async id => {
      appels.push(id);
      return id === 'b' ? { erreur: 'Profil de facturation incomplet : SIRET' } : ok(`n-${id}`);
    });
    expect(appels).toEqual(['a', 'b']);
    expect(bilan.validees.map(v => v.id)).toEqual(['a']);
    expect(bilan).toMatchObject({ interrompue: true, nonTraitees: ['c', 'd'] });
    expect(bilan.erreurs).toHaveLength(1);
  });

  it('une exception inattendue est rangée en erreur sans faire échouer le lot', async () => {
    const bilan = await validerEnSerie(['a', 'b'], async id => {
      if (id === 'a') throw new Error('réseau coupé');
      return ok('n-b');
    });
    expect(bilan.erreurs).toEqual([{ id: 'a', message: 'réseau coupé' }]);
    expect(bilan.validees.map(v => v.id)).toEqual(['b']);
  });

  it('erreurSystemique reconnaît seulement les erreurs qui frapperaient toutes les factures', () => {
    expect(erreurSystemique('Profil de facturation incomplet : SIRET')).toBe(true);
    expect(erreurSystemique('Accès refusé à cette facture')).toBe(true);
    expect(erreurSystemique('Adresse du bénéficiaire incomplète (mention obligatoire) : rue')).toBe(false);
    expect(erreurSystemique('Validation impossible : la facture n\'a aucune ligne')).toBe(false);
  });

  it('un lot vide ne fait rien', async () => {
    expect(await validerEnSerie([], async () => ok('x'))).toEqual({ validees: [], erreurs: [], interrompue: false, nonTraitees: [] });
  });
});

describe('nomFichierFacture', () => {
  it('nomme le fichier par le numéro, sans aucun nom de personne, et neutralise les caractères inattendus', () => {
    expect(nomFichierFacture('2026-0007')).toBe('facture-2026-0007.pdf');
    expect(nomFichierFacture('../2026-0007 \\x')).toBe('facture-2026-0007x.pdf');
  });
});

describe('validation à partir du 1er du mois suivant (facture progressive)', () => {
  it('premier jour du mois suivant, y compris en décembre', () => {
    expect(premierJourMoisSuivant('2026-10-01')).toBe('2026-11-01');
    expect(premierJourMoisSuivant('2026-12-01')).toBe('2027-01-01');
  });
  it('un brouillon d\'octobre n\'est pas validable le 31 octobre, il l\'est le 1er novembre', () => {
    expect(estValidable('2026-10-01', '2026-10-09')).toBe(false);
    expect(estValidable('2026-10-01', '2026-10-31')).toBe(false);
    expect(estValidable('2026-10-01', '2026-11-01')).toBe(true);
    expect(estValidable('2026-10-01', '2027-03-15')).toBe(true);
    expect(estValidable('2026-12-01', '2026-12-31')).toBe(false);
    expect(estValidable('2026-12-01', '2027-01-01')).toBe(true);
  });
  it('affiche la date d\'ouverture de la validation', () => {
    expect(dateOuvertureValidation('2026-10-01')).toBe('01/11/2026');
  });
  it('se règle sur la date de Paris : à 23h30 UTC le 31 octobre, il est déjà le 1er novembre à Paris', () => {
    expect(dateCivileParis(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11-01');
    expect(dateCivileParis(new Date('2026-10-31T22:30:00Z'))).toBe('2026-10-31');
  });
  it('sépare les brouillons validables de ceux « en cours »', () => {
    const f = (id: string, periode: string) => ({ id, periode } as FactureBrouillon);
    const { validables, enCours } = separerBrouillons([f('a', '2026-09-01'), f('b', '2026-10-01'), f('c', '2026-08-01')], '2026-10-09');
    expect(validables.map(x => x.id)).toEqual(['a', 'c']);
    expect(enCours.map(x => x.id)).toEqual(['b']);
  });
});
