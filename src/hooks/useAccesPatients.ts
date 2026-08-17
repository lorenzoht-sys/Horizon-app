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

// Purge complète et défensive de tout ce qui pourrait rattacher cet
// appareil à un patient précédent — pas seulement la clé de session.
// Point d'entrée UNIQUE pour deux usages : (1) déconnexion explicite,
// (2) juste avant d'établir une NOUVELLE session sur ce device (voir
// EspacePatient.tsx, resoudreToken()), pour qu'un patient B qui se connecte
// après un patient A sur un appareil partagé (PWA, poste commun en
// structure...) ne récupère aucun résidu du patient précédent, même si A
// n'a jamais cliqué "déconnexion". Chaque étape est indépendante (un échec
// sur l'une ne doit pas empêcher les autres) : aucune donnée patient n'est
// mise en cache aujourd'hui (aucune règle runtimeCaching ne couvre /api/*,
// voir vite.config.ts, et aucune IndexedDB n'est utilisée pour l'espace
// patient) — cette purge couvre ces mécanismes par défense en profondeur,
// pour qu'une future fonctionnalité de cache offline ne réintroduise pas
// silencieusement ce risque.
export function purgerSessionPatient(): void {
  try { localStorage.removeItem(SESSION_KEY); } catch {}

  try {
    const clesViaPraticien: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const cle = sessionStorage.key(i);
      if (cle?.startsWith('horizon_patient_via_praticien_')) clesViaPraticien.push(cle);
    }
    for (const cle of clesViaPraticien) sessionStorage.removeItem(cle);
  } catch {}

  try {
    if ('caches' in window) {
      void caches.keys().then((noms) => Promise.all(noms.map((nom) => caches.delete(nom))));
    }
  } catch {}

  try {
    if (indexedDB?.databases) {
      void indexedDB.databases().then((bases) => {
        for (const base of bases) {
          if (base.name) indexedDB.deleteDatabase(base.name);
        }
      });
    }
  } catch {}
}
