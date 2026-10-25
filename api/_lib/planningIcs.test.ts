import { describe, it, expect } from 'vitest';
import ical, { type VEvent } from 'node-ical';
import { subMonths, format } from 'date-fns';
import {
  genererCalendrierPlanning, calculerBornesFenetreIcs, coursVersIcs, evenementsVersIcs,
  heureFinDepuisDuree, normaliserHeure,
  type SeancePourIcs, type RowCoursIcs, type RowEvenementIcs,
} from './planningIcs.js';
import { dateHeureParisVersUTC } from './rappels.js';

function seance(overrides: Partial<SeancePourIcs> = {}): SeancePourIcs {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    date: '2026-07-15',
    heureDebut: '10:00',
    heureFin: '11:00',
    type: 'seance',
    adresse: '12 rue des Lilas, 75011 Paris',
    participantPrenom: 'Marie',
    participantNom: 'Dupont',
    codePortail: null,
    personneContact: null,
    ...overrides,
  };
}

function parseEvents(icsString: string): VEvent[] {
  const parsed = ical.sync.parseICS(icsString);
  return Object.values(parsed).filter((e): e is VEvent => e?.type === 'VEVENT');
}

describe('genererCalendrierPlanning', () => {
  it('génère un VCALENDAR valide (structure RFC 5545 minimale)', () => {
    const out = genererCalendrierPlanning([seance()]);
    expect(out.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(out).toContain('VERSION:2.0');
    expect(out).toContain('PRODID:');
    expect(out.trim().endsWith('END:VCALENDAR')).toBe(true);
  });

  it('produit un VEVENT par séance, avec le bon horaire (UID stable basé sur id)', () => {
    const s = seance();
    const events = parseEvents(genererCalendrierPlanning([s]));
    expect(events).toHaveLength(1);

    const event = events[0];
    expect(event.uid).toContain(s.id);
    expect(event.start.getTime()).toBe(dateHeureParisVersUTC(s.date, s.heureDebut).getTime());
    expect(event.end?.getTime()).toBe(dateHeureParisVersUTC(s.date, s.heureFin).getTime());
  });

  it('gère correctement heure d\'été et heure d\'hiver (CEST/CET)', () => {
    const ete = seance({ id: '22222222-2222-2222-2222-222222222222', date: '2026-07-15', heureDebut: '10:00', heureFin: '11:00' });
    const hiver = seance({ id: '33333333-3333-3333-3333-333333333333', date: '2026-01-15', heureDebut: '10:00', heureFin: '11:00' });
    const events = parseEvents(genererCalendrierPlanning([ete, hiver]));

    const eventEte = events.find(e => e.uid.includes('22222222'));
    const eventHiver = events.find(e => e.uid.includes('33333333'));

    expect(eventEte?.start.toISOString()).toBe('2026-07-15T08:00:00.000Z');
    expect(eventHiver?.start.toISOString()).toBe('2026-01-15T09:00:00.000Z');
  });

  it('affiche "Prénom I." (initiale du nom uniquement, jamais le nom complet)', () => {
    const s = seance({ participantPrenom: 'Marie', participantNom: 'Dupont' });
    const events = parseEvents(genererCalendrierPlanning([s]));
    expect(events[0].summary).toBe('Marie D.');
    expect(events[0].summary).not.toContain('Dupont');
  });

  it('inclut l\'adresse en LOCATION quand elle est renseignée', () => {
    const s = seance({ adresse: '12 rue des Lilas, 75011 Paris' });
    const events = parseEvents(genererCalendrierPlanning([s]));
    expect(events[0].location).toBe('12 rue des Lilas, 75011 Paris');
  });

  it('omet LOCATION proprement quand l\'adresse est vide', () => {
    const s = seance({ adresse: null });
    const events = parseEvents(genererCalendrierPlanning([s]));
    expect(events[0].location).toBeFalsy();
  });

  it('échappe correctement les accents et apostrophes (round-trip RFC 5545)', () => {
    const s = seance({ participantPrenom: "Zoé", participantNom: "O'Brien", adresse: "Chez M., 3 allée de l'Église" });
    const events = parseEvents(genererCalendrierPlanning([s]));
    expect(events[0].summary).toBe("Zoé O.");
    expect(events[0].location).toBe("Chez M., 3 allée de l'Église");
  });

  it('ne génère aucun VEVENT si la liste de séances est vide (annulées déjà filtrées en amont)', () => {
    const events = parseEvents(genererCalendrierPlanning([]));
    expect(events).toHaveLength(0);
  });

  it('inclut le code portail et la personne à contacter en DESCRIPTION quand renseignés', () => {
    const s = seance({ codePortail: 'A1234', personneContact: 'Marie Dupont — 06 12 34 56 78' });
    const events = parseEvents(genererCalendrierPlanning([s]));
    expect(events[0].description).toBe('Code portail : A1234\nPersonne à contacter : Marie Dupont — 06 12 34 56 78');
  });

  it('omet DESCRIPTION quand ni code portail ni personne à contacter ne sont renseignés', () => {
    const s = seance({ codePortail: null, personneContact: null });
    const events = parseEvents(genererCalendrierPlanning([s]));
    expect(events[0].description).toBeFalsy();
  });

  it('inclut une séance passée (statut réalisée) avec son horaire exact — historique 24 mois', () => {
    const s = seance({
      id: '44444444-4444-4444-4444-444444444444',
      date: format(subMonths(new Date(), 3), 'yyyy-MM-dd'),
    });
    const events = parseEvents(genererCalendrierPlanning([s]));
    expect(events).toHaveLength(1);
    expect(events[0].uid).toContain(s.id);
  });
});

describe('calculerBornesFenetreIcs', () => {
  it('couvre 24 mois en arrière et 12 mois en avant, bornes inclusives au jour près', () => {
    const maintenant = new Date('2026-09-10T12:00:00.000Z');
    const { debut, fin } = calculerBornesFenetreIcs(maintenant);
    expect(debut).toBe('2024-09-10');
    expect(fin).toBe('2027-09-10');
  });

  it('conserve la stabilité des UID : les bornes ne dépendent que de "maintenant", jamais de l\'id de la séance', () => {
    // Élargir la fenêtre ne doit jamais changer l'UID des séances déjà
    // synchronisées côté praticien (basé uniquement sur seance.id, voir
    // genererCalendrierPlanning) — sinon Google Agenda les recrée en doublon.
    const s = seance({ id: '55555555-5555-5555-5555-555555555555' });
    const events = parseEvents(genererCalendrierPlanning([s]));
    expect(events[0].uid).toContain(s.id);
  });
});

// ── Bug 17 : cours collectifs et événements d'agenda dans le flux ──────────────

function cours(overrides: Partial<RowCoursIcs> = {}): RowCoursIcs {
  return { id: 'c0000000-0000-0000-0000-000000000001', titre: 'Gym douce', date: '2026-07-15', heure_debut: '14:00', duree_minutes: 60, ...overrides };
}

function evenement(overrides: Partial<RowEvenementIcs> = {}): RowEvenementIcs {
  return {
    id: 'e0000000-0000-0000-0000-000000000001', type: 'reunion', titre: 'Réunion équipe',
    date: '2026-07-16', heure_debut: '09:00', heure_fin: '10:30', nom: null, prenom: null, adresse: null,
    ...overrides,
  };
}

describe('coursVersIcs', () => {
  it('un cours collectif devient un événement, fin = début + durée', () => {
    const [e] = coursVersIcs([cours()]);
    expect(e).toEqual({
      uid: 'cours-c0000000-0000-0000-0000-000000000001', date: '2026-07-15',
      heureDebut: '14:00', heureFin: '15:00', summary: 'Cours collectif — Gym douce', location: null,
    });
  });

  it('accepte une heure stockée avec les secondes', () => {
    expect(coursVersIcs([cours({ heure_debut: '14:00:00' })])[0].heureFin).toBe('15:00');
  });

  it('ignore une ligne inexploitable au lieu de casser le flux', () => {
    expect(coursVersIcs([cours({ duree_minutes: null }), cours({ heure_debut: 'n/a' }), cours({ date: '' })])).toEqual([]);
  });
});

describe('heureFinDepuisDuree / normaliserHeure', () => {
  it('plafonne à 23:59 (jamais sur le lendemain)', () => {
    expect(heureFinDepuisDuree('23:30', 90)).toBe('23:59');
    expect(heureFinDepuisDuree('09:15', 45)).toBe('10:00');
  });
  it('normalise HH:MM:SS en HH:MM et laisse le reste tel quel', () => {
    expect(normaliserHeure('08:05:00')).toBe('08:05');
    expect(normaliserHeure('08:05')).toBe('08:05');
    expect(normaliserHeure(null)).toBe('');
  });
});

describe('evenementsVersIcs', () => {
  it('reprend le titre et l\'adresse, quel que soit le type (un type futur est exporté sans correction)', () => {
    const [e] = evenementsVersIcs([evenement({ type: 'type_ajoute_demain', titre: 'Formation', adresse: 'Salle 2' })]);
    expect(e).toMatchObject({ uid: 'evenement-e0000000-0000-0000-0000-000000000001', summary: 'Formation', location: 'Salle 2', heureFin: '10:30' });
  });

  it('première rencontre : « Prénom N. », jamais le nom complet ni le titre libre', () => {
    const [avecNom] = evenementsVersIcs([evenement({ type: 'prospect', titre: 'Mme Dupont (prospect)', prenom: 'Jean', nom: 'Dupont' })]);
    expect(avecNom.summary).toBe('Première rencontre — Jean D.');
    expect(avecNom.summary).not.toContain('Dupont');
    const [sansNom] = evenementsVersIcs([evenement({ type: 'premier_contact_prospect', titre: 'Mme Dupont (prospect)' })]);
    expect(sansNom.summary).toBe('Première rencontre');
  });

  it('ignore un créneau invalide (fin avant début)', () => {
    expect(evenementsVersIcs([evenement({ heure_debut: '11:00', heure_fin: '10:00' })])).toEqual([]);
  });
});

describe('genererCalendrierPlanning — séances + autres occupations', () => {
  it('contient séances, cours et événements, avec des UID distincts et les horaires de Paris', () => {
    const autres = [...coursVersIcs([cours()]), ...evenementsVersIcs([evenement()])];
    const events = parseEvents(genererCalendrierPlanning([seance()], autres));
    expect(events).toHaveLength(3);
    const coursEv = events.find(e => e.uid.includes('cours-'));
    expect(coursEv?.summary).toBe('Cours collectif — Gym douce');
    expect(coursEv?.start.toISOString()).toBe('2026-07-15T12:00:00.000Z');
    expect(coursEv?.end?.toISOString()).toBe('2026-07-15T13:00:00.000Z');
    expect(events.find(e => e.uid.includes('evenement-'))?.summary).toBe('Réunion équipe');
  });

  it('ne change pas l\'UID des séances déjà synchronisées (sinon doublons dans Google Agenda)', () => {
    const s = seance({ id: '66666666-6666-6666-6666-666666666666' });
    const seul = parseEvents(genererCalendrierPlanning([s]))[0].uid;
    const avecAutres = parseEvents(genererCalendrierPlanning([s], coursVersIcs([cours()]))).find(e => e.uid.includes('66666666'))?.uid;
    expect(avecAutres).toBe(seul);
  });

  it('un événement n\'a pas de DESCRIPTION : ni notes ni téléphone ne quittent Horizon', () => {
    // Structurel : RowEvenementIcs ne porte ni notes ni telephone (colonnes non lues par la requête).
    const out = genererCalendrierPlanning([], evenementsVersIcs([evenement({ type: 'prospect', prenom: 'Jean', nom: 'Dupont' })]));
    expect(parseEvents(out)[0].description).toBeFalsy();
  });
});
