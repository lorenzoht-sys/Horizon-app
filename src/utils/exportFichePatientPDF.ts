import React from 'react';
import { pdf } from '@react-pdf/renderer';
import FichePatientPDF, { type FichePatientPDFData } from '../components/export/FichePatientPDF';

export async function exportFichePatientPDF(
  data: FichePatientPDFData,
  nomFichier: string
): Promise<void> {
  const element = React.createElement(FichePatientPDF, data);
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
