// Génération mensuelle des brouillons de facture (api/_lib/facturationMensuelle.ts).
//
// Faux client Supabase : reproduit les filtres, la pagination et l'ordre des appels de la tâche
// (contrats facturables, factures déjà présentes, appel RPC par contrat, lecture des praticiens
// des brouillons créés). La preuve contre un vrai PostgREST et un vrai Postgres est dans
// tests/db/facturation-cron.spec.ts : ici on verrouille la logique de la tâche.
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  contratAFacturer,
  executerFacturationMensuelle,
  genererBrouillonsDuMois,
  libelleMois,
  messageFacturesAValider,
  premierJourMoisPrecedent,
  premierJourMoisSuivant,
  TAILLE_LOT,
  URL_NOTIFICATION_FACTURES_A_VALIDER,
  type ContratCandidat,
} from './facturationMensuelle.js';

afterEach(() => vi.restoreAllMocks());

// ── Faux client ───────────────────────────────────────────────────────────────────────────────

type Ligne = Record<string, unknown>;
interface Fixtures {
  contrats?: Ligne[];
  factures?: Ligne[];
  /** Réponse du RPC generer_brouillon_facture, par contrat. Par défaut : un nouvel identifiant. */
  rpc?: (args: { p_contrat_id: string; p_periode: string }) => Promise<{ data: unknown; error: { message: string } | null }>;
  erreurContrats?: string;
}

function fauxClient(fx: Fixtures) {
  const appelsRpc: { nom: string; args: { p_contrat_id: string; p_periode: string } }[] = [];
  let enCours = 0;
  let maxEnCours = 0;
  let compteur = 0;

  function constructeur(table: string) {
    const filtres: ((l: Ligne) => boolean)[] = [];
    let plage: [number, number] | null = null;
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.in = (col: string, valeurs: unknown[]) => (filtres.push(l => valeurs.includes(l[col])), b);
    b.eq = (col: string, v: unknown) => (filtres.push(l => l[col] === v), b);
    b.neq = (col: string, v: unknown) => (filtres.push(l => l[col] !== v), b);
    b.lt = (col: string, v: string) => (filtres.push(l => String(l[col]) < v), b);
    b.order = () => b;
    b.range = (de: number, a: number) => ((plage = [de, a]), b);
    b.then = (resolve: (v: unknown) => unknown) => {
      if (table === 'contrats' && fx.erreurContrats) return resolve({ data: null, error: { message: fx.erreurContrats } });
      const source = table === 'contrats' ? fx.contrats ?? [] : table === 'factures' ? fx.factures ?? [] : [];
      let lignes = source.filter(l => filtres.every(f => f(l)));
      if (plage) lignes = lignes.slice(plage[0], plage[1] + 1);
      return resolve({ data: lignes, error: null });
    };
    return b;
  }

  const client = {
    from: (table: string) => constructeur(table),
    rpc: async (nom: string, args: { p_contrat_id: string; p_periode: string }) => {
      appelsRpc.push({ nom, args });
      enCours++;
      maxEnCours = Math.max(maxEnCours, enCours);
      try {
        await Promise.resolve();
        if (fx.rpc) return await fx.rpc(args);
        compteur++;
        return { data: `facture-${compteur}`, error: null };
      } finally {
        enCours--;
      }
    },
  };
  return { client: client as unknown as SupabaseClient, appelsRpc, maxEnCours: () => maxEnCours };
}

function contrat(id: string, o: Partial<ContratCandidat> = {}): ContratCandidat & Ligne {
  return {
    id, praticien_id: 'pra-1', statut: 'actif', mode_facturation: 'seance',
    date_debut: '2026-01-01', date_fin: '2026-12-31', duree_indeterminee: false, ...o,
  };
}

const SEPT = '2026-09-01';

// ── Dates ─────────────────────────────────────────────────────────────────────────────────────

