import { describe, it, expect } from 'vitest';
import { estSemaineDue, genererDatesSeances, heuresChevauchent, trouveChevauchement, trouveChevauchements, arrondirAuPas, calerDansFenetre, cleSerieRecurrente, trouverSerieRecurrente, regrouperParCreneau, datesManquantes, messageErreurSeance } from './horaires';
import type { Seance } from '../types';

function fakeSeance(overrides: Partial<Seance> = {}): Seance {
  return {
    id: 'seance-1',
    participantId: 'participant-1',
    date: '2026-07-13',
    heureDebut: '10:00',
    heureFin: '10:45',
    dureeMinutes: 45,
    type: 'seance',
    statut: 'planifiee',
    adresse: '',
    ...overrides,
  };
}

describe('estSemaineDue', () => {
  const DEBUT = '2026-06-29'; // un lundi

  it('périodicité "semaine" : toujours due, quelle que soit la date cible', () => {
    expect(estSemaineDue(DEBUT, DEBUT, 'semaine')).toBe(true);
    expect(estSemaineDue(DEBUT, '2026-07-06', 'semaine')).toBe(true);
    expect(estSemaineDue(DEBUT, '2026-08-10', 'semaine')).toBe(true);
  });

  it('périodicité absente (undefined) : se comporte comme "semaine"', () => {
    expect(estSemaineDue(DEBUT, '2026-07-13')).toBe(true);
  });

  it('"deux_semaines" : due à la semaine 0, pas à la semaine 1, due à la semaine 2', () => {
    expect(estSemaineDue(DEBUT, '2026-06-29', 'deux_semaines')).toBe(true);  // semaine 0
    expect(estSemaineDue(DEBUT, '2026-07-06', 'deux_semaines')).toBe(false); // semaine 1
    expect(estSemaineDue(DEBUT, '2026-07-13', 'deux_semaines')).toBe(true);  // semaine 2
    expect(estSemaineDue(DEBUT, '2026-07-20', 'deux_semaines')).toBe(false); // semaine 3
  });

  it('"trois_semaines" : due seulement aux semaines 0, 3, 6...', () => {
    expect(estSemaineDue(DEBUT, '2026-06-29', 'trois_semaines')).toBe(true);  // semaine 0
    expect(estSemaineDue(DEBUT, '2026-07-06', 'trois_semaines')).toBe(false); // semaine 1
    expect(estSemaineDue(DEBUT, '2026-07-13', 'trois_semaines')).toBe(false); // semaine 2
    expect(estSemaineDue(DEBUT, '2026-07-20', 'trois_semaines')).toBe(true);  // semaine 3
  });

  it('fonctionne aussi pour une date cible avant dateDebut (indice négatif)', () => {
    // semaine -1 par rapport à dateDebut : ne doit pas planter sur le modulo négatif.
    expect(estSemaineDue(DEBUT, '2026-06-22', 'deux_semaines')).toBe(false);
    expect(estSemaineDue(DEBUT, '2026-06-15', 'deux_semaines')).toBe(true);
  });
});

describe('genererDatesSeances avec périodicité', () => {
  it('"deux_semaines" : ne génère qu\'une date toutes les 2 semaines, jamais 2 semaines consécutives', () => {
    const dates = genererDatesSeances('2026-06-29', '2026-08-09', 'lun', 'deux_semaines');
    // Lundis entre le 29/06 et le 09/08 : 29/06, 06/07, 13/07, 20/07, 27/07, 03/08
    // → un sur deux à partir du 29/06 : 29/06, 13/07, 27/07
    expect(dates).toEqual(['2026-06-29', '2026-07-13', '2026-07-27']);
  });

  it('"trois_semaines" : une date toutes les 3 semaines', () => {
    const dates = genererDatesSeances('2026-06-29', '2026-08-09', 'lun', 'trois_semaines');
    expect(dates).toEqual(['2026-06-29', '2026-07-20']);
  });

  it('sans périodicité (défaut "semaine") : comportement inchangé, toutes les semaines', () => {
    const dates = genererDatesSeances('2026-06-29', '2026-07-20', 'lun');
    expect(dates).toEqual(['2026-06-29', '2026-07-06', '2026-07-13', '2026-07-20']);
  });

  it('dateAncrage distincte de dateDebut : le cycle reste calé sur le vrai début de contrat', () => {
    // Contrat "deux_semaines" ancré le 29/06 (semaine 0, due). On ne génère
    // qu'à partir du 06/07 (semaine 1 par rapport au vrai début → PAS due).
    // Sans dateAncrage (bug), le calcul prendrait 06/07 comme semaine 0 et le
    // considérerait à tort comme due : le résultat serait alors
    // ['2026-07-06', '2026-07-20'] au lieu du résultat correct ci-dessous.
    const dates = genererDatesSeances('2026-07-06', '2026-08-03', 'lun', 'deux_semaines', '2026-06-29');
    expect(dates).toEqual(['2026-07-13', '2026-07-27']);
  });
});

