// Nettoyage des chaînes avant écriture dans un PDF jsPDF (factures).
// La police par défaut de jsPDF (Helvetica/WinAnsi) n'a pas les glyphes des
// émojis et symboles Unicode récents : un nom, une adresse e-mail ou une
// note copiée-collée contenant un emoji s'affiche alors comme un carré
// vide dans le PDF généré. On retire ces caractères avant `doc.text(...)`.
const SYMBOLES_NON_SUPPORTES = /[\u{1F000}-\u{1FFFF}\u{2190}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu;

export function cleanTextPdf(text: string): string {
  return text.replace(SYMBOLES_NON_SUPPORTES, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Comme cleanTextPdf, pour un texte LIBRE sur plusieurs lignes (note du praticien) : retire les
 * caractères que Helvetica ne sait pas dessiner (un émoji devient un carré vide dans le PDF),
 * mais GARDE les retours à la ligne — cleanTextPdf les écrase en un espace.
 *
 * Retours Windows/Mac ramenés à \n ; espaces multiples réduits dans chaque ligne ; pas plus
 * d'une ligne vide d'affilée ; rien en début ni en fin de texte.
 */
export function cleanTextPdfMultiligne(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(SYMBOLES_NON_SUPPORTES, '')
    .split('\n')
    .map(ligne => ligne.replace(/[ \t]{2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