describe('mois facturé : toujours le mois qui vient de se terminer, en date civile Paris', () => {
  it('le 1er octobre, on facture septembre', () => {
    expect(premierJourMoisPrecedent(new Date('2026-10-01T05:15:00Z'))).toBe('2026-09-01');
  });
  it('le 1er janvier, on facture décembre de l\'année précédente', () => {
    expect(premierJourMoisPrecedent(new Date('2027-01-01T05:15:00Z'))).toBe('2026-12-01');
  });
  it('se règle sur la date de Paris, pas sur la date UTC', () => {
    // 22h30 UTC le 30 septembre = 00h30 le 1er octobre à Paris (heure d'été) : le mois écoulé est septembre.
    expect(premierJourMoisPrecedent(new Date('2026-09-30T22:30:00Z'))).toBe('2026-09-01');
  });
  it('mois suivant et libellé', () => {
    expect(premierJourMoisSuivant('2026-09-01')).toBe('2026-10-01');
    expect(premierJourMoisSuivant('2026-12-01')).toBe('2027-01-01');
    expect(libelleMois('2026-09-01')).toBe('septembre 2026');
    expect(libelleMois('2027-02-01')).toBe('février 2027');
  });
});

// ── Quels contrats ────────────────────────────────────────────────────────────────────────────

describe('contratAFacturer', () => {
  const fin = premierJourMoisSuivant(SEPT);
  it('facture un contrat actif qui recouvre le mois', () => {
    expect(contratAFacturer(contrat('c'), SEPT, fin)).toBe(true);
  });
  it('facture aussi un contrat TERMINÉ : le statut est posé à la main, sa dernière facture ne doit pas disparaître', () => {
    expect(contratAFacturer(contrat('c', { statut: 'termine', date_fin: '2026-09-18' }), SEPT, fin)).toBe(true);
  });
  it('ne facture pas un contrat à venir', () => {
    expect(contratAFacturer(contrat('c', { statut: 'a_venir' }), SEPT, fin)).toBe(false);
  });
  it('un forfait suspendu n\'est pas facturé, des séances réalisées avant la suspension le sont', () => {
    expect(contratAFacturer(contrat('c', { statut: 'suspendu', mode_facturation: 'forfait' }), SEPT, fin)).toBe(false);
    expect(contratAFacturer(contrat('c', { statut: 'suspendu', mode_facturation: 'seance' }), SEPT, fin)).toBe(true);
  });
  it('bornes de dates : fini la veille = non, fini le 1er = oui, commence le mois suivant = non', () => {
    expect(contratAFacturer(contrat('c', { date_fin: '2026-08-31' }), SEPT, fin)).toBe(false);
    expect(contratAFacturer(contrat('c', { date_fin: '2026-09-01' }), SEPT, fin)).toBe(true);
    expect(contratAFacturer(contrat('c', { date_debut: '2026-10-01' }), SEPT, fin)).toBe(false);
    expect(contratAFacturer(contrat('c', { date_debut: '2026-09-30' }), SEPT, fin)).toBe(true);
  });
  it('un contrat à durée indéterminée recouvre le mois quelle que soit sa date de fin enregistrée', () => {
    expect(contratAFacturer(contrat('c', { duree_indeterminee: true, date_fin: '2026-01-31' }), SEPT, fin)).toBe(true);
  });
});

// ── Génération ────────────────────────────────────────────────────────────────────────────────

