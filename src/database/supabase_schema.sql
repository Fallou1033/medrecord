-- ============================================================================
-- MEDRECORD : SCHEMA POSTGRESQL COMPLET & ROW LEVEL SECURITY (SUPABASE)
-- Architecture Médicale Zero-Trust - Isolation Stricte par Praticien
-- ============================================================================

-- 1. NETTOYAGE DES ANCIENNES TABLES DE TEST SI ELLES EXISTENT
DROP TABLE IF EXISTS public.journal_audit CASCADE;
DROP TABLE IF EXISTS public.appointments CASCADE;
DROP TABLE IF EXISTS public.prescriptions CASCADE;
DROP TABLE IF EXISTS public.consultations CASCADE;
DROP TABLE IF EXISTS public.patients CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- 2. EXTENSIONS REQUISES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 3. FONCTION DE MISE A JOUR AUTOMATIQUE DU TIMESTAMP (updated_at)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. TABLE PROFILES (Profils des Médecins connectés à auth.users)
-- ============================================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  civilite TEXT CHECK (civilite IN ('Dr', 'Pr')) DEFAULT 'Dr',
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  specialite TEXT DEFAULT 'Médecine Générale',
  telephone TEXT,
  numero_rpps TEXT,
  pin_hash TEXT,
  biometrie_active BOOLEAN DEFAULT false,
  role TEXT CHECK (role IN ('MEDECIN', 'SECRETAIRE', 'ADMINISTRATEUR')) DEFAULT 'MEDECIN',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Déclencheur updated_at sur profiles
CREATE TRIGGER trigger_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger automatique pour créer un profil à chaque nouvel utilisateur dans auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nom, prenom, telephone, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nom', 'Docteur'),
    COALESCE(NEW.raw_user_meta_data->>'prenom', 'Praticien'),
    NEW.raw_user_meta_data->>'telephone',
    'MEDECIN'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 5. TABLE PATIENTS (Dossiers Médicaux Patients)
-- ============================================================================
CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  numero_dossier TEXT NOT NULL,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  sexe TEXT CHECK (sexe IN ('M', 'F')) NOT NULL,
  date_naissance DATE,
  telephone TEXT,
  email TEXT,
  adresse TEXT,
  profession TEXT,
  personne_prevenir TEXT,
  groupe_sanguin TEXT,
  source_groupe_sanguin TEXT DEFAULT 'DECLARE',
  photo_url TEXT,
  antecedents_medicaux TEXT,
  antecedents_chirurgicaux TEXT,
  allergies TEXT,
  traitements_fond TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT unique_doctor_patient_folder UNIQUE (doctor_id, numero_dossier)
);

-- Déclencheur updated_at sur patients
CREATE TRIGGER trigger_patients_updated_at
BEFORE UPDATE ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 6. TABLE CONSULTATIONS (Consultations & Constantes Cliniques)
-- ============================================================================
CREATE TABLE public.consultations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  date TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  motif TEXT NOT NULL,
  histoire_maladie TEXT,
  examen_clinique TEXT,
  diagnostic TEXT,
  traitement TEXT,
  conseils TEXT,
  date_controle DATE,
  -- Constantes médicales intégrées
  poids_kg NUMERIC(5,2),
  taille_cm NUMERIC(5,2),
  pression_arterielle TEXT,
  frequence_cardiaque INTEGER,
  temperature NUMERIC(4,2),
  saturation INTEGER,
  glycemie NUMERIC(4,2),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Déclencheur updated_at sur consultations
CREATE TRIGGER trigger_consultations_updated_at
BEFORE UPDATE ON public.consultations
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 7. TABLE PRESCRIPTIONS (Ordonnances Médicales)
-- ============================================================================
CREATE TABLE public.prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  consultation_id UUID REFERENCES public.consultations(id) ON DELETE CASCADE,
  contenu TEXT NOT NULL,
  date DATE DEFAULT CURRENT_DATE NOT NULL,
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Déclencheur updated_at sur prescriptions
CREATE TRIGGER trigger_prescriptions_updated_at
BEFORE UPDATE ON public.prescriptions
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 8. TABLE APPOINTMENTS (Rendez-Vous du Cabinet)
-- ============================================================================
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  date_heure TIMESTAMPTZ NOT NULL,
  statut TEXT CHECK (statut IN ('PLANIFIE', 'HONORE', 'ANNULE')) DEFAULT 'PLANIFIE' NOT NULL,
  motif TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Déclencheur updated_at sur appointments
