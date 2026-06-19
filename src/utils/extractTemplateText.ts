// Extraction du texte d'un template de compte rendu (PDF ou Word), entièrement
// côté client : le fichier n'est jamais envoyé à un serveur pour cette étape,
// il reste en mémoire le temps de l'extraction puis n'est plus référencé.

import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore — pas de types pour cet import d'URL spécifique à Vite
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type TemplateFormat = 'pdf' | 'docx';

export interface TemplateExtraction {
  texte: string;
  format: TemplateFormat;
  avertissement: string | null;
}

export function detecterFormat(file: File): TemplateFormat | null {
  const nom = file.name.toLowerCase();
  if (nom.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  if (nom.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  return null;
}

async function extraireTextePdf(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const contenu = await page.getTextContent();
    const texte = contenu.items.map(item => ('str' in item ? item.str : '')).join(' ');
    pages.push(texte);
  }
  return pages.join('\n\n').trim();
}

async function extraireTexteDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value.trim();
}

/** Extrait le texte d'un template uploadé (PDF ou Word). */
export async function extraireTexteTemplate(file: File): Promise<TemplateExtraction> {
  const format = detecterFormat(file);
  if (!format) {
    throw new Error('Format de fichier non supporté — utilisez un PDF ou un document Word (.docx)');
  }

  const texte = format === 'pdf' ? await extraireTextePdf(file) : await extraireTexteDocx(file);

  const avertissement = texte.length < 30
    ? 'Le texte extrait est très court — si le PDF est un document scanné (image), l\'extraction peut être incomplète ou vide. Vérifiez le résultat avant de continuer.'
    : null;

  return { texte, format, avertissement };
}
