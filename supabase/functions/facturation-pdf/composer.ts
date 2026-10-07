// Composition du PDF d'une facture (étape 5, PR A). Module PUR : aucune lecture de base, aucun
// réseau, aucune horloge. Il est chargé aussi bien par l'Edge Function (Deno, via l'import map de
// `deno.json`) que par Vitest (le paquet `pdf-lib` du dépôt).
//
// Ce que ce module garantit :
//   - le PDF est composé UNIQUEMENT depuis la facture validée, ses lignes et ses deux snapshots
//     (émetteur et destinataire, figés à la validation). Rien n'est relu dans le profil du praticien
//     ni recalculé : les totaux sont ceux de la base, copiés tels quels ;
//   - la sortie est DÉTERMINISTE (dates de métadonnées fixées sur la date d'émission, pas
//     d'object streams). Le spike du 2026-10-08 sur l'Edge runtime de staging a donné le même
//     sha256 d'un appel à l'autre. C'est ce qui permet la régénération « à l'identique ».
//
// Décisions de contenu (2026-10-08) : facturation 100 % au payeur, donc aucune mention de
// répartition client/URSSAF ; aucune mention de pénalités de retard (payeurs particuliers
// uniquement, aucune facture B2B dans ce système). Les mentions SAP (n°, date de déclaration, mode
// et adresse d'intervention) sont imprimées quand le profil les a renseignées. La phrase relative
// à l'avantage fiscal n'est PAS imprimée : l'éligibilité des activités attend l'expert-comptable
// (voir docs/FACTURATION.md, « Crédit d'impôt »).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export interface AdressePdf {
  rue?: string | null;
  code_postal?: string | null;
  ville?: string | null;
}

/** Forme du `snapshot_emetteur` posé par valider_facture(). */
export interface EmetteurPdf {
  prenom?: string | null;
  nom?: string | null;
  societe?: string | null;
  titre?: string | null;
  siret?: string | null;
  numero_sap?: string | null;
  numero_tva?: string | null;
  adresse?: AdressePdf | null;
  email?: string | null;
  telephone?: string | null;
  regime_tva?: string | null;
  iban?: string | null;
  date_declaration_sap?: string | null;
  mode_intervention?: string | null;
  adresse_intervention?: string | null;
}

/** Forme du `snapshot_destinataire` : le proche payeur s'il y en a un, sinon le bénéficiaire. */
export interface DestinatairePdf {
  role?: string | null;
  nom?: string | null;
  prenom?: string | null;
  adresse?: AdressePdf | string | null;
  beneficiaire?: { nom?: string | null; prenom?: string | null; adresse?: AdressePdf | null } | null;
}

export interface LignePdf {
  libelle: string;
  quantite: number;
  prixUnitaire: number;
  montant: number;
  /** Séance liée (absente pour un forfait) : sert uniquement à ordonner les lignes. */
  seanceDate?: string | null;
  seanceHeure?: string | null;
}

export interface FacturePdf {
  numero: string;
  type: 'facture' | 'avoir';
  /** AAAA-MM-JJ */
  dateEmission: string;
  /** AAAA-MM-JJ */
  echeance: string;
  /** AAAA-MM-01 */
  periode: string;
  /** Numéro de la facture corrigée, pour un avoir. */
  numeroOrigine?: string | null;
  totalHt: number;
  montantTva: number;
  tauxTva: number;
  total: number;
  emetteur: EmetteurPdf;
  destinataire: DestinatairePdf;
  lignes: LignePdf[];
}

