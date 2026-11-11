// Bibliothèque d'exercices du praticien : exercices personnalisés et dossiers,
// en base (Supabase) ou en local (ancien stockage navigateur).
//
// Extrait de src/data/exercices.ts le 2026-11-11 : ce fichier-là ne contient
// plus que le référentiel (données statiques), celui-ci les lectures et
// écritures. Code déplacé à l'identique.
import type { CategorieExercice, Exercice, DossierExercice, DossierExerciceMembre, TypeExerciceRef } from '../types';
import { supabase } from './supabase';
import { utilisateurCourant } from './session';
import { EXERCICES_BASE } from '../data/exercices';

const CUSTOM_KEY = 'mouvtrack_custom_exercices';

export function loadExercices(): Exercice[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    const custom: Exercice[] = raw ? JSON.parse(raw) : [];
    return [...EXERCICES_BASE, ...custom];
  } catch {
    return EXERCICES_BASE;
  }
}

export function saveCustomExercice(ex: Exercice) {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    const custom: Exercice[] = raw ? JSON.parse(raw) : [];
    custom.push({ ...ex, custom: true });
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom));
  } catch {
    console.error('Erreur sauvegarde exercice');
  }
}

// ── Bibliothèque Supabase (côté praticien uniquement) ───────────────────────
// exercices_personnalises n'a pas de trigger connu pour remplir praticien_id
// automatiquement (aucune contrainte FK ni trigger confirmés côté base,
// voir supabase/migrations/20260716_bibliotheque_exercices.sql) — on le
// fournit donc explicitement à chaque insert plutôt que de compter dessus.

const CUSTOM_CACHE_KEY = 'mouvtrack_custom_exercices_cache';

function rowToExercicePersonnalise(row: Record<string, unknown>): Exercice {
  return {
    id: row.id as string,
    nom: row.nom as string,
    categorie: row.categorie as CategorieExercice,
    description: row.description as string,
    consigneSecurite: (row.consigne_securite as string | null) ?? undefined,
    photoUrl: (row.photo_url as string | null) ?? undefined,
    videoYoutubeId: (row.video_youtube_id as string | null) ?? undefined,
    niveaux: row.niveaux as Exercice['niveaux'],
    materielNecessaire: (row.materiel_necessaire as string | null) ?? undefined,
    dureeEstimeeMinutes: row.duree_estimee_minutes as number,
    custom: true,
    profilsCompatibles: (row.profils_compatibles as Exercice['profilsCompatibles']) ?? undefined,
    adaptations: (row.adaptations as Exercice['adaptations']) ?? undefined,
    positionRequise: (row.position_requise as Exercice['positionRequise']) ?? undefined,
    niveauMobilite: (row.niveau_mobilite as Exercice['niveauMobilite']) ?? undefined,
    reference: (row.reference as string | null) ?? undefined,
    niveau_config: (row.niveau_config as Exercice['niveau_config']) ?? undefined,
  };
}

/**
 * Remplacement praticien de loadExercices() : lit exercices_personnalises
 * sur Supabase. Repli propre en cas d'échec réseau/permissions — ne lève
 * jamais, retourne toujours un tableau exploitable (cache local si présent,
 * sinon EXERCICES_BASE seul). Ne pas utiliser côté patient (EspacePatient.tsx,
 * ClientProgramme.tsx) : ces pages n'ont pas de session Supabase, voir
 * mémoire "bug-catalogue-exercices-patient-v1".
 */
export async function loadExercicesPraticien(): Promise<Exercice[]> {
  if (!supabase) return EXERCICES_BASE;
  try {
    const { data, error } = await supabase
      .from('exercices_personnalises')
      .select('*')
      .order('ordre');
    if (error) throw error;

    const custom = (data ?? []).map(rowToExercicePersonnalise);
    try {
      localStorage.setItem(CUSTOM_CACHE_KEY, JSON.stringify(custom));
    } catch {
      // Cache best-effort — un échec d'écriture localStorage ne doit pas
      // empêcher de retourner les exercices fraîchement chargés.
    }
    return [...EXERCICES_BASE, ...custom];
  } catch (err) {
    console.error('Erreur chargement exercices personnalisés, repli sur le cache local:', err);
    try {
      const raw = localStorage.getItem(CUSTOM_CACHE_KEY);
      const cached: Exercice[] = raw ? JSON.parse(raw) : [];
      return [...EXERCICES_BASE, ...cached];
    } catch {
      return EXERCICES_BASE;
    }
  }
}

