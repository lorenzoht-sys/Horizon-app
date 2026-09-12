import { describe, it, expect, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, format } from 'date-fns';
import {
  MARGE_RENOUVELLEMENT_JOURS,
  calculerNouvelleDateFin,
  calculerDebutGeneration,
  calculerSeancesARenouveler,
  chargerContratsEligibles,
  renouvelerUnContrat,
  renouvelerContratsEligibles,
  type ContratEligible,
} from './renouvellementContrats.js';

// Le cron tourne sur Vercel (Node en UTC) — on fixe le fuseau du test pour
// refléter ça, indépendamment du fuseau de la machine qui exécute la suite.
// Sans ça, un range d'un an (le cas normal ici, +1 an à chaque renouvellement)
// traverse forcément un changement d'heure DST : genererDatesSeances
// (src/utils/horaires.ts) compare current.getDay() (lu en heure LOCALE) à
// dateStr (dérivé de .toISOString(), en UTC) — sur un poste réglé sur un
// fuseau à décalage positif observant le DST (ex: Europe/Paris), ces deux
// horloges se désynchronisent pendant la période d'heure d'été et
// génère des dates dont l'étiquette (le jour du mois) ne correspond plus au
// jour de la semaine testé. Bug préexistant dans horaires.ts, sans impact en
// production (le cron tourne en UTC sur Vercel) mais qui affecte
// potentiellement la génération manuelle (PlanningGrilleView / ModalInsererPatient,
// exécutée dans le navigateur de Pierre, donc dans SON fuseau) — hors
// périmètre de cette tâche, signalé séparément plutôt que corrigé ici.
beforeAll(() => {
  process.env.TZ = 'UTC';
});

// ── Faux client Supabase en mémoire ─────────────────────────────────────────
// Simule juste assez de l'API supabase-js pour ce module : select/eq/neq/lte
// (lecture filtrée), insert (ajoute des lignes), update+eq (modifie les
// lignes correspondantes). Les tables sont de simples tableaux mutables —
// ce qui permet de vérifier l'idempotence en relisant l'état après coup.
type Table = 'contrats' | 'seances' | 'participants';
type Row = Record<string, unknown>;
type Filtre = { field: string; kind: 'eq' | 'neq' | 'lte'; value: unknown };

function creerSupabaseFake(initial: { contrats?: Row[]; seances?: Row[]; participants?: Row[] }) {
  const store: Record<Table, Row[]> = {
    contrats: (initial.contrats ?? []).map(r => ({ ...r })),
    seances: (initial.seances ?? []).map(r => ({ ...r })),
    participants: (initial.participants ?? []).map(r => ({ ...r })),
  };

  function matches(row: Row, filtres: Filtre[]) {
    return filtres.every(f => {
      if (f.kind === 'eq') return row[f.field] === f.value;
      if (f.kind === 'neq') return row[f.field] !== f.value;
      if (f.kind === 'lte') return (row[f.field] as string) <= (f.value as string);
      return true;
    });
  }

  function from(table: Table) {
    const filtres: Filtre[] = [];
    let mode: 'select' | 'insert' | 'update' = 'select';
    let insertRows: Row[] = [];
    let updatePatch: Row = {};

    const builder = {
      select() { mode = 'select'; return builder; },
      eq(field: string, value: unknown) { filtres.push({ field, kind: 'eq', value }); return builder; },
      neq(field: string, value: unknown) { filtres.push({ field, kind: 'neq', value }); return builder; },
      lte(field: string, value: unknown) { filtres.push({ field, kind: 'lte', value }); return builder; },
      insert(rows: Row[]) { mode = 'insert'; insertRows = rows; return builder; },
      update(patch: Row) { mode = 'update'; updatePatch = patch; return builder; },
      then(resolve: (v: { data: Row[]; error: null } | { error: null }) => void) {
        if (mode === 'select') {
          resolve({ data: store[table].filter(r => matches(r, filtres)), error: null });
        } else if (mode === 'insert') {
          for (const row of insertRows) {
            store[table].push({ id: `gen-${store[table].length}-${Math.random().toString(36).slice(2)}`, ...row });
          }
          resolve({ error: null });
        } else if (mode === 'update') {
          for (const row of store[table]) {
            if (matches(row, filtres)) Object.assign(row, updatePatch);
          }
          resolve({ error: null });
        }
      },
    };
    return builder;
  }

  return { client: { from } as unknown as SupabaseClient, store };
}