describe('heuresChevauchent', () => {
  it('détecte un chevauchement partiel', () => {
    expect(heuresChevauchent('10:00', '10:45', '10:30', '11:15')).toBe(true);
  });

  it('ne détecte pas de chevauchement quand les créneaux se touchent juste (fin = début)', () => {
    expect(heuresChevauchent('10:00', '10:45', '10:45', '11:30')).toBe(false);
  });

  it('ne détecte pas de chevauchement quand les créneaux sont disjoints', () => {
    expect(heuresChevauchent('10:00', '10:45', '11:00', '11:45')).toBe(false);
  });

  it('détecte un créneau entièrement englobé dans un autre', () => {
    expect(heuresChevauchent('10:00', '12:00', '10:30', '10:45')).toBe(true);
  });
});

describe('trouveChevauchement', () => {
  it('trouve la séance existante en collision le même jour', () => {
    const existante = fakeSeance({ id: 'e1', date: '2026-07-13', heureDebut: '10:00', heureFin: '10:45' });
    const trouve = trouveChevauchement([existante], { date: '2026-07-13', heureDebut: '10:30', heureFin: '11:15' });
    expect(trouve?.id).toBe('e1');
  });

  it('ignore les séances annulées', () => {
    const annulee = fakeSeance({ id: 'e1', statut: 'annulee' });
    const trouve = trouveChevauchement([annulee], { date: '2026-07-13', heureDebut: '10:00', heureFin: '10:45' });
    expect(trouve).toBeUndefined();
  });

  it('ignore les séances un autre jour', () => {
    const existante = fakeSeance({ id: 'e1', date: '2026-07-14' });
    const trouve = trouveChevauchement([existante], { date: '2026-07-13', heureDebut: '10:00', heureFin: '10:45' });
    expect(trouve).toBeUndefined();
  });

  it('excludeId permet d\'ignorer la séance elle-même (cas modification)', () => {
    const existante = fakeSeance({ id: 'e1' });
    const trouve = trouveChevauchement(
      [existante], { date: '2026-07-13', heureDebut: '10:00', heureFin: '10:45' }, 'e1',
    );
    expect(trouve).toBeUndefined();
  });
});

describe('trouveChevauchements (bulk)', () => {
  it('renvoie une paire par créneau candidat en collision', () => {
    const existantes = [
      fakeSeance({ id: 'e1', date: '2026-07-13', heureDebut: '10:00', heureFin: '10:45' }),
      fakeSeance({ id: 'e2', date: '2026-07-27', heureDebut: '10:00', heureFin: '10:45' }),
    ];
    // 3 occurrences hebdomadaires générées, dont 2 tombent en collision avec
    // des séances déjà planifiées pour un autre bénéficiaire.
    const candidats = [
      { date: '2026-07-13', heureDebut: '10:15', heureFin: '11:00' },
      { date: '2026-07-20', heureDebut: '10:15', heureFin: '11:00' },
      { date: '2026-07-27', heureDebut: '10:15', heureFin: '11:00' },
    ];
    const conflits = trouveChevauchements(existantes, candidats);
    expect(conflits).toHaveLength(2);
    expect(conflits.map(c => c.creneau.date)).toEqual(['2026-07-13', '2026-07-27']);
  });

  it('ne renvoie rien quand aucun créneau candidat ne chevauche', () => {
    const existantes = [fakeSeance({ id: 'e1', date: '2026-07-13', heureDebut: '08:00', heureFin: '08:45' })];
    const candidats = [{ date: '2026-07-13', heureDebut: '10:00', heureFin: '10:45' }];
    expect(trouveChevauchements(existantes, candidats)).toHaveLength(0);
  });
});

