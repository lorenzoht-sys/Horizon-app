// scripts/test-planificateur.ts
//
// Script de test autonome du planificateur de tournée (src/lib/planificateur.ts).
// Simule une optimisation complète (Mode A semaine ponctuelle + Mode B
// récurrent) sur des données fictives réalistes (zone Nantes/Pornic) :
//   - 7 patients (coordonnées GPS réelles, disponibilités jours+créneaux,
//     contrats avec fréquence et durées variées), dont 2 cas limites
//     volontaires (sans coordonnées GPS, fréquence 0) ;
//   - 1 point de départ (Pierre, Nantes centre) ;
//   - des indisponibilités récurrentes (pause déjeuner 12h-13h30).
//
// AUCUN accès réseau, AUCUNE base de données : la matrice de trajets est
// calculée en Haversine localement (même formule que le fallback de
// api/tournee/matrice-trajets.ts), jamais via l'API OpenRouteService.
// N'écrit ni ne lit aucun fichier — tout est affiché sur la sortie standard.
//
// Usage :
//   npx tsx scripts/test-planificateur.ts
//
// (Le projet utilise `tsx` pour ses autres scripts autonomes — voir
// scripts/backfill-code-acces.ts, scripts/dump-schema.ts. `ts-node` n'est pas
// une dépendance de ce repo et fonctionne moins bien avec les imports ESM
// sans extension utilisés par src/lib/planificateur.ts ; tsx est un
// remplacement direct : `npx ts-node scripts/test-planificateur.ts`
// fonctionnerait aussi, au prix d'un téléchargement à la volée.

import type {
  Participant,
  Contrat,
  Seance,
  IndisponibilitePierre,
  JourSemaine,
} from '../src/types/index.ts';
import {
  planifierSemaine,
  planifierRecurrent,
  coordKey,
  prochainLundi,
  type MatriceORS,
  type PlanificateurParams,
  type EtapePlanifiee,
  type ResultatPlanification,
} from '../src/lib/planificateur.ts';
import { PLAGES, estDansPlage } from '../src/utils/horaires.ts';

// ════════════════════════════════════════════════════════════════════════════
// 1. DONNÉES FICTIVES — zone Nantes / Pornic
// ════════════════════════════════════════════════════════════════════════════

// Point de départ de Pierre : Nantes centre (légèrement décalé du domicile du
// 1er patient pour éviter une collision de coordonnées dans la matrice).
const DEPART_PIERRE = { lat: 47.2200, lng: -1.5550 };

type LatLng = { lat: number; lng: number };

function coord(lat: number, lng: number): Participant['coordonnees'] {
  return { lat, lng, geocodeeAt: '2026-01-01' };
}

function patient(p: {
  id: string; nom: string; prenom: string;
  coords?: LatLng;
  jours: JourSemaine[];
  creneaux: ('matin' | 'apres-midi' | 'soiree')[];
}): Participant {
  return {
    id: p.id,
    nom: p.nom,
    prenom: p.prenom,
    dateNaissance: '1945-01-01',
    dateCreation: '2026-01-01',
    token: `tok-${p.id}`,
    bilans: [],
    coordonnees: p.coords ? coord(p.coords.lat, p.coords.lng) : undefined,
    // Lu par getJoursDisponiblesCourts() pour le choix des jours de passage.
    anamnese: { organisation: { joursDisponibles: p.jours.map(capitaliser) } },
    // Lu par ajusterAuCreneauPatient()/prioriteCreneau() pour les créneaux.
    disponibilites: {
      joursDisponibles: p.jours,
      creneauxPreference: p.creneaux,
      dureeSeanceMinutes: 45,
    },
  };
}

function capitaliser(j: JourSemaine): string {
  return j.charAt(0).toUpperCase() + j.slice(1);
}

function contrat(c: {
  id: string; participantId: string; nbSeancesSemaine: number; dureesSeances: number[];
}): Contrat {
  return {
    id: c.id,
    participantId: c.participantId,
    dateDebut: '2026-01-01',
    dateFin: '2026-12-31',
    nbSeancesSemaine: c.nbSeancesSemaine,
    heureDebut: '08:00',
    dureeMinutes: c.dureesSeances[0] ?? 45,
    dureesSeances: c.dureesSeances,
    statut: 'actif',
    dateCreation: '2026-01-01',
    nombreSeancesTotal: 50,
    nombreSeancesRealisees: 0,
  };
}