// ---------- formats ----------

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** `1234.5` -> `1 234,50 €`. Espace simple : les espaces fines d'Intl ne sont pas dans WinAnsi. */
export function formaterMontant(valeur: number): string {
  const [entier, decimales] = Math.abs(valeur).toFixed(2).split('.');
  const groupe = entier.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${valeur < 0 ? '-' : ''}${groupe},${decimales} €`;
}

export function formaterDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function formaterPeriode(iso: string): string {
  const m = /^(\d{4})-(\d{2})-/.exec(iso);
  return m ? `${MOIS[Number(m[2]) - 1] ?? m[2]} ${m[1]}` : iso;
}

function formaterTaux(taux: number): string {
  return `${String(taux).replace('.', ',')} %`;
}

function formaterQuantite(q: number): string {
  return Number.isInteger(q) ? String(q) : String(q).replace('.', ',');
}

function texte(v: string | null | undefined): string {
  return (v ?? '').replace(/\s+/g, ' ').trim();
}

function lignesAdresse(a: AdressePdf | string | null | undefined): string[] {
  if (!a) return [];
  if (typeof a === 'string') return a.split(/\r?\n/).map(texte).filter(Boolean);
  const villeLigne = [texte(a.code_postal), texte(a.ville)].filter(Boolean).join(' ');
  return [texte(a.rue), villeLigne].filter(Boolean);
}

function nomComplet(prenom?: string | null, nom?: string | null): string {
  return [texte(prenom), texte(nom)].filter(Boolean).join(' ');
}

/** IBAN regroupé par 4 pour la lecture. La base le stocke normalisé (sans espaces). */
function formaterIban(iban: string): string {
  return texte(iban).replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Ordre des lignes : les séances datées d'abord, par date puis heure, puis les lignes sans séance
 * (forfait) par libellé. Même clé que l'écran « Factures à valider », avec le libellé en dernier
 * recours pour que l'ordre ne dépende jamais de l'ordre de lecture en base (PDF reproductible).
 */
export function trierLignes(lignes: LignePdf[]): LignePdf[] {
  const cle = (l: LignePdf) => (l.seanceDate ? `0${l.seanceDate}${l.seanceHeure ?? ''}` : '1');
  return [...lignes].sort((a, b) => cle(a).localeCompare(cle(b)) || a.libelle.localeCompare(b.libelle, 'fr'));
}

// ---------- contenu (testable sans PDF) ----------

export interface BlocsFacture {
  titre: string;
  emetteur: string[];
  mentionsSap: string[];
  destinataire: string[];
  beneficiaire: string[];
  references: string[];
  tva: { franchise: boolean; mention: string | null };
  paiement: string[];
}

/** Construit le texte de chaque bloc. Séparé du dessin pour pouvoir tester les mentions. */
export function construireBlocs(f: FacturePdf): BlocsFacture {
  const e = f.emetteur;
  const franchise = e.regime_tva === 'franchise_293B';
  const identite = texte(e.societe) || nomComplet(e.prenom, e.nom);

  const emetteur = [
    identite,
    texte(e.societe) ? nomComplet(e.prenom, e.nom) : '',
    texte(e.titre),
    ...lignesAdresse(e.adresse),
    e.siret ? `SIRET : ${texte(e.siret)}` : '',
    !franchise && e.numero_tva ? `N° de TVA intracommunautaire : ${texte(e.numero_tva)}` : '',
    texte(e.email),
    texte(e.telephone),
  ].filter(Boolean);

  const sap: string[] = [];
  if (e.numero_sap) {
    sap.push(
      e.date_declaration_sap
        ? `Organisme de services à la personne : déclaration n° ${texte(e.numero_sap)} du ${formaterDate(e.date_declaration_sap)}`
        : `Organisme de services à la personne : déclaration n° ${texte(e.numero_sap)}`,
    );
  }
  if (e.mode_intervention === 'prestataire') sap.push("Mode d'intervention : prestataire");
  if (e.mode_intervention === 'mandataire') sap.push("Mode d'intervention : mandataire");
  if (texte(e.adresse_intervention)) sap.push(`Adresse d'intervention : ${texte(e.adresse_intervention)}`);

  const d = f.destinataire;
  const destinataire = [nomComplet(d.prenom, d.nom), ...lignesAdresse(d.adresse)].filter(Boolean);
  const b = d.beneficiaire;
  // Le bénéficiaire n'est rappelé que si quelqu'un d'autre paie.
  const beneficiaire = d.role === 'proche' && b
    ? [`Bénéficiaire de la prestation : ${nomComplet(b.prenom, b.nom)}`, ...lignesAdresse(b.adresse)].filter(Boolean)
    : [];

  const references = [
    `Date d'émission : ${formaterDate(f.dateEmission)}`,
    `Période : ${formaterPeriode(f.periode)}`,
    f.type === 'avoir' && f.numeroOrigine ? `Avoir sur la facture n° ${f.numeroOrigine}` : '',
  ].filter(Boolean);

  const paiement = [
    f.type === 'avoir' ? '' : `Échéance de paiement : ${formaterDate(f.echeance)}`,
    f.type === 'avoir' ? '' : 'Mode de règlement : virement bancaire',
    f.type !== 'avoir' && e.iban ? `IBAN : ${formaterIban(e.iban)}` : '',
  ].filter(Boolean);

  return {
    titre: f.type === 'avoir' ? `Avoir n° ${f.numero}` : `Facture n° ${f.numero}`,
    emetteur,
    mentionsSap: sap,
    destinataire,
    beneficiaire,
    references,
    tva: { franchise, mention: franchise ? 'TVA non applicable, art. 293 B du CGI' : null },
    paiement,
  };
}

