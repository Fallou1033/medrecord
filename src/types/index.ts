export type AppView = 'welcome' | 'setup' | 'login' | 'dashboard';

export type UserRole = 'MEDECIN' | 'SECRETAIRE' | 'ADMINISTRATEUR';

export interface DoctorProfile {
  id: string;
  civilite: 'Dr' | 'Pr';
  specialite: string;
  numero_rpps?: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  phone?: string;
  role: UserRole;
  pin?: string;
  pin_hash?: string;
  biometrie_active?: boolean;
}

export interface Patient {
  id: string;
  nom: string;
  prenom: string;
  sexe: 'M' | 'F';
  date_naissance: string;
  telephone?: string | null;
  email?: string | null;
  adresse?: string | null;
  groupe_sanguin?: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | null;
  antecedents_medicaux?: string | null;
  antecedents_chirurgicaux?: string | null;
  allergies?: string | null;
  traitements_fond?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Consultation {
  id: string;
  patient_id: string;
  date_consultation: string;
  motif: string;
  histoire_maladie?: string | null;
  examen_clinique?: string | null;
  diagnostic?: string | null;
  conduite_a_tenir?: string | null;
  poids_kg?: number | null;
  taille_cm?: number | null;
  pression_arterielle?: string | null;
  frequence_cardiaque?: number | null;
  temperature?: number | null;
  created_at?: string;
}

export interface RendezVous {
  id: string;
  patient_id: string;
  patient_name?: string;
  date_heure: string;
  motif?: string | null;
  statut: 'PLANIFIE' | 'HONORE' | 'ANNULE';
  notes?: string | null;
}
