import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';
import { dbToTemplateStructure } from '../lib/mappers';
import type { TemplateStructure } from '../types';

export function useTemplatesStructure(structureId: string | undefined) {
  const [templates, setTemplates] = useState<TemplateStructure[]>([]);
  const [loading, setLoading] = useState(false);
  const [praticienId, setPraticienId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setPraticienId(user.id);
    });
  }, []);

  const charger = useCallback(async () => {
    if (!supabase || !structureId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('templates_structure')
        .select('*')
        .eq('structure_id', structureId)
        .order('nom');
      if (data) setTemplates(data.map(dbToTemplateStructure));
    } finally {
      setLoading(false);
    }
  }, [structureId]);

  useEffect(() => { void charger(); }, [charger]);

  async function creerTemplate(data: {
    nom: string;
    contenuTexte: string;
    formatOrigine: 'pdf' | 'docx' | null;
  }): Promise<TemplateStructure | null> {
    if (!supabase || !praticienId || !structureId) return null;
    const row = {
      id: uuidv4(),
      praticien_id: praticienId,
      structure_id: structureId,
      nom: data.nom,
      contenu_texte: data.contenuTexte,
      format_origine: data.formatOrigine,
    };
    const { data: inserted, error } = await supabase
      .from('templates_structure')
      .insert(row)
      .select()
      .single();
    if (error) {
      console.error('[useTemplatesStructure] create error:', error.message);
      return null;
    }
    const t = dbToTemplateStructure(inserted);
    setTemplates(prev => [...prev, t].sort((a, b) => a.nom.localeCompare(b.nom)));
    return t;
  }

  async function supprimerTemplate(id: string): Promise<void> {
    if (!supabase) return;
    await supabase.from('templates_structure').delete().eq('id', id);
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  return { templates, loading, creerTemplate, supprimerTemplate, recharger: charger };
}