function contrat(overrides: Partial<ContratEligible & { duree_indeterminee: boolean; statut: string }> = {}) {
  return {
    id: 'contrat-1',
    participant_id: 'participant-1',
    praticien_id: 'praticien-1',
    date_debut: '2025-01-05',
    date_fin: '2026-01-05',
    periodicite: 'semaine',
    jours_fixe: ['lun', 'mer', 'ven'],
    nb_seances_semaine: 3,
    durees_seances: [45, 45, 60],
    heure_debut: '09:00',
    duree_indeterminee: true,
    statut: 'actif',
    ...overrides,
  };
}

function participant(overrides: Row = {}) {
  return {
    id: 'participant-1',
    adresse_rue: '12 rue des Lilas',
    adresse_code_postal: '75011',
    adresse_ville: 'Paris',
    coordonnees_lat: 48.86,
    coordonnees_lng: 2.35,
    ...overrides,
  };
}

describe('calculerNouvelleDateFin', () => {
  it('prolonge d\'exactement un an, même jour et mois', () => {
    expect(calculerNouvelleDateFin('2026-01-05')).toBe('2027-01-05');
  });
});

describe('calculerDebutGeneration', () => {
  it('reprend le lendemain de l\'ancienne date_fin quand elle est future', () => {
    expect(calculerDebutGeneration('2026-09-20', '2026-09-11')).toBe('2026-09-21');
  });

  it('ne remonte jamais avant aujourd\'hui pour un contrat déjà expiré (remédiation)', () => {
    expect(calculerDebutGeneration('2026-03-01', '2026-09-11')).toBe('2026-09-11');
  });
});

describe('calculerSeancesARenouveler (pure, dérivée uniquement du motif déclaré)', () => {
  const base = {
    debutGeneration: '2026-01-06',
    finGeneration: '2026-01-31',
    dateAncrage: '2025-01-05',
    periodicite: 'semaine' as const,
    heureDebut: '09:00',
    participantId: 'participant-1',
    praticienId: 'praticien-1',
    contratId: 'contrat-1',
    adresse: '12 rue des Lilas, 75011, Paris',
    coordonnees: { lat: 48.86, lng: 2.35 },
  };

  it('génère une occurrence par jour déclaré, avec la durée correspondante dans l\'ordre chronologique', () => {
    const nouvelles = calculerSeancesARenouveler({
      ...base,
      datesCouvertes: [],
      joursFixe: ['ven', 'lun'], // ordre de saisie quelconque
      dureesSeances: [45, 60], // 45 = lundi (1er de la semaine), 60 = vendredi
    });
    const lundis = nouvelles.filter(s => new Date(s.date + 'T12:00').getDay() === 1);
    const vendredis = nouvelles.filter(s => new Date(s.date + 'T12:00').getDay() === 5);
    expect(lundis.every(s => s.duree_minutes === 45)).toBe(true);
    expect(vendredis.every(s => s.duree_minutes === 60)).toBe(true);
    expect(nouvelles.every(s => s.heure_debut === '09:00' && s.adresse === base.adresse)).toBe(true);
  });

  it('ne génère rien si aucun jour n\'est déclaré (cas normalement intercepté avant appel par renouvelerUnContrat)', () => {
    expect(calculerSeancesARenouveler({ ...base, datesCouvertes: [], joursFixe: [], dureesSeances: [45] })).toEqual([]);
  });

  it('exclut les dates déjà couvertes (idempotence)', () => {
    const premier = calculerSeancesARenouveler({ ...base, datesCouvertes: [], joursFixe: ['lun'], dureesSeances: [45] });
    expect(premier.length).toBeGreaterThan(0);
    const deuxieme = calculerSeancesARenouveler({
      ...base,
      datesCouvertes: premier.map(s => s.date),
      joursFixe: ['lun'],
      dureesSeances: [45],
    });
    expect(deuxieme).toEqual([]);
  });
});

