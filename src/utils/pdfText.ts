// Nettoyage des chaînes avant écriture dans un PDF jsPDF (factures).
// La police par défaut de jsPDF (Helvetica/WinAnsi) n'a pas les glyphes des
// émojis et symboles Unicode récents : un nom, une adresse e-mail ou une
// note copiée-collée contenant un emoji s'affiche alors comme un carré
// vide dans le PDF généré. On retire ces caractères avant `doc.text(...)`.
const SYMBOLES_NON_SUPPORTES = /[\u{1F000}-\u{1FFFF}\u{2190}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu;

export function cleanTextPdf(text: string): string {
  return text.replace(SYMBOLES_NON_SUPPORTES, '').replace(/\s{2,}/g, ' ').trim();
}