describe('genererBrouillonsDuMois', () => {
  it('crée un brouillon par contrat avec des séances, en appelant le RPC avec les bons paramètres', async () => {
    const { client, appelsRpc } = fauxClient({
      contrats: [contrat('c1'), contrat('c2')],
      factures: [],
      rpc: async a => ({ data: `facture-de-${a.p_contrat_id}`, error: null }),
    });
    const bilan = await genererBrouillonsDuMois(client, SEPT, { envoyerAlerte: async () => ({ nbEnvoyes: 0, nbEchecs: 0 }) });
    expect(bilan).toMatchObject({ mois: '2026-09', contratsExamines: 2, dejaExistants: 0, sansSeance: 0, brouillonsCrees: 2, erreurs: [] });
    // Noms de paramètres du RPC (migration 20261006100400) : une faute ici ferait échouer tous les appels.
    expect(appelsRpc.map(a => a.nom)).toEqual(['generer_brouillon_facture', 'generer_brouillon_facture']);
    expect(appelsRpc.map(a => a.args).sort((x, y) => x.p_contrat_id.localeCompare(y.p_contrat_id)))
      .toEqual([{ p_contrat_id: 'c1', p_periode: SEPT }, { p_contrat_id: 'c2', p_periode: SEPT }]);
  });

  it('un contrat sans séance à facturer ne produit rien (le RPC renvoie NULL)', async () => {
    const { client } = fauxClient({
      contrats: [contrat('c1'), contrat('vide')],
      rpc: async a => ({ data: a.p_contrat_id === 'vide' ? null : 'facture-1', error: null }),
    });
    const bilan = await genererBrouillonsDuMois(client, SEPT, { envoyerAlerte: async () => ({ nbEnvoyes: 0, nbEchecs: 0 }) });
    expect(bilan).toMatchObject({ brouillonsCrees: 1, sansSeance: 1, erreurs: [] });
  });

  it('ne retouche jamais un contrat déjà facturé ce mois-là (brouillon ou émise) : aucun appel, rien à réécrire', async () => {
    const { client, appelsRpc } = fauxClient({
      contrats: [contrat('deja-brouillon'), contrat('deja-emise'), contrat('nouveau')],
      factures: [
        { id: 'f1', contrat_id: 'deja-brouillon', periode: SEPT, type: 'facture', statut: 'brouillon', praticien_id: 'pra-1' },
        { id: 'f2', contrat_id: 'deja-emise', periode: SEPT, type: 'facture', statut: 'validee', praticien_id: 'pra-1' },
      ],
    });
    const bilan = await genererBrouillonsDuMois(client, SEPT, { envoyerAlerte: async () => ({ nbEnvoyes: 0, nbEchecs: 0 }) });
    expect(appelsRpc.map(a => a.args.p_contrat_id)).toEqual(['nouveau']);
    expect(bilan).toMatchObject({ contratsExamines: 3, dejaExistants: 2, brouillonsCrees: 1 });
  });

  it('une facture ANNULÉE ou celle d\'un autre mois n\'empêche pas la génération', async () => {
    const { client, appelsRpc } = fauxClient({
      contrats: [contrat('c1'), contrat('c2')],
      factures: [
        { id: 'f1', contrat_id: 'c1', periode: SEPT, type: 'facture', statut: 'annulee', praticien_id: 'pra-1' },
        { id: 'f2', contrat_id: 'c2', periode: '2026-08-01', type: 'facture', statut: 'validee', praticien_id: 'pra-1' },
      ],
    });
    await genererBrouillonsDuMois(client, SEPT, { envoyerAlerte: async () => ({ nbEnvoyes: 0, nbEchecs: 0 }) });
    expect(appelsRpc.map(a => a.args.p_contrat_id).sort()).toEqual(['c1', 'c2']);
  });

  it('relancer la génération ne crée, ne réécrit et ne notifie rien', async () => {
    const factures: Ligne[] = [];
    const alerte = vi.fn(async () => ({ nbEnvoyes: 1, nbEchecs: 0 }));
    const { client, appelsRpc } = fauxClient({
      contrats: [contrat('c1'), contrat('c2')],
      factures,
      rpc: async a => {
        const id = `facture-${a.p_contrat_id}`;
        factures.push({ id, contrat_id: a.p_contrat_id, periode: a.p_periode, type: 'facture', statut: 'brouillon', praticien_id: 'pra-1' });
        return { data: id, error: null };
      },
    });
    const premier = await genererBrouillonsDuMois(client, SEPT, { envoyerAlerte: alerte });
    expect(premier.brouillonsCrees).toBe(2);
    expect(alerte).toHaveBeenCalledTimes(1);

    const second = await genererBrouillonsDuMois(client, SEPT, { envoyerAlerte: alerte });
    expect(second).toMatchObject({ brouillonsCrees: 0, dejaExistants: 2, erreurs: [] });
    expect(appelsRpc).toHaveLength(2);            // aucun appel de plus
    expect(alerte).toHaveBeenCalledTimes(1);      // aucune notification de plus
  });

  it('l\'échec d\'un contrat (rejet ou erreur SQL) n\'empêche pas les autres, et reste visible dans le bilan', async () => {
    const { client } = fauxClient({
      contrats: [contrat('ok-1'), contrat('sans-tarif'), contrat('plante'), contrat('ok-2')],
      rpc: async a => {
        if (a.p_contrat_id === 'sans-tarif') return { data: null, error: { message: 'Aucun tarif applicable pour la ou les séances du 10/09/2026 : créer une version de tarif' } };
        if (a.p_contrat_id === 'plante') throw new Error('connexion perdue');
        return { data: `facture-${a.p_contrat_id}`, error: null };
      },
    });
    const bilan = await genererBrouillonsDuMois(client, SEPT, { envoyerAlerte: async () => ({ nbEnvoyes: 0, nbEchecs: 0 }) });
    expect(bilan.brouillonsCrees).toBe(2);
    expect(bilan.erreurs).toEqual([
      { contratId: 'sans-tarif', erreur: expect.stringContaining('Aucun tarif applicable') },
      { contratId: 'plante', erreur: 'connexion perdue' },
    ]);
  });

  it('traite les contrats par lots bornés (jamais plus de TAILLE_LOT appels simultanés) sans en oublier', async () => {
    const contrats = Array.from({ length: 23 }, (_, i) => contrat(`c${String(i).padStart(2, '0')}`));
    const { client, appelsRpc, maxEnCours } = fauxClient({ contrats });
    const bilan = await genererBrouillonsDuMois(client, SEPT, { envoyerAlerte: async () => ({ nbEnvoyes: 0, nbEchecs: 0 }) });
    expect(appelsRpc).toHaveLength(23);
    expect(bilan.brouillonsCrees).toBe(23);
    expect(maxEnCours()).toBeLessThanOrEqual(TAILLE_LOT);
    expect(maxEnCours()).toBeGreaterThan(1);
  });

  it('lit toutes les pages de contrats (plafond PostgREST de 1000 lignes par réponse)', async () => {
    const contrats = Array.from({ length: 1503 }, (_, i) => contrat(`c${String(i).padStart(4, '0')}`));
    const { client, appelsRpc } = fauxClient({ contrats });
    const bilan = await genererBrouillonsDuMois(client, SEPT, { envoyerAlerte: async () => ({ nbEnvoyes: 0, nbEchecs: 0 }) });
    expect(bilan.contratsExamines).toBe(1503);
    expect(appelsRpc).toHaveLength(1503);
  });

  it('écarte les contrats hors période ou non facturables avant tout appel', async () => {
    const { client, appelsRpc } = fauxClient({
      contrats: [
        contrat('actif'),
        contrat('a-venir', { statut: 'a_venir' }),
        contrat('fini-en-aout', { date_fin: '2026-08-31' }),
        contrat('forfait-suspendu', { statut: 'suspendu', mode_facturation: 'forfait' }),
        contrat('commence-en-octobre', { date_debut: '2026-10-01' }),
      ],
    });
    const bilan = await genererBrouillonsDuMois(client, SEPT, { envoyerAlerte: async () => ({ nbEnvoyes: 0, nbEchecs: 0 }) });
    expect(appelsRpc.map(a => a.args.p_contrat_id)).toEqual(['actif']);
    expect(bilan.contratsExamines).toBe(1);
  });

  it('lève si la liste des contrats est illisible (rien d\'autre à faire) sans rien créer', async () => {
    const { client, appelsRpc } = fauxClient({ erreurContrats: 'permission denied' });
    await expect(genererBrouillonsDuMois(client, SEPT)).rejects.toThrow('permission denied');
    expect(appelsRpc).toHaveLength(0);
  });
});