describe('arrondirAuPas', () => {
  it('arrondit au multiple de 15 le plus proche (par défaut)', () => {
    expect(arrondirAuPas(9 * 60 + 7)).toBe(9 * 60);        // 9h07 → 9h00
    expect(arrondirAuPas(9 * 60 + 23)).toBe(9 * 60 + 30);  // 9h23 → 9h30
    expect(arrondirAuPas(9 * 60 + 8)).toBe(9 * 60 + 15);   // 9h08 → 9h15 (arrondi au plus proche)
  });

  it('laisse inchangé un horaire déjà sur la grille', () => {
    expect(arrondirAuPas(10 * 60)).toBe(10 * 60);
  });

  it('accepte un pas différent (configurable)', () => {
    expect(arrondirAuPas(9 * 60 + 12, 10)).toBe(9 * 60 + 10);
    expect(arrondirAuPas(9 * 60 + 12, 30)).toBe(9 * 60);
  });
});

describe('calerDansFenetre', () => {
  const FENETRE_8_12 = [{ debut: 8 * 60, fin: 12 * 60 }]; // 08:00–12:00

  it('renvoie l\'heure telle quelle quand la séance tient dans la fenêtre', () => {
    const debut = arrondirAuPas(9 * 60 + 7); // 9h00
    expect(calerDansFenetre(debut, 45, FENETRE_8_12)).toBe(9 * 60);
  });

  it('recale sur le dernier début valide quand l\'arrondi ferait déborder la fin de fenêtre', () => {
    // Dispo jusqu'à 12h, séance d'1h déposée à 11h50 → arrondie à 11h45 →
    // finirait à 12h45 (hors zone) → doit être recalée sur 11h00 (11h–12h).
    const snappe = arrondirAuPas(11 * 60 + 50);
    expect(snappe).toBe(11 * 60 + 45);
    expect(calerDansFenetre(snappe, 60, FENETRE_8_12)).toBe(11 * 60);
  });

  it('ne dépasse jamais le début de la fenêtre en recalant', () => {
    // Fenêtre de 30 min seulement, séance de 45 min : ne tient jamais.
    const fenetreCourte = [{ debut: 8 * 60, fin: 8 * 60 + 30 }];
    expect(calerDansFenetre(8 * 60, 45, fenetreCourte)).toBeNull();
  });

  it('renvoie null si le début ne tombe dans aucune fenêtre', () => {
    expect(calerDansFenetre(14 * 60, 45, FENETRE_8_12)).toBeNull();
  });

  it('choisit la fenêtre qui contient réellement le début, parmi plusieurs', () => {
    const fenetres = [{ debut: 8 * 60, fin: 10 * 60 }, { debut: 14 * 60, fin: 18 * 60 }];
    expect(calerDansFenetre(15 * 60, 30, fenetres)).toBe(15 * 60);
  });
});

