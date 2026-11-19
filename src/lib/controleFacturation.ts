// Contrôle de la facturation du mois (retour de Pierre du 2026-11-19).
//
// Octobre 2026 : deux bénéficiaires sans facture, sans aucun signal. Leur contrat avait été créé sans
// tarif, puis le tarif saisi en novembre à la date du jour : les séances d'octobre n'avaient aucun tarif
// applicable et generer_brouillon_facture refusait le mois en silence. 28 séances d'octobre étaient dans
// ce cas, plus 16 séances passées restées « planifiées ». Ce module classe chaque dossier du mois (prêt,
// à vérifier, bloqué) à partir du suivi existant, des séances passées non confirmées et des contrats
// dont le tarif ne couvre pas toute la période.

import type { LigneSuivi } from './suiviSeances';

export interface SeanceAConfirmer {
  seanceId: string;
  date: string;
  heure: string;
  participantId: string;
  contratId: string | null;
}

export interface ContratIncomplet {
  contratId: string;
  participantId: string;
  dateDebut: string;
  /** Début de la plus ancienne version de tarif, null s'il n'y en a aucune. */
  premierTarif: string | null;
}

export type StatutDossier = 'bloque' | 'a_verifier' | 'pret';

export interface DossierControle {
  participantId: string;
  statut: StatutDossier;
  aCorriger: number;
  aConfirmer: number;
  factures: number;
}

export interface SyntheseControle {
  dossiers: DossierControle[];
  prets: number;
  aVerifier: number;
  bloques: number;
  factures: number;
  seancesAConfirmer: number;
  contratsIncomplets: number;
}

/**
 * Contrat facturable à la séance dont le tarif ne couvre pas le début : aucune version, ou une première
 * version qui commence après le début du contrat. Les séances de cette période ne peuvent pas être facturées.
 */
export function estContratIncomplet(c: ContratIncomplet): boolean {
  return c.premierTarif === null || c.premierTarif > c.dateDebut;
}

/** Message affiché pour un contrat incomplet. */
export function messageContratIncomplet(c: ContratIncomplet): string {
  if (c.premierTarif === null) return 'Impossible de préparer la facture : aucun tarif renseigné dans le contrat.';
  return `Le tarif commence le ${jjmm(c.premierTarif)}, après le début du contrat (${jjmm(c.dateDebut)}) : les séances d'avant ne peuvent pas être facturées.`;
}

function jjmm(iso: string): string {
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a}`;
}

/** Classe chaque bénéficiaire actif sur le mois : bloqué > à vérifier > prêt. */
export function syntheseControle(
  lignes: LigneSuivi[],
  aConfirmer: SeanceAConfirmer[],
  contratsIncomplets: ContratIncomplet[],
): SyntheseControle {
  const parDossier = new Map<string, { aCorriger: number; aConfirmer: number; factures: Set<string>; facturable: boolean }>();
  const dossier = (id: string) => {
    let d = parDossier.get(id);
    if (!d) { d = { aCorriger: 0, aConfirmer: 0, factures: new Set(), facturable: false }; parDossier.set(id, d); }
    return d;
  };

  for (const l of lignes) {
    if (!l.participantId) continue;
    if (l.etat === 'non_facturable') continue;  // SAP, forfait, bilan non facturé : voulu
    const d = dossier(l.participantId);
    d.facturable = true;
    if (l.etat === 'a_facturer') d.aCorriger++;
    if (l.factureId) d.factures.add(l.factureId);
  }
  for (const s of aConfirmer) {
    const d = dossier(s.participantId);
    d.aConfirmer++;
  }
  const incomplets = new Set(contratsIncomplets.filter(estContratIncomplet).map(c => c.participantId));

  const dossiers: DossierControle[] = [...parDossier.entries()].map(([participantId, d]) => ({
    participantId,
    statut: d.aCorriger > 0 ? 'bloque' : d.aConfirmer > 0 || incomplets.has(participantId) ? 'a_verifier' : 'pret',
    aCorriger: d.aCorriger,
    aConfirmer: d.aConfirmer,
    factures: d.factures.size,
  }));
  const ordre: Record<StatutDossier, number> = { bloque: 0, a_verifier: 1, pret: 2 };
  dossiers.sort((a, b) => ordre[a.statut] - ordre[b.statut]);

  const factures = new Set(lignes.filter(l => l.etat !== 'non_facturable' && l.factureId).map(l => l.factureId));
  return {
    dossiers,
    prets: dossiers.filter(d => d.statut === 'pret').length,
    aVerifier: dossiers.filter(d => d.statut === 'a_verifier').length,
    bloques: dossiers.filter(d => d.statut === 'bloque').length,
    factures: factures.size,
    seancesAConfirmer: aConfirmer.length,
    contratsIncomplets: contratsIncomplets.filter(estContratIncomplet).length,
  };
}

/**
 * Dernier jour des séances « passées » à confirmer pour un mois (AAAA-MM-01) : la veille d'aujourd'hui,
 * bornée à la fin du mois. Null pour un mois qui n'a encore aucun jour passé.
 */
export function finSeancesPassees(mois: string, aujourdhui: string): string | null {
  if (aujourdhui <= mois) return null;
  const [a, m] = mois.split('-').map(Number);
  const finMois = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  const [ay, am, aj] = aujourdhui.split('-').map(Number);
  const veille = new Date(Date.UTC(ay, am - 1, aj - 1)).toISOString().slice(0, 10);
  return veille < finMois ? veille : finMois;
}
