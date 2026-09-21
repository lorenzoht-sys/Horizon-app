import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import {
  validerCorpsCoursPresence, evaluerReponse, instantDebutCours, rendezVousVisibles, reponseValide, MESSAGES_REFUS,
} from './presenceAnnoncee.js';

const dossierApi = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UUID_OK = '3f2b8a0e-5c1d-4e7a-9b6f-0a1b2c3d4e5f';

describe('validerCorpsCoursPresence', () => {
  it('accepte « vient » et « ne_vient_pas »', () => {
    for (const reponse of ['vient', 'ne_vient_pas']) {
      expect(validerCorpsCoursPresence({ coursId: UUID_OK, reponse })).toEqual({ ok: true, coursId: UUID_OK, reponse });
    }
  });

  it("refuse tout ce qui n'est pas exactement l'une des deux réponses — dont le retour à « sans réponse »", () => {
    for (const reponse of [null, undefined, '', 'peut-etre', 'VIENT', 'Vient', 'oui', 0, true, {}, ['vient']]) {
      expect(validerCorpsCoursPresence({ coursId: UUID_OK, reponse }).ok, String(reponse)).toBe(false);
    }
  });

  it("refuse un coursId qui n'est pas un UUID (il ne doit jamais partir vers PostgREST)", () => {
    for (const coursId of [undefined, null, '', 'abc', '123', UUID_OK + 'x', "x' or '1'='1", '../etc', 42, {}]) {
      expect(validerCorpsCoursPresence({ coursId, reponse: 'vient' }).ok, String(coursId)).toBe(false);
    }
  });

  it('un corps absent ou malformé : refus, pas de plantage', () => {
    for (const body of [undefined, null, 'texte', 42, [], {}]) {
      expect(validerCorpsCoursPresence(body).ok, JSON.stringify(body)).toBe(false);
    }
  });

  it("ignore un participant fourni dans le corps : il n'existe pas dans le résultat", () => {
    const r = validerCorpsCoursPresence({ coursId: UUID_OK, reponse: 'vient', participantId: 'autre', participant_id: 'autre' });
    expect(r).toEqual({ ok: true, coursId: UUID_OK, reponse: 'vient' });
    expect(Object.keys(r).join()).not.toMatch(/participant/i);
  });
});

describe('reponseValide', () => {
  it('lit une valeur de la base : la réponse, ou null (= pas de réponse)', () => {
    expect(reponseValide('vient')).toBe('vient');
    expect(reponseValide('ne_vient_pas')).toBe('ne_vient_pas');
    expect(reponseValide(null)).toBeNull();
    expect(reponseValide(undefined)).toBeNull();
    expect(reponseValide('n_importe_quoi')).toBeNull();
  });
});

describe('instantDebutCours — heure civile Europe/Paris', () => {
  it('hiver (CET, UTC+1) et été (CEST, UTC+2)', () => {
    expect(instantDebutCours('2026-01-15', '10:00')?.toISOString()).toBe('2026-01-15T09:00:00.000Z');
    expect(instantDebutCours('2026-07-15', '10:00')?.toISOString()).toBe('2026-07-15T08:00:00.000Z');
  });

  it("les deux jours de changement d'heure, pour un cours à 10h (mesuré, pas supposé)", () => {
    // 29 mars 2026 : passage à l'heure d'été (le saut a lieu à 2h) -> 10h Paris = 08:00Z
    expect(instantDebutCours('2026-03-29', '10:00')?.toISOString()).toBe('2026-03-29T08:00:00.000Z');
    // 25 octobre 2026 : passage à l'heure d'hiver -> 10h Paris = 09:00Z
    expect(instantDebutCours('2026-10-25', '10:00')?.toISOString()).toBe('2026-10-25T09:00:00.000Z');
  });

  it('accepte HH:MM:SS', () => {
    expect(instantDebutCours('2026-07-15', '10:00:00')?.toISOString()).toBe('2026-07-15T08:00:00.000Z');
  });

  // dateHeureParisVersUTC LÈVE une RangeError sur une heure malformée (mesuré) :
  // sans garde, une ligne mal saisie ferait crasher la route en 500.
  it("heure inexploitable : ne plante pas, et la réponse reste ouverte jusqu'à 23h59 ce jour-là", () => {
    for (const heure of ['abc', '', '25:00', '10h30', '10:60', null, undefined, 1030]) {
      const instant = instantDebutCours('2026-07-15', heure);
      expect(instant?.toISOString(), String(heure)).toBe('2026-07-15T21:59:00.000Z'); // 23:59 CEST
    }
  });

  it('date inexploitable : null', () => {
    for (const date of ['', 'demain', '2026-7-15', '15/07/2026', null, undefined, 20260715]) {
      expect(instantDebutCours(date, '10:00'), String(date)).toBeNull();
    }
  });
});

