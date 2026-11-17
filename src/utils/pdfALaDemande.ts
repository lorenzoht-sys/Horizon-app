// Exports PDF chargés à la demande (nettoyage, lot 1, 2026-11-17).
//
// @react-pdf/renderer et ses dépendances (pdfkit, fontkit, yoga, brotli,
// hyphen) pèsent ≈ 1,1 Mo bruts. Importés directement par des écrans chargés
// au démarrage (fiche bénéficiaire, espace patient), ils entraient dans le
// paquet initial téléchargé par tout le monde avant le premier affichage.
// Ici, la bibliothèque n'est téléchargée qu'au premier clic sur un export.
//
// Mêmes signatures que les modules d'origine : seul le chemin d'import change
// chez les appelants. Les types sont importés en `import type`, effacés à la
// compilation : ils n'entraînent aucun chargement.

import type { ExportFicheBilanData, ExportProgrammeData } from './exportPDF';
import type { DossierPDFData } from '../components/export/DossierPDF';
import type { ContratPDFData } from '../components/export/ContratPDF';

export type { ExportFicheBilanData, ExportProgrammeData, DossierPDFData, ContratPDFData };

export async function exportFicheBilanPDF(data: ExportFicheBilanData, fileName: string): Promise<void> {
  return (await import('./exportPDF')).exportFicheBilanPDF(data, fileName);
}

export async function exportFicheBilanBeneficiairePDF(
  ...args: Parameters<typeof import('./exportPDF').exportFicheBilanBeneficiairePDF>
): Promise<void> {
  return (await import('./exportPDF')).exportFicheBilanBeneficiairePDF(...args);
}

export async function exportProgrammePDF(
  ...args: Parameters<typeof import('./exportPDF').exportProgrammePDF>
): Promise<void> {
  return (await import('./exportPDF')).exportProgrammePDF(...args);
}

export async function exportDossierPraticien(data: DossierPDFData, fileName: string): Promise<void> {
  return (await import('./exportDossierPDF')).exportDossierPraticien(data, fileName);
}

export async function exportCarteSantePatient(data: DossierPDFData, fileName: string): Promise<void> {
  return (await import('./exportDossierPDF')).exportCarteSantePatient(data, fileName);
}

export async function exportContratPDF(data: ContratPDFData, nomFichier: string): Promise<void> {
  return (await import('./exportContratPDF')).exportContratPDF(data, nomFichier);
}
