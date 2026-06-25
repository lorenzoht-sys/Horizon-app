// Détection des champs AcroForm d'un PDF template uploadé. Seul le PDF
// interactif (formulaire avec champs) est supporté : un PDF statique ou
// un Word ne peuvent pas être remplis fidèlement, donc non supportés ici.
// pdf-lib est chargé en lazy (comme mammoth ailleurs) pour ne pas alourdir
// le bundle initial.

import { detecterFormat } from './extractTemplateText';

export type ChampTypeFormulaire = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'autre';

export interface ChampFormulaire {
  nom: string;
  type: ChampTypeFormulaire;
  options?: string[];
}

export type DetectionTemplate =
  | { type: 'acroform'; champs: ChampFormulaire[]; pdfBytes: ArrayBuffer }
  | { type: 'non_supporte'; raison: string };

const MESSAGE_PDF_SANS_CHAMPS =
  'Ce PDF ne contient pas de champs de formulaire. Pour utiliser cette fonctionnalité, demandez à la structure de vous fournir son template en PDF avec champs (formulaire interactif).';

const MESSAGE_DOCX_NON_SUPPORTE =
  'Les fichiers Word ne peuvent pas être remplis comme un formulaire. Pour utiliser cette fonctionnalité, demandez à la structure de vous fournir son template en PDF avec champs (formulaire interactif).';

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

/** Détecte si un fichier uploadé est un PDF à champs AcroForm (seul format supporté). */
export async function detecterTypeTemplate(file: File): Promise<DetectionTemplate> {
  const format = detecterFormat(file);
  if (!format) {
    throw new Error('Format de fichier non supporté — utilisez un PDF avec champs de formulaire (AcroForm)');
  }

  if (format === 'docx') {
    return { type: 'non_supporte', raison: MESSAGE_DOCX_NON_SUPPORTE };
  }

  const buffer = await file.arrayBuffer();
  const champs = await detecterChampsAcroForm(buffer);
  if (!champs) {
    return { type: 'non_supporte', raison: MESSAGE_PDF_SANS_CHAMPS };
  }

  return { type: 'acroform', champs, pdfBytes: buffer };
}
