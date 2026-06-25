// Remplissage d'un PDF AcroForm avec les valeurs générées par Claude,
// puis aplatissement (flatten) pour figer le résultat avant téléchargement.
// pdf-lib est chargé en lazy, comme dans detecterTypeTemplate.ts.

function estCoche(valeur: string): boolean {
  return /^(oui|true|x|coché|coche|1)$/i.test(valeur.trim());
}

/** Remplit un PDF AcroForm à partir des bytes d'origine et télécharge le résultat aplati. */
export async function remplirEtTelechargerPdf(opts: {
  pdfBytes: ArrayBuffer;
  valeurs: Record<string, string>;
  filename: string;
}): Promise<void> {
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(opts.pdfBytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();

  for (const [nom, valeur] of Object.entries(opts.valeurs)) {
    try {
      const field = form.getField(nom);
      const nomClasse = field.constructor.name;
      if (nomClasse === 'PDFTextField') {
        (field as import('pdf-lib').PDFTextField).setText(valeur || '');
      } else if (nomClasse === 'PDFCheckBox') {
        const checkbox = field as import('pdf-lib').PDFCheckBox;
        if (estCoche(valeur)) checkbox.check(); else checkbox.uncheck();
      } else if (nomClasse === 'PDFDropdown') {
        (field as import('pdf-lib').PDFDropdown).select(valeur);
      } else if (nomClasse === 'PDFOptionList') {
        (field as import('pdf-lib').PDFOptionList).select(valeur);
      } else if (nomClasse === 'PDFRadioGroup') {
        (field as import('pdf-lib').PDFRadioGroup).select(valeur);
      }
    } catch (e) {
      // Un champ qui ne peut pas être rempli (option inexistante, type inattendu)
      // ne doit pas bloquer le remplissage des autres champs du formulaire.
      console.warn(`[remplirFormulairePdf] champ "${nom}" non rempli :`, e);
    }
  }

  form.flatten();
  const bytes = await pdfDoc.save();
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = opts.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
