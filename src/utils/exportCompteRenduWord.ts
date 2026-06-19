import { Document, Packer, Paragraph, TextRun, HeadingLevel, BorderStyle } from 'docx';

function cleanText(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/\*/g, '')
    .replace(/`(.*?)`/g, '$1')
    .replace(/`/g, '')
    .trim();
}

/** Convertit le Markdown en paragraphes docx (même niveau de support que mdToPdfMake). */
function mdToDocxParagraphs(md: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = md.split('\n');

  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;

    if (/^# [^#]/.test(t)) {
      paragraphs.push(new Paragraph({ text: cleanText(t.slice(2)), heading: HeadingLevel.HEADING_1 }));
    } else if (/^## [^#]/.test(t)) {
      paragraphs.push(new Paragraph({ text: cleanText(t.slice(3)), heading: HeadingLevel.HEADING_2 }));
    } else if (/^### /.test(t)) {
      paragraphs.push(new Paragraph({ text: cleanText(t.slice(4)), heading: HeadingLevel.HEADING_3 }));
    } else if (t === '---') {
      paragraphs.push(new Paragraph({
        text: '',
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'DCE4E4' } },
      }));
    } else if (/^[-*] /.test(t)) {
      paragraphs.push(new Paragraph({ text: cleanText(t.slice(2)), bullet: { level: 0 } }));
    } else if (t.startsWith('**') && t.endsWith('**') && t.length > 4) {
      paragraphs.push(new Paragraph({ children: [new TextRun({ text: cleanText(t.slice(2, -2)), bold: true })] }));
    } else {
      paragraphs.push(new Paragraph({ text: cleanText(t) }));
    }
  }
  return paragraphs;
}

/** Génère et télécharge un document Word (.docx) à partir de Markdown. */
export async function exportCompteRenduWord(opts: { contenu: string; filename: string }): Promise<void> {
  const doc = new Document({
    sections: [{ children: mdToDocxParagraphs(opts.contenu) }],
  });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = opts.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
