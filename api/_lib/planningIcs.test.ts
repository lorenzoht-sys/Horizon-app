import { describe, it, expect } from 'vitest';
import ical, { type VEvent } from 'node-ical';
import { genererCalendrierPlanning, type SeancePourIcs } from './planningIcs.js';
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
});
