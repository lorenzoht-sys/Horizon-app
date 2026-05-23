import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { Bilan, Participant } from '../types';

export async function exportRapportEvolutionPDF(
  _participant: Participant,
  _bilans: Bilan[],
  _settings: Record<string, string>,
  fileName: string
): Promise<void> {
  const el = document.getElementById('rapport-evolution-printable');
  if (!el) throw new Error('Template PDF introuvable');

  el.style.display = 'block';
  await new Promise<void>(r => setTimeout(r, 300));

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    width: el.scrollWidth,
    height: el.scrollHeight,
  });

  el.style.display = 'none';

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgH = (canvas.height * pageW) / canvas.width;
  const img = canvas.toDataURL('image/png');

  if (imgH <= pageH) {
    pdf.addImage(img, 'PNG', 0, 0, pageW, imgH);
  } else {
    let y = 0;
    while (y < imgH) {
      if (y > 0) pdf.addPage();
      pdf.addImage(img, 'PNG', 0, -y, pageW, imgH);
      y += pageH;
    }
  }

  pdf.save(fileName);
}
