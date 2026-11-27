import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';

(pdfMake as any).vfs = (pdfFonts as any).pdfMake?.vfs ?? (pdfFonts as any).default?.pdfMake?.vfs;

export { pdfMake };

/** Supprime tous les marqueurs Markdown + décode les entités HTML */
function cleanText(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1') // **bold** → bold (paires fermées)
    .replace(/\*\*/g, '')             // ** résiduels (non fermés)
    .replace(/\*(.*?)\*/g, '$1')      // *italic* → italic
    .replace(/\*/g, '')               // * résiduels
    .replace(/`(.*?)`/g, '$1')        // `code` → code
    .replace(/`/g, '')                // ` résiduels
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

/** Convertit le Markdown en tableau de blocs pdfmake */
export function mdToPdfMake(md: string): object[] {
  const content: object[] = [];
  const lines = md.split('\n');
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (!t) { i++; continue; }

    if (/^# [^#]/.test(t)) {
      content.push({ text: cleanText(t.slice(2)), style: 'h1', margin: [0, 10, 0, 6] });
    } else if (/^## [^#]/.test(t)) {
      content.push({ text: cleanText(t.slice(3)), style: 'h2', margin: [0, 10, 0, 4] });
    } else if (/^### /.test(t)) {
      content.push({ text: cleanText(t.slice(4)), style: 'h3', margin: [0, 6, 0, 3] });
    } else if (t === '---') {
      content.push({ canvas: [{ type: 'line', x1: 0, y1: 2, x2: 515, y2: 2, lineWidth: 0.5, lineColor: '#DCE4E4' }], margin: [0, 5, 0, 5] });
    } else if (t.startsWith('|') && t.endsWith('|')) {
      const tLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { tLines.push(lines[i].trim()); i++; }
      const rows = tLines
        .filter(l => l.replace(/[| :-]/g, '').trim().length > 0)
        .map((l, ri) => l.split('|').filter(c => c !== '').map(c => ({
          text: cleanText(c),
          fontSize: 8,
          style: ri === 0 ? 'th' : 'td',
        })));
      if (rows.length > 0) {
        content.push({ table: { headerRows: 1, widths: Array(rows[0].length).fill('*'), body: rows }, layout: 'lightHorizontalLines', margin: [0, 4, 0, 8] });
      }
      continue;
    } else if (/^[-*] /.test(t)) {
      content.push({ text: '•  ' + cleanText(t.slice(2)), style: 'body', margin: [10, 1, 0, 1] });
    } else if (t.startsWith('**') && t.endsWith('**') && t.length > 4) {
      content.push({ text: cleanText(t.slice(2, -2)), style: 'bold', margin: [0, 2, 0, 1] });
    } else {
      content.push({ text: cleanText(t), style: 'body', margin: [0, 1, 0, 1] });
    }
    i++;
  }
  return content;
}

