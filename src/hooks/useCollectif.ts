import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { ContenuExerciceCollectif, ContenuModeleCollectif } from '../lib/collectif';

// Bibliothèque collective : lecture, publication et retrait (tables exercices_collectifs et
// modeles_collectifs, migration 20261102100000). La RLS fait foi : lecture pour tout compte
// enseignant, publication en son propre nom, retrait par l'auteur ou un admin, aucune modification.
// L'auteur affiché (« Prénom N. ») est calculé par la base, jamais envoyé par le client.

export interface ExerciceCollectif {
  id: string;
  praticienId: string;
  auteurNom: string;
  nom: string;
  categorie: string;
  familles: string[];
  materiels: string[];
  position: string | null;
  contenu: ContenuExerciceCollectif;
  createdAt: string;
}

export interface ModeleCollectif {
  id: string;
  praticienId: string;
  auteurNom: string;
  nom: string;
  objectif: string | null;
  famille: string | null;
  position: string | null;
  niveau: string | null;
  materiels: string[];
  nbExercices: number;
  dureeMinutes: number | null;
  contenu: ContenuModeleCollectif;
  createdAt: string;
}

export interface PublicationExercice {
  sourceExerciceId?: string;
  nom: string;
  categorie: string;
  familles: string[];
  materiels: string[];
  position: string | null;
  contenu: ContenuExerciceCollectif;
}

export interface PublicationModele {
  sourceModeleId?: string;
  nom: string;
  objectif: string | null;
  famille: string | null;
  position: string | null;
  niveau: string | null;
  materiels: string[];
  nbExercices: number;
  dureeMinutes: number | null;
  contenu: ContenuModeleCollectif;
}

const estUuid = (v?: string) => !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

function versExercice(r: Record<string, unknown>): ExerciceCollectif {
  return {
    id: r.id as string,
    praticienId: r.praticien_id as string,
    auteurNom: (r.auteur_nom as string) || 'Enseignant APA',
    nom: r.nom as string,
    categorie: r.categorie as string,
    familles: (r.familles as string[] | null) ?? [],
    materiels: (r.materiels as string[] | null) ?? [],
    position: (r.position as string | null) ?? null,
    contenu: r.contenu as ContenuExerciceCollectif,
    createdAt: r.created_at as string,
  };
}

function versModele(r: Record<string, unknown>): ModeleCollectif {
  return {
    id: r.id as string,
    praticienId: r.praticien_id as string,
    auteurNom: (r.auteur_nom as string) || 'Enseignant APA',
    nom: r.nom as string,
    objectif: (r.objectif as string | null) ?? null,
    famille: (r.famille as string | null) ?? null,
    position: (r.position as string | null) ?? null,
    niveau: (r.niveau as string | null) ?? null,
    materiels: (r.materiels as string[] | null) ?? [],
    nbExercices: (r.nb_exercices as number | null) ?? 0,
    dureeMinutes: (r.duree_minutes as number | null) ?? null,
    contenu: r.contenu as ContenuModeleCollectif,
    createdAt: r.created_at as string,
  };
}

/** Message lisible pour une erreur Supabase de publication (garde-fou du trigger compris). */
export function messageErreurCollectif(message?: string): string {
  if (message?.includes('nom d\'un bénéficiaire') || message?.includes("nom d''un")) {
    return 'Publication refusée : le contenu contient le nom d\'un de vos bénéficiaires.';
  }
  if (message?.includes('does not exist') || message?.includes('schema cache')) {
    return 'La bibliothèque Collectif n\'est pas encore activée sur ce serveur.';
  }
  return 'La publication a échoué. Réessayez.';
}

