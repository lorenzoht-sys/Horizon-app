import * as XLSX from 'xlsx';
import type { Participant, TagPatient } from '../types';

// ── Types ─────────────────────────────────────────────────────

export interface ImportError {
  ligne: number;
  message: string;
}

export interface ImportResult {
  succes: Omit<Participant, 'id' | 'token' | 'bilans'>[];
  erreurs: ImportError[];
  ignores: ImportError[];
}

// ── Utilitaires de parsing ────────────────────────────────────

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}

function parseDate(raw: unknown): string {
  if (!raw) return '';

  // JS Date (cellDates: true)
  if (raw instanceof Date) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const s = String(raw).trim();

  // JJ/MM/AAAA · JJ-MM-AAAA · JJ.MM.AAAA
  const m1 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`;

  // Already ISO AAAA-MM-JJ
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Numéro de série Excel (ex: 13203.0 → 1936-02-13)
  const serial = parseFloat(s);
  if (!isNaN(serial) && serial > 1000) {
    const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
  }

  return '';
}

function parseTelephone(v: unknown): string | undefined {
  if (!v) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  const n = Math.round(parseFloat(s));
  if (isNaN(n)) return s || undefined;
  const digits = String(n);
  return digits.length === 9 ? '0' + digits : digits;
}

function parseCodePostal(v: unknown): string | undefined {
  if (!v) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  const n = parseFloat(s);
  return !isNaN(n) ? String(Math.round(n)) : s;
}

const VALID_TAGS: TagPatient[] = ['senior', 'post_op', 'chronique', 'adulte_blessure'];

// ── Parsing du fichier ────────────────────────────────────────

export function parseExcelRows(
  rows: unknown[][],
  existingParticipants: Participant[]
): ImportResult {
  const result: ImportResult = { succes: [], erreurs: [], ignores: [] };

  for (const [i, row] of rows.slice(1).entries()) {
    const numLigne = i + 2;
    const r = row as unknown[];

    const nom = str(r[0]);
    const prenom = str(r[1]);

    // Ignorer les lignes complètement vides
    if (!nom && !prenom && !r[2]) continue;

    if (!nom || !prenom) {
      result.erreurs.push({ ligne: numLigne, message: 'Nom et prénom obligatoires' });
      continue;
    }

    const dateNaissance = parseDate(r[2]);
    if (!dateNaissance) {
      result.erreurs.push({
        ligne: numLigne,
        message: `${prenom} ${nom} — date de naissance invalide (format attendu : JJ/MM/AAAA)`,
      });
      continue;
    }

    // Doublon
    const doublon = existingParticipants.find(
      p => p.nom.toLowerCase() === nom.toLowerCase() &&
           p.prenom.toLowerCase() === prenom.toLowerCase()
    );
    if (doublon) {
      result.ignores.push({ ligne: numLigne, message: `${prenom} ${nom} existe déjà` });
      continue;
    }

    // Tags
    const tagsRaw = str(r[12]);
    const tags: TagPatient[] = tagsRaw
      ? (tagsRaw.split(/[,;]/)
          .map(t => t.trim().toLowerCase())
          .filter(t => VALID_TAGS.includes(t as TagPatient)) as TagPatient[])
      : [];

    result.succes.push({
      nom,
      prenom,
      dateNaissance,
      dateCreation: new Date().toISOString().slice(0, 10),
      telephone:            parseTelephone(r[3]),
      email:                str(r[4])  || undefined,
      adresseRue:           str(r[5])  || undefined,
      adresseCodePostal:    parseCodePostal(r[6]),
      adresseVille:         str(r[7])  || undefined,
      taille:               num(r[8]),
      poids:                num(r[9]),
      villeNaissance:       str(r[10]) || undefined,
      codePostalNaissance:  parseCodePostal(r[11]),
      tags,
      contexteClinic:       str(r[13]) || undefined,
      pathologie:           str(r[14]) || undefined,
      medecinTraitant:      str(r[15]) || undefined,
      programmes: [],
    });
  }

  return result;
}

// ── Template Excel ────────────────────────────────────────────

const COLS = [
  { header: 'Nom ✱',                                       wch: 16 },
  { header: 'Prénom ✱',                                    wch: 16 },
  { header: 'Date naissance ✱  (JJ/MM/AAAA)',              wch: 30 },
  { header: 'Téléphone',                                   wch: 15 },
  { header: 'Email',                                       wch: 26 },
  { header: 'Adresse (rue)',                               wch: 26 },
  { header: 'Code postal',                                 wch: 13 },
  { header: 'Ville',                                       wch: 16 },
  { header: 'Taille (cm)',                                 wch: 12 },
  { header: 'Poids (kg)',                                  wch: 12 },
  { header: 'Ville de naissance',                          wch: 20 },
  { header: 'CP naissance',                                wch: 14 },
  { header: 'Tags  (senior,post_op,chronique,adulte_blessure)', wch: 46 },
  { header: 'Contexte clinique',                           wch: 28 },
  { header: 'Pathologies',                                 wch: 28 },
  { header: 'Médecin traitant',                            wch: 22 },
  { header: 'Notes',                                       wch: 28 },
];

const INSTRUCTIONS = [
  ['INSTRUCTIONS D\'IMPORT — MOUV\'APA'],
  [''],
  ['COLONNES OBLIGATOIRES (✱)'],
  ['  A — Nom'],
  ['  B — Prénom'],
  ['  C — Date de naissance  (format JJ/MM/AAAA, ex: 15/03/1952)'],
  [''],
  ['TAGS DISPONIBLES — colonne M  (séparez plusieurs tags par une virgule)'],
  ['  senior          → Sénior, prévention des chutes'],
  ['  post_op         → Post-opératoire, rééducation chirurgicale'],
  ['  chronique       → Pathologie chronique (cardiaque, diabète, BPCO…)'],
  ['  adulte_blessure → Adulte actif, reprise après blessure sportive'],
  [''],
  ['EXEMPLES'],
  ['  Patient sénior avec diabète  :  senior,chronique'],
  ['  Patient post-op uniquement   :  post_op'],
  [''],
  ['RÈGLES D\'IMPORT'],
  ['  • Remplir à partir de la ligne 2  (ligne 1 = en-têtes)'],
  ['  • Ne pas modifier les en-têtes de la feuille « Patients »'],
  ['  • Les doublons (même nom + prénom) seront ignorés automatiquement'],
  ['  • Les adresses seront géolocalisées automatiquement après import'],
  ['  • Le fichier exporté depuis Mouv\'APA peut être réimporté sans modification'],
];

export function downloadTemplate(): void {
  const wb = XLSX.utils.book_new();

  const ws = XLSX.utils.aoa_to_sheet([COLS.map(c => c.header)]);
  ws['!cols'] = COLS.map(c => ({ wch: c.wch }));
  XLSX.utils.book_append_sheet(wb, ws, 'Patients');

  const wsInstr = XLSX.utils.aoa_to_sheet(INSTRUCTIONS);
  wsInstr['!cols'] = [{ wch: 62 }];
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instructions');

  XLSX.writeFile(wb, 'Template_Import_Patients.xlsx');
}

// ── Export patients → Excel ───────────────────────────────────

export function exportPatientsExcel(participants: Participant[]): void {
  const headers = COLS.map(c =>
    c.header.replace(' ✱', '').replace(/\s+\(.*?\)/, '').trim()
  );

  const rows = participants.map(p => [
    p.nom,
    p.prenom,
    p.dateNaissance
      ? new Date(p.dateNaissance + 'T12:00:00').toLocaleDateString('fr-FR')
      : '',
    p.telephone        ?? '',
    p.email            ?? '',
    p.adresseRue       ?? '',
    p.adresseCodePostal ?? '',
    p.adresseVille     ?? '',
    p.taille           ?? '',
    p.poids            ?? '',
    p.villeNaissance   ?? '',
    p.codePostalNaissance ?? '',
    (p.tags ?? []).join(','),
    p.contexteClinic   ?? '',
    p.pathologie       ?? '',
    p.medecinTraitant  ?? '',
    '',
  ]);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = COLS.map(c => ({ wch: c.wch }));
  XLSX.utils.book_append_sheet(wb, ws, 'Patients');

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Patients_${date}.xlsx`);
}
