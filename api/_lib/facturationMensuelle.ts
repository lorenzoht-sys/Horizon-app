// api/_lib/facturationMensuelle.ts
//
// Génération et finalisation des brouillons de facture du mois ÉCOULÉ, greffées sur le point d'entrée
// cron unique (api/cron/rappels.ts) : le plan Vercel plafonne le nombre de fonctions, aucune
// route n'est ajoutée. Déclenchée une fois par jour (voir doitGenererFacturationMaintenant,
// api/_lib/cronTaches.ts) : chaque passage ne traite que le mois précédent, donc un cron manqué le
// 1er est rattrapé le lendemain sans doublon (décision du 2026-10-05).
//
// ── Facture progressive (2026-10-09) ────────────────────────────────────────────────────────
// Le brouillon se construit désormais AU FIL DES SÉANCES : un trigger de base (migration
// 20261011100000, seances_recalcul_brouillon) rappelle generer_brouillon_facture dès qu'une séance
// entre dans « réalisée », en sort ou change. Au 1er du mois, la plupart des brouillons existent donc
// déjà. Ce cron est le filet de sécurité de ce trigger, qui avale ses erreurs (une séance sans tarif
// ne doit pas bloquer l'agenda) :
//   - il CRÉE les brouillons qui manquent (comportement d'origine) ;
//   - il RECALCULE les brouillons existants du mois écoulé, pour que celui que le praticien va
//     valider reflète exactement les séances d'aujourd'hui, même si le trigger a échoué ou si une
//     séance a été ajoutée par un chemin qui l'aurait contourné ;
//   - il n'écrase JAMAIS une facture émise.
// Le brouillon est le reflet automatique des séances : un recalcul reconstruit ses lignes. On le
// corrige en éditant la séance ou le tarif, jamais la facture (décision du 2026-10-09).
//
// Notifications : « N factures à valider » part pour les brouillons CRÉÉS par cette exécution et,
// le 1er du mois seulement (jour où le mois devient validable), pour tous les brouillons du mois
// écoulé. Les jours suivants, un recalcul ne notifie pas : sinon le même push reviendrait chaque
// jour jusqu'à la validation. Si le cron saute le 1er, les brouillons existants ne sont pas notifiés
// (ceux qui manquaient le sont) : l'écran « Factures à valider » reste la source de vérité.
// Conséquences assumées : un brouillon supprimé ou annulé par le praticien est régénéré au passage
// suivant ; un contrat dont une séance n'a pas de tarif reste en erreur (et journalisé) chaque jour
// jusqu'à correction.
//
// Pour chaque contrat facturable, appelle generer_brouillon_facture(contrat, mois précédent)
// (supabase/migrations/20261006100400_facturation_calcul.sql). On traite le mois qui vient de se
// terminer ; le mois en cours est l'affaire du trigger.
//
// ── Ce que cette tâche NE fait PAS, volontairement ──────────────────────────────────────────
// Elle ne valide rien : valider_facture() (numéro, verrou, snapshots) reste un geste du
// praticien, sur l'écran « Factures à valider », et la base refuse la validation avant le 1er du
// mois suivant (trigger factures_validation_apres_le_mois). Aucun PDF, aucun e-mail.
//
// ── Idempotence ─────────────────────────────────────────────────────────────────────────────
// Pas de doublon possible : generer_brouillon_facture recalcule le brouillon existant au lieu d'en
// créer un second (une seule facture vivante par contrat et par mois). Une facture ÉMISE est
// écartée avant tout appel. Relancer la tâche recalcule les mêmes brouillons au même résultat et ne
// renotifie rien (hors le 1er, voir plus haut).
//
// ── Isolation des échecs ────────────────────────────────────────────────────────────────────
// Un contrat qui échoue (typiquement : séance sans tarif applicable, la fonction refuse de
// deviner un montant) est enregistré dans `erreurs` ; les autres continuent. Un échec de
// notification n'invalide jamais les brouillons déjà créés.
//
// ── Données de santé ────────────────────────────────────────────────────────────────────────
// Le bilan journalisé ne contient que des identifiants techniques (contrat, praticien) et des
// compteurs. Jamais de nom de bénéficiaire. La notification ne porte qu'un nombre et un mois.