// ---------- dessin ----------

const A4: [number, number] = [595.28, 841.89];
const MARGE = 50;
const NOIR = rgb(0.1, 0.1, 0.1);
const GRIS = rgb(0.4, 0.4, 0.4);
const FILET = rgb(0.8, 0.8, 0.8);

interface Contexte {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  normal: PDFFont;
  gras: PDFFont;
  pied: string;
  pages: PDFPage[];
}

/** Remplace ce que la police standard ne sait pas écrire : pdf-lib lève sinon une exception. */
function sur(police: PDFFont, s: string): string {
  const permis = new Set(police.getCharacterSet());
  let out = '';
  for (const c of s.replace(/[   ]/g, ' ').replace(/‑/g, '-')) {
    out += permis.has(c.codePointAt(0) as number) ? c : '?';
  }
  return out;
}

function decouper(police: PDFFont, s: string, taille: number, largeur: number): string[] {
  const propre = sur(police, s);
  const mots = propre.split(' ');
  const lignes: string[] = [];
  let courante = '';
  for (const mot of mots) {
    const essai = courante ? `${courante} ${mot}` : mot;
    if (police.widthOfTextAtSize(essai, taille) <= largeur || !courante) courante = essai;
    else { lignes.push(courante); courante = mot; }
  }
  if (courante) lignes.push(courante);
  return lignes.length ? lignes : [''];
}

function nouvellePage(c: Contexte): void {
  c.page = c.doc.addPage(A4);
  c.pages.push(c.page);
  c.y = A4[1] - MARGE;
}

function assurerPlace(c: Contexte, hauteur: number): void {
  if (c.y - hauteur < MARGE + 30) nouvellePage(c);
}

function ecrire(c: Contexte, s: string, opts: { x?: number; taille?: number; gras?: boolean; couleur?: ReturnType<typeof rgb>; largeur?: number } = {}): void {
  const taille = opts.taille ?? 10;
  const police = opts.gras ? c.gras : c.normal;
  const largeur = opts.largeur ?? A4[0] - 2 * MARGE;
  for (const l of decouper(police, s, taille, largeur)) {
    assurerPlace(c, taille + 4);
    c.page.drawText(l, { x: opts.x ?? MARGE, y: c.y - taille, size: taille, font: police, color: opts.couleur ?? NOIR });
    c.y -= taille + 4;
  }
}

function droite(c: Contexte, s: string, xDroit: number, y: number, taille: number, gras = false): void {
  const police = gras ? c.gras : c.normal;
  const t = sur(police, s);
  c.page.drawText(t, { x: xDroit - police.widthOfTextAtSize(t, taille), y, size: taille, font: police, color: NOIR });
}