export function useCollectif() {
  const [exercices, setExercices] = useState<ExerciceCollectif[]>([]);
  const [modeles, setModeles] = useState<ModeleCollectif[]>([]);
  const [chargement, setChargement] = useState(true);
  const [indisponible, setIndisponible] = useState(false);
  const [utilisateurId, setUtilisateurId] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!supabase) { setChargement(false); setIndisponible(true); return; }
    setChargement(true);
    const [{ data: { user } }, ex, mo] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('exercices_collectifs').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('modeles_collectifs').select('*').order('created_at', { ascending: false }).limit(500),
    ]);
    setUtilisateurId(user?.id ?? null);
    // Table absente (migration pas encore appliquée sur cet environnement) : écran explicatif,
    // jamais d'erreur bloquante pour le reste de la bibliothèque.
    setIndisponible(!!(ex.error && mo.error));
    setExercices(((ex.data ?? []) as Record<string, unknown>[]).map(versExercice));
    setModeles(((mo.data ?? []) as Record<string, unknown>[]).map(versModele));
    setChargement(false);
  }, []);

  useEffect(() => { void charger(); }, [charger]);

  const publierExercice = useCallback(async (p: PublicationExercice) => {
    const r = await publierExerciceCollectif(p);
    if (r.ligne) setExercices(prev => [r.ligne!, ...prev]);
    return r;
  }, []);

  const publierModele = useCallback(async (p: PublicationModele) => {
    const r = await publierModeleCollectif(p);
    if (r.ligne) setModeles(prev => [r.ligne!, ...prev]);
    return r;
  }, []);

  /** Retire une publication par son identifiant précis (auteur ou admin, la RLS tranche). */
  const retirer = useCallback(async (table: 'exercices_collectifs' | 'modeles_collectifs', id: string): Promise<boolean> => {
    if (!supabase) return false;
    const { data, error } = await supabase.from(table).delete().eq('id', id).select('id');
    // 0 ligne supprimée = refus RLS silencieux : on le signale comme un échec.
    if (error || !data || data.length !== 1) return false;
    if (table === 'exercices_collectifs') setExercices(prev => prev.filter(e => e.id !== id));
    else setModeles(prev => prev.filter(m => m.id !== id));
    return true;
  }, []);

  return { exercices, modeles, chargement, indisponible, utilisateurId, charger, publierExercice, publierModele, retirer };
}

/** Prénoms et noms de TOUS les bénéficiaires de l'enseignant (archivés compris), pour le garde-fou. */
// null = lecture impossible : l'appelant doit alors REFUSER la publication (le garde-fou ne se
// désactive jamais en silence).
export async function chargerNomsBeneficiaires(): Promise<{ prenom: string; nom: string }[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('participants').select('prenom, nom');
  if (error) return null;
  return ((data ?? []) as { prenom: string | null; nom: string | null }[]).map(p => ({ prenom: p.prenom ?? '', nom: p.nom ?? '' }));
}

// Publication hors du hook : appelée depuis « Mes exercices » et « Mes modèles », qui n'affichent pas
// la liste collective.
export async function publierExerciceCollectif(p: PublicationExercice): Promise<{ ok: boolean; erreur?: string; ligne?: ExerciceCollectif }> {
  if (!supabase) return { ok: false, erreur: 'Hors ligne' };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, erreur: 'Session expirée' };
  const { data, error } = await supabase.from('exercices_collectifs').insert({
    praticien_id: user.id,
    source_exercice_id: estUuid(p.sourceExerciceId) ? p.sourceExerciceId : null,
    nom: p.nom,
    categorie: p.categorie,
    familles: p.familles,
    materiels: p.materiels,
    position: p.position,
    contenu: p.contenu,
  }).select('*').single();
  if (error || !data) return { ok: false, erreur: messageErreurCollectif(error?.message) };
  return { ok: true, ligne: versExercice(data as Record<string, unknown>) };
}

export async function publierModeleCollectif(p: PublicationModele): Promise<{ ok: boolean; erreur?: string; ligne?: ModeleCollectif }> {
  if (!supabase) return { ok: false, erreur: 'Hors ligne' };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, erreur: 'Session expirée' };
  const { data, error } = await supabase.from('modeles_collectifs').insert({
    praticien_id: user.id,
    source_modele_id: estUuid(p.sourceModeleId) ? p.sourceModeleId : null,
    nom: p.nom,
    objectif: p.objectif,
    famille: p.famille,
    position: p.position,
    niveau: p.niveau,
    materiels: p.materiels,
    nb_exercices: p.nbExercices,
    duree_minutes: p.dureeMinutes,
    contenu: p.contenu,
  }).select('*').single();
  if (error || !data) return { ok: false, erreur: messageErreurCollectif(error?.message) };
  return { ok: true, ligne: versModele(data as Record<string, unknown>) };
}
