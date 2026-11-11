import { supabase } from '../../lib/supabase';
import { lireProgrammeActif, lireSeancesProgramme, lireExercicesProgramme, lirePlanningProgramme } from '../../lib/acces/assistant';
import { EXERCICES_BASE } from '../../data/exercices';
import { formatExerciceV1Ligne, formatExerciceV2Ligne, type ProgrammeResume } from '../../utils/assistantContexte';

/** Charge le programme actif d'un patient directement depuis Supabase (requête
 *  scopée, pas de hook réactif) — un hook keyed sur le patient sélectionné
 *  introduirait un risque de lire les données de l'ancien patient au moment
 *  où runAction() construit le prompt juste après la sélection.
 *  Gère les deux formats qui partagent la table `programmes` (colonne `type`
 *  NULL = V1 legacy avec exercices catalogués ; `type` renseigné = V2 avec
 *  séances + planning dans des tables séparées). */
export async function chargerProgrammeActif(patientId: string): Promise<ProgrammeResume | null> {
  if (!supabase) return null;

  const { data: progRows } = await lireProgrammeActif(patientId);
  const row = progRows?.[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  if (row.type) {
    const { data: seanceRows } = await lireSeancesProgramme(row.id);
    const seances = (seanceRows ?? []) as { id: string }[];
    const [exRes, planRes] = await Promise.all([
      seances.length > 0
        ? lireExercicesProgramme(seances.map(s => s.id))
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      lirePlanningProgramme(row.id),
    ]);
    const exRows = (exRes.data ?? []) as Record<string, unknown>[];
    const planRows = (planRes.data ?? []) as Record<string, unknown>[];

    const lignes = seances.flatMap(s => {
      const jours = planRows.filter(p => p.seance_id === s.id).map(p => p.jour as string);
      return exRows
        .filter(e => e.seance_id === s.id)
        .map(e => formatExerciceV2Ligne(
          { nom: (e.nom as string) ?? '', series: (e.series as number) ?? undefined, repetitions: (e.repetitions as number) ?? undefined, dureeSecondes: (e.duree_secondes as number) ?? undefined },
          jours,
        ));
    });
    return {
      titre: (row.nom as string) || (row.titre as string) || 'Programme',
      objectif: (row.objectif as string) || null,
      messageMotivation: (row.message_motivation as string) || null,
      lignesExercices: lignes,
    };
  }

  const exercices = (row.exercices ?? []) as { exerciceId: string; niveau?: string; series?: number; repetitions?: number | null; dureeSecondes?: number | null; frequenceParSemaine?: number[] }[];
  const lignes = exercices.map(ex => {
    const nom = EXERCICES_BASE.find(e => e.id === ex.exerciceId)?.nom ?? ex.exerciceId;
    return formatExerciceV1Ligne(nom, ex);
  });
  return {
    titre: (row.titre as string) || 'Programme',
    objectif: (row.objectif as string) || null,
    messageMotivation: (row.message_motivation as string) || null,
    lignesExercices: lignes,
  };
}