/**
 * Crée un exercice personnalisé sur Supabase. Contrairement à la lecture,
 * un échec ici doit être visible côté appelant (toast d'erreur) plutôt que
 * de se replier silencieusement — l'utilisateur doit savoir que son
 * exercice n'a pas été sauvegardé.
 */
export async function saveExercicePersonnalise(ex: Omit<Exercice, 'id'>): Promise<Exercice | null> {
  if (!supabase) return null;
  try {
    const user = await utilisateurCourant();
    if (!user) return null;

    const { data, error } = await supabase
      .from('exercices_personnalises')
      .insert({
        praticien_id: user.id,
        nom: ex.nom,
        categorie: ex.categorie,
        description: ex.description,
        consigne_securite: ex.consigneSecurite ?? null,
        photo_url: ex.photoUrl ?? null,
        video_youtube_id: ex.videoYoutubeId ?? null,
        niveaux: ex.niveaux,
        materiel_necessaire: ex.materielNecessaire ?? null,
        duree_estimee_minutes: ex.dureeEstimeeMinutes,
        profils_compatibles: ex.profilsCompatibles ?? null,
        adaptations: ex.adaptations ?? null,
        position_requise: ex.positionRequise ?? null,
        niveau_mobilite: ex.niveauMobilite ?? null,
        reference: ex.reference ?? null,
        niveau_config: ex.niveau_config ?? null,
      })
      .select()
      .single();

    if (error || !data) {
      console.error('Erreur sauvegarde exercice personnalisé:', error);
      return null;
    }
    return rowToExercicePersonnalise(data as Record<string, unknown>);
  } catch (err) {
    console.error('Erreur sauvegarde exercice personnalisé:', err);
    return null;
  }
}

// ── Migration localStorage → Supabase (bandeau ExercicesPage.tsx) ──────────

const MIGRATION_FLAG_KEY = 'mouvtrack_custom_exercices_migre';

/** Lit les exercices encore stockés localement, sans y toucher. */
export function getExercicesLocaux(): Exercice[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function migrationExercicesDejaFaite(): boolean {
  return localStorage.getItem(MIGRATION_FLAG_KEY) === 'true';
}

/**
 * Importe les exercices du localStorage vers exercices_personnalises, en
 * réutilisant les id générés côté client à la création originale (upsert
 * sur id, jamais de nouvel UUID) — rejouer cette fonction plusieurs fois
 * (échec partiel, double clic) ne crée jamais de doublons. Ne pose le flag
 * de migration que sur un succès complet ; sur échec, le bandeau doit
 * pouvoir réessayer au prochain clic.
 */
export async function migrerExercicesLocalStorageVersSupabase(): Promise<{ count: number } | null> {
  if (!supabase) return null;
  const locaux = getExercicesLocaux();
  if (locaux.length === 0) {
    localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
    return { count: 0 };
  }

  try {
    const user = await utilisateurCourant();
    if (!user) return null;

    const rows = locaux.map(ex => ({
      id: ex.id,
      praticien_id: user.id,
      nom: ex.nom,
      categorie: ex.categorie,
      description: ex.description,
      consigne_securite: ex.consigneSecurite ?? null,
      photo_url: ex.photoUrl ?? null,
      video_youtube_id: ex.videoYoutubeId ?? null,
      niveaux: ex.niveaux,
      materiel_necessaire: ex.materielNecessaire ?? null,
      duree_estimee_minutes: ex.dureeEstimeeMinutes,
      profils_compatibles: ex.profilsCompatibles ?? null,
      adaptations: ex.adaptations ?? null,
      position_requise: ex.positionRequise ?? null,
      niveau_mobilite: ex.niveauMobilite ?? null,
      reference: ex.reference ?? null,
      niveau_config: ex.niveau_config ?? null,
    }));

    const { error } = await supabase
      .from('exercices_personnalises')
      .upsert(rows, { onConflict: 'id' });

    if (error) {
      console.error('Erreur import localStorage → Supabase:', error);
      return null;
    }

    localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
    return { count: rows.length };
  } catch (err) {
    console.error('Erreur import localStorage → Supabase:', err);
    return null;
  }
}

// ── Dossiers d'exercices ─────────────────────────────────────────────────────
// Même remarque que plus haut : pas de trigger connu pour praticien_id sur
// dossiers_exercices, fourni explicitement à chaque insert.

function rowToDossierExercice(row: Record<string, unknown>): DossierExercice {
  return {
    id: row.id as string,
    nom: row.nom as string,
    ordre: (row.ordre as number) ?? 0,
  };
}

export async function loadDossiersExercices(): Promise<DossierExercice[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('dossiers_exercices')
      .select('*')
      .order('ordre');
    if (error) throw error;
    return (data ?? []).map(rowToDossierExercice);
  } catch (err) {
    console.error('Erreur chargement dossiers:', err);
    return [];
  }
}

