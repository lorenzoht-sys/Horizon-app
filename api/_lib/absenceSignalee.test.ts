import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import {
  validerCorpsSeanceAbsence, evaluerAbsence, MESSAGES_REFUS_ABSENCE,
  messageAbsenceSignaleePraticien, MESSAGE_ABSENCE_SIGNALEE_PRATICIEN_NEUTRE, urlNotificationAbsencePraticien,
} from './absenceSignalee.js';

const dossierApi = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('validerCorpsSeanceAbsence', () => {
  it('accepte { signale: true } et { signale: false }', () => {
    expect(validerCorpsSeanceAbsence({ signale: true })).toEqual({ ok: true, signale: true });
    expect(validerCorpsSeanceAbsence({ signale: false })).toEqual({ ok: true, signale: false });
  });

  it("refuse tout ce qui n'est pas exactement un booléen", () => {
    for (const signale of [null, undefined, '', 'true', 'false', 1, 0, {}, []]) {
      expect(validerCorpsSeanceAbsence({ signale }).ok, String(signale)).toBe(false);
    }
  });

  it('un corps absent ou malformé : refus, pas de plantage', () => {
    for (const body of [undefined, null, 'texte', 42, [], {}]) {
      expect(validerCorpsSeanceAbsence(body).ok, JSON.stringify(body)).toBe(false);
    }
  });

  it("ignore un seanceId fourni dans le corps : il n'existe pas dans le résultat — l'action ne porte jamais sur un id choisi par le client", () => {
    const r = validerCorpsSeanceAbsence({ signale: true, seanceId: 'autre', participantId: 'autre' });
    expect(r).toEqual({ ok: true, signale: true });
    expect(Object.keys(r).join()).not.toMatch(/seance|participant/i);
  });
});

describe('evaluerAbsence — « jusqu\'au début de la séance », aucune tolérance', () => {
  const seance = { statut: 'planifiee', date: '2026-07-15', heure_debut: '10:00' }; // début : 08:00Z

  it('avant le début : acceptée', () => {
    expect(evaluerAbsence(seance, new Date('2026-07-14T08:00:00Z'))).toEqual({ ok: true }); // la veille
    expect(evaluerAbsence(seance, new Date('2026-07-15T07:59:00Z'))).toEqual({ ok: true }); // 1 min avant
  });

  it('la borne exacte : une milliseconde avant OUI, à l\'instant du début NON', () => {
    expect(evaluerAbsence(seance, new Date('2026-07-15T07:59:59.999Z'))).toEqual({ ok: true });
    expect(evaluerAbsence(seance, new Date('2026-07-15T08:00:00.000Z'))).toEqual({ ok: false, refus: 'deja_commencee' });
  });

  it('après le début : refusée, quelle que soit la durée écoulée', () => {
    for (const t of ['2026-07-15T08:00:01Z', '2026-07-15T09:30:00Z', '2026-07-16T08:00:00Z', '2027-01-01T00:00:00Z']) {
      expect(evaluerAbsence(seance, new Date(t)), t).toEqual({ ok: false, refus: 'deja_commencee' });
    }
  });

  it('une séance déjà réalisée, annulée ou reportée refuse, même avant l\'heure', () => {
    const avant = new Date('2026-07-01T00:00:00Z');
    expect(evaluerAbsence({ ...seance, statut: 'realisee' }, avant)).toEqual({ ok: false, refus: 'seance_realisee' });
    expect(evaluerAbsence({ ...seance, statut: 'annulee' }, avant)).toEqual({ ok: false, refus: 'seance_annulee' });
    expect(evaluerAbsence({ ...seance, statut: 'reportee' }, avant)).toEqual({ ok: false, refus: 'seance_reportee' });
  });

  it('un statut inconnu ou une date corrompue : refus « invalide », pas de plantage', () => {
    const avant = new Date('2026-07-01T00:00:00Z');
    expect(evaluerAbsence({ ...seance, statut: 'autre' }, avant)).toEqual({ ok: false, refus: 'seance_invalide' });
    expect(evaluerAbsence({ ...seance, statut: undefined }, avant)).toEqual({ ok: false, refus: 'seance_invalide' });
    expect(evaluerAbsence({ ...seance, date: 'demain' }, avant)).toEqual({ ok: false, refus: 'seance_invalide' });
  });

  it('heure_debut inexploitable : signalement possible jusqu\'à 23h59 (Paris), pas après', () => {
    const s = { statut: 'planifiee', date: '2026-07-15', heure_debut: 'abc' };
    expect(evaluerAbsence(s, new Date('2026-07-15T21:58:59Z'))).toEqual({ ok: true }); // 23:58:59 Paris
    expect(evaluerAbsence(s, new Date('2026-07-15T21:59:00Z'))).toEqual({ ok: false, refus: 'deja_commencee' });
  });

  it('chaque refus a un message lisible par le bénéficiaire', () => {
    for (const refus of ['seance_realisee', 'seance_annulee', 'seance_reportee', 'seance_invalide', 'deja_commencee'] as const) {
      expect(MESSAGES_REFUS_ABSENCE[refus].length).toBeGreaterThan(10);
    }
  });
});

