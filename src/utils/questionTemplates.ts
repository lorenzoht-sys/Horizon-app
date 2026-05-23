import type { TypeQuestion } from '../types';

const KEY = 'mouvtrack_question_templates';

export interface QuestionTemplate {
  id: string;
  label: string;
  type: TypeQuestion;
}

export function loadTemplates(): QuestionTemplate[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); }
  catch { return []; }
}

export function saveTemplate(t: QuestionTemplate) {
  const templates = loadTemplates();
  if (!templates.find(x => x.id === t.id)) {
    localStorage.setItem(KEY, JSON.stringify([...templates, t]));
  }
}

export function deleteTemplate(id: string) {
  localStorage.setItem(KEY, JSON.stringify(loadTemplates().filter(t => t.id !== id)));
}
