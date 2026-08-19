import { supabase } from '../../lib/supabase';

export interface Prescription {
  id: string;
  doctor_id?: string;
  patient_id: string;
  consultation_id?: string | null;
  contenu: string;
  date: string;
  pdf_url?: string | null;
  created_at?: string;
  updated_at?: string;
  patients?: {
    nom: string;
    prenom: string;
  };
}

/**
 * Service de gestion des ordonnances connecté à Supabase avec RLS
 */
export async function getPrescriptions(patientId?: string): Promise<Prescription[]> {
  let query = supabase
    .from('prescriptions')
    .select('*, patients(nom, prenom)')
    .order('date', { ascending: false });

  if (patientId) {
    query = query.eq('patient_id', patientId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Supabase getPrescriptions error:', error);
    throw new Error(`Erreur lors de la récupération des ordonnances: ${error.message}`);
  }

  return data || [];
}

export async function createPrescription(prescription: {
  patient_id: string;
  consultation_id?: string | null;
  contenu: string;
  date?: string;
  pdf_url?: string | null;
}): Promise<Prescription> {
  const { data: userData } = await supabase.auth.getUser();
  const doctorId = userData?.user?.id;

  const insertPayload: any = {
    patient_id: prescription.patient_id,
    consultation_id: prescription.consultation_id || null,
    contenu: prescription.contenu,
    date: prescription.date || new Date().toISOString().split('T')[0],
    pdf_url: prescription.pdf_url || null,
  };

  if (doctorId) {
    insertPayload.doctor_id = doctorId;
  }

  const { data, error } = await supabase
    .from('prescriptions')
    .insert(insertPayload)
    .select('*, patients(nom, prenom)')
    .single();

  if (error) {
    console.error('Supabase createPrescription error:', error);
    throw new Error(`Erreur lors de la création de l'ordonnance: ${error.message}`);
  }

  return data;
}

export async function deletePrescription(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('prescriptions')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Supabase deletePrescription error:', error);
    throw new Error(`Erreur lors de la suppression de l'ordonnance: ${error.message}`);
  }

  return true;
}
