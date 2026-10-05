// api/_lib/facturationMensuelle.ts
//
// Génération automatique des brouillons de facture du mois ÉCOULÉ, greffée sur le point d'entrée
// cron unique (api/cron/rappels.ts) : le plan Vercel plafonne le nombre de fonctions, aucune
// route n'est ajoutée. Déclenchée une fois par jour, le 1er du mois seulement (voir
// doitGenererFacturationMaintenant, api/_lib/cronTaches.ts).
//
// Pour chaque contrat facturable, appelle generer_brouillon_facture(contrat, mois précédent)
// (supabase/migrations/20261006100400_facturation_calcul.sql). On facture le mois qui vient de
// se terminer, jamais le mois en cours.
//
// ── Ce que cette tâche NE fait PAS, volontairement ──────────────────────────────────────────
// Elle ne valide rien : valider_facture() (numéro, verrou, snapshots) reste un geste du
// praticien, sur l'écran « Factures à valider ». Aucun PDF, aucun e-mail.
//
// ── Idempotence : ce qui la garantit réellement ─────────────────────────────────────────────
// Ce n'est PAS la contrainte d'unicité (contrat, mois) : generer_brouillon_facture ne la heurte
// jamais, il recalcule le brouillon existant (il supprime ses lignes et les reconstruit). Relancer
// la génération n'a donc aucun doublon à craindre, mais RÉÉCRIRAIT un brouillon que le praticien
// aurait déjà consulté, et la même tâche exécutée deux fois enverrait deux notifications. On
// écarte donc, avant tout appel, tout contrat qui a déjà une facture « vivante » (brouillon ou
// émise, hors annulée) pour ce mois : une deuxième exécution le même jour est un no-op complet
// (rien créé, rien réécrit, rien notifié).
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
  /** Contrats écartés car ils ont déjà une facture (brouillon ou émise) pour ce mois. */
  dejaExistants: number;
  /** Contrats facturables sans aucune séance à facturer ce mois-là : rien n'est créé. */
  sansSeance: number;
  brouillonsCrees: number;
  erreurs: ErreurContrat[];
  notifications: { praticiens: number; envoyes: number; echecs: number };
}

export interface OptionsGeneration {
  /** Injectable pour les tests ; par défaut le push praticien existant (api/_lib/notifications.ts). */
  envoyerAlerte?: (supabase: SupabaseClient, praticienId: string, message: MessagePraticien) => Promise<ResultatEnvoi>;
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

  // Contrats qui ont déjà une facture « vivante » ce mois-là : on n'y touche pas (voir en-tête).
  const existantes = await lireToutesLesLignes<{ contrat_id: string }>((de, a) =>
    supabase
      .from('factures')
      .select('contrat_id')
      .eq('periode', periode)
      .eq('type', 'facture')
      .neq('statut', 'annulee')
      .order('contrat_id')
      .range(de, a),
  );
  const dejaFactures = new Set(existantes.map(f => f.contrat_id));
  const aGenerer = contrats.filter(c => !dejaFactures.has(c.id));

  const bilan: BilanFacturationMensuelle = {
    mois: periode.slice(0, 7),
    contratsExamines: contrats.length,
    dejaExistants: contrats.length - aGenerer.length,
    sansSeance: 0,
    brouillonsCrees: 0,
    erreurs: [],
    notifications: { praticiens: 0, envoyes: 0, echecs: 0 },
  };

  const idsCrees: string[] = [];
  for (const lot of enLots(aGenerer, TAILLE_LOT)) {
    const reponses = await Promise.allSettled(
      lot.map(c => supabase.rpc('generer_brouillon_facture', { p_contrat_id: c.id, p_periode: periode })),
    );
    reponses.forEach((r, i) => {
      const contratId = lot[i].id;
      if (r.status === 'rejected') {
        bilan.erreurs.push({ contratId, erreur: String(r.reason?.message ?? r.reason).slice(0, 300) });
      } else if (r.value.error) {
        bilan.erreurs.push({ contratId, erreur: r.value.error.message.slice(0, 300) });
      } else if (r.value.data == null) {
        bilan.sansSeance++;
      } else {
        bilan.brouillonsCrees++;
        idsCrees.push(r.value.data as string);
      }
    });
  }

  // Notification : un push par praticien, pour les brouillons CRÉÉS par cette exécution. Une
  // exécution qui ne crée rien (relance, mois sans séance) n'envoie rien.
  if (idsCrees.length > 0) {
    try {
      const parPraticien = new Map<string, number>();
      for (const lot of enLots(idsCrees, 100)) {
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
  const bilan = await genererBrouillonsDuMois(supabase, premierJourMoisPrecedent(maintenant), options);
  console.log(`[facturation] ${JSON.stringify(bilan)}`);
  for (const e of bilan.erreurs) {
    console.error(`[facturation] contrat ${e.contratId} : ${e.erreur}`);
  }
  return bilan;
}
