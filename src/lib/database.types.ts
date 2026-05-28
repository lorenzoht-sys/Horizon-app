// Types générés depuis le schéma Supabase.
// À remplacer par : npx supabase gen types typescript --project-id TON_PROJECT_ID > src/lib/database.types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      participants: {
        Row: {
          id: string;
          praticien_id: string | null;
          nom: string;
          prenom: string;
          date_naissance: string | null;
          date_creation: string;
          email: string | null;
          telephone: string | null;
          pathologie: string | null;
          profil: string | null;
          tags: string[] | null;
          tests_actifs: string[] | null;
          contexte_clinic: string | null;
          taille: number | null;
          poids: number | null;
          ville_naissance: string | null;
          code_postal_naissance: string | null;
          medecin_traitant: string | null;
          adresse_rue: string | null;
          adresse_code_postal: string | null;
          adresse_ville: string | null;
          coordonnees_lat: number | null;
          coordonnees_lng: number | null;
          coordonnees_geocodee_at: string | null;
          coordonnees_adresse_normalisee: string | null;
          geocode_failed: boolean;
          disponibilites: Json | null;
          token: string;
          profil_handicap: string | null;
          mode_deplacement_habituel: string | null;
          mode_deplacement_detail: string | null;
          antecedents_medicaux: string | null;
          antecedents_chirurgicaux: string | null;
          allergies: string | null;
          activites_souhaitees: string[] | null;
          objectifs_patient: Json | null;
          iban: string | null;
          bic: string | null;
          droit_image: boolean | null;
          rgpd: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['participants']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['participants']['Insert']>;
      };
      bilans: {
        Row: {
          id: string;
          participant_id: string;
          date: string;
          type: 'initial' | 'trimestriel';
          trimestre: number | null;
          equilibre_droite: number | null;
          equilibre_gauche: number | null;
          chair_stand_30: number | null;
          hand_grip_droite: number | null;
          hand_grip_gauche: number | null;
          tug_3m: number | null;
          souplesse_methode: 'debout' | 'assis' | null;
          souplesse_valeur: number | null;
          tm6_distance_metres: number | null;
          tm6_fc_avant: number | null;
          tm6_fc_apres: number | null;
          tm6_fc_2min: number | null;
          tm6_spo2_avant: number | null;
          tm6_spo2_apres: number | null;
          tm6_spo2_2min: number | null;
          tm6_borg_rpe: number | null;
          memoire_score_immediat: number | null;
          memoire_score_differe: number | null;
          memoire_dubois: Json | null;
          notes_professionnelles: string | null;
          objectifs_suivants: string | null;
          points_vigilance: string | null;
          message_client: string | null;
          profil_enrichi: Json | null;
          bilan_initial_data: Json | null;
          notes_bilan: Json | null;
          interpretation_ia: Json | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['bilans']['Row'], 'id' | 'created_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['bilans']['Insert']>;
      };
      programmes: {
        Row: {
          id: string;
          participant_id: string;
          date_creation: string;
          date_debut: string;
          date_fin: string | null;
          titre: string;
          objectif: string | null;
          message_motivation: string | null;
          exercices: Json;
          actif: boolean;
          suivi_semaines: Json;
        };
        Insert: Omit<Database['public']['Tables']['programmes']['Row'], 'id' | 'date_creation'> & { id?: string };
        Update: Partial<Database['public']['Tables']['programmes']['Insert']>;
      };
      seances: {
        Row: {
          id: string;
          participant_id: string;
          contrat_id: string | null;
          date: string;
          heure_debut: string;
          heure_fin: string;
          duree_minutes: number;
          type: 'seance' | 'bilan' | 'bilan_initial';
          statut: 'planifiee' | 'realisee' | 'annulee' | 'reportee';
          notes: string | null;
          adresse: string | null;
          coordonnees: Json | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['seances']['Row'], 'id' | 'created_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['seances']['Insert']>;
      };
      contrats: {
        Row: {
          id: string;
          participant_id: string;
          date_debut: string;
          date_fin: string;
          jours_fixe: string[];
          heure_debut: string;
          duree_minutes: number;
          statut: 'actif' | 'termine' | 'suspendu' | 'a_venir';
          notes: string | null;
          date_creation: string;
          nombre_seances_total: number;
          nombre_seances_realisees: number;
        };
        Insert: Omit<Database['public']['Tables']['contrats']['Row'], 'id' | 'date_creation'> & { id?: string };
        Update: Partial<Database['public']['Tables']['contrats']['Insert']>;
      };
      notes_seances: {
        Row: {
          id: string;
          seance_id: string;
          participant_id: string;
          date: string;
          heure_debut: string | null;
          ressenti: 'excellent' | 'bien' | 'moyen' | 'difficile' | 'arret' | null;
          note: string | null;
          alertes: Json | null;
          douleur_eva: number | null;
          fc_fin: number | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['notes_seances']['Row'], 'id' | 'created_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['notes_seances']['Insert']>;
      };
      zones_geographiques: {
        Row: {
          id: string;
          nom: string;
          couleur: string;
          participant_ids: string[];
          centroide_lat: number | null;
          centroide_lng: number | null;
          jours_assignes: string[];
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['zones_geographiques']['Row'], 'id' | 'created_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['zones_geographiques']['Insert']>;
      };
      indisponibilites: {
        Row: {
          id: string;
          jour: 'lun' | 'mar' | 'mer' | 'jeu' | 'ven' | 'sam' | 'dim';
          heure_debut: string;
          heure_fin: string;
          recurrente: boolean;
          label: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['indisponibilites']['Row'], 'id' | 'created_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['indisponibilites']['Insert']>;
      };
      acces_patients: {
        Row: {
          participant_id: string;
          visibilite: Json;
          message_pierre_texte: string | null;
          dernier_acces: string | null;
        };
        Insert: Database['public']['Tables']['acces_patients']['Row'];
        Update: Partial<Database['public']['Tables']['acces_patients']['Row']>;
      };
      settings_praticien: {
        Row: {
          id: string;
          prenom: string | null;
          nom: string | null;
          email: string | null;
          telephone: string | null;
          structure: string | null;
          numero_siret: string | null;
          adresse: string | null;
          logo_url: string | null;
          couleur_principale: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['settings_praticien']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['settings_praticien']['Insert']>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