describe('cleSerieRecurrente / trouverSerieRecurrente', () => {
  // Toutes ces dates tombent le même jour de la semaine (écart de 7 jours).
  const S1 = fakeSeance({ id: 's1', contratId: 'contrat-A', date: '2026-07-14' });
  const S2 = fakeSeance({ id: 's2', contratId: 'contrat-A', date: '2026-07-21' });
  const S3 = fakeSeance({ id: 's3', contratId: 'contrat-A', date: '2026-07-28' });

  it('un même rythme hebdomadaire (même bénéficiaire/contrat/jour/heure) produit une clé identique quelle que soit la semaine', () => {
    expect(cleSerieRecurrente(S1)).toBe(cleSerieRecurrente(S2));
    expect(cleSerieRecurrente(S2)).toBe(cleSerieRecurrente(S3));
  });

  it('deux contrats différents au même créneau produisent des clés différentes (pas de fusion visuelle)', () => {
    const ancienContrat = fakeSeance({ id: 's-ancien', contratId: 'contrat-A', date: '2026-07-14' });
    const nouveauContrat = fakeSeance({ id: 's-nouveau', contratId: 'contrat-B', date: '2026-07-21' });
    expect(cleSerieRecurrente(ancienContrat)).not.toBe(cleSerieRecurrente(nouveauContrat));
  });

  it('une occurrence déplacée à une autre heure MAIS le même jour reste dans la même série (l\'heure n\'entre plus dans la clé)', () => {
    const heureAjustee = fakeSeance({ id: 's-heure-ajustee', contratId: 'contrat-A', date: '2026-07-21', heureDebut: '14:00', heureFin: '14:45' });
    expect(cleSerieRecurrente(S1)).toBe(cleSerieRecurrente(heureAjustee));
  });

  it('une occurrence déplacée à un AUTRE JOUR sort bien de la clé de sa série d\'origine', () => {
    const autreJour = fakeSeance({ id: 's-autre-jour', contratId: 'contrat-A', date: '2026-07-22' }); // mercredi au lieu de mardi
    expect(cleSerieRecurrente(S1)).not.toBe(cleSerieRecurrente(autreJour));
  });

  it('un bénéficiaire avec un seul rythme : trouverSerieRecurrente renvoie toutes les occurrences, triées par date', () => {
    const autreParticipant = fakeSeance({ id: 's-autre-b', participantId: 'participant-2', contratId: 'contrat-A', date: '2026-07-14' });
    const seances = [S3, S1, autreParticipant, S2];
    const serie = trouverSerieRecurrente(seances, S1);
    expect(serie.map(s => s.id)).toEqual(['s1', 's2', 's3']);
  });

  it('exclut les séances annulées de la série', () => {
    const annulee = fakeSeance({ id: 's-annulee', contratId: 'contrat-A', date: '2026-07-28', statut: 'annulee' });
    const serie = trouverSerieRecurrente([S1, S2, annulee], S1);
    expect(serie.map(s => s.id)).toEqual(['s1', 's2']);
  });

  it('deux contrats successifs au même créneau ne se mélangent jamais dans la même série', () => {
    const ancien = fakeSeance({ id: 's-ancien2', contratId: 'contrat-A', date: '2026-07-14' });
    const nouveau = fakeSeance({ id: 's-nouveau2', contratId: 'contrat-B', date: '2026-07-21' });
    const serie = trouverSerieRecurrente([ancien, nouveau], ancien);
    expect(serie.map(s => s.id)).toEqual(['s-ancien2']);
  });

  // Bug rapporté (Julien B.) : un rythme du jeudi affichait 3 badges de
  // récurrence différents (↻4/↻7/↻8) à cause d'un léger écart d'heure entre
  // occurrences — "déplacer cette séance et les suivantes" n'en attrapait
  // qu'un sous-ensemble, laissant de vraies séances futures au jeudi.
  it('un même jour regroupe toutes les occurrences même avec des heures légèrement différentes (corrige le bug des badges scindés ↻4/↻7/↻8)', () => {
    const jeudi1 = fakeSeance({ id: 'j1', contratId: 'contrat-julien', date: '2026-07-16', heureDebut: '10:00', heureFin: '10:45' });
    const jeudi2 = fakeSeance({ id: 'j2', contratId: 'contrat-julien', date: '2026-07-23', heureDebut: '10:15', heureFin: '11:00' }); // léger écart
    const jeudi3 = fakeSeance({ id: 'j3', contratId: 'contrat-julien', date: '2026-07-30', heureDebut: '09:45', heureFin: '10:30' }); // autre écart
    const serie = trouverSerieRecurrente([jeudi1, jeudi2, jeudi3], jeudi1);
    expect(serie.map(s => s.id)).toEqual(['j1', 'j2', 'j3']); // les trois, malgré les écarts d'heure
  });

  // Règle métier confirmée : un bénéficiaire peut avoir plusieurs séances par
  // semaine, mais jamais deux fois le même jour (ex : 3 séances/semaine = 3
  // jours différents). Déplacer un jour ne doit donc jamais toucher les
  // autres jours du même contrat.
  it('bénéficiaire à 3 séances/semaine sur 3 jours différents : la série d\'un jour ne contient jamais les séances des autres jours du même contrat', () => {
    const lundi = fakeSeance({ id: 'lun', contratId: 'contrat-3x', date: '2026-07-13', heureDebut: '09:00', heureFin: '09:45' });
    const mercredi = fakeSeance({ id: 'mer', contratId: 'contrat-3x', date: '2026-07-15', heureDebut: '09:00', heureFin: '09:45' });
    const vendredi = fakeSeance({ id: 'ven', contratId: 'contrat-3x', date: '2026-07-17', heureDebut: '09:00', heureFin: '09:45' });
    const toutes = [lundi, mercredi, vendredi];

    expect(trouverSerieRecurrente(toutes, lundi).map(s => s.id)).toEqual(['lun']);
    expect(trouverSerieRecurrente(toutes, mercredi).map(s => s.id)).toEqual(['mer']);
    expect(trouverSerieRecurrente(toutes, vendredi).map(s => s.id)).toEqual(['ven']);
  });
});

