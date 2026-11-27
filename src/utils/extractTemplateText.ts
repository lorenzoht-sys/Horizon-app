// Extraction du texte d'un template de compte rendu (PDF ou Word), entièrement
// côté client : le fichier n'est jamais envoyé à un serveur pour cette étape,
// il reste en mémoire le temps de l'extraction puis n'est plus référencé.

type TemplateFormat = 'pdf' | 'docx';

export function detecterFormat(file: File): TemplateFormat | null {
  const nom = file.name.toLowerCase();
  if (nom.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  if (nom.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  return null;
}