describe('evaluerReponse — « jusqu\'au début du cours », aucune tolérance', () => {
  const cours = { statut: 'planifie', date: '2026-07-15', heure_debut: '10:00' }; // début : 08:00Z

  it('avant le début : acceptée', () => {
    expect(evaluerReponse(cours, new Date('2026-07-14T08:00:00Z'))).toEqual({ ok: true }); // la veille
    expect(evaluerReponse(cours, new Date('2026-07-15T07:59:00Z'))).toEqual({ ok: true }); // 1 min avant
  });

  it('la borne exacte : une milliseconde avant OUI, à l\'instant du début NON', () => {
    expect(evaluerReponse(cours, new Date('2026-07-15T07:59:59.999Z'))).toEqual({ ok: true });
    expect(evaluerReponse(cours, new Date('2026-07-15T08:00:00.000Z'))).toEqual({ ok: false, refus: 'deja_commence' });
  });

  it('après le début : refusée, quelle que soit la durée écoulée', () => {
    for (const t of ['2026-07-15T08:00:01Z', '2026-07-15T09:30:00Z', '2026-07-16T08:00:00Z', '2027-01-01T00:00:00Z']) {
      expect(evaluerReponse(cours, new Date(t)), t).toEqual({ ok: false, refus: 'deja_commence' });
    }
  });

  it('un cours annulé ou réalisé refuse, même avant l\'heure', () => {
    const avant = new Date('2026-07-01T00:00:00Z');
    expect(evaluerReponse({ ...cours, statut: 'annule' }, avant)).toEqual({ ok: false, refus: 'cours_annule' });
    expect(evaluerReponse({ ...cours, statut: 'realise' }, avant)).toEqual({ ok: false, refus: 'cours_realise' });
  });

  it('un statut inconnu ou une date corrompue : refus « invalide », pas de plantage', () => {
    const avant = new Date('2026-07-01T00:00:00Z');
    expect(evaluerReponse({ ...cours, statut: 'autre' }, avant)).toEqual({ ok: false, refus: 'cours_invalide' });
    expect(evaluerReponse({ ...cours, statut: undefined }, avant)).toEqual({ ok: false, refus: 'cours_invalide' });
    expect(evaluerReponse({ ...cours, date: 'demain' }, avant)).toEqual({ ok: false, refus: 'cours_invalide' });
  });

  it('heure_debut inexploitable : réponse possible jusqu\'à 23h59 (Paris), pas après', () => {
    const c = { statut: 'planifie', date: '2026-07-15', heure_debut: 'abc' };
    expect(evaluerReponse(c, new Date('2026-07-15T21:58:59Z'))).toEqual({ ok: true }); // 23:58:59 Paris
    expect(evaluerReponse(c, new Date('2026-07-15T21:59:00Z'))).toEqual({ ok: false, refus: 'deja_commence' });
  });

  it('chaque refus a un message lisible par le bénéficiaire', () => {
    for (const refus of ['cours_annule', 'cours_realise', 'deja_commence', 'cours_invalide'] as const) {
      expect(MESSAGES_REFUS[refus].length).toBeGreaterThan(10);
    }
  });
});

describe('rendezVousVisibles — même règle que api/patient/me.ts', () => {
  it('visible par défaut : rien de renseigné, ou réglage absent', () => {
    for (const v of [undefined, null, {}, { bilans: false }, { rdv: true }]) {
      expect(rendezVousVisibles(v), JSON.stringify(v)).toBe(true);
    }
  });

  it('masqué dès que le réglage est faux — y compris null, comme dans me.ts', () => {
    for (const v of [{ rdv: false }, { rdv: null }, { rdv: 0 }, { rdv: '' }]) {
      expect(rendezVousVisibles(v), JSON.stringify(v)).toBe(false);
    }
  });

  it('un réglage mal formé ne masque pas par accident', () => {
    for (const v of ['texte', 42, true, []]) {
      expect(rendezVousVisibles(v), JSON.stringify(v)).toBe(true);
    }
  });
});

describe('api/patient/activite.ts — action « cours-presence » (lecture de la source)', () => {
  // Les routes ne sont pas testées en exécution dans ce dépôt (service_role, Supabase) :
  // on verrouille ici les propriétés de sécurité qu'un remaniement pourrait casser sans
  // que rien ne le signale. Le comportement réel est éprouvé sur le Preview.
  const source = readFileSync(path.join(dossierApi, 'patient/activite.ts'), 'utf-8');
  const debut = source.indexOf('// ── cours-presence');
  const fin = source.indexOf('// ── exercice-libre');
  const bloc = debut >= 0 && fin > debut ? source.slice(debut, fin) : '';
  it('le bloc « cours-presence » est bien délimité dans la source', () => {
    expect(bloc.length).toBeGreaterThan(500);
  });

  it("le participant vient UNIQUEMENT du jeton : le corps n'est jamais lu pour l'identifier", () => {
    expect(source).toMatch(/verifyPatientToken\(token\)/);
    expect(bloc).not.toMatch(/body\.participant|participantId\s*=\s*body|\{[^}]*participantId[^}]*\}\s*=\s*body/);
  });

  it("la participation est retrouvée par (cours, participant DU JETON), et l'écriture épingle encore le participant", () => {
    expect(bloc).toMatch(/\.eq\('cours_id', coursId\)\s*\.eq\('participant_id', participantId\)/);
    expect(bloc).toMatch(/\.update\([\s\S]*?\)\s*\.eq\('id', [^)]+\)\s*\.eq\('participant_id', participantId\)/);
  });

  it("un cours inconnu ou auquel on n'est pas inscrit répond 404 (pas 403 : pas d'oracle d'existence)", () => {
    expect(bloc).toMatch(/status\(404\)/);
    expect(bloc).not.toMatch(/status\(403\)/);
  });

  it('applique le contrôle du délai et le réglage « rendez-vous »', () => {
    expect(bloc).toMatch(/evaluerReponse\(/);
    expect(bloc).toMatch(/rendezVousVisibles\(/);
  });
});