// 7 patients, coordonnées réelles entre Nantes et Pornic.
const patients: Participant[] = [
  patient({ id: 'p1', nom: 'Dubois', prenom: 'Madeleine', coords: { lat: 47.2184, lng: -1.5536 }, // Nantes centre
    jours: ['lun', 'mer', 'ven'], creneaux: ['matin'] }),
  patient({ id: 'p2', nom: 'Lefèvre', prenom: 'Robert', coords: { lat: 47.2167, lng: -1.6500 }, // Saint-Herblain
    jours: ['lun', 'mar', 'jeu'], creneaux: ['apres-midi'] }),
  patient({ id: 'p3', nom: 'Martin', prenom: 'Suzanne', coords: { lat: 47.1667, lng: -1.6167 }, // Bouguenais
    jours: ['mar', 'jeu'], creneaux: ['matin'] }),
  patient({ id: 'p4', nom: 'Petit', prenom: 'Henri', coords: { lat: 47.1167, lng: -2.0833 }, // Pornic
    jours: ['lun', 'ven'], creneaux: ['apres-midi'] }),
  patient({ id: 'p5', nom: 'Roux', prenom: 'Jacqueline', coords: { lat: 47.1167, lng: -1.8000 }, // Sainte-Pazanne
    jours: ['lun', 'mer'], creneaux: ['soiree'] }),
  // Cas limite volontaire : patient sans coordonnées GPS (adresse non géocodée).
  patient({ id: 'p6', nom: 'Garcia', prenom: 'Antoine', coords: undefined,
    jours: ['lun', 'mer', 'ven'], creneaux: ['matin'] }),
  // Cas limite volontaire : disponibilités correctes mais contrat corrompu (voir plus bas).
  patient({ id: 'p7', nom: 'Blanc', prenom: 'Geneviève', coords: { lat: 47.2000, lng: -1.6000 }, // Rezé
    jours: ['mar', 'jeu', 'sam'], creneaux: ['matin'] }),
];

const contrats: Contrat[] = [
  contrat({ id: 'c1', participantId: 'p1', nbSeancesSemaine: 2, dureesSeances: [45, 45] }),
  contrat({ id: 'c2', participantId: 'p2', nbSeancesSemaine: 3, dureesSeances: [30, 30, 45] }),
  contrat({ id: 'c3', participantId: 'p3', nbSeancesSemaine: 2, dureesSeances: [45, 45] }),
  contrat({ id: 'c4', participantId: 'p4', nbSeancesSemaine: 1, dureesSeances: [60] }),
  contrat({ id: 'c5', participantId: 'p5', nbSeancesSemaine: 1, dureesSeances: [45] }),
  contrat({ id: 'c6', participantId: 'p6', nbSeancesSemaine: 1, dureesSeances: [45] }),
  // Cas limite volontaire : fréquence invalide (donnée corrompue) — doit finir
  // en "à planifier manuellement", jamais ignorée silencieusement ni planter.
  contrat({ id: 'c7', participantId: 'p7', nbSeancesSemaine: 0, dureesSeances: [45] }),
];

const seancesExistantes: Seance[] = [];

// Pause déjeuner récurrente, tous les jours ouvrés.
// + vendredi totalement bloqué (8h-20h) pour tester que jourTotalementBloque
//   empêche l'assignation : p1 (lun/mer/ven) et p4 (lun/ven) doivent trouver
//   leurs séances sans jamais atterrir sur un vendredi.
const indispos: IndisponibilitePierre[] = [
  ...(['lun', 'mar', 'mer', 'jeu', 'ven'] as JourSemaine[]).map((jour, i) => ({
    id: `indispo-${i}`,
    jour,
    heureDebut: '12:00',
    heureFin: '13:30',
    recurrente: true,
    label: 'Pause déjeuner',
  })),
  {
    id: 'indispo-ven-totale',
    jour: 'ven' as JourSemaine,
    heureDebut: '08:00',
    heureFin: '20:00',
    recurrente: true,
    label: 'Vendredi bloqué (test invariant)',
  },
];