export async function composerFacturePdf(f: FacturePdf): Promise<Uint8Array> {
  const blocs = construireBlocs(f);
  const doc = await PDFDocument.create();
  // Métadonnées figées : c'est ce qui rend la sortie reproductible octet pour octet.
  const figee = new Date(`${f.dateEmission}T00:00:00Z`);
  doc.setCreationDate(figee);
  doc.setModificationDate(figee);
  doc.setProducer('Horizon');
  doc.setCreator('Horizon');
  doc.setTitle(blocs.titre);
  doc.setAuthor(texte(f.emetteur.societe) || nomComplet(f.emetteur.prenom, f.emetteur.nom) || 'Horizon');

  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);
  const premiere = doc.addPage(A4);
  const c: Contexte = { doc, page: premiere, y: A4[1] - MARGE, normal, gras, pied: blocs.titre, pages: [premiere] };

  ecrire(c, blocs.titre, { taille: 20, gras: true });
  c.y -= 6;
  for (const l of blocs.references) ecrire(c, l, { couleur: GRIS });
  c.y -= 10;

  // Émetteur à gauche, destinataire à droite, au même niveau.
  const yHaut = c.y;
  const demi = (A4[0] - 2 * MARGE) / 2 - 10;
  ecrire(c, 'Émetteur', { gras: true, taille: 9, couleur: GRIS, largeur: demi });
  blocs.emetteur.forEach((l, i) => ecrire(c, l, { gras: i === 0, largeur: demi }));
  const yBasEmetteur = c.y;
  c.page = c.pages[0];
  c.y = yHaut;
  ecrire(c, 'Destinataire', { x: MARGE + demi + 20, gras: true, taille: 9, couleur: GRIS, largeur: demi });
  blocs.destinataire.forEach((l, i) => ecrire(c, l, { x: MARGE + demi + 20, gras: i === 0, largeur: demi }));
  for (const l of blocs.beneficiaire) ecrire(c, l, { x: MARGE + demi + 20, taille: 9, couleur: GRIS, largeur: demi });
  c.y = Math.min(c.y, yBasEmetteur) - 6;

  for (const l of blocs.mentionsSap) ecrire(c, l, { taille: 9, couleur: GRIS });
  c.y -= 14;

  // Tableau des lignes : désignation, quantité, prix unitaire HT, montant HT.
  const xQte = 355;
  const xPu = 445;
  const xMontant = A4[0] - MARGE;
  const enTete = (): void => {
    assurerPlace(c, 24);
    const base = c.y - 10;
    c.page.drawText('Désignation', { x: MARGE, y: base, size: 9, font: c.gras, color: GRIS });
    droite(c, 'Qté', xQte, base, 9, true);
    droite(c, 'Prix unit. HT', xPu, base, 9, true);
    droite(c, 'Montant HT', xMontant, base, 9, true);
    c.y -= 16;
    c.page.drawLine({ start: { x: MARGE, y: c.y }, end: { x: xMontant, y: c.y }, thickness: 0.6, color: FILET });
    c.y -= 6;
  };
  enTete();
  for (const l of trierLignes(f.lignes)) {
    const morceaux = decouper(c.normal, l.libelle, 10, xQte - MARGE - 50);
    if (c.y - morceaux.length * 14 < MARGE + 30) { nouvellePage(c); enTete(); }
    const base = c.y - 10;
    droite(c, formaterQuantite(l.quantite), xQte, base, 10);
    droite(c, formaterMontant(l.prixUnitaire), xPu, base, 10);
    droite(c, formaterMontant(l.montant), xMontant, base, 10);
    for (const m of morceaux) {
      c.page.drawText(m, { x: MARGE, y: c.y - 10, size: 10, font: c.normal, color: NOIR });
      c.y -= 14;
    }
    c.y -= 2;
  }
  c.page.drawLine({ start: { x: MARGE, y: c.y }, end: { x: xMontant, y: c.y }, thickness: 0.6, color: FILET });
  c.y -= 12;

  // Totaux : repris de la base, jamais recalculés ici (la TVA est arrondie UNE fois sur le total HT).
  assurerPlace(c, 70);
  const ligneTotal = (libelle: string, valeur: string, fort = false): void => {
    const base = c.y - 10;
    c.page.drawText(sur(c.normal, libelle), { x: xPu - 70, y: base, size: fort ? 11 : 10, font: fort ? c.gras : c.normal, color: NOIR });
    droite(c, valeur, xMontant, base, fort ? 11 : 10, fort);
    c.y -= fort ? 18 : 15;
  };
  if (blocs.tva.franchise) {
    ligneTotal(f.type === 'avoir' ? "Total de l'avoir" : 'Total à payer', formaterMontant(f.total), true);
    c.y -= 4;
    ecrire(c, blocs.tva.mention ?? '', { taille: 9, couleur: GRIS });
  } else {
    ligneTotal('Total HT', formaterMontant(f.totalHt));
    ligneTotal(`TVA (${formaterTaux(f.tauxTva)})`, formaterMontant(f.montantTva));
    ligneTotal('Total TTC', formaterMontant(f.total), true);
  }
  c.y -= 12;

  if (blocs.paiement.length) {
    assurerPlace(c, 14 * (blocs.paiement.length + 1));
    ecrire(c, 'Conditions de paiement', { gras: true, taille: 9, couleur: GRIS });
    for (const l of blocs.paiement) ecrire(c, l);
  }

  // Pied de page sur chaque page : numéro de facture et pagination.
  const total = c.pages.length;
  c.pages.forEach((p, i) => {
    const t = sur(normal, `${blocs.titre} · page ${i + 1}/${total}`);
    p.drawText(t, { x: MARGE, y: 28, size: 8, font: normal, color: GRIS });
  });

  return await doc.save({ useObjectStreams: false });
}