// Bug rapporté : « après suppression 'et les suivantes', la séance reste
// affichée, il faut supprimer une 2e fois ». regrouperParCreneau est
// exactement la fonction utilisée par FrisePlanningJour pour décider quel
// bloc afficher — la reproduire ici avec le AVANT/APRÈS d'une suppression
// permet de vérifier, sans navigateur, si l'écran reflète bien l'état de la
// base après l'opération.
//
// Cause identifiée : ce n'était PAS un bug de resynchronisation (l'état
// local est correctement mis à jour — voir le premier test, qui prouve
// qu'aucun bloc résiduel n'apparaît quand rien d'autre ne subsiste au même
// créneau). C'était l'ancien comportement de repli de regrouperParCreneau,
// qui affichait la dernière occurrence PASSÉE quand plus aucune occurrence
// future n'existait — une séance différente, plus ancienne, jamais touchée
// par la suppression (elle exclut toujours l'historique, à raison), mais
// réapparaissant au même endroit visuel et donnant l'impression que la
// suppression n'avait pas fonctionné. Corrigé : plus de repli sur le passé.
describe('regrouperParCreneau — bug "reste affiché après suppression et les suivantes"', () => {
  const AUJOURDHUI = '2026-07-06'; // date de référence des tests (voir currentDate de la session)

  it('sans occurrence passée : après suppression de toutes les futures, plus aucun bloc ne s\'affiche', () => {
    const seancesAvant = [
      fakeSeance({ id: 's1', contratId: 'C', date: '2026-07-07' }),
      fakeSeance({ id: 's2', contratId: 'C', date: '2026-07-14' }),
      fakeSeance({ id: 's3', contratId: 'C', date: '2026-07-21' }),
    ];
    // Simule exactement ce que fait useAgenda.supprimerSeance : filtrer les
    // ids supprimés hors de l'état local (setSeances(prev => prev.filter(...))).
    const idsSupprimes = new Set(['s1', 's2', 's3']);
    const seancesApres = seancesAvant.filter(s => !idsSupprimes.has(s.id));

    const blocsApres = regrouperParCreneau(seancesApres, AUJOURDHUI);
    expect(blocsApres).toHaveLength(0); // aucun bloc résiduel : l'affichage est cohérent avec la base
  });

  it('avec une occurrence PASSÉE au même créneau : après suppression des futures, plus aucun bloc — l\'historique ne revient plus se substituer visuellement', () => {
    const passee = fakeSeance({ id: 's0', contratId: 'C', date: '2026-06-30', statut: 'realisee' }); // déjà eue, avant aujourd'hui
    const s1 = fakeSeance({ id: 's1', contratId: 'C', date: '2026-07-07' });
    const s2 = fakeSeance({ id: 's2', contratId: 'C', date: '2026-07-14' });
    const seancesAvant = [passee, s1, s2];

    // Avant suppression : un seul bloc, représenté par s1 (prochaine à venir).
    const blocsAvant = regrouperParCreneau(seancesAvant, AUJOURDHUI);
    expect(blocsAvant).toHaveLength(1);
    expect(blocsAvant[0].seance.id).toBe('s1');
    expect(blocsAvant[0].totalOccurrences).toBe(3);

    // "Cette séance et les suivantes" sur s1 : futures = [s1, s2] (s0 exclue,
    // c'est l'historique, jamais supprimé). On simule la suppression réussie
    // de s1 et s2 — s0 reste en base (à raison) mais ne doit plus réapparaître
    // à l'écran comme si c'était la séance qu'on vient de supprimer.
    const idsSupprimes = new Set(['s1', 's2']);
    const seancesApres = seancesAvant.filter(s => !idsSupprimes.has(s.id));

    const blocsApres = regrouperParCreneau(seancesApres, AUJOURDHUI);
    expect(blocsApres).toHaveLength(0);
  });

  it('un créneau entièrement passé (contrat terminé) ne produit plus de bloc dans cette grille de planification', () => {
    const passee1 = fakeSeance({ id: 'p1', contratId: 'C', date: '2026-06-16', statut: 'realisee' });
    const passee2 = fakeSeance({ id: 'p2', contratId: 'C', date: '2026-06-23', statut: 'realisee' });
    const blocs = regrouperParCreneau([passee1, passee2], AUJOURDHUI);
    expect(blocs).toHaveLength(0);
  });

  it('un déplacement "cette séance uniquement" laisse les autres occurrences FUTURES visibles (comportement voulu, différent du cas passé)', () => {
    // Contraste volontaire avec les tests ci-dessus : ici les occurrences
    // restantes sont dans le FUTUR (pas l'historique) — les laisser visibles
    // est le comportement spécifié pour "cette séance uniquement", pas un bug.
    const s1 = fakeSeance({ id: 's1', contratId: 'C', date: '2026-07-07' });
    const s2 = fakeSeance({ id: 's2', contratId: 'C', date: '2026-07-14' });
    const s3 = fakeSeance({ id: 's3', contratId: 'C', date: '2026-07-21' });
    // s1 déplacée ailleurs (nouveau JOUR — le 8 est un mercredi, pas un mardi
    // comme s1/s2/s3) : sort de la clé de la série. Un simple changement
    // d'heure en gardant le même jour ne l'isolerait plus (voir le test
    // dédié dans le describe cleSerieRecurrente ci-dessus).
    const s1Deplacee = { ...s1, date: '2026-07-08', heureDebut: '14:00', heureFin: '14:45' };
    const seancesApres = [s1Deplacee, s2, s3];

    const blocs = regrouperParCreneau(seancesApres, AUJOURDHUI);
    // Le créneau d'origine (mardi) affiche encore un bloc : s2 (prochaine
    // occurrence future restante) — une séance réelle et distincte de s1,
    // pas une copie.
    const blocOrigine = blocs.find(b => new Date(b.seance.date + 'T12:00').getDay() === new Date(s2.date + 'T12:00').getDay());
    expect(blocOrigine?.seance.id).toBe('s2');
    expect(blocOrigine?.totalOccurrences).toBe(2); // s2 + s3, s1 n'est plus dans cette série
  });

  it('un écart d\'heure sur le même jour ne scinde plus le regroupement visuel (corrige les badges ↻4/↻7/↻8 du bug Julien B.)', () => {
    const j1 = fakeSeance({ id: 'j1', contratId: 'C', date: '2026-07-16', heureDebut: '10:00', heureFin: '10:45' });
    const j2 = fakeSeance({ id: 'j2', contratId: 'C', date: '2026-07-23', heureDebut: '10:15', heureFin: '11:00' });
    const j3 = fakeSeance({ id: 'j3', contratId: 'C', date: '2026-07-30', heureDebut: '09:45', heureFin: '10:30' });

    const blocs = regrouperParCreneau([j1, j2, j3], AUJOURDHUI);
    expect(blocs).toHaveLength(1); // un seul bloc pour le jeudi, pas trois
    expect(blocs[0].totalOccurrences).toBe(3);
  });
});