// ════════════════════════════════════════════════════════════════════════════
// 2. MATRICE DE TRAJETS — Haversine locale (équivalent du fallback de
//    api/tournee/matrice-trajets.ts), AUCUN appel réseau / ORS.
// ════════════════════════════════════════════════════════════════════════════

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function haversineMatrix(points: LatLng[]): MatriceORS {
  const n = points.length;
  const durees: number[][] = [];
  const distances: number[][] = [];
  for (let i = 0; i < n; i++) {
    durees[i] = [];
    distances[i] = [];
    for (let j = 0; j < n; j++) {
      const km = haversineKm(points[i], points[j]);
      const distM = km * 1400; // facteur routier 1.4
      durees[i][j] = Math.round(distM / (40000 / 3600)); // 40 km/h moyen
      distances[i][j] = Math.round(distM);
    }
  }
  return { durees, distances, fallback: true };
}

// Patients avec coordonnées uniquement (p6 exclu, comme le ferait
// ModalPlanificateur côté UI) — le planificateur lui-même gère aussi
// l'absence de coordonnées en mettant le patient en "impossible" sans planter.
const patientsAvecCoords = patients.filter(p => p.coordonnees);
const points: LatLng[] = [DEPART_PIERRE, ...patientsAvecCoords.map(p => p.coordonnees!)];
const matrix = haversineMatrix(points);
const indexMap = new Map(points.map((p, i) => [coordKey(p), i]));

const params: PlanificateurParams = {
  participants: patients, // y compris p6 (sans coordonnées) : test de robustesse
  contrats,
  seances: seancesExistantes,
  indispos,
  depart: DEPART_PIERRE,
  matrix,
  indexMap,
  heureDebutJournee: '08:00',
};

// ════════════════════════════════════════════════════════════════════════════
// 3. EXÉCUTION — Mode A (semaine ponctuelle) + Mode B (récurrent, 4 semaines)
// ════════════════════════════════════════════════════════════════════════════

const aujourdHui = new Date().toISOString().split('T')[0];
const lundiCible = prochainLundi(aujourdHui);

console.log('═'.repeat(78));
console.log('TEST AUTONOME DU PLANIFICATEUR — zone Nantes/Pornic, données fictives');
console.log('═'.repeat(78));
console.log(`Départ Pierre : Nantes centre (${DEPART_PIERRE.lat}, ${DEPART_PIERRE.lng})`);
console.log(`Matrice de trajets : Haversine locale (fallback=${matrix.fallback}, aucun appel réseau)`);
console.log(`7 patients chargés (dont 1 sans GPS, 1 avec fréquence de contrat invalide)`);
console.log();

let resultatModeA: ResultatPlanification;
let resultatModeB: ResultatPlanification;
let crashModeA: unknown = null;
let crashModeB: unknown = null;

try {
  resultatModeA = planifierSemaine(params, lundiCible);
} catch (err) {
  crashModeA = err;
  resultatModeA = { jours: [], impossibles: [], fallbackORS: true, modeB: false };
}

try {
  resultatModeB = planifierRecurrent(params, aujourdHui, 4);
} catch (err) {
  crashModeB = err;
  resultatModeB = { jours: [], impossibles: [], fallbackORS: true, modeB: true };
}

// ── Affichage du planning ───────────────────────────────────────────────────

function afficherPlanning(titre: string, resultat: ResultatPlanification) {
  console.log('─'.repeat(78));
  console.log(titre);
  console.log('─'.repeat(78));

  if (resultat.jours.length === 0) {
    console.log('  (aucune séance planifiée)');
  }

  for (const jour of resultat.jours) {
    console.log(`\n  ${jour.label} (${jour.date})`);
    for (const e of jour.etapes) {
      const trajet = e.dureeTrajetMinutes > 0 ? ` · ${e.dureeTrajetMinutes} min de trajet (${e.distanceKm.toFixed(1)} km)` : '';
      const tag = e.alreadyPlanned ? ' [déplacée]' : ' [nouvelle]';
      console.log(`    ${e.heureDebut}-${e.heureFin}  ${e.patient.prenom} ${e.patient.nom}  (${e.contrat.dureeMinutes} min)${trajet}${tag}`);
    }
  }

  console.log(`\n  À planifier manuellement (${resultat.impossibles.length}) :`);
  for (const imp of resultat.impossibles) {
    console.log(`    - ${imp.patient.prenom} ${imp.patient.nom} — ${imp.raison}`);
  }
  console.log();
}