export async function creerDossierExercice(nom: string, ordre: number): Promise<DossierExercice | null> {
  if (!supabase) return null;
  try {
    const user = await utilisateurCourant();
    if (!user) return null;

    const { data, error } = await supabase
      .from('dossiers_exercices')
      .insert({ praticien_id: user.id, nom, ordre })
      .select()
      .single();

    if (error || !data) {
      console.error('Erreur création dossier:', error);
      return null;
    }
    return rowToDossierExercice(data as Record<string, unknown>);
  } catch (err) {
    console.error('Erreur création dossier:', err);
    return null;
  }
}

/** Met à jour le champ ordre de plusieurs dossiers en une fois (tri manuel). */
export async function reordonnerDossiersExercices(ordres: { id: string; ordre: number }[]): Promise<boolean> {
  if (!supabase) return false;
  try {
    for (const { id, ordre } of ordres) {
      const { error } = await supabase.from('dossiers_exercices').update({ ordre }).eq('id', id);
      if (error) throw error;
    }
    return true;
  } catch (err) {
    console.error('Erreur tri des dossiers:', err);
    return false;
  }
}

// ── Rattachement exercice ↔ dossier (base ou personnalisé) ─────────────────
// Table dossier_exercice_membres (20260718_dossier_exercice_membres.sql).
// Remplace deplacerExercicePersonnalise/reordonnerExercicesPersonnalises
// (exercices_personnalises.dossier_id/ordre) — colonnes laissées en base
// mais volontairement plus lues ni écrites ici. Multi-dossier assumé : un
// exercice peut appartenir à plusieurs dossiers, ajouter n'en retire jamais
// d'un autre.

function rowToDossierExerciceMembre(row: Record<string, unknown>): DossierExerciceMembre {
  return {
    id: row.id as string,
    dossierId: row.dossier_id as string,
    exerciceRef: row.exercice_ref as string,
    typeExercice: row.type_exercice as TypeExerciceRef,
    ordre: (row.ordre as number) ?? 0,
  };
}

/** Charge tous les rattachements exercice↔dossier du praticien courant. */
export async function loadMembresDossiers(): Promise<DossierExerciceMembre[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('dossier_exercice_membres')
      .select('*')
      .order('ordre');
    if (error) throw error;
    return (data ?? []).map(rowToDossierExerciceMembre);
  } catch (err) {
    console.error('Erreur chargement rattachements dossiers:', err);
    return [];
  }
}

/** Ajoute un exercice (base ou personnalisé) à un dossier. Idempotent : ne
 *  crée pas de doublon si déjà présent (contrainte UNIQUE côté base). */
export async function ajouterExerciceADossier(
  dossierId: string, exerciceRef: string, typeExercice: TypeExerciceRef, ordre = 0,
): Promise<DossierExerciceMembre | null> {
  if (!supabase) return null;
  try {
    const user = await utilisateurCourant();
    if (!user) return null;

    const { data, error } = await supabase
      .from('dossier_exercice_membres')
      .upsert(
        { praticien_id: user.id, dossier_id: dossierId, exercice_ref: exerciceRef, type_exercice: typeExercice, ordre },
        { onConflict: 'praticien_id,dossier_id,type_exercice,exercice_ref', ignoreDuplicates: false },
      )
      .select()
      .single();

    if (error || !data) { console.error('Erreur ajout exercice au dossier:', error); return null; }
    return rowToDossierExerciceMembre(data as Record<string, unknown>);
  } catch (err) {
    console.error('Erreur ajout exercice au dossier:', err);
    return null;
  }
}

/** Retire un exercice d'un dossier précis (les autres dossiers ne sont pas affectés). */
export async function retirerExerciceDeDossier(
  dossierId: string, exerciceRef: string, typeExercice: TypeExerciceRef,
): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('dossier_exercice_membres')
    .delete()
    .eq('dossier_id', dossierId)
    .eq('exercice_ref', exerciceRef)
    .eq('type_exercice', typeExercice);
  if (error) { console.error('Erreur retrait exercice du dossier:', error); return false; }
  return true;
}