import type { SupabaseClient } from '@supabase/supabase-js';
import { dateCivileParis } from './cronTaches.js';
import { envoyerAlertePraticien, type MessagePraticien, type ResultatEnvoi } from './notifications.js';

/** Route ouverte au clic sur la notification (écran « Factures à valider »). */
export const URL_NOTIFICATION_FACTURES_A_VALIDER = '/factures/a-valider';

/** Taille des lots d'appels simultanés : borne la durée totale sans saturer la base. */
export const TAILLE_LOT = 5;

/**
 * Statuts de contrat dont on facture le mois écoulé. 'a_venir' est exclu (rien à facturer).
 * 'termine' reste inclus : ce statut est posé À LA MAIN par le praticien (ContratsTab.tsx), donc
 * un contrat terminé en cours de mois n'est plus « actif » le 1er suivant ; l'exclure ferait
 * disparaître la dernière facture du contrat. 'suspendu' reste inclus pour les séances réalisées
 * avant la suspension, mais PAS pour un forfait (voir contratAFacturer).
 */
export const STATUTS_CONTRAT_FACTURABLES = ['actif', 'termine', 'suspendu'] as const;

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Premier jour du mois PRÉCÉDENT la date civile Paris de `instant` (AAAA-MM-01). */
export function premierJourMoisPrecedent(instant: Date): string {
  const [annee, mois] = dateCivileParis(instant).split('-').map(Number);
  const [a, m] = mois === 1 ? [annee - 1, 12] : [annee, mois - 1];
  return `${a}-${String(m).padStart(2, '0')}-01`;
}

/** Premier jour du mois suivant `periode` (AAAA-MM-01) : borne EXCLUSIVE du mois facturé. */
export function premierJourMoisSuivant(periode: string): string {
  const [annee, mois] = periode.split('-').map(Number);
  const [a, m] = mois === 12 ? [annee + 1, 1] : [annee, mois + 1];
  return `${a}-${String(m).padStart(2, '0')}-01`;
}

/** « septembre 2026 » pour 2026-09-01. */
export function libelleMois(periode: string): string {
  const [annee, mois] = periode.split('-').map(Number);
  return `${MOIS[mois - 1]} ${annee}`;
}

export interface ContratCandidat {
  id: string;
  praticien_id: string | null;
  statut: string;
  mode_facturation: string;
  date_debut: string;
  date_fin: string | null;
  duree_indeterminee: boolean | null;
}

/**
 * Un contrat est facturable pour le mois [periode, fin exclusive[ s'il est dans un statut
 * facturable et si ses dates recouvrent le mois. Un forfait n'est pas facturé pendant une
 * suspension : aucune prestation n'est due ce mois-là.
 */
export function contratAFacturer(contrat: ContratCandidat, periode: string, finExclusive: string): boolean {
  if (!(STATUTS_CONTRAT_FACTURABLES as readonly string[]).includes(contrat.statut)) return false;
  if (contrat.mode_facturation === 'forfait' && contrat.statut === 'suspendu') return false;
  if (contrat.date_debut >= finExclusive) return false;
  return Boolean(contrat.duree_indeterminee) || (contrat.date_fin != null && contrat.date_fin >= periode);
}

export interface ErreurContrat {
  contratId: string;
  erreur: string;
}

export interface BilanFacturationMensuelle {
  /** Mois facturé, AAAA-MM. */
  mois: string;
  contratsExamines: number;
  /** Contrats écartés car leur facture du mois est déjà ÉMISE (jamais retouchée). */
  dejaExistants: number;
  /** Contrats facturables sans aucune séance à facturer ce mois-là : rien n'est créé. */
  sansSeance: number;
  brouillonsCrees: number;
  /** Brouillons existants recalculés depuis les séances du moment (facture progressive). */
  brouillonsRecalcules: number;
  /** Brouillons supprimés au recalcul parce qu'il ne reste plus aucune séance à facturer. */
  brouillonsSupprimes: number;
  erreurs: ErreurContrat[];
  notifications: { praticiens: number; envoyes: number; echecs: number };
}

