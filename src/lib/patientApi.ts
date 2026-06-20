// Client fetch pour /api/patient/* (T3 — sécurisation Horizon).
// Remplace les appels Supabase directs (anon) de l'espace patient : toutes
// les requêtes passent par des endpoints serverless qui valident le code
// patient / le JWT côté serveur (clé service_role, jamais exposée ici).

export interface PatientMeResponse {
  participantId: string;
  participant: Record<string, unknown>;
  bilans: Record<string, unknown>[];
  seances: Record<string, unknown>[];
  programmes: Record<string, unknown>[];
  programmeSeances: Record<string, unknown>[];
  programmePlanning: Record<string, unknown>[];
  programmeExercices: Record<string, unknown>[];
  documentsPatient: { id: string; titre: string; contenu: string; date_creation: string }[];
  seancesPatient: Record<string, unknown>[];
  exercicesRealises: { seance_patient_id: string; realise: boolean }[];
  /** Décompte total des séances autonomes validées, par programme_id — non limité aux 15 dernières (cf. seancesPatient). */
  seancesAutonomesCount: Record<string, number>;
}

export interface SeanceAEnregistrer {
  programmeId: string;
  seanceId: string;
  dateSeance: string;
  statut: 'terminee' | 'partielle' | 'en_cours';
  commentairePatient?: string | null;
  dureeMinutes?: number;
  exercices: { id: string; realise: boolean; commentaire?: string }[];
}

export async function patientLogin(code: string): Promise<{ token: string; participantId: string } | { error: string }> {
  try {
    const res = await fetch('/api/patient/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data?.error ?? 'Erreur de connexion.' };
    return data;
  } catch {
    return { error: 'Erreur de connexion. Vérifiez votre réseau et réessayez.' };
  }
}

export async function patientFetchMe(token: string): Promise<{ ok: true; data: PatientMeResponse } | { ok: false; status: number }> {
  try {
    const res = await fetch('/api/patient/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false, status: 0 };
  }
}

export async function patientSauvegarderSeance(
  token: string,
  payload: SeanceAEnregistrer,
): Promise<{ ok: boolean; seancePatientId?: string; error?: string }> {
  try {
    const res = await fetch('/api/patient/seance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error };
    return { ok: true, seancePatientId: data.seancePatientId };
  } catch {
    return { ok: false };
  }
}

export async function patientEnvoyerRetour(
  token: string,
  payload: { seanceId?: string | null; borgRpe: number; bienEtre: number },
): Promise<boolean> {
  try {
    const res = await fetch('/api/patient/retour-seance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      console.error('[patientEnvoyerRetour] échec', res.status, body?.error);
    }
    return res.ok;
  } catch (err) {
    console.error('[patientEnvoyerRetour] erreur réseau', err);
    return false;
  }
}

// Enregistre un abonnement push (rappels-patients, T2).
export async function patientActiverRappels(token: string, subscription: PushSubscriptionJSON): Promise<boolean> {
  try {
    const res = await fetch('/api/patient/push-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subscription }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Supprime un abonnement push (désactive les rappels sur cet appareil).
export async function patientDesactiverRappels(token: string, endpoint: string): Promise<boolean> {
  try {
    const res = await fetch('/api/patient/push-subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ endpoint }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
