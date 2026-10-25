import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import type { CategorieSeance } from '../types';
import { supabase } from '../lib/supabase';
import { dbToCategorieSeance } from '../lib/mappers';

// Catégories de séance du praticien (nom + couleur), partagées entre mobile et PC par la base
// (table categories_seance, RLS par praticien). Aucune catégorie n'est imposée : la liste est vide
// tant que le praticien n'en crée pas.

export const COULEUR_CATEGORIE_PAR_DEFAUT = '#6B7280';
export const COULEUR_CATEGORIE_BILAN = '#8B5CF6';

export function useCategoriesSeance() {
  const [categories, setCategories] = useState<CategorieSeance[]>([]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase
      .from('categories_seance')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.error('Erreur chargement catégories de séance:', error); return; }
        setCategories((data ?? []).map(dbToCategorieSeance));
      });
    return () => { cancelled = true; };
  }, []);

  async function creerCategorie(nom: string, couleur: string, estBilan = false): Promise<CategorieSeance | null> {
    const nouvelle: CategorieSeance = { id: uuidv4(), nom: nom.trim(), couleur, estBilan };
    if (supabase) {
      const { error } = await supabase.from('categories_seance')
        .insert({ id: nouvelle.id, nom: nouvelle.nom, couleur, est_bilan: estBilan });
      if (error) {
        console.error('Erreur création catégorie de séance:', error);
        toast.error('Impossible de créer la catégorie.');
        return null;
      }
    }
    setCategories(prev => [...prev, nouvelle]);
    return nouvelle;
  }

  async function modifierCategorie(id: string, patch: { nom?: string; couleur?: string }): Promise<boolean> {
    if (supabase) {
      const { error } = await supabase.from('categories_seance')
        .update({ ...(patch.nom !== undefined ? { nom: patch.nom.trim() } : {}), ...(patch.couleur ? { couleur: patch.couleur } : {}) })
        .eq('id', id);
      if (error) {
        console.error('Erreur modification catégorie de séance:', error);
        toast.error('Impossible de modifier la catégorie.');
        return false;
      }
    }
    setCategories(prev => prev.map(c => c.id === id
      ? { ...c, ...(patch.nom !== undefined ? { nom: patch.nom.trim() } : {}), ...(patch.couleur ? { couleur: patch.couleur } : {}) }
      : c));
    return true;
  }

  // Les séances qui la portaient ne sont pas supprimées : categorie_id passe à NULL (ON DELETE SET NULL).
  // Le state des séances (useAgenda) n'est pas rafraîchi ici : l'appelant retire la couleur à l'affichage
  // puisque la catégorie n'existe plus dans `categories`.
  async function supprimerCategorie(id: string): Promise<boolean> {
    if (supabase) {
      const { error } = await supabase.from('categories_seance').delete().eq('id', id);
      if (error) {
        console.error('Erreur suppression catégorie de séance:', error);
        toast.error('Impossible de supprimer la catégorie.');
        return false;
      }
    }
    setCategories(prev => prev.filter(c => c.id !== id));
    return true;
  }

  // Une seule catégorie « Bilan » par praticien (index unique en base) : on retire d'abord le
  // marqueur des autres, par identifiant explicite, puis on le pose.
  async function definirCategorieBilan(id: string): Promise<boolean> {
    const autres = categories.filter(c => c.estBilan && c.id !== id).map(c => c.id);
    if (supabase) {
      for (const autreId of autres) {
        const { error } = await supabase.from('categories_seance').update({ est_bilan: false }).eq('id', autreId);
        if (error) { console.error('Erreur catégorie Bilan:', error); toast.error('Impossible de définir la catégorie Bilan.'); return false; }
      }
      const { error } = await supabase.from('categories_seance').update({ est_bilan: true }).eq('id', id);
      if (error) { console.error('Erreur catégorie Bilan:', error); toast.error('Impossible de définir la catégorie Bilan.'); return false; }
    }
    setCategories(prev => prev.map(c => ({ ...c, estBilan: c.id === id })));
    return true;
  }

  // Catégorie utilisée par les bilans automatiques : celle que le praticien a désignée, sinon une
  // catégorie « Bilan » violette créée à la première activation (modifiable ensuite comme les autres).
  async function categorieBilan(): Promise<CategorieSeance | null> {
    const existante = categories.find(c => c.estBilan);
    if (existante) return existante;
    return creerCategorie('Bilan', COULEUR_CATEGORIE_BILAN, true);
  }

  return { categories, creerCategorie, modifierCategorie, supprimerCategorie, definirCategorieBilan, categorieBilan };
}