export interface OptionsGeneration {
  /** Injectable pour les tests ; par défaut le push praticien existant (api/_lib/notifications.ts). */
  envoyerAlerte?: (supabase: SupabaseClient, praticienId: string, message: MessagePraticien) => Promise<ResultatEnvoi>;
  /**
   * Notifier aussi les brouillons EXISTANTS recalculés (en plus de ceux créés). Vrai le 1er du mois,
   * jour où le mois devient validable ; faux les autres jours pour ne pas renvoyer le même push chaque
   * jour (voir l'en-tête du fichier).
   */
  notifierBrouillonsExistants?: boolean;
}

const TAILLE_PAGE = 1000;

/** Lit toutes les pages d'une requête PostgREST (plafond de 1000 lignes par réponse). */
async function lireToutesLesLignes<T>(
  construire: (de: number, a: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const lignes: T[] = [];
  for (let de = 0; ; de += TAILLE_PAGE) {
    const { data, error } = await construire(de, de + TAILLE_PAGE - 1);
    if (error) throw new Error(error.message);
    lignes.push(...(data ?? []));
    if (!data || data.length < TAILLE_PAGE) return lignes;
  }
}

function enLots<T>(elements: T[], taille: number): T[][] {
  const lots: T[][] = [];
  for (let i = 0; i < elements.length; i += taille) lots.push(elements.slice(i, i + taille));
  return lots;
}

export function messageFacturesAValider(nombre: number, periode: string): MessagePraticien {
  return {
    titre: 'Horizon',
    corps: `${nombre} facture${nombre > 1 ? 's' : ''} à valider pour ${libelleMois(periode)}`,
    url: URL_NOTIFICATION_FACTURES_A_VALIDER,
    // Un tag par mois : une relance ne multiplie pas les notifications affichées.
    tag: `factures-a-valider-${periode.slice(0, 7)}`,
  };
}

/**
 * Génère les brouillons du mois `periode` (AAAA-MM-01) pour tous les contrats facturables, puis
 * notifie chaque praticien qui en a reçu. Ne lève que si la liste des contrats est illisible
 * (rien d'autre ne peut alors être fait) ; tout échec propre à un contrat est dans `erreurs`.
 */
export async function genererBrouillonsDuMois(
  supabase: SupabaseClient,
  periode: string,
  options: OptionsGeneration = {},
): Promise<BilanFacturationMensuelle> {
  const envoyerAlerte = options.envoyerAlerte ?? envoyerAlertePraticien;
  const finExclusive = premierJourMoisSuivant(periode);

  const candidats = await lireToutesLesLignes<ContratCandidat>((de, a) =>
    supabase
      .from('contrats')
      .select('id, praticien_id, statut, mode_facturation, date_debut, date_fin, duree_indeterminee')
      .in('statut', [...STATUTS_CONTRAT_FACTURABLES])
      .lt('date_debut', finExclusive)
      .order('id')
      .range(de, a),
  );
  const contrats = candidats.filter(c => contratAFacturer(c, periode, finExclusive));

  // Factures « vivantes » du mois : un brouillon se RECALCULE (facture progressive), une facture émise
  // n'est jamais touchée.
  const existantes = await lireToutesLesLignes<{ contrat_id: string; statut: string }>((de, a) =>
    supabase
      .from('factures')
      .select('contrat_id, statut')
      .eq('periode', periode)
      .eq('type', 'facture')
      .neq('statut', 'annulee')
      .order('contrat_id')
      .range(de, a),
  );
  const avecBrouillon = new Set(existantes.filter(f => f.statut === 'brouillon').map(f => f.contrat_id));
  const dejaEmises = new Set(existantes.filter(f => f.statut !== 'brouillon').map(f => f.contrat_id));
  const cibles = contrats
    .filter(c => !dejaEmises.has(c.id))
    .map(c => ({ contrat: c, recalcul: avecBrouillon.has(c.id) }));

  const bilan: BilanFacturationMensuelle = {
    mois: periode.slice(0, 7),
    contratsExamines: contrats.length,
    dejaExistants: contrats.filter(c => dejaEmises.has(c.id)).length,
    sansSeance: 0,
    brouillonsCrees: 0,
    brouillonsRecalcules: 0,
    brouillonsSupprimes: 0,
    erreurs: [],
    notifications: { praticiens: 0, envoyes: 0, echecs: 0 },
  };

  const idsCrees: string[] = [];
  const idsRecalcules: string[] = [];
  for (const lot of enLots(cibles, TAILLE_LOT)) {
    const reponses = await Promise.allSettled(
      lot.map(({ contrat }) => supabase.rpc('generer_brouillon_facture', { p_contrat_id: contrat.id, p_periode: periode })),
    );
    reponses.forEach((r, i) => {
      const { contrat, recalcul } = lot[i];
      const contratId = contrat.id;
      if (r.status === 'rejected') {
        bilan.erreurs.push({ contratId, erreur: String(r.reason?.message ?? r.reason).slice(0, 300) });
      } else if (r.value.error) {
        bilan.erreurs.push({ contratId, erreur: r.value.error.message.slice(0, 300) });
      } else if (r.value.data == null) {
        if (recalcul) bilan.brouillonsSupprimes++;
        else bilan.sansSeance++;
      } else if (recalcul) {
        bilan.brouillonsRecalcules++;
        idsRecalcules.push(r.value.data as string);
      } else {
        bilan.brouillonsCrees++;
        idsCrees.push(r.value.data as string);
      }
    });
  }

  // Notification : un push par praticien, pour les brouillons CRÉÉS par cette exécution et, si
  // demandé (le 1er du mois), pour ceux qui existaient déjà. Une exécution qui n'a rien à annoncer
  // (relance, mois sans séance) n'envoie rien.
  const idsANotifier = options.notifierBrouillonsExistants ? [...idsCrees, ...idsRecalcules] : idsCrees;
  if (idsANotifier.length > 0) {
    try {
      const parPraticien = new Map<string, number>();
      for (const lot of enLots(idsANotifier, 100)) {
        const { data, error } = await supabase.from('factures').select('id, praticien_id').in('id', lot);
        if (error) throw new Error(error.message);
        for (const f of (data ?? []) as { id: string; praticien_id: string }[]) {
          parPraticien.set(f.praticien_id, (parPraticien.get(f.praticien_id) ?? 0) + 1);
        }
      }
      bilan.notifications.praticiens = parPraticien.size;
      for (const [praticienId, nombre] of parPraticien) {
        try {
          const r = await envoyerAlerte(supabase, praticienId, messageFacturesAValider(nombre, periode));
          bilan.notifications.envoyes += r.nbEnvoyes;
          bilan.notifications.echecs += r.nbEchecs;
        } catch (err) {
          bilan.notifications.echecs++;
          console.error('[facturation] notification en échec pour un praticien :', err instanceof Error ? err.message : err);
        }
      }
    } catch (err) {
      // Les brouillons existent déjà : on le dit, on ne fait pas échouer la tâche.
      console.error('[facturation] notifications non envoyées :', err instanceof Error ? err.message : err);
    }
  }

  return bilan;
}

/**
 * Point d'entrée de la tâche cron : mois écoulé calculé depuis la date civile Paris, génération,
 * puis journalisation en une ligne JSON exploitable (recherchable dans les logs Vercel par le
 * préfixe `[facturation]`) et une ligne d'erreur par contrat en échec.
 */
export async function executerFacturationMensuelle(
  supabase: SupabaseClient,
  maintenant: Date,
  options: OptionsGeneration = {},
): Promise<BilanFacturationMensuelle> {
  // Le 1er du mois (date civile Paris), le mois écoulé devient validable : on prévient aussi pour les
  // brouillons déjà présents, construits au fil des séances.
  const premierDuMois = dateCivileParis(maintenant).endsWith('-01');
  const bilan = await genererBrouillonsDuMois(supabase, premierJourMoisPrecedent(maintenant), {
    notifierBrouillonsExistants: premierDuMois,
    ...options,
  });
  console.log(`[facturation] ${JSON.stringify(bilan)}`);
  for (const e of bilan.erreurs) {
    console.error(`[facturation] contrat ${e.contratId} : ${e.erreur}`);
  }
  return bilan;
}