// ── Notification ──────────────────────────────────────────────────────────────────────────────

describe('notification du praticien', () => {
  function jeu() {
    const factures: Ligne[] = [];
    const praticienDe: Record<string, string> = { a1: 'pra-A', a2: 'pra-A', a3: 'pra-A', b1: 'pra-B' };
    const fx = fauxClient({
      contrats: ['a1', 'a2', 'a3', 'b1'].map(id => ({ ...contrat(id, { praticien_id: praticienDe[id] }) })),
      factures,
      rpc: async a => {
        const id = `facture-${a.p_contrat_id}`;
        factures.push({ id, contrat_id: a.p_contrat_id, periode: a.p_periode, type: 'facture', statut: 'brouillon', praticien_id: praticienDe[a.p_contrat_id] });
        return { data: id, error: null };
      },
    });
    return fx;
  }

  it('envoie UN push par praticien, avec le nombre de brouillons créés pour lui et le lien de l\'écran', async () => {
    const { client } = jeu();
    const alerte = vi.fn(async () => ({ nbEnvoyes: 2, nbEchecs: 0 }));
    const bilan = await genererBrouillonsDuMois(client, SEPT, { envoyerAlerte: alerte });
    expect(alerte).toHaveBeenCalledTimes(2);
    const parPraticien = Object.fromEntries(alerte.mock.calls.map((c: any[]) => [c[1], c[2]]));
    expect(parPraticien['pra-A']).toEqual({ titre: 'Horizon', corps: '3 factures à valider pour septembre 2026', url: URL_NOTIFICATION_FACTURES_A_VALIDER, tag: 'factures-a-valider-2026-09' });
    expect(parPraticien['pra-B'].corps).toBe('1 facture à valider pour septembre 2026');   // singulier
    expect(bilan.notifications).toEqual({ praticiens: 2, envoyes: 4, echecs: 0 });
  });

  it('ne notifie personne quand rien n\'a été créé', async () => {
    const { client } = fauxClient({ contrats: [contrat('c1')], rpc: async () => ({ data: null, error: null }) });
    const alerte = vi.fn(async () => ({ nbEnvoyes: 1, nbEchecs: 0 }));
    const bilan = await genererBrouillonsDuMois(client, SEPT, { envoyerAlerte: alerte });
    expect(alerte).not.toHaveBeenCalled();
    expect(bilan.notifications).toEqual({ praticiens: 0, envoyes: 0, echecs: 0 });
  });

  it('un échec d\'envoi n\'invalide ni les brouillons créés ni les notifications des autres praticiens', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = jeu();
    const alerte = vi.fn(async (_c: unknown, praticienId: string) => {
      if (praticienId === 'pra-A') throw new Error('push indisponible');
      return { nbEnvoyes: 1, nbEchecs: 0 };
    });
    const bilan = await genererBrouillonsDuMois(client, SEPT, { envoyerAlerte: alerte });
    expect(bilan.brouillonsCrees).toBe(4);
    expect(alerte).toHaveBeenCalledTimes(2);
    expect(bilan.notifications).toEqual({ praticiens: 2, envoyes: 1, echecs: 1 });
  });

  it('le message ne contient que un nombre et un mois : aucune donnée de santé', () => {
    const m = messageFacturesAValider(3, SEPT);
    expect(JSON.stringify(m)).not.toMatch(/\d{2}\/\d{2}\/\d{4}|€|bénéficiaire|séance/i);
    expect(m.url).toBe('/factures/a-valider');
  });
});