// Bug rapporté : la création (glisser un bénéficiaire) tente de réinsérer des
// séances déjà existantes pour ce contrat → violation de la contrainte
// d'unicité seances_no_double_contrat_idx (participant_id, date, contrat_id),
// qui remonte à l'utilisateur comme une erreur Postgres brute. datesManquantes
// doit filtrer ces dates AVANT tout insert.
describe('datesManquantes — anti-doublon à la création (bug "duplicate key value violates unique constraint")', () => {
  it('ne génère que les occurrences manquantes quand certaines existent déjà pour ce contrat', () => {
    const existantes: Seance[] = [
      fakeSeance({ id: 'e1', participantId: 'p1', contratId: 'C', date: '2026-07-14' }),
      fakeSeance({ id: 'e2', participantId: 'p1', contratId: 'C', date: '2026-07-21' }),
    ];
    const datesDemandees = ['2026-07-14', '2026-07-21', '2026-07-28', '2026-08-04'];
    const resultat = datesManquantes(existantes, 'p1', 'C', datesDemandees);
    expect(resultat).toEqual(['2026-07-28', '2026-08-04']); // seules les 2 nouvelles
  });

  it('bloque proprement (liste vide) si toutes les dates demandées existent déjà — jamais de tentative d\'insert en double', () => {
    const existantes: Seance[] = [
      fakeSeance({ id: 'e1', participantId: 'p1', contratId: 'C', date: '2026-07-14' }),
      fakeSeance({ id: 'e2', participantId: 'p1', contratId: 'C', date: '2026-07-21' }),
    ];
    const resultat = datesManquantes(existantes, 'p1', 'C', ['2026-07-14', '2026-07-21']);
    expect(resultat).toEqual([]);
  });

  it('ignore les séances annulées : une date annulée est considérée comme libre (rejoue la logique de l\'index partiel WHERE statut <> annulee)', () => {
    const annulee = fakeSeance({ id: 'e1', participantId: 'p1', contratId: 'C', date: '2026-07-14', statut: 'annulee' });
    const resultat = datesManquantes([annulee], 'p1', 'C', ['2026-07-14']);
    expect(resultat).toEqual(['2026-07-14']);
  });

  it('un autre contrat ou un autre bénéficiaire au même horaire ne bloque rien (la contrainte est bien scopée par participant_id + contrat_id)', () => {
    const autreContrat = fakeSeance({ id: 'e1', participantId: 'p1', contratId: 'AUTRE-CONTRAT', date: '2026-07-14' });
    const autreParticipant = fakeSeance({ id: 'e2', participantId: 'p2', contratId: 'C', date: '2026-07-14' });
    const resultat = datesManquantes([autreContrat, autreParticipant], 'p1', 'C', ['2026-07-14']);
    expect(resultat).toEqual(['2026-07-14']);
  });

  it('aucune modification n\'est jamais tentée quand la liste résultante est vide (à charge de l\'appelant de bloquer, pas de forcer un insert)', () => {
    const existantes: Seance[] = [fakeSeance({ id: 'e1', participantId: 'p1', contratId: 'C', date: '2026-07-14' })];
    const resultat = datesManquantes(existantes, 'p1', 'C', ['2026-07-14']);
    expect(resultat).toHaveLength(0);
  });
});