if (crashModeA) {
  console.log('─'.repeat(78));
  console.log('MODE A — CRASH :', crashModeA);
  console.log();
} else {
  afficherPlanning('MODE A — Semaine ponctuelle', resultatModeA);
}

if (crashModeB) {
  console.log('─'.repeat(78));
  console.log('MODE B — CRASH :', crashModeB);
  console.log();
} else {
  afficherPlanning('MODE B — Récurrent (4 semaines)', resultatModeB);
}

// ════════════════════════════════════════════════════════════════════════════
// 4. VÉRIFICATION AUTOMATIQUE DES INVARIANTS
// ════════════════════════════════════════════════════════════════════════════

interface ResultatTest { nom: string; pass: boolean; detail?: string }
const resultatsTests: ResultatTest[] = [];

function verifier(nom: string, condition: boolean, detail?: string) {
  resultatsTests.push({ nom, pass: condition, detail: condition ? undefined : detail });
}

function toutesEtapes(r: ResultatPlanification): EtapePlanifiee[] {
  return r.jours.flatMap(j => j.etapes);
}

const JOURS_NUM: Record<JourSemaine | 'dim', number> = { dim: 0, lun: 1, mar: 2, mer: 3, jeu: 4, ven: 5, sam: 6 };
function jourDeLaDate(dateStr: string): JourSemaine | 'dim' {
  const dow = new Date(dateStr + 'T12:00').getDay();
  return (Object.entries(JOURS_NUM).find(([, n]) => n === dow)?.[0] as JourSemaine | 'dim') ?? 'dim';
}
function lundiDeLaSemaine(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00');
  const back = d.getDay() === 0 ? 6 : d.getDay() - 1;
  d.setDate(d.getDate() - back);
  return d.toISOString().split('T')[0];
}

// ── 1. Aucun patient planifié 2 fois le même jour ──────────────────────────
for (const [label, r] of [['Mode A', resultatModeA], ['Mode B', resultatModeB]] as const) {
  const etapes = toutesEtapes(r);
  const vus = new Map<string, number>();
  for (const e of etapes) {
    const cle = `${e.patient.id}|${e.date}`;
    vus.set(cle, (vus.get(cle) ?? 0) + 1);
  }
  const doublons = [...vus.entries()].filter(([, n]) => n > 1);
  verifier(
    `[${label}] Aucun patient planifié 2 fois le même jour`,
    doublons.length === 0,
    `doublons trouvés : ${doublons.map(([cle, n]) => `${cle} (${n}x)`).join(', ')}`,
  );
}

// ── 2. Toutes les heures sont arrondies au quart d'heure ───────────────────
for (const [label, r] of [['Mode A', resultatModeA], ['Mode B', resultatModeB]] as const) {
  const etapes = toutesEtapes(r);
  const nonArrondies = etapes.filter(e => {
    const [, mDebut] = e.heureDebut.split(':').map(Number);
    const [, mFin] = e.heureFin.split(':').map(Number);
    return mDebut % 15 !== 0 || mFin % 15 !== 0;
  });
  verifier(
    `[${label}] Toutes les heures (début et fin) sont arrondies au quart d'heure`,
    nonArrondies.length === 0,
    nonArrondies.map(e => `${e.patient.nom}: ${e.heureDebut}-${e.heureFin}`).join(', '),
  );
}

// ── 3. Aucune séance pendant les indisponibilités de Pierre ────────────────
for (const [label, r] of [['Mode A', resultatModeA], ['Mode B', resultatModeB]] as const) {
  const etapes = toutesEtapes(r);
  const conflits = etapes.filter(e => {
    const jour = jourDeLaDate(e.date);
    return indispos.some(ind =>
      ind.jour === jour && e.heureDebut < ind.heureFin && e.heureFin > ind.heureDebut
    );
  });
  verifier(
    `[${label}] Aucune séance pendant une indisponibilité de Pierre (pause déjeuner)`,
    conflits.length === 0,
    conflits.map(e => `${e.patient.nom}: ${e.heureDebut}-${e.heureFin} le ${e.date}`).join(', '),
  );
}

