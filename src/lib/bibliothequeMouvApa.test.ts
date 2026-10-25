import { describe, it, expect } from 'vitest';
import { EXERCICES_BASE } from '../data/exercices';
import {
  EXERCICES_MOUVAPA, CORRESPONDANCES_EXISTANTS, ENRICHISSEMENT_EXISTANTS, RESPIRATION_PILATES,
  famillesDe, positionDe,
} from '../data/exercicesMouvApa';
import {
  MODELES_MOUVAPA, resoudreExercices, versDonneesModele, materielsDuModele, dureeIndicative,
} from '../data/modelesMouvApa';

// Garde-fous de la bibliothèque Mouv'APA (exercices + modèles), demandés explicitement :
// aucun doublon (y compris de nom approché), positions « 100 % assis / debout / au sol » réellement
// respectées, Pilates avec respiration, paramètres cohérents, jamais de pathologie → programme.

const MOTS_VIDES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'en', 'a', 'au', 'aux', 'avec', 'sur', 'et', 'un', 'une', 'position']);

/** Clé de comparaison : sans accents, sans parenthèses, sans mots vides, mots « racinés » et triés. */
export function cleNom(nom: string): string {
  return nom
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(m => m && !MOTS_VIDES.has(m))
    .map(m => (m.length > 3 ? m.replace(/(es|e|s)$/, '').replace(/s$/, '') : m))
    .sort()
    .join(' ');
}

const historiques = EXERCICES_BASE.filter(ex => !ex.horsCatalogueIA);
const parId = new Map(EXERCICES_BASE.map(ex => [ex.id, ex]));

describe('détection des doublons de nom', () => {
  it('reconnaît l\'exemple du cahier des charges comme le même exercice', () => {
    expect(cleNom('Extension genou assis')).toBe(cleNom('Extension de genou en position assise'));
    expect(cleNom('Extension du genou assis')).toBe(cleNom('Extension de genou assis'));
  });

  it('distingue des exercices réellement différents', () => {
    expect(cleNom('Pont fessier')).not.toBe(cleNom('Pont Pilates (déroulé vertébral)'));
    expect(cleNom('Séquence de 3 mouvements')).not.toBe(cleNom('Séquence de 4 mouvements'));
  });
});

