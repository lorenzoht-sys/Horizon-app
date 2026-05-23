import type { ContratPDFData } from '../components/export/ContratPDF';

export async function exportContratPDF(
  _data: ContratPDFData,
  nomFichier: string
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const html2canvas = (await import('html2canvas')).default;

  const page1 = document.getElementById('contrat-pdf-page-1');
  const page2 = document.getElementById('contrat-pdf-page-2');
  if (!page1 || !page2) {
    throw new Error('Composants PDF introuvables dans le DOM');
  }

  // Rendre visible temporairement pour la capture
  const makeVisible = (el: HTMLElement) => {
    el.style.position = 'fixed';
    el.style.top = '0';
    el.style.left = '0';
    el.style.visibility = 'visible';
    el.style.zIndex = '9999';
    el.style.background = 'white';
  };
  const makeHidden = (el: HTMLElement) => {
    el.style.position = 'absolute';
    el.style.top = '-9999px';
    el.style.left = '-9999px';
    el.style.visibility = 'hidden';
    el.style.zIndex = '-1';
  };

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Page 1
  makeVisible(page1);
  await new Promise(r => setTimeout(r, 100));
  const canvas1 = await html2canvas(page1.firstElementChild as HTMLElement, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    width: 794,
    height: 1123,
  });
  makeHidden(page1);
  pdf.addImage(canvas1.toDataURL('image/png'), 'PNG', 0, 0, 210, 297);

  // Page 2
  pdf.addPage();
  makeVisible(page2);
  await new Promise(r => setTimeout(r, 100));
  const canvas2 = await html2canvas(page2.firstElementChild as HTMLElement, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    width: 794,
    height: 1123,
  });
  makeHidden(page2);
  pdf.addImage(canvas2.toDataURL('image/png'), 'PNG', 0, 0, 210, 297);

  pdf.save(nomFichier);
}