// ── 4. Chaque patient respecte ses créneaux de disponibilité ──────────────
for (const [label, r] of [['Mode A', resultatModeA], ['Mode B', resultatModeB]] as const) {
  const etapes = toutesEtapes(r);
  const horsCreneau = etapes.filter(e => {
    const prefs = e.patient.disponibilites?.creneauxPreference ?? [];
    if (prefs.length === 0) return false; // pas de préférence = pas de contrainte
    return !prefs.some(pref => estDansPlage(e.heureDebut, PLAGES[pref].debut, PLAGES[pref].fin));
  });
  verifier(
    `[${label}] Chaque séance respecte un créneau de disponibilité du patient`,
    horsCreneau.length === 0,
    horsCreneau.map(e => `${e.patient.nom}: ${e.heureDebut} hors de ses créneaux`).join(', '),
  );
}

// ── 5. Nb séances/semaine respecté pour chaque contrat (Mode A, semaine cible) ──
{
  const etapes = toutesEtapes(resultatModeA);
  const parContrat = new Map<string, number>();
  for (const e of etapes) parContrat.set(e.contrat.id, (parContrat.get(e.contrat.id) ?? 0) + 1);

  // Contrats "normaux" : fréquence valide ET patient avec assez de jours dispo
  // cette semaine pour l'atteindre (p1..p5 sont construits pour ça).
  const contratsNormaux = ['c1', 'c2', 'c3', 'c4', 'c5'];
  const ecarts = contratsNormaux.filter(id => {
    const c = contrats.find(c => c.id === id)!;
    return (parContrat.get(id) ?? 0) !== c.nbSeancesSemaine;
  });
  verifier(
    `[Mode A] Nb séances/semaine respecté pour chaque contrat valide (c1-c5)`,
    ecarts.length === 0,
    ecarts.map(id => `${id}: ${parContrat.get(id) ?? 0}/${contrats.find(c => c.id === id)!.nbSeancesSemaine}`).join(', '),
  );

  // Jamais plus que nbSeancesSemaine, même pour un contrat en sous-capacité.
  const depassements = contrats.filter(c => (parContrat.get(c.id) ?? 0) > c.nbSeancesSemaine);
  verifier(
    `[Mode A] Aucun contrat ne dépasse sa fréquence nbSeancesSemaine`,
    depassements.length === 0,
    depassements.map(c => `${c.id}: ${parContrat.get(c.id)}/${c.nbSeancesSemaine}`).join(', '),
  );
}

// Idem en Mode B, semaine par semaine (jamais de dépassement, même logique).
{
  const etapes = toutesEtapes(resultatModeB);
  const parContratEtSemaine = new Map<string, number>();
  for (const e of etapes) {
    const cle = `${e.contrat.id}|${lundiDeLaSemaine(e.date)}`;
    parContratEtSemaine.set(cle, (parContratEtSemaine.get(cle) ?? 0) + 1);
  }
  const depassements = [...parContratEtSemaine.entries()].filter(([cle, n]) => {
    const contratId = cle.split('|')[0];
    const c = contrats.find(c => c.id === contratId)!;
    return n > c.nbSeancesSemaine;
  });
  verifier(
    `[Mode B] Aucun contrat ne dépasse sa fréquence nbSeancesSemaine, sur aucune des 4 semaines`,
    depassements.length === 0,
    depassements.map(([cle, n]) => `${cle}: ${n}`).join(', '),
  );
}

// ── 6. Pas de crash si un patient n'a pas de coordonnées GPS ───────────────
verifier(
  `Pas de crash avec un patient sans coordonnées GPS (Mode A)`,
  crashModeA === null,
  String(crashModeA),
);
verifier(
  `Patient sans GPS (p6) correctement écarté en "à planifier manuellement"`,
  resultatModeA.impossibles.some(i => i.patient.id === 'p6' && /géocodée/i.test(i.raison)),
  resultatModeA.impossibles.find(i => i.patient.id === 'p6')?.raison ?? '(absent des impossibles)',
);