describe('exercices Mouv\'APA', () => {
  it('identifiants uniques sur tout le catalogue', () => {
    const ids = EXERCICES_BASE.map(ex => ex.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('les exercices historiques sont tous conservés, inchangés hors familles/matériel', () => {
    expect(historiques.length).toBe(82);
    for (const ex of historiques) {
      expect(ex.horsCatalogueIA, ex.id).toBeUndefined();
      expect(ex.id.startsWith('ma-'), ex.id).toBe(false);
    }
  });

  it('aucun nouvel exercice ne double un exercice existant ni un autre nouvel exercice (nom approché)', () => {
    const vus = new Map<string, string>();
    for (const ex of historiques) vus.set(cleNom(ex.nom), ex.id);
    for (const ex of EXERCICES_MOUVAPA) {
      const cle = cleNom(ex.nom);
      expect(vus.get(cle), `« ${ex.nom} » (${ex.id}) double ${vus.get(cle)}`).toBeUndefined();
      vus.set(cle, ex.id);
    }
  });

  it('les exercices demandés qui existaient déjà sont réutilisés, pas recréés', () => {
    const clesNouveaux = new Set(EXERCICES_MOUVAPA.map(ex => cleNom(ex.nom)));
    for (const [nom, id] of Object.entries(CORRESPONDANCES_EXISTANTS)) {
      expect(parId.has(id), `${nom} → ${id} introuvable`).toBe(true);
      if (!id.startsWith('ma-')) expect(clesNouveaux.has(cleNom(nom)), `${nom} recréé alors qu'il existe (${id})`).toBe(false);
    }
    for (const id of Object.keys(ENRICHISSEMENT_EXISTANTS)) expect(parId.has(id), id).toBe(true);
  });

  it('chaque nouvel exercice est complet et exclu de la génération IA', () => {
    for (const ex of EXERCICES_MOUVAPA) {
      expect(ex.horsCatalogueIA, ex.id).toBe(true);
      expect(ex.description.length, ex.id).toBeGreaterThan(20);
      expect(ex.consigneSecurite, ex.id).toBeTruthy();
      expect(ex.familles?.length, ex.id).toBeGreaterThan(0);
      expect(ex.positionRequise, ex.id).toBeTruthy();
      for (const n of ['1', '2', '3'] as const) {
        const c = ex.niveau_config![n];
        expect(c.series, ex.id).toBeGreaterThanOrEqual(1);
        // Répétitions OU durée, jamais les deux ni aucun.
        expect((c.repetitions == null) !== (c.duree_secondes == null), `${ex.id} niveau ${n}`).toBe(true);
      }
    }
  });

  it('Pilates : consigne respiratoire systématique', () => {
    for (const ex of EXERCICES_MOUVAPA.filter(e => e.familles?.includes('pilates'))) {
      expect(ex.respiration, ex.id).toBe(RESPIRATION_PILATES);
    }
  });

  it('avec des poids : les bouteilles d\'eau sont proposées en remplacement', () => {
    for (const ex of EXERCICES_MOUVAPA.filter(e => e.materiels?.includes('petits_poids'))) {
      expect(ex.description, ex.id).toMatch(/bouteilles d'eau/);
    }
  });

  it('paramètres de départ conformes : renforcement 2-3 × 8-15, souplesse et équilibre tenus 20-30 s', () => {
    for (const ex of EXERCICES_MOUVAPA) {
      const n2 = ex.niveau_config!['2'];
      const pilates = ex.familles?.includes('pilates');
      if (ex.categorie === 'force' && !pilates) {
        expect(n2.series, ex.id).toBeGreaterThanOrEqual(2);
        expect(n2.series, ex.id).toBeLessThanOrEqual(3);
        expect(n2.repetitions, ex.id).toBeGreaterThanOrEqual(8);
        expect(n2.repetitions, ex.id).toBeLessThanOrEqual(15);
      }
      // Tenues statiques seulement : un exercice d'équilibre qui fait marcher se compte en minutes.
      const dynamique = /marche/i.test(ex.nom) || ex.familles?.includes('cardio');
      if ((ex.categorie === 'souplesse' || ex.categorie === 'equilibre') && n2.duree_secondes != null && !dynamique) {
        expect(n2.duree_secondes, ex.id).toBeGreaterThanOrEqual(20);
        expect(n2.duree_secondes, ex.id).toBeLessThanOrEqual(30);
      }
    }
  });
});

describe('modèles Mouv\'APA', () => {
  it('environ 60 modèles, identifiants et noms uniques', () => {
    expect(MODELES_MOUVAPA.length).toBe(60);
    expect(new Set(MODELES_MOUVAPA.map(m => m.id)).size).toBe(60);
    expect(new Set(MODELES_MOUVAPA.map(m => m.nom)).size).toBe(60);
  });

  it('chaque modèle est réellement utilisable : 6 à 10 exercices, tous présents dans le catalogue', () => {
    for (const m of MODELES_MOUVAPA) {
      expect(m.exercices.length, m.id).toBeGreaterThanOrEqual(6);
      expect(m.exercices.length, m.id).toBeLessThanOrEqual(10);
      for (const e of m.exercices) expect(parId.has(e.ref), `${m.id} → ${e.ref}`).toBe(true);
      expect(resoudreExercices(m, EXERCICES_BASE)).toHaveLength(m.exercices.length);
    }
  });

  it('chaque exercice d\'un modèle a une position connue', () => {
    for (const m of MODELES_MOUVAPA) {
      for (const e of m.exercices) expect(positionDe(parId.get(e.ref)!), `${m.id} → ${e.ref}`).not.toBeNull();
    }
  });

  it('« 100 % assis » ne fait jamais se lever, « debout » jamais assis seulement, « au sol » jamais debout', () => {
    const permises = { assis: ['assis', 'tous'], debout: ['debout', 'tous'], sol: ['couche', 'tous'] } as const;
    for (const m of MODELES_MOUVAPA) {
      if (m.position === 'mixte') continue;
      for (const e of m.exercices) {
        const pos = positionDe(parId.get(e.ref)!);
        expect((permises[m.position] as readonly string[]).includes(pos ?? ''), `${m.nom} contient ${e.ref} (${pos})`).toBe(true);
      }
    }
  });

  it('« mixte » combine réellement au moins deux positions', () => {
    for (const m of MODELES_MOUVAPA.filter(x => x.position === 'mixte')) {
      const positions = new Set(m.exercices.map(e => positionDe(parId.get(e.ref)!)).filter(p => p !== 'tous'));
      expect(positions.size, m.nom).toBeGreaterThanOrEqual(2);
    }
  });

  it('les modèles Pilates intègrent la respiration et sont majoritairement des exercices Pilates', () => {
    for (const m of MODELES_MOUVAPA.filter(x => x.famille === 'pilates')) {
      const exos = m.exercices.map(e => parId.get(e.ref)!);
      expect(exos.some(ex => famillesDe(ex).includes('respiration')), m.nom).toBe(true);
      expect(exos.filter(ex => famillesDe(ex).includes('pilates')).length * 2, m.nom).toBeGreaterThanOrEqual(exos.length);
    }
  });

  it('un modèle « élastique » contient bien de l\'élastique', () => {
    for (const m of MODELES_MOUVAPA.filter(x => /élastique/i.test(x.nom))) {
      expect(materielsDuModele(m, EXERCICES_BASE), m.nom).toContain('elastique');
    }
  });

  it('aucun modèle n\'est associé à une pathologie (le professionnel choisit)', () => {
    const pathologies = /diab|avc|parkinson|scl[ée]rose|\bsep\b|ob[ée]sit|proth[èe]se|cancer|alzheimer|arthrose|bpco|insuffisance/i;
    for (const m of MODELES_MOUVAPA) {
      expect(`${m.nom} ${m.objectif}`, m.id).not.toMatch(pathologies);
    }
  });

  it('les routines de 10 minutes restent courtes', () => {
    for (const m of MODELES_MOUVAPA.filter(x => /10 min/.test(x.nom))) {
      expect(dureeIndicative(m, EXERCICES_BASE), m.nom).toBeLessThanOrEqual(15);
    }
  });
});

describe('copie d\'un modèle vers « Mes modèles »', () => {
  it('produit une séance complète, planifiée par défaut, avec la respiration Pilates dans la consigne', () => {
    const modele = MODELES_MOUVAPA.find(m => m.id === 'mod-pilates-chaise-complet')!;
    const donnees = versDonneesModele(modele, EXERCICES_BASE);
    expect(donnees.nom).toBe(modele.nom);
    expect(donnees.seances).toHaveLength(1);
    expect(donnees.seances[0].exercices).toHaveLength(modele.exercices.length);
    expect(Object.values(donnees.planning).filter(Boolean)).toHaveLength(3);
    expect(donnees.seances[0].exercices.every(e => e.description?.includes('Respiration :'))).toBe(true);
    for (const e of donnees.seances[0].exercices) {
      expect((e.repetitions == null) !== (e.dureeSecondes == null), e.nom).toBe(true);
    }
  });

  it('copie indépendante : modifier la copie ne touche pas le catalogue', () => {
    const modele = MODELES_MOUVAPA[0];
    const avant = JSON.stringify(modele);
    const donnees = versDonneesModele(modele, EXERCICES_BASE);
    donnees.seances[0].exercices[0].series = 99;
    donnees.seances[0].exercices.pop();
    expect(JSON.stringify(modele)).toBe(avant);
    expect(versDonneesModele(modele, EXERCICES_BASE).seances[0].exercices[0].series).not.toBe(99);
  });
});