describe('messageErreurSeance — ne jamais laisser fuiter un message Postgres brut', () => {
  it('traduit la violation de la contrainte anti-doublon en message humain', () => {
    const erreurBrute = { message: 'duplicate key value violates unique constraint "seances_no_double_contrat_idx"', code: '23505' };
    const message = messageErreurSeance(erreurBrute);
    expect(message).not.toMatch(/duplicate key|constraint|seances_no_double/i);
    expect(message).toBe('Ce bénéficiaire a déjà une séance planifiée à cette date pour ce contrat.');
  });

  it('reconnaît une violation d\'unicité via le code SQLSTATE même sans le texte anglais habituel', () => {
    const erreurBrute = { message: 'texte imprévisible quelconque', code: '23505' };
    const message = messageErreurSeance(erreurBrute);
    expect(message).not.toBe('texte imprévisible quelconque');
  });

  it('reste générique (et humain) pour une autre contrainte d\'unicité non prévue', () => {
    const erreurBrute = { message: 'duplicate key value violates unique constraint "autre_contrainte_idx"', code: '23505' };
    const message = messageErreurSeance(erreurBrute);
    expect(message).not.toMatch(/duplicate key|constraint/i);
  });

  it('retombe sur un message générique pour toute autre erreur (jamais le texte brut)', () => {
    const erreurBrute = { message: 'connection timeout to database host 10.0.4.2:5432', code: '57014' };
    const message = messageErreurSeance(erreurBrute);
    expect(message).not.toMatch(/10\.0\.4\.2|timeout|database host/i);
  });
});
