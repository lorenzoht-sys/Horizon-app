import { toast } from 'sonner';
import { pdfMake, mdToPdfMake } from '../../utils/markdownToPdf';
import { type ActionType } from '../../utils/promptAssistant';

// ── PDF export ────────────────────────────────────────────────────────────────

export function downloadPDF(patientNom: string, type: ActionType, markdownContent: string) {
  try {
  const date    = new Date().toISOString().split('T')[0];
  const dateStr = new Date().toLocaleDateString('fr-FR');
  const label   = type === 'compte_rendu' ? 'CR-medecin' : 'CR-famille';
  const filename = `${label}_${patientNom.replace(/ /g, '-')}_${date}.pdf`;

  const docDefinition = {
    // Marges en points (1mm ≈ 2.835pt) : 40pt ≈ 14mm, 55pt ≈ 19mm, 45pt ≈ 16mm
    pageMargins: [40, 55, 40, 45] as [number, number, number, number],

    header: () => ({
      columns: [
        { text: 'Horizon — APA', bold: true, fontSize: 10, color: 'white', margin: [40, 12, 0, 0] },
        { text: `Généré le ${dateStr}`, alignment: 'right', fontSize: 8, color: '#a0d8d8', margin: [0, 14, 40, 0] },
      ],
      fillColor: 'var(--color-ink)',
    }),

    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: 'Document généré par Horizon — Outil de suivi APA', fontSize: 7, color: '#969696', margin: [40, 8, 0, 0] },
        { text: `Page ${currentPage} / ${pageCount}`, alignment: 'right', fontSize: 7, color: '#969696', margin: [0, 8, 40, 0] },
      ],
    }),

    content: mdToPdfMake(markdownContent),

    defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.45, color: '#505050' },

    styles: {
      h1:   { fontSize: 16, bold: true,  color: 'var(--color-ink)', lineHeight: 1.3 },
      h2:   { fontSize: 12, bold: true,  color: 'var(--color-teal)', lineHeight: 1.3 },
      h3:   { fontSize: 10.5, bold: true, color: '#1A1A1A', lineHeight: 1.3 },
      body: { fontSize: 10, color: '#505050', lineHeight: 1.45 },
      bold: { fontSize: 10, bold: true, color: '#1A1A1A', lineHeight: 1.45 },
      th:   { fontSize: 9, bold: true, color: '#505050', fillColor: '#F0F5F5' },
      td:   { fontSize: 9, color: '#1A1A1A' },
    },
  };

  pdfMake.createPdf(docDefinition as any).download(filename);
  } catch (err) {
    console.error('Erreur PDF:', err);
    toast.error('Erreur lors de la génération du PDF. Réessayez.');
  }
}
