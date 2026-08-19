export type AppView = 'welcome' | 'setup' | 'login' | 'dashboard';

export type UserRole = 'MEDECIN' | 'SECRETAIRE' | 'ADMINISTRATEUR';

export interface DoctorProfile {
  id: string;
  civilite: 'Dr' | 'Pr';
  specialite: string;
  numero_rpps?: string | null;
  nom: string;
  prenom: string;
  email: string;
  telephone: string | null;
  phone?: string | null;
  role: UserRole;
  pin?: string;
  pin_hash?: string | null;
  biometrie_active?: boolean;
}

export type Doctor = DoctorProfile;

export interface Patient {
  id: string;
  doctor_id?: string;
  numero_dossier: string;
  nom: string;
  prenom: string;
  sexe: 'M' | 'F';
  date_naissance: string | null;
  telephone?: string | null;
  email?: string | null;
  adresse?: string | null;
  profession?: string | null;
  personne_prevenir?: string | null;
  groupe_sanguin?: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | string | null;
  source_groupe_sanguin?: 'BIOLOGIQUE' | 'DECLARE' | null;
  photo_url?: string | null;
  antecedents_medicaux?: string | null;
  antecedents_chirurgicaux?: string | null;
  allergies?: string | null;
  traitements_fond?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  is_synced?: boolean;
}

export interface Consultation {
  id: string;
  patient_id: string;
  doctor_id?: string;
  medecin_id?: string;
  date_consultation?: string;
  date?: string;
  motif: string;
  histoire_maladie?: string | null;
  examen_clinique?: string | null;
  diagnostic?: string | null;
  conduite_a_tenir?: string | null;
  traitement?: string | null;
  conseils?: string | null;
  date_controle?: string | null;
  poids_kg?: number | null;
  taille_cm?: number | null;
  pression_arterielle?: string | null;
  frequence_cardiaque?: number | null;
  temperature?: number | null;
  created_at?: string;
  updated_at?: string;
  is_synced?: boolean;
  constantes?: any;
}

export interface RendezVous {
  id: string;
  patient_id: string;
  doctor_id?: string;
  medecin_id?: string;
  patient_name?: string;
  patient_nom?: string;
  patient_prenom?: string;
  patient_telephone?: string | null;
  patient_numero_dossier?: string;
  date_heure: string;
  motif?: string | null;
  statut: 'PLANIFIE' | 'HONORE' | 'ANNULE' | 'PROGRAMME' | 'CONFIRME' | 'REALISE';
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  is_synced?: boolean;
}

export type Appointment = RendezVous;
