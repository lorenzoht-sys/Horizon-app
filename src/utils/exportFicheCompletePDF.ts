import React from 'react';
import { pdf } from '@react-pdf/renderer';
import FicheCompletePDF, { type FicheCompletePDFData } from '../components/export/FicheCompletePDF';

export type { FicheCompletePDFData };

export async function exportFicheCompletePDF(
  data: FicheCompletePDFData,
  nomFichier: string
): Promise<void> {
  const element = React.createElement(FicheCompletePDF, data);
  const blob = await pdf(element as Parameters<typeof pdf>[0]).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
