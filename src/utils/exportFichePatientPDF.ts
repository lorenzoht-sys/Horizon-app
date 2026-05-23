import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

async function capturePage(id: string): Promise<HTMLCanvasElement | null> {
  const el = document.getElementById(id);
  if (!el) return null;
  return html2canvas(el, {
    scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
  });
}

export async function exportFichePatientPDF(nomFichier: string): Promise<void> {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();

  function addCanvas(canvas: HTMLCanvasElement) {
    const imgH = (canvas.height * W) / canvas.width;
    const img = canvas.toDataURL('image/png');
    if (imgH <= H) {
      pdf.addImage(img, 'PNG', 0, 0, W, imgH);
    } else {
      let y = 0;
      while (y < imgH) {
        if (y > 0) pdf.addPage();
        pdf.addImage(img, 'PNG', 0, -y, W, imgH);
        y += H;
      }
    }
  }

  const c1 = await capturePage('fiche-page-1');
  if (c1) addCanvas(c1);

  const c2 = await capturePage('fiche-page-2');
  if (c2) {
    pdf.addPage();
    addCanvas(c2);
  }

  pdf.save(nomFichier);
}