// ── Journalisation ────────────────────────────────────────────────────────────────────────────

describe('executerFacturationMensuelle : bilan journalisé', () => {
  it('journalise une ligne JSON exploitable et une ligne par contrat en échec, sans nom de bénéficiaire', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client, appelsRpc } = fauxClient({
      contrats: [contrat('c1'), contrat('c2')],
      rpc: async a => (a.p_contrat_id === 'c2'
        ? { data: null, error: { message: 'Aucun tarif applicable pour la ou les séances du 10/09/2026' } }
        : { data: 'facture-1', error: null }),
    });
    const bilan = await executerFacturationMensuelle(client, new Date('2026-10-01T05:15:00Z'), { envoyerAlerte: async () => ({ nbEnvoyes: 0, nbEchecs: 0 }) });
    expect(appelsRpc.every(a => a.args.p_periode === '2026-09-01')).toBe(true);   // mois ÉCOULÉ, pas le mois en cours
    expect(bilan.mois).toBe('2026-09');

    const lignes = log.mock.calls.map(c => String(c[0]));
    expect(lignes).toHaveLength(1);
    expect(lignes[0].startsWith('[facturation] ')).toBe(true);
    expect(JSON.parse(lignes[0].slice('[facturation] '.length))).toMatchObject({ mois: '2026-09', brouillonsCrees: 1, erreurs: [{ contratId: 'c2' }] });
    expect(err.mock.calls.map(c => String(c[0]))).toEqual([expect.stringContaining('[facturation] contrat c2 :')]);
  });
});