// ── 7. Pas de crash si nbSeancesSemaine est 0 ──────────────────────────────
verifier(
  `Pas de crash avec un contrat à fréquence 0 (Mode A)`,
  crashModeA === null,
);
verifier(
  `Contrat à fréquence invalide (c7, p7) correctement écarté en "à planifier manuellement"`,
  resultatModeA.impossibles.some(i => i.patient.id === 'p7' && /Fréquence invalide/.test(i.raison)),
  resultatModeA.impossibles.find(i => i.patient.id === 'p7')?.raison ?? '(absent des impossibles)',
);

// Pas de crash global Mode B également (même jeu de données).
verifier(`Pas de crash en Mode B (mêmes données, 4 semaines)`, crashModeB === null, String(crashModeB));

// ── 8. Aucun patient planifié un jour totalement bloqué par les indispos ───
// Reproduit la logique de jourTotalementBloque() (seuil 90%, plage 08h-20h)
// directement dans le script pour valider l'invariant sans exporter la fonction.
{
  const HEURE_FIN_TRAVAIL = '20:00';
  const SEUIL = 0.90;

  function heureMinutes(h: string): number {
    const [hh, mm] = h.split(':').map(Number);
    return hh * 60 + mm;
  }

  function jourBloque(jourKey: string, indisposAll: IndisponibilitePierre[], heureDebut: string): boolean {
    const joursInds = indisposAll.filter(i => i.jour === jourKey);
    if (joursInds.length === 0) return false;
    const debut = heureMinutes(heureDebut);
    const fin   = heureMinutes(HEURE_FIN_TRAVAIL);
    const plage = fin - debut;
    if (plage <= 0) return false;
    const intervals = joursInds
      .map(i => [Math.max(debut, heureMinutes(i.heureDebut)), Math.min(fin, heureMinutes(i.heureFin))] as [number, number])
      .filter(([s, e]) => s < e)
      .sort((a, b) => a[0] - b[0]);
    let couvert = 0, curFin = -1;
    for (const [s, e] of intervals) {
      if (s > curFin) { couvert += e - s; curFin = e; }
      else if (e > curFin) { couvert += e - curFin; curFin = e; }
    }
    return couvert / plage >= SEUIL;
  }

  const JOURS_NUM_LOC: Record<string, number> = { lun: 1, mar: 2, mer: 3, jeu: 4, ven: 5, sam: 6, dim: 0 };
  function jourDeLaDateLoc(dateStr: string): string {
    const dow = new Date(dateStr + 'T12:00').getDay();
    return Object.entries(JOURS_NUM_LOC).find(([, n]) => n === dow)?.[0] ?? 'dim';
  }

  for (const [label, r] of [['Mode A', resultatModeA], ['Mode B', resultatModeB]] as const) {
    const etapes = toutesEtapes(r);
    const surJourBloque = etapes.filter(e => {
      const jourKey = jourDeLaDateLoc(e.date);
      return jourBloque(jourKey, indispos, params.heureDebutJournee);
    });
    verifier(
      `[${label}] Aucun patient planifié un jour totalement bloqué (>= 90% indispo praticien)`,
      surJourBloque.length === 0,
      surJourBloque.map(e => `${e.patient.nom} le ${e.date}`).join(', '),
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 5. RAPPORT FINAL
// ════════════════════════════════════════════════════════════════════════════

console.log('═'.repeat(78));
console.log('RAPPORT DE VÉRIFICATION DES INVARIANTS');
console.log('═'.repeat(78));

for (const t of resultatsTests) {
  const statut = t.pass ? 'PASS' : 'FAIL';
  console.log(`  [${statut}] ${t.nom}`);
  if (!t.pass && t.detail) console.log(`         → ${t.detail}`);
}

const nbPass = resultatsTests.filter(t => t.pass).length;
const nbFail = resultatsTests.length - nbPass;

console.log();
console.log('─'.repeat(78));
console.log(`TOTAL : ${resultatsTests.length} vérifications — ${nbPass} PASS, ${nbFail} FAIL`);
console.log('─'.repeat(78));

if (nbFail > 0) {
  console.log('\nÉchecs détaillés :');
  for (const t of resultatsTests.filter(t => !t.pass)) {
    console.log(`  - ${t.nom}\n    ${t.detail ?? ''}`);
  }
  process.exitCode = 1;
} else {
  console.log('\nTous les invariants critiques sont respectés.');
}