describe('messageAbsenceSignaleePraticien — prénom seul, repli neutre', () => {
  it('prénom et heure disponibles : « [Prénom] a signalé son absence pour sa séance de [heure] »', () => {
    expect(messageAbsenceSignaleePraticien({ prenom: 'Camille', heure_debut: '14:30:00' })).toEqual({
      titre: 'Horizon',
      corps: 'Camille a signalé son absence pour sa séance de 14h30',
    });
    expect(messageAbsenceSignaleePraticien({ prenom: '  Julien ', heure_debut: '09:05' }).corps)
      .toBe('Julien a signalé son absence pour sa séance de 9h05');
  });

  it('heure absente ou illisible : prénom conservé, « sa prochaine séance »', () => {
    for (const heure_debut of [null, undefined, '', '25:00', '9h05']) {
      expect(messageAbsenceSignaleePraticien({ prenom: 'Camille', heure_debut }).corps)
        .toBe('Camille a signalé son absence pour sa prochaine séance');
    }
  });

  it('prénom absent ou vide : repli neutre inchangé, jamais « undefined » ni « null »', () => {
    for (const prenom of [null, undefined, '', '   ', 42]) {
      const message = messageAbsenceSignaleePraticien({ prenom, heure_debut: '14:30' });
      expect(message).toEqual(MESSAGE_ABSENCE_SIGNALEE_PRATICIEN_NEUTRE);
      expect(message.corps).toBe('Un bénéficiaire a signalé une absence pour sa prochaine séance.');
    }
  });
});

describe('urlNotificationAbsencePraticien — agenda mobile sur le jour de la séance', () => {
  it('date AAAA-MM-JJ : /agenda?date=…', () => {
    expect(urlNotificationAbsencePraticien('2026-10-07')).toBe('/agenda?date=2026-10-07');
  });

  it('date illisible : /agenda seul (aujourd\'hui), comme avant', () => {
    for (const date of [null, undefined, '', '07/10/2026', 20261007]) {
      expect(urlNotificationAbsencePraticien(date)).toBe('/agenda');
    }
  });
});

describe('api/patient/activite.ts — action « seance-absence » (lecture de la source)', () => {
  // Les routes ne sont pas testées en exécution dans ce dépôt (service_role, Supabase) :
  // on verrouille ici les propriétés de sécurité qu'un remaniement pourrait casser sans
  // que rien ne le signale. Le comportement réel est éprouvé sur le Preview.
  const source = readFileSync(path.join(dossierApi, 'patient/activite.ts'), 'utf-8');
  const debut = source.indexOf('// ── seance-absence');
  const fin = source.indexOf('// ── exercice-libre');
  const bloc = debut >= 0 && fin > debut ? source.slice(debut, fin) : '';
  it('le bloc « seance-absence » est bien délimité dans la source', () => {
    expect(bloc.length).toBeGreaterThan(500);
  });

  it("le participant vient UNIQUEMENT du jeton : le corps n'est jamais lu pour l'identifier", () => {
    expect(source).toMatch(/verifyPatientToken\(token\)/);
    expect(bloc).not.toMatch(/body\.participant|participantId\s*=\s*body|\{[^}]*participantId[^}]*\}\s*=\s*body/);
  });

  it("aucun identifiant de séance n'est lu dans le corps de la requête — zéro surface IDOR sur cette action", () => {
    expect(bloc).not.toMatch(/body\.seanceId|seanceId\s*[,}]\s*=\s*(corps|body)/);
    expect(bloc).toMatch(/validerCorpsSeanceAbsence\(body\)/);
  });

  it("la séance est retrouvée par (participant DU JETON, statut planifiee), et l'écriture épingle encore le participant", () => {
    expect(bloc).toMatch(/\.eq\('participant_id', participantId\)\s*\n\s*\.eq\('statut', 'planifiee'\)/);
    expect(bloc).toMatch(/\.update\([\s\S]*?\)\s*\.eq\('id', seance\.id\)\s*\.eq\('participant_id', participantId\)/);
  });

  it("n'écrit jamais la colonne `statut` — seule absence_signalee_par_patient_le est modifiée", () => {
    expect(bloc).not.toMatch(/\.update\(\{[^}]*statut/);
    expect(bloc).toMatch(/absence_signalee_par_patient_le/);
  });

  it('aucune séance à venir répond 404, comme un cours introuvable', () => {
    expect(bloc).toMatch(/status\(404\)/);
  });

  it('applique le contrôle du délai, le réglage « rendez-vous », et le rate limit générique', () => {
    expect(bloc).toMatch(/evaluerAbsence\(/);
    expect(bloc).toMatch(/rendezVousVisibles\(/);
    expect(source).toMatch(/checkActiviteRateLimit\(supabase, participantId, type\)/);
    expect(source).toMatch(/recordActiviteAttempt\(supabase, participantId, type\)/);
  });

  it('alerte praticien : prénom seul lu sur le participant, jamais le nom — date et heure de la séance', () => {
    expect(bloc).toMatch(/\.select\('visibilite_beneficiaire, prenom'\)/);
    expect(bloc).not.toMatch(/participant\.nom\b/);
    expect(bloc).toMatch(/messageAbsenceSignaleePraticien\(\{ prenom: participant\.prenom, heure_debut: seance\.heure_debut \}\)/);
    expect(bloc).toMatch(/urlNotificationAbsencePraticien\(seance\.date\)/);
  });

  it('le calcul de « aujourd\'hui » est en Europe/Paris, jamais le fuseau du serveur', () => {
    expect(bloc).toMatch(/dateParisCivile\(new Date\(\)\)/);
  });
});
