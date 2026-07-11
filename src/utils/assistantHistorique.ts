// Logique pure de regroupement/filtrage de l'historique "Questions récentes"
// (src/pages/AssistantPage.tsx). Extraite pour être testable sans monter le
// composant React (pas de jsdom/RTL dans ce projet — voir vitest.config.ts).

export interface LogHistorique {
  id: string;
  question: string;
  reponse: string;
  patient_id: string | null;
  created_at: string;
}

/** Un "fil" = toutes les entrées d'un même bénéficiaire portant EXACTEMENT la
 *  même question. Couvre à la fois les régénérations (🔄, même intitulé
 *  renvoyé volontairement à l'identique) et les répétitions manuelles de la
 *  même action le même jour — les deux cas encombrent la liste de la même
 *  façon et se règlent avec la même règle de regroupement.
 *  entries[0] = version la plus récente ; les suivantes sont les versions
 *  antérieures (dont la version d'origine), repliables sous la première. */
export interface FilHistorique {
  question: string;
  entries: LogHistorique[];
  derniereActivite: string;
}

export interface GroupeBeneficiaire {
  patientId: string | null;
  fils: FilHistorique[];
  derniereActivite: string;
}

/** Filtre sur le texte de la question OU le nom du bénéficiaire associé. */
export function filtrerLogsHistorique(
  logs: LogHistorique[],
  recherche: string,
  nomPatient: (patientId: string | null) => string,
): LogHistorique[] {
  const q = recherche.trim().toLowerCase();
  if (!q) return logs;
  return logs.filter(l =>
    l.question.toLowerCase().includes(q) || nomPatient(l.patient_id).toLowerCase().includes(q));
}

/** Regroupe par bénéficiaire (triés par dernière activité décroissante), puis
 *  par fil de question identique à l'intérieur (idem, dernière activité décroissante). */
export function regrouperLogsParBeneficiaire(logs: LogHistorique[]): GroupeBeneficiaire[] {
  const parBeneficiaire = new Map<string | null, LogHistorique[]>();
  for (const log of logs) {
    const liste = parBeneficiaire.get(log.patient_id) ?? [];
    liste.push(log);
    parBeneficiaire.set(log.patient_id, liste);
  }

  const groupes: GroupeBeneficiaire[] = [];
  for (const [patientId, logsPatient] of parBeneficiaire) {
    const parQuestion = new Map<string, LogHistorique[]>();
    for (const log of logsPatient) {
      const cle = log.question.trim();
      const liste = parQuestion.get(cle) ?? [];
      liste.push(log);
      parQuestion.set(cle, liste);
    }

    const fils: FilHistorique[] = [...parQuestion.entries()].map(([question, entries]) => {
      const triees = [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at));
      return { question, entries: triees, derniereActivite: triees[0].created_at };
    }).sort((a, b) => b.derniereActivite.localeCompare(a.derniereActivite));

    groupes.push({ patientId, fils, derniereActivite: fils[0].derniereActivite });
  }

  return groupes.sort((a, b) => b.derniereActivite.localeCompare(a.derniereActivite));
}
