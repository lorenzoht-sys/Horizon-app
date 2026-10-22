// Composition de l'e-mail d'envoi d'une facture (plan facturation PR 8). Logique pure, testée à côté
// (envoi.test.ts) : aucune I/O, rien de Deno. index.ts lit la base, appelle Resend et journalise.
//
// Décisions du 2026-10-22 :
//   * expéditeur factures@horizon-suivi.fr (FACTURES_EXPEDITEUR), nom affiché = nom commercial du profil
//     (snapshot_emetteur.societe), sinon prénom + nom du praticien ;
//   * « Répondre à » = e-mail du praticien figé à la validation (le domaine n'a aucune boîte de réception) ;
//   * destinataire = e-mail figé à la validation (proche payeur ou bénéficiaire), sinon adresse saisie
//     au moment de l'envoi.
// Le corps ne porte aucune donnée de santé : numéro, période, montant et échéance seulement ; le détail
// est dans le PDF joint.

export interface FactureEnvoi {
  numero: string;
  type: 'facture' | 'avoir';
  /** AAAA-MM-01 */
  periode: string;
  total: number;
  /** AAAA-MM-JJ */
  echeance: string | null;
  emetteur: { societe?: string | null; prenom?: string | null; nom?: string | null; email?: string | null };
  destinataire: { email?: string | null };
}

export interface MessageResend {
  from: string;
  to: string[];
  reply_to?: string;
  subject: string;
  text: string;
  attachments: { filename: string; content: string }[];
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Forme seulement : une adresse plausible, sans espace, 254 caractères au plus (même règle que la base). */
export function emailValide(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
}

/** Nom affiché de l'expéditeur, sans caractère qui casserait l'en-tête From. */
export function nomExpediteur(e: FactureEnvoi['emetteur']): string {
  const brut = (e.societe ?? '').trim() || [e.prenom, e.nom].map(x => (x ?? '').trim()).filter(Boolean).join(' ') || 'Horizon';
  return brut.replace(/[\r\n\t]/g, ' ').replace(/["<>\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Horizon';
}

/** Adresse de destination : celle saisie à l'envoi si elle est donnée, sinon celle figée à la validation. */
export function destinataire(f: FactureEnvoi, saisie?: string | null): { email: string } | { manquant: true } | { invalide: true } {
  const s = (saisie ?? '').trim();
  if (s) return emailValide(s) ? { email: s } : { invalide: true };
  const fige = (f.destinataire.email ?? '').trim();
  return emailValide(fige) ? { email: fige } : { manquant: true };
}

function montant(v: number): string {
  const [entier, dec] = Math.abs(v).toFixed(2).split('.');
  return `${v < 0 ? '-' : ''}${entier.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${dec} €`;
}
function date(iso: string): string {
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a}`;
}
function mois(periode: string): string {
  const [a, m] = periode.split('-').map(Number);
  return `${MOIS[m - 1] ?? ''} ${a}`;
}

export function sujet(f: FactureEnvoi): string {
  return `${f.type === 'avoir' ? 'Avoir' : 'Facture'} n° ${f.numero} — ${mois(f.periode)}`;
}

export function texte(f: FactureEnvoi): string {
  const signature = nomExpediteur(f.emetteur);
  const lignes = f.type === 'avoir'
    ? [`Veuillez trouver ci-joint l'avoir n° ${f.numero} (${mois(f.periode)}), d'un montant de ${montant(f.total)}.`]
    : [
        `Veuillez trouver ci-joint la facture n° ${f.numero} (${mois(f.periode)}), d'un montant de ${montant(f.total)}.`,
        ...(f.echeance ? [`Échéance de paiement : ${date(f.echeance)}.`] : []),
      ];
  return ['Bonjour,', '', ...lignes, '', 'Pour toute question, répondez simplement à ce message.', '', 'Cordialement,', signature, ''].join('\n');
}

/** Nom de la pièce jointe : le numéro, rien de nominatif (même règle que le téléchargement). */
export function nomPieceJointe(f: Pick<FactureEnvoi, 'numero' | 'type'>): string {
  return `${f.type === 'avoir' ? 'avoir' : 'facture'}-${f.numero.replace(/[^0-9A-Za-z-]/g, '')}.pdf`;
}

export function composerMessage(f: FactureEnvoi, a: string, pdfBase64: string, adresseExpedition: string): MessageResend {
  const reponse = (f.emetteur.email ?? '').trim();
  return {
    from: `"${nomExpediteur(f.emetteur)}" <${adresseExpedition}>`,
    to: [a],
    ...(emailValide(reponse) ? { reply_to: reponse } : {}),
    subject: sujet(f),
    text: texte(f),
    attachments: [{ filename: nomPieceJointe(f), content: pdfBase64 }],
  };
}

/** Message d'erreur Resend lisible et court pour le journal (500 caractères au plus, contrainte de la base). */
export function erreurCourte(e: unknown): string {
  const s = typeof e === 'string' ? e : e instanceof Error ? e.message : JSON.stringify(e);
  return (s || 'Erreur inconnue').slice(0, 500);
}
