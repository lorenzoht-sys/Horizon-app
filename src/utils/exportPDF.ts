import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

async function captureElement(id: string, delayMs = 150): Promise<HTMLCanvasElement> {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Élément #${id} introuvable`);
  el.style.display = 'block';
  await new Promise<void>(r => setTimeout(r, delayMs));
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });
  el.style.display = 'none';
  return canvas;
}

function placeCanvas(pdf: jsPDF, canvas: HTMLCanvasElement) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgH = (canvas.height * pageW) / canvas.width;
  const img = canvas.toDataURL('image/png');
  if (imgH <= pageH) {
    pdf.addImage(img, 'PNG', 0, 0, pageW, imgH);
  } else {
    // Contenu plus haut qu'une page A4 → découper
    let y = 0;
    while (y < imgH) {
      if (y > 0) pdf.addPage();
      pdf.addImage(img, 'PNG', 0, -y, pageW, imgH);
      y += pageH;
    }
  }
}

// Export PDF programme (2 sections → 2 pages distinctes)
export async function exportProgrammePDF(
  page1Id: string,
  page2Id: string,
  fileName: string
): Promise<void> {
  const pdf = new jsPDF('p', 'mm', 'a4');

  // — Page 1 : en-tête + exercices
  const canvas1 = await captureElement(page1Id, 150);
  placeCanvas(pdf, canvas1);

  // — Page 2 : tableau de suivi (toujours sur une nouvelle feuille, règle absolue)
  pdf.addPage();
  const canvas2 = await captureElement(page2Id, 500); // délai plus long pour les QR codes async
  placeCanvas(pdf, canvas2);

  pdf.save(fileName);
}

// Export Fiche Bilan Mouv'APA
export async function exportFicheBilanPDF(elementId: string, fileName: string): Promise<void> {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const canvas = await captureElement(elementId, 150);
  placeCanvas(pdf, canvas);
  pdf.save(fileName);
}

// Export PDF bilan (usage existant)
export async function exportPDF(elementId: string, fileName: string): Promise<void> {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const canvas = await captureElement(elementId, 100);
  placeCanvas(pdf, canvas);
  pdf.save(fileName);
}