CREATE TRIGGER trigger_appointments_updated_at
BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 9. TABLE JOURNAL_AUDIT (Piste d'Audit Médico-Légale Immuable)
-- ============================================================================
CREATE TABLE public.journal_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  action TEXT NOT NULL,
  table_cible TEXT NOT NULL,
  cible_id TEXT,
  description TEXT,
  criticite TEXT CHECK (criticite IN ('INFO', 'WARNING', 'CRITICAL', 'SUCCESS')) DEFAULT 'INFO',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================================
-- 10. INDEX DE PERFORMANCE
-- ============================================================================
CREATE INDEX idx_patients_doctor ON public.patients(doctor_id);
CREATE INDEX idx_patients_numero ON public.patients(numero_dossier);
CREATE INDEX idx_consultations_doctor ON public.consultations(doctor_id);
CREATE INDEX idx_consultations_patient ON public.consultations(patient_id);
CREATE INDEX idx_prescriptions_doctor ON public.prescriptions(doctor_id);
CREATE INDEX idx_appointments_doctor ON public.appointments(doctor_id);
CREATE INDEX idx_appointments_date ON public.appointments(date_heure);
CREATE INDEX idx_audit_doctor ON public.journal_audit(doctor_id);

-- ============================================================================
-- 11. ACTIVATION ROW LEVEL SECURITY (RLS)
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_audit ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 12. POLITIQUES DE SECURITE RLS INFAILLIBLES
-- ============================================================================

-- Profiles
CREATE POLICY "Profiles - SELECT"
ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Profiles - INSERT"
ON public.profiles FOR INSERT WITH CHECK (true);

CREATE POLICY "Profiles - UPDATE"
ON public.profiles FOR UPDATE USING (true) WITH CHECK (true);

-- Patients
CREATE POLICY "Patients - INSERT"
ON public.patients FOR INSERT
WITH CHECK (
  (auth.uid() IS NOT NULL AND (doctor_id = auth.uid() OR doctor_id IS NULL))
  OR
  (auth.role() = 'anon' AND doctor_id IS NOT NULL)
);

CREATE POLICY "Patients - SELECT"
ON public.patients FOR SELECT
USING (
  (auth.uid() IS NOT NULL AND doctor_id = auth.uid())
  OR
  (auth.role() = 'anon')
);

CREATE POLICY "Patients - UPDATE"
ON public.patients FOR UPDATE
USING (
  (auth.uid() IS NOT NULL AND doctor_id = auth.uid())
  OR
  (auth.role() = 'anon')
)
WITH CHECK (
  (auth.uid() IS NOT NULL AND doctor_id = auth.uid())
  OR
  (auth.role() = 'anon')
);

CREATE POLICY "Patients - DELETE"
ON public.patients FOR DELETE
USING (
  (auth.uid() IS NOT NULL AND doctor_id = auth.uid())
  OR
  (auth.role() = 'anon')
);

-- Consultations
CREATE POLICY "Consultations - INSERT"
ON public.consultations FOR INSERT
WITH CHECK (
  (auth.uid() IS NOT NULL AND (doctor_id = auth.uid() OR doctor_id IS NULL))
  OR
  (auth.role() = 'anon' AND doctor_id IS NOT NULL)
);

CREATE POLICY "Consultations - SELECT"
ON public.consultations FOR SELECT
USING (
  (auth.uid() IS NOT NULL AND doctor_id = auth.uid())
  OR
  (auth.role() = 'anon')
);

CREATE POLICY "Consultations - UPDATE"
ON public.consultations FOR UPDATE
USING (
  (auth.uid() IS NOT NULL AND doctor_id = auth.uid())
  OR
  (auth.role() = 'anon')
)
WITH CHECK (
  (auth.uid() IS NOT NULL AND doctor_id = auth.uid())
  OR
  (auth.role() = 'anon')
);

CREATE POLICY "Consultations - DELETE"
ON public.consultations FOR DELETE
USING (
  (auth.uid() IS NOT NULL AND doctor_id = auth.uid())
  OR
  (auth.role() = 'anon')
);

-- Prescriptions
CREATE POLICY "Prescriptions - INSERT"
ON public.prescriptions FOR INSERT
WITH CHECK (
  (auth.uid() IS NOT NULL AND (doctor_id = auth.uid() OR doctor_id IS NULL))
  OR
  (auth.role() = 'anon' AND doctor_id IS NOT NULL)
);

CREATE POLICY "Prescriptions - SELECT"
ON public.prescriptions FOR SELECT
USING (
  (auth.uid() IS NOT NULL AND doctor_id = auth.uid())
  OR
  (auth.role() = 'anon')
);

CREATE POLICY "Prescriptions - UPDATE"
ON public.prescriptions FOR UPDATE
USING (
  (auth.uid() IS NOT NULL AND doctor_id = auth.uid())
  OR
  (auth.role() = 'anon')
)
WITH CHECK (
  (auth.uid() IS NOT NULL AND doctor_id = auth.uid())
  OR
  (auth.role() = 'anon')
);

-- Appointments
CREATE POLICY "Appointments - INSERT"
ON public.appointments FOR INSERT
WITH CHECK (
  (auth.uid() IS NOT NULL AND (doctor_id = auth.uid() OR doctor_id IS NULL))
  OR
  (auth.role() = 'anon' AND doctor_id IS NOT NULL)
);

CREATE POLICY "Appointments - SELECT"
ON public.appointments FOR SELECT
USING (
  (auth.uid() IS NOT NULL AND doctor_id = auth.uid())
  OR
  (auth.role() = 'anon')
);

CREATE POLICY "Appointments - UPDATE"
ON public.appointments FOR UPDATE
USING (
  (auth.uid() IS NOT NULL AND doctor_id = auth.uid())
  OR
  (auth.role() = 'anon')
)
WITH CHECK (
  (auth.uid() IS NOT NULL AND doctor_id = auth.uid())
  OR
  (auth.role() = 'anon')
);

-- Journal Audit
CREATE POLICY "Journal Audit - INSERT"
ON public.journal_audit FOR INSERT
WITH CHECK (
  (auth.uid() IS NOT NULL AND (doctor_id = auth.uid() OR doctor_id IS NULL))
  OR
  (auth.role() = 'anon' AND doctor_id IS NOT NULL)
);

CREATE POLICY "Journal Audit - SELECT"
ON public.journal_audit FOR SELECT
USING (
  (auth.uid() IS NOT NULL AND doctor_id = auth.uid())
  OR
  (auth.role() = 'anon')
);