describe('renouvelerUnContrat (avec faux Supabase)', () => {
  it('étend date_fin et génère les séances d\'après jours_fixe/durees_seances/heure_debut du contrat', async () => {
    const { client, store } = creerSupabaseFake({ participants: [participant()] });
    const c = contrat({ date_fin: '2026-01-05' });

    const resultat = await renouvelerUnContrat(client, c, '2026-01-02');

    expect('erreur' in resultat || 'anomalie' in resultat).toBe(false);
    if (!('seancesCreees' in resultat)) throw new Error('résultat inattendu');
    expect(resultat.nouvelleDateFin).toBe('2027-01-05');
    expect(resultat.seancesCreees).toBeGreaterThan(0);

    const nouvelles = store.seances.filter(s => s.statut === 'planifiee');
    expect(nouvelles.length).toBe(resultat.seancesCreees);
    for (const s of nouvelles) {
      expect((s.date as string) > '2026-01-05').toBe(true);
      expect(s.heure_debut).toBe('09:00');
      expect(s.adresse).toBe('12 rue des Lilas, 75011, Paris');
    }
  });

  it('un historique récent divergent de nb_seances_semaine n\'influence pas la génération : le contrat fait foi', async () => {
    // Historique : seulement lundi et mercredi (2 séances/semaine), alors que
    // le contrat déclare 3 jours (lun, mer, ven). La génération doit suivre
    // les 3 jours du contrat, jamais se limiter aux 2 jours vus en historique.
    const { client, store } = creerSupabaseFake({
      participants: [participant()],
      seances: [
        { contrat_id: 'contrat-1', statut: 'realisee', date: '2025-12-01', heure_debut: '09:00', heure_fin: '09:45', duree_minutes: 45, type: 'seance', adresse: 'ancienne adresse jamais réutilisée' },
        { contrat_id: 'contrat-1', statut: 'realisee', date: '2025-12-03', heure_debut: '09:00', heure_fin: '09:45', duree_minutes: 45, type: 'seance', adresse: 'ancienne adresse jamais réutilisée' },
      ],
    });
    const c = contrat({ date_fin: '2026-01-05', jours_fixe: ['lun', 'mer', 'ven'], nb_seances_semaine: 3, durees_seances: [45, 45, 60] });

    const resultat = await renouvelerUnContrat(client, c, '2026-01-02');
    if (!('seancesCreees' in resultat)) throw new Error('résultat inattendu');

    const nouvelles = store.seances.filter(s => s.statut === 'planifiee');
    const joursVus = new Set(nouvelles.map(s => new Date((s.date as string) + 'T12:00').getDay()));
    // 1 = lundi, 3 = mercredi, 5 = vendredi : les 3 jours du CONTRAT doivent
    // apparaître, y compris vendredi qui n'existait jamais dans l'historique.
    expect(joursVus.has(1)).toBe(true);
    expect(joursVus.has(3)).toBe(true);
    expect(joursVus.has(5)).toBe(true);

    // L'adresse vient du participant ACTUEL, jamais de l'instantané historique.
    for (const s of nouvelles) expect(s.adresse).toBe('12 rue des Lilas, 75011, Paris');
  });

  it('sans aucune séance existante, génère quand même le motif déclaré (aucune dépendance à l\'historique)', async () => {
    const { client, store } = creerSupabaseFake({ participants: [participant()] });
    const c = contrat({ date_fin: '2026-01-05' });
    const resultat = await renouvelerUnContrat(client, c, '2026-01-02');
    if (!('seancesCreees' in resultat)) throw new Error('résultat inattendu');
    expect(resultat.seancesCreees).toBeGreaterThan(0);
    expect(store.seances.length).toBe(resultat.seancesCreees);
  });

  it('exécuté deux fois de suite (course cron/génération manuelle) ne crée aucun doublon', async () => {
    const { client, store } = creerSupabaseFake({ participants: [participant()] });
    const c = contrat({ date_fin: '2026-01-05' });

    const premier = await renouvelerUnContrat(client, c, '2026-01-02');
    const second = await renouvelerUnContrat(client, c, '2026-01-02');

    if (!('seancesCreees' in premier) || !('seancesCreees' in second)) throw new Error('résultat inattendu');
    expect(premier.seancesCreees).toBeGreaterThan(0);
    expect(second.seancesCreees).toBe(0);

    const dates = store.seances.map(s => s.date);
    expect(dates.length).toBe(new Set(dates).size);
  });

  it('contrat sans jours_fixe : ni renouvelé ni signalé en erreur — anomalie renvoyée, rien n\'est modifié', async () => {
    const c = contrat({ jours_fixe: [], date_fin: '2026-01-05' });
    const { client, store } = creerSupabaseFake({ participants: [participant()], contrats: [c] });

    const resultat = await renouvelerUnContrat(client, c, '2026-01-02');

    expect(resultat).toEqual({ contratId: 'contrat-1', anomalie: 'jours_fixe_manquant' });
    expect(store.seances.length).toBe(0);
    // date_fin inchangée en base : aucun update tenté, pas seulement "aucune ligne trouvée".
    expect(store.contrats.find(x => x.id === 'contrat-1')?.date_fin).toBe('2026-01-05');
  });

  it('contrat avec jours_fixe null (legacy, jamais complété) : même anomalie', async () => {
    const { client } = creerSupabaseFake({ participants: [participant()] });
    const c = contrat({ jours_fixe: null, date_fin: '2026-01-05' });
    const resultat = await renouvelerUnContrat(client, c, '2026-01-02');
    expect(resultat).toEqual({ contratId: 'contrat-1', anomalie: 'jours_fixe_manquant' });
  });
});

