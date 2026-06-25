// Détection du type de template uploadé (PDF avec champs de formulaire
// AcroForm vs document statique) afin de choisir le bon flux de
// remplissage. Tout se passe côté client, pdf-lib est chargé en lazy
// (comme mammoth) pour ne pas alourdir le bundle initial.

import { extraireTexteTemplate, detecterFormat, type TemplateFormat } from './extractTemplateText';

export type ChampTypeFormulaire = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'autre';

export interface ChampFormulaire {
  nom: string;
  type: ChampTypeFormulaire;
  options?: string[];
}

export type DetectionTemplate =
  | { type: 'acroform'; champs: ChampFormulaire[]; pdfBytes: ArrayBuffer; format: 'pdf' }
  | { type: 'statique'; texte: string; format: TemplateFormat; pdfBytes: ArrayBuffer | null; avertissement: string | null };

function typeChamp(nomClasse: string): ChampTypeFormulaire {
  if (nomClasse === 'PDFCheckBox') return 'checkbox';
  if (nomClasse === 'PDFRadioGroup') return 'radio';
  if (nomClasse === 'PDFDropdown' || nomClasse === 'PDFOptionList') return 'dropdown';
  if (nomClasse === 'PDFTextField') return 'text';
  return 'autre';
}

/** Détecte les champs AcroForm d'un PDF. Retourne null si aucun champ (PDF statique). */
async function detecterChampsAcroForm(buffer: ArrayBuffer): Promise<ChampFormulaire[] | null> {
  const { PDFDocument } = await import('pdf-lib');
  try {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const fields = pdfDoc.getForm().getFields();
    if (fields.length === 0) return null;

    return fields.map(f => {
      const type = typeChamp(f.constructor.name);
      const champ: ChampFormulaire = { nom: f.getName(), type };
      if (type === 'radio' || type === 'dropdown') {
        try {
          champ.options = (f as unknown as { getOptions(): string[] }).getOptions();
        } catch {
          // Certains champs liste/radio n'exposent pas d'options exploitables — on continue sans.
        }
      }
      return champ;
    });
  } catch {
    return null;
  }
}

/** Détecte si un fichier uploadé est un PDF à remplir (AcroForm) ou un document statique. */
export async function detecterTypeTemplate(file: File): Promise<DetectionTemplate> {
  const format = detecterFormat(file);
  if (!format) {
    throw new Error('Format de fichier non supporté — utilisez un PDF ou un document Word (.docx)');
  }

  if (format === 'docx') {
    const { texte, avertissement } = await extraireTexteTemplate(file);
    return { type: 'statique', texte, format, pdfBytes: null, avertissement };
  }

  const buffer = await file.arrayBuffer();
  const champs = await detecterChampsAcroForm(buffer);
  if (champs) {
    return { type: 'acroform', champs, pdfBytes: buffer, format: 'pdf' };
  }

  const { texte, avertissement } = await extraireTexteTemplate(file);
  return { type: 'statique', texte, format, pdfBytes: buffer, avertissement };
}
