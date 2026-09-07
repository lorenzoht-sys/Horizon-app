// Réglages du praticien : source de vérité en base, cache localStorage.
//
// ── Pourquoi un cache, et pourquoi il faut l'hydrater ───────────────────
// Les composants qui produisent des documents — contrat de prestation,
// fiches bilan, rapport d'évolution — lisent ces réglages de façon
// SYNCHRONE, au moment du rendu. Ils ne peuvent pas attendre une requête.
// D'où le cache `settings_praticien` dans localStorage.
//
// Ce cache n'était écrit qu'à DEUX endroits : la sauvegarde des réglages et
// la fin de l'onboarding. Jamais à la connexion. Conséquence, sur un second
// appareil — le poste du cabinet et le portable en visite à domicile, donc
// le quotidien — le cache n'existait pas :
//
//   - `loadSettings()` rendait un objet vide ;
//   - l'onboarding ne se rejouait pas, il est conditionné à
//     `praticiens.titre` en base, déjà renseigné ;
//   - visiter les Réglages ne suffisait pas : la page hydrate son formulaire
//     depuis la base, mais seul « Enregistrer » écrit le cache.
//
// Le praticien se retrouvait donc sans identité sur ses propres documents,
// sans rien qui le lui dise. `hydraterSettingsPraticien` ferme ce trou en
// remplissant le cache dès l'ouverture de session.
//
// La base reste la source de vérité : SettingsPage écrit d'abord dans
// `praticiens`, puis le cache. Hydrater depuis la base ne peut donc pas
// écraser une modification plus récente.

import { supabase } from './supabase';

export const CLE_SETTINGS_PRATICIEN = 'settings_praticien';

/** Événement émis après écriture du cache, pour les composants qui l'écoutent. */
export const EVENT_SETTINGS_PRATICIEN = 'settings_praticien_updated';

export interface SettingsPraticien {
  prenom: string;
  nom: string;
  titre: string;
  email: string;
  telephone: string;
  adresseRue: string;
  adresseCodePostal: string;
  adresseVille: string;
  siret: string;
  numeroSAP: string;
  numeroTVA: string;
  villeSignature: string;
  societe: string;
  logoPraticien: string;
  tarifHoraire: string;
  fraisKmDefaut: string;
}

export const DEFAULTS_SETTINGS: SettingsPraticien = {
  prenom: '', nom: '', titre: 'Enseignant en Activité Physique Adaptée',
  email: '', telephone: '', adresseRue: '', adresseCodePostal: '',
  adresseVille: '', siret: '', numeroSAP: '', numeroTVA: '',
  villeSignature: '', societe: '', logoPraticien: '',
  tarifHoraire: '45', fraisKmDefaut: '0.50',
};

/** Ligne `praticiens` → réglages. La table porte tous les champs. */
export function rowToSettings(row: Record<string, unknown>): SettingsPraticien {
  return {
    prenom:            String(row.prenom              ?? ''),
    nom:               String(row.nom                 ?? ''),
    titre:             String(row.titre               ?? DEFAULTS_SETTINGS.titre),
    email:             String(row.email               ?? ''),
    telephone:         String(row.telephone           ?? ''),
    adresseRue:        String(row.adresse_rue         ?? ''),
    adresseCodePostal: String(row.adresse_code_postal ?? ''),
    adresseVille:      String(row.adresse_ville       ?? ''),
    siret:             String(row.siret               ?? ''),
    numeroSAP:         String(row.numero_sap          ?? ''),
    numeroTVA:         String(row.numero_tva          ?? ''),
    villeSignature:    String(row.ville_signature     ?? ''),
    societe:           String(row.societe             ?? ''),
    logoPraticien:     String(row.logo_praticien      ?? ''),
    tarifHoraire:      String(row.tarif_horaire       ?? DEFAULTS_SETTINGS.tarifHoraire),
    fraisKmDefaut:     String(row.frais_km_defaut     ?? DEFAULTS_SETTINGS.fraisKmDefaut),
  };
}

/**
 * Lecture SYNCHRONE du cache. Remplace les cinq copies locales de
 * `loadSettings()` qui traînaient dans les pages, chacune avec son propre
 * sous-ensemble de valeurs par défaut.
 */
export function chargerSettingsPraticien(): SettingsPraticien {
  try {
    const brut = localStorage.getItem(CLE_SETTINGS_PRATICIEN);
    if (!brut) return { ...DEFAULTS_SETTINGS };
    return { ...DEFAULTS_SETTINGS, ...JSON.parse(brut) };
  } catch {
    return { ...DEFAULTS_SETTINGS };
  }
}

/** Écrit le cache et prévient les composants qui l'écoutent. */
export function ecrireCacheSettingsPraticien(settings: SettingsPraticien): void {
  localStorage.setItem(CLE_SETTINGS_PRATICIEN, JSON.stringify(settings));
  window.dispatchEvent(new Event(EVENT_SETTINGS_PRATICIEN));
}

/**
 * Remplit le cache depuis `praticiens`. À appeler à l'ouverture de session.
 *
 * Ne fait RIEN si la fiche praticien n'existe pas encore (compte invité qui
 * n'a pas terminé son onboarding, cas du 406 sur /praticiens?select=titre) :
 * écraser le cache avec du vide serait pire que de le laisser tel quel.
 *
 * Ne lève jamais : un échec réseau ne doit pas empêcher d'entrer dans
 * l'application. Le pire cas est le comportement d'avant — un cache absent.
 */
export async function hydraterSettingsPraticien(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;

    const { data, error } = await supabase
      .from('praticiens')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle();

    if (error || !data) return false;

    ecrireCacheSettingsPraticien(rowToSettings(data as Record<string, unknown>));
    return true;
  } catch {
    return false;
  }
}
