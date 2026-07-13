// Le contrôle de partage bénéficiaire (VisibiliteBeneficiaire) vivait ici en
// localStorage — retiré : c'était local à l'appareil qui l'écrivait (celui de
// Pierre), donc jamais vu par le bénéficiaire sur son propre appareil, et
// jamais appliqué côté serveur. Remplacé par une colonne Supabase
// (participants.visibilite_beneficiaire), appliquée dans api/patient/me.ts —
// voir src/lib/mappers.ts et src/components/participant/ModalEspacePatient.tsx.

// ── Session patient (persistance pour PWA "ajouter à l'écran d'accueil") ──────
// La PWA s'ouvre sans les paramètres d'URL (?code=...) : on garde la session
// en localStorage pour rester connecté entre deux ouvertures de l'app.

const SESSION_KEY = 'horizon_patient_session';

export interface SessionPatient {
  patientId: string;
  token: string;
}

export function sauvegarderSessionPatient(session: SessionPatient): void {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch {}
}

export function getSessionPatient(): SessionPatient | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null'); }
  catch { return null; }
}

export function purgerSessionPatient(): void {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}
