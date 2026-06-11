import React from 'react';
import { pdf } from '@react-pdf/renderer';
import DossierPDF, { type DossierPDFData } from '../components/export/DossierPDF';

async function renderAndExport(data: DossierPDFData, mode: 'praticien' | 'patient', fileName: string): Promise<void> {
  const element = React.createElement(DossierPDF, { ...data, mode });
  const blob = await pdf(element as Parameters<typeof pdf>[0]).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportDossierPraticien(data: DossierPDFData, fileName: string): Promise<void> {
  return renderAndExport(data, 'praticien', fileName);
}

export async function exportCarteSantePatient(data: DossierPDFData, fileName: string): Promise<void> {
  return renderAndExport(data, 'patient', fileName);
}
