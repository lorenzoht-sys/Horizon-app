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
//
// Décisions du 2026-10-22 (après la PR 8, demande de Pierre) : nom affiché « [nom commercial] via Horizon »
// (remplace le nom seul), corps HTML aux couleurs d'Horizon avec son logo et « Facture de la part de
// [prénom nom] — [nom commercial] ». La version texte reste envoyée (clients sans HTML). Logo : image
// hébergée (LOGO_EMAIL), l'e-mail reste lisible images bloquées. Aucun pixel de suivi.

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
  html: string;
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

/** Nom affiché dans « De » : « Mouv'APA via Horizon » ; « Horizon » seul si le profil n'a aucun nom. */
export function nomAffiche(e: FactureEnvoi['emetteur']): string {
  const nom = nomExpediteur(e);
  return nom === 'Horizon' ? 'Horizon' : `${nom} via Horizon`;
}

/** « Alex Exemple — Mouv'APA », ou l'un des deux seulement. */
export function emetteurComplet(e: FactureEnvoi['emetteur']): string {
  const personne = [e.prenom, e.nom].map(x => (x ?? '').trim()).filter(Boolean).join(' ');
  const societe = (e.societe ?? '').trim();
  return [personne, societe && societe !== personne ? societe : ''].filter(Boolean).join(' — ') || 'votre praticien';
}

/** Logo Horizon hébergé, version texte foncé (logo-horizon.png a un texte blanc, prévu pour la barre latérale sombre). */
export const LOGO_EMAIL = 'https://app.horizon-suivi.fr/LOGO_noir_pour_login.png';

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
  return ['Bonjour,', '', ...lignes, '', 'Pour toute question, répondez simplement à ce message.', '', 'Cordialement,', signature, '',
    '--', 'Envoyé via Horizon, logiciel de suivi en activité physique adaptée.', ''].join('\n');
}

function echapper(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Charte Horizon (tailwind.config.js) : vert #2BB89A, encre #1A2332, texte secondaire #5A6B7A, fonds
// #E6F5F1 / #F5F9FB. Mise en page en tableaux et styles en ligne : seule forme fiable dans les clients mail.
// Mode sombre (remarque du 2026-10-22) : le logo a un texte noir ; il est posé sur un bloc à fond blanc fixe
// (bgcolor + style) pour rester lisible quand Gmail ou Apple Mail assombrissent le message, et l'e-mail se
// déclare « light only » (respecté par Apple Mail). Images bloquées : texte alternatif « Horizon » en vert.
const POLICE = "'Plus Jakarta Sans', 'Segoe UI', Helvetica, Arial, sans-serif";

export function html(f: FactureEnvoi, logo: string = LOGO_EMAIL): string {
  const avoir = f.type === 'avoir';
  const de = echapper(emetteurComplet(f.emetteur));
  const ligne = (libelle: string, valeur: string) =>
    `<tr><td style="padding:6px 0;color:#5A6B7A;font-size:14px;">${libelle}</td>` +
    `<td align="right" style="padding:6px 0;color:#1A2332;font-size:14px;font-weight:600;">${valeur}</td></tr>`;
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<title>${echapper(sujet(f))}</title></head>
<body style="margin:0;padding:0;background:#F5F9FB;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F9FB;font-family:${POLICE};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:14px;border-top:4px solid #2BB89A;">
<tr><td style="padding:20px 28px 8px 28px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td bgcolor="#FFFFFF" style="background-color:#FFFFFF;border-radius:8px;padding:8px 10px;">
<img src="${echapper(logo)}" width="140" alt="Horizon" style="display:block;width:140px;height:auto;border:0;color:#2BB89A;font-family:${POLICE};font-size:20px;font-weight:700;">
</td></tr></table>
</td></tr>
<tr><td style="padding:8px 28px 0 28px;color:#5A6B7A;font-size:14px;">${avoir ? 'Avoir' : 'Facture'} de la part de <strong style="color:#1A2332;">${de}</strong></td></tr>
<tr><td style="padding:6px 28px 0 28px;color:#1A2332;font-size:20px;font-weight:700;">${echapper(sujet(f))}</td></tr>
<tr><td style="padding:16px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E6F5F1;border-radius:10px;padding:8px 16px;">
${ligne(avoir ? "Montant de l'avoir" : 'Montant', montant(f.total))}${!avoir && f.echeance ? ligne('Échéance de paiement', date(f.echeance)) : ''}
</table></td></tr>
<tr><td style="padding:0 28px 8px 28px;color:#1A2332;font-size:14px;line-height:1.5;">
Le document est joint à cet e-mail au format PDF.<br>Pour toute question, répondez simplement à ce message : votre réponse parviendra directement à ${de}.
</td></tr>
<tr><td style="padding:16px 28px 24px 28px;border-top:1px solid #EEF4F7;color:#9DAFC0;font-size:12px;">
Envoyé via Horizon, logiciel de suivi en activité physique adaptée.
</td></tr>
</table></td></tr></table>
</body></html>`;
}

/** Nom de la pièce jointe : le numéro, rien de nominatif (même règle que le téléchargement). */
export function nomPieceJointe(f: Pick<FactureEnvoi, 'numero' | 'type'>): string {
  return `${f.type === 'avoir' ? 'avoir' : 'facture'}-${f.numero.replace(/[^0-9A-Za-z-]/g, '')}.pdf`;
}

export function composerMessage(f: FactureEnvoi, a: string, pdfBase64: string, adresseExpedition: string): MessageResend {
  const reponse = (f.emetteur.email ?? '').trim();
  return {
    from: `"${nomAffiche(f.emetteur)}" <${adresseExpedition}>`,
    to: [a],
    ...(emailValide(reponse) ? { reply_to: reponse } : {}),
    subject: sujet(f),
    text: texte(f),
    html: html(f),
    attachments: [{ filename: nomPieceJointe(f), content: pdfBase64 }],
  };
}

/** Message d'erreur Resend lisible et court pour le journal (500 caractères au plus, contrainte de la base). */
export function erreurCourte(e: unknown): string {
  const s = typeof e === 'string' ? e : e instanceof Error ? e.message : JSON.stringify(e);
  return (s || 'Erreur inconnue').slice(0, 500);
}
