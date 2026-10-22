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
import fontkit from '@pdf-lib/fontkit';
import { lignesAffichees, lirePresentation, type Presentation } from './regroupement.ts';
import { PLUS_JAKARTA_SANS_BOLD, PLUS_JAKARTA_SANS_REGULAR } from './polices.ts';

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
  /** Figée à la validation (20261031100000) : 'ei' imprime « EI » à côté du nom ; absente sur les factures antérieures. */
  forme_juridique?: string | null;
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
  /** Type de la séance liée (« seance » ou « bilan ») : sert au récapitulatif. */
  seanceType?: string | null;
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
  /** Motif de l'avoir (obligatoire depuis la PR 9, 2026-10-22), imprimé sous la référence d'origine. */
  motif?: string | null;
  totalHt: number;
  montantTva: number;
  tauxTva: number;
  total: number;
  emetteur: EmetteurPdf;
  destinataire: DestinatairePdf;
  lignes: LignePdf[];
  /** Logo figé à la validation (logos_factures, clé snapshot_emetteur.logo_sha256), PR 5. */
  logo?: { type: 'png' | 'jpg'; octets: Uint8Array } | null;
  /** Mode figé à la validation (factures.presentation, 20261028100000) ; NULL = « detaillee ». */
  presentation?: Presentation | null;
  /** Gabarit figé à la validation (factures.gabarit, 20261029100000) : NULL ou 1 = Helvetica gris, 2 = charte Horizon. */
  gabarit?: number | null;
}