describe('chargerContratsEligibles / renouvelerContratsEligibles (avec faux Supabase)', () => {
  it('ne sélectionne que duree_indeterminee=true ET statut=actif ET date_fin <= seuil', async () => {
    const { client } = creerSupabaseFake({
      contrats: [
        contrat({ id: 'a', duree_indeterminee: true, statut: 'actif', date_fin: '2026-09-15' }),
        contrat({ id: 'b', duree_indeterminee: false, statut: 'actif', date_fin: '2026-09-15' }),
        contrat({ id: 'c', duree_indeterminee: true, statut: 'suspendu', date_fin: '2026-09-15' }),
        contrat({ id: 'd', duree_indeterminee: true, statut: 'actif', date_fin: '2027-06-01' }),
      ],
    });
    const eligibles = await chargerContratsEligibles(client, '2026-09-16');
    expect(eligibles.map(c => c.id)).toEqual(['a']);
  });

  it('exclut explicitement un contrat suspendu ET un contrat terminé, même à durée indéterminée et à échéance', async () => {
    const { client, store } = creerSupabaseFake({
      contrats: [
        contrat({ id: 'pause', duree_indeterminee: true, statut: 'suspendu', date_fin: '2026-03-01' }),
        contrat({ id: 'fini', duree_indeterminee: true, statut: 'termine', date_fin: '2026-03-01' }),
      ],
    });
    const seuil = format(addDays(new Date('2026-09-11'), -1), 'yyyy-MM-dd');
    const resultats = await renouvelerContratsEligibles(client, seuil, '2026-09-11');
    expect(resultats).toEqual([]);
    expect(store.contrats.find(c => c.id === 'pause')?.date_fin).toBe('2026-03-01');
    expect(store.contrats.find(c => c.id === 'fini')?.date_fin).toBe('2026-03-01');
  });

  it('un contrat non-indéterminé n\'est jamais touché, même déjà expiré', async () => {
    const { client, store } = creerSupabaseFake({
      contrats: [contrat({ id: 'normal', duree_indeterminee: false, date_fin: '2026-01-01' })],
    });
    const seuil = format(addDays(new Date('2026-09-11'), -1), 'yyyy-MM-dd');
    const resultats = await renouvelerContratsEligibles(client, seuil, '2026-09-11');
    expect(resultats).toEqual([]);
    expect(store.contrats[0].date_fin).toBe('2026-01-01');
  });

  it('un contrat déjà expiré au moment du déploiement est remis en état (remédiation)', async () => {
    const { client, store } = creerSupabaseFake({
      contrats: [contrat({ id: 'expire', date_fin: '2026-03-01' })],
      participants: [participant()],
    });
    const aujourdhui = '2026-09-11';
    const seuilDejaExpire = format(addDays(new Date(aujourdhui), -1), 'yyyy-MM-dd');

    const resultats = await renouvelerContratsEligibles(client, seuilDejaExpire, aujourdhui);

    expect(resultats.length).toBe(1);
    const [r] = resultats;
    if (!('seancesCreees' in r)) throw new Error('résultat inattendu');
    expect(r.nouvelleDateFin).toBe('2027-03-01');

    const contratMisAJour = store.contrats.find(c => c.id === 'expire');
    expect(contratMisAJour?.date_fin).toBe('2027-03-01');

    const nouvelles = store.seances.filter(s => s.statut === 'planifiee');
    for (const s of nouvelles) expect((s.date as string) >= aujourdhui).toBe(true);
  });

  it('le cron marge-based sélectionne un contrat qui expire bientôt, pas seulement les déjà-expirés', async () => {
    const { client } = creerSupabaseFake({
      contrats: [contrat({ id: 'bientot', date_fin: '2026-09-14' })],
      participants: [participant()],
    });
    const aujourdhui = '2026-09-11';
    const seuil = format(addDays(new Date(aujourdhui), MARGE_RENOUVELLEMENT_JOURS), 'yyyy-MM-dd');
    const resultats = await renouvelerContratsEligibles(client, seuil, aujourdhui);
    expect(resultats.length).toBe(1);
  });
});