// ---------- formats ----------

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** `1234.5` -> `1 234,50 €`. Espace simple : les espaces fines d'Intl ne sont pas dans WinAnsi. */
export function formaterMontant(valeur: number): string {
  const [entier, decimales] = Math.abs(valeur).toFixed(2).split('.');
  const groupe = entier.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${valeur < 0 ? '-' : ''}${groupe},${decimales} €`;
}

/**
 * Récapitulatif imprimé sous le tableau (plan facturation PR 4, exemple de Pierre du 2026-10-19) :
 * « 4 séances × 50,00 € = 200,00 € », « 1 bilan × 60,00 € = 60,00 € », puis la ligne des frais de
 * déplacement « Frais de déplacement : 4 × 5,00 € = 20,00 € ». Calculé depuis les lignes, sans rien
 * stocker : les séances (ou bilans) sont regroupées par prix unitaire. Vide quand la facture n'a aucune
 * ligne de séance (forfait, avoir) : le tableau suffit.
 */
export function recapitulatif(lignes: LignePdf[]): string[] {
  const seances = lignes.filter(l => l.seanceDate);
  if (seances.length === 0) return [];
  const groupes = new Map<string, { bilan: boolean; prix: number; nombre: number; montant: number }>();
  for (const l of seances) {
    const bilan = l.seanceType === 'bilan';
    const cle = `${bilan ? 1 : 0}|${l.prixUnitaire.toFixed(2).padStart(12, '0')}`;
    const g = groupes.get(cle) ?? { bilan, prix: l.prixUnitaire, nombre: 0, montant: 0 };
    g.nombre += l.quantite;
    g.montant += l.montant;
    groupes.set(cle, g);
  }
  const lignesRecap = [...groupes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, g]) => {
      const nom = g.bilan ? (g.nombre > 1 ? 'bilans' : 'bilan') : (g.nombre > 1 ? 'séances' : 'séance');
      return `${formaterQuantite(g.nombre)} ${nom} × ${formaterMontant(g.prix)} = ${formaterMontant(Math.round(g.montant * 100) / 100)}`;
    });
  const frais = lignes
    .filter(l => !l.seanceDate && /^Frais de déplacement\b/.test(l.libelle))
    .sort((a, b) => a.prixUnitaire - b.prixUnitaire)
    .map(l => `Frais de déplacement : ${formaterQuantite(l.quantite)} × ${formaterMontant(l.prixUnitaire)} = ${formaterMontant(l.montant)}`);
  return [...lignesRecap, ...frais];
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
  // Entrepreneur individuel : « EI » à côté du NOM de la personne (obligation depuis le 15 mai 2022), sur
  // la ligne du nom, qu'elle soit la première ou suive un nom commercial. Absent du snapshot (factures
  // émises avant le 2026-10-31) : rien n'est ajouté, le PDF reste identique.
  const ei = e.forme_juridique === 'ei';
  const nomPersonne = nomComplet(e.prenom, e.nom);

  const emetteur = [
    texte(e.societe) ? identite : (ei && nomPersonne ? `${nomPersonne} EI` : identite),
    texte(e.societe) ? (ei && nomPersonne ? `${nomPersonne} EI` : nomPersonne) : '',
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
    f.type === 'avoir' && texte(f.motif) ? `Motif : ${texte(f.motif)}` : '',
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
const LOGO_LARGEUR = 140;
const LOGO_HAUTEUR = 56;
const NOIR = rgb(0.1, 0.1, 0.1);
const GRIS = rgb(0.4, 0.4, 0.4);
const FILET = rgb(0.8, 0.8, 0.8);

type Couleur = ReturnType<typeof rgb>;
const hex = (h: string): Couleur => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

/**
 * Couleurs d'un gabarit. Le gabarit 1 reprend EXACTEMENT les constantes d'origine (NOIR, GRIS, FILET) :
 * ses PDF sortent à l'octet près comme avant le point C. Le gabarit 2 suit tailwind.config.js.
 */
interface Teintes {
  encre: Couleur;      // texte courant
  gris: Couleur;       // références, mentions
  etiquette: Couleur;  // « Émetteur », en-têtes du tableau, titres de section
  filet: Couleur;
  total: Couleur;      // ligne du total à payer
  pied: Couleur;
  /** Gabarit 2 seulement : filet d'accent sous l'en-tête et fond de l'en-tête du tableau. */
  accent: Couleur | null;
  fondEntete: Couleur | null;
}

const TEINTES_1: Teintes = { encre: NOIR, gris: GRIS, etiquette: GRIS, filet: FILET, total: NOIR, pied: GRIS, accent: null, fondEntete: null };
const TEINTES_2: Teintes = {
  encre: hex('#1A2332'),       // dark
  gris: hex('#5A6B7A'),        // text-secondary
  etiquette: hex('#1A9A7F'),   // primary-dark
  filet: hex('#9DAFC0'),       // text-muted
  total: hex('#1A9A7F'),       // primary-dark
  pied: hex('#9DAFC0'),        // text-muted
  accent: hex('#2BB89A'),      // primary
  fondEntete: hex('#E6F5F1'),  // primary-light
};

/** Mention du gabarit 2, à droite du pied de page (décision du 2026-10-22), accordée pour un avoir. */
export function mentionHorizon(type: FacturePdf['type']): string {
  return type === 'avoir' ? 'Avoir édité avec Horizon' : 'Facture éditée avec Horizon';
}

interface Contexte {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  normal: PDFFont;
  gras: PDFFont;
  pied: string;
  pages: PDFPage[];
  t: Teintes;
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

function ecrire(c: Contexte, s: string, opts: { x?: number; taille?: number; gras?: boolean; couleur?: Couleur; largeur?: number } = {}): void {
  const taille = opts.taille ?? 10;
  const police = opts.gras ? c.gras : c.normal;
  const largeur = opts.largeur ?? A4[0] - 2 * MARGE;
  for (const l of decouper(police, s, taille, largeur)) {
    assurerPlace(c, taille + 4);
    c.page.drawText(l, { x: opts.x ?? MARGE, y: c.y - taille, size: taille, font: police, color: opts.couleur ?? c.t.encre });
    c.y -= taille + 4;
  }
}

function droite(c: Contexte, s: string, xDroit: number, y: number, taille: number, gras = false, couleur?: Couleur): void {
  const police = gras ? c.gras : c.normal;
  const t = sur(police, s);
  c.page.drawText(t, { x: xDroit - police.widthOfTextAtSize(t, taille), y, size: taille, font: police, color: couleur ?? c.t.encre });
}

/** Octets d'une police encodée en base64 (polices.ts) ; atob existe dans Deno comme dans Node. */
function base64EnOctets(b64: string): Uint8Array {
  const binaire = atob(b64);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
  return octets;
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

  // Gabarit figé à la validation (20261029100000). Toute valeur autre que 2 = gabarit 1 : les factures
  // émises avant le point C se recomposent à l'identique.
  const charte = f.gabarit === 2;
  let normal: PDFFont;
  let gras: PDFFont;
  if (charte) {
    // Police embarquée et sous-ensemblée. customName évite le suffixe ALÉATOIRE que pdf-lib ajoute sinon
    // au nom de la police : sans lui, deux compositions ne donneraient pas les mêmes octets.
    doc.registerFontkit(fontkit);
    normal = await doc.embedFont(base64EnOctets(PLUS_JAKARTA_SANS_REGULAR), { subset: true, customName: 'PlusJakartaSans-Regular' });
    gras = await doc.embedFont(base64EnOctets(PLUS_JAKARTA_SANS_BOLD), { subset: true, customName: 'PlusJakartaSans-Bold' });
  } else {
    normal = await doc.embedFont(StandardFonts.Helvetica);
    gras = await doc.embedFont(StandardFonts.HelveticaBold);
  }
  const premiere = doc.addPage(A4);
  const c: Contexte = { doc, page: premiere, y: A4[1] - MARGE, normal, gras, pied: blocs.titre, pages: [premiere], t: charte ? TEINTES_2 : TEINTES_1 };

  // Logo en haut à droite, dans une boîte de 140 × 56 points, jamais agrandi. Une image que pdf-lib ne
  // sait pas lire (PNG exotique, JPEG tronqué) est ignorée : le résultat reste le même à chaque
  // composition, ce qui garde la régénération à l'identique.
  if (f.logo) {
    try {
      const image = f.logo.type === 'png' ? await doc.embedPng(f.logo.octets) : await doc.embedJpg(f.logo.octets);
      const k = Math.min(LOGO_LARGEUR / image.width, LOGO_HAUTEUR / image.height, 1);
      const largeur = image.width * k;
      const hauteur = image.height * k;
      premiere.drawImage(image, { x: A4[0] - MARGE - largeur, y: A4[1] - MARGE - hauteur, width: largeur, height: hauteur });
    } catch {
      console.warn('[facturation-pdf] logo illisible, facture composée sans logo', f.numero);
    }
  }

  ecrire(c, blocs.titre, { taille: 20, gras: true, largeur: A4[0] - 2 * MARGE - (f.logo ? LOGO_LARGEUR + 12 : 0) });
  c.y -= 6;
  for (const l of blocs.references) ecrire(c, l, { couleur: c.t.gris });
  c.y -= 10;
  if (c.t.accent) {
    // Gabarit 2 : filet d'accent sous l'en-tête.
    c.page.drawLine({ start: { x: MARGE, y: c.y + 2 }, end: { x: A4[0] - MARGE, y: c.y + 2 }, thickness: 1.5, color: c.t.accent });
    c.y -= 12;
  }

  // Émetteur à gauche, destinataire à droite, au même niveau.
  const yHaut = c.y;
  const demi = (A4[0] - 2 * MARGE) / 2 - 10;
  ecrire(c, 'Émetteur', { gras: true, taille: 9, couleur: c.t.etiquette, largeur: demi });
  blocs.emetteur.forEach((l, i) => ecrire(c, l, { gras: i === 0, largeur: demi }));
  const yBasEmetteur = c.y;
  c.page = c.pages[0];
  c.y = yHaut;
  ecrire(c, 'Destinataire', { x: MARGE + demi + 20, gras: true, taille: 9, couleur: c.t.etiquette, largeur: demi });
  blocs.destinataire.forEach((l, i) => ecrire(c, l, { x: MARGE + demi + 20, gras: i === 0, largeur: demi }));
  for (const l of blocs.beneficiaire) ecrire(c, l, { x: MARGE + demi + 20, taille: 9, couleur: c.t.gris, largeur: demi });
  c.y = Math.min(c.y, yBasEmetteur) - 6;

  for (const l of blocs.mentionsSap) ecrire(c, l, { taille: 9, couleur: c.t.gris });
  c.y -= 14;

  // Tableau des lignes : désignation, quantité, prix unitaire HT, montant HT.
  const xQte = 355;
  const xPu = 445;
  const xMontant = A4[0] - MARGE;
  const enTete = (): void => {
    assurerPlace(c, 24);
    const base = c.y - 10;
    // Gabarit 2 : bandeau clair derrière les intitulés, débordant de 6 points à gauche et à droite.
    if (c.t.fondEntete) c.page.drawRectangle({ x: MARGE - 6, y: c.y - 16, width: xMontant - MARGE + 12, height: 18, color: c.t.fondEntete });
    // Gabarit 1 : « Désignation » en gris, les trois autres intitulés en noir (rendu d'origine conservé).
    const intitules = c.t.fondEntete ? c.t.etiquette : undefined;
    c.page.drawText('Désignation', { x: MARGE, y: base, size: 9, font: c.gras, color: c.t.etiquette });
    droite(c, 'Qté', xQte, base, 9, true, intitules);
    droite(c, 'Prix unit. HT', xPu, base, 9, true, intitules);
    droite(c, 'Montant HT', xMontant, base, 9, true, intitules);
    c.y -= 16;
    c.page.drawLine({ start: { x: MARGE, y: c.y }, end: { x: xMontant, y: c.y }, thickness: 0.6, color: c.t.filet });
    c.y -= 6;
  };
  enTete();
  // Point A (A2) : en « globale », séances et frais ne forment qu'une ligne (regroupement.ts). En
  // « detaillee » (et pour toute facture antérieure), les lignes sont celles de la base, comme avant :
  // ces PDF se recomposent octet pour octet.
  const globale = lirePresentation(f.presentation) === 'globale';
  for (const l of trierLignes(lignesAffichees(f.lignes, lirePresentation(f.presentation), f.periode))) {
    const morceaux = decouper(c.normal, l.libelle, 10, xQte - MARGE - 50);
    if (c.y - morceaux.length * 14 < MARGE + 30) { nouvellePage(c); enTete(); }
    const base = c.y - 10;
    droite(c, formaterQuantite(l.quantite), xQte, base, 10);
    droite(c, formaterMontant(l.prixUnitaire), xPu, base, 10);
    droite(c, formaterMontant(l.montant), xMontant, base, 10);
    for (const m of morceaux) {
      c.page.drawText(m, { x: MARGE, y: c.y - 10, size: 10, font: c.normal, color: c.t.encre });
      c.y -= 14;
    }
    c.y -= 2;
  }
  c.page.drawLine({ start: { x: MARGE, y: c.y }, end: { x: xMontant, y: c.y }, thickness: 0.6, color: c.t.filet });
  c.y -= 12;

  // Le récapitulatif redétaillerait ce que la présentation globale regroupe : il n'est imprimé qu'en détaillée.
  const recap = globale ? [] : recapitulatif(f.lignes);
  if (recap.length) {
    assurerPlace(c, 14 * (recap.length + 1) + 6);
    ecrire(c, 'Récapitulatif', { gras: true, taille: 9, couleur: c.t.etiquette });
    for (const l of recap) ecrire(c, l);
    c.y -= 10;
  }

  // Totaux : repris de la base, jamais recalculés ici (la TVA est arrondie UNE fois sur le total HT).
  assurerPlace(c, 70);
  const ligneTotal = (libelle: string, valeur: string, fort = false): void => {
    const base = c.y - 10;
    const couleur = fort ? c.t.total : c.t.encre;
    c.page.drawText(sur(c.normal, libelle), { x: xPu - 70, y: base, size: fort ? 11 : 10, font: fort ? c.gras : c.normal, color: couleur });
    droite(c, valeur, xMontant, base, fort ? 11 : 10, fort, couleur);
    c.y -= fort ? 18 : 15;
  };
  if (blocs.tva.franchise) {
    ligneTotal(f.type === 'avoir' ? "Total de l'avoir" : 'Total à payer', formaterMontant(f.total), true);
    c.y -= 4;
    ecrire(c, blocs.tva.mention ?? '', { taille: 9, couleur: c.t.gris });
  } else {
    ligneTotal('Total HT', formaterMontant(f.totalHt));
    ligneTotal(`TVA (${formaterTaux(f.tauxTva)})`, formaterMontant(f.montantTva));
    ligneTotal('Total TTC', formaterMontant(f.total), true);
  }
  c.y -= 12;

  if (blocs.paiement.length) {
    assurerPlace(c, 14 * (blocs.paiement.length + 1));
    ecrire(c, 'Conditions de paiement', { gras: true, taille: 9, couleur: c.t.etiquette });
    for (const l of blocs.paiement) ecrire(c, l);
  }

  // Pied de page sur chaque page : numéro de facture et pagination.
  const total = c.pages.length;
  c.pages.forEach((p, i) => {
    const t = sur(normal, `${blocs.titre} · page ${i + 1}/${total}`);
    p.drawText(t, { x: MARGE, y: 28, size: 8, font: normal, color: c.t.pied });
    if (charte) {
      const m = sur(normal, mentionHorizon(f.type));
      p.drawText(m, { x: A4[0] - MARGE - normal.widthOfTextAtSize(m, 8), y: 28, size: 8, font: normal, color: c.t.pied });
    }
  });

  return await doc.save({ useObjectStreams: false });
}
