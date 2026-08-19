import { supabase } from '../../lib/supabase';
import { Consultation } from '../../types';

/**
 * Service de gestion des consultations connecté à Supabase avec RLS
 */
export async function getConsultations(patientId?: string): Promise<Consultation[]> {
  let query = supabase
    .from('consultations')
    .select('*, patients(nom, prenom, numero_dossier)')
    .order('date', { ascending: false });

  if (patientId) {
    query = query.eq('patient_id', patientId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Supabase getConsultations error:', error);
    throw new Error(`Erreur lors de la récupération des consultations: ${error.message}`);
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    patient_id: row.patient_id,
    doctor_id: row.doctor_id,
    medecin_id: row.doctor_id,
    date: row.date,
    date_consultation: row.date,
    motif: row.motif || '',
    histoire_maladie: row.histoire_maladie,
    examen_clinique: row.examen_clinique,
    diagnostic: row.diagnostic,
    traitement: row.traitement,
    conseils: row.conseils,
    date_controle: row.date_controle,
    poids_kg: row.poids_kg ? Number(row.poids_kg) : null,
    taille_cm: row.taille_cm ? Number(row.taille_cm) : null,
    pression_arterielle: row.pression_arterielle,
    frequence_cardiaque: row.frequence_cardiaque ? Number(row.frequence_cardiaque) : null,
    temperature: row.temperature ? Number(row.temperature) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_synced: true,
  }));
}

export async function getConsultationById(id: string): Promise<Consultation | null> {
  const { data, error } = await supabase
    .from('consultations')
    .select('*, patients(nom, prenom, numero_dossier)')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Supabase getConsultationById error:', error);
    throw new Error(`Consultation introuvable: ${error.message}`);
  }

  return {
    id: data.id,
    patient_id: data.patient_id,
    doctor_id: data.doctor_id,
    medecin_id: data.doctor_id,
    date: data.date,
    date_consultation: data.date,
    motif: data.motif || '',
    histoire_maladie: data.histoire_maladie,
    examen_clinique: data.examen_clinique,
    diagnostic: data.diagnostic,
    traitement: data.traitement,
    conseils: data.conseils,
    date_controle: data.date_controle,
    poids_kg: data.poids_kg ? Number(data.poids_kg) : null,
    taille_cm: data.taille_cm ? Number(data.taille_cm) : null,
    pression_arterielle: data.pression_arterielle,
    frequence_cardiaque: data.frequence_cardiaque ? Number(data.frequence_cardiaque) : null,
    temperature: data.temperature ? Number(data.temperature) : null,
    created_at: data.created_at,
    updated_at: data.updated_at,
    is_synced: true,
  };
}

export async function createConsultation(consultation: Omit<Consultation, 'id' | 'created_at' | 'updated_at'>): Promise<Consultation> {
  const { data: userData } = await supabase.auth.getUser();
  const doctorId = userData?.user?.id;

  const insertPayload: any = {
    patient_id: consultation.patient_id,
    date: consultation.date || consultation.date_consultation || new Date().toISOString(),
    motif: consultation.motif?.trim() || 'Consultation générale',
    histoire_maladie: consultation.histoire_maladie || null,
    examen_clinique: consultation.examen_clinique || null,
    diagnostic: consultation.diagnostic || null,
    traitement: consultation.traitement || null,
    conseils: consultation.conseils || null,
    date_controle: consultation.date_controle || null,
    poids_kg: consultation.poids_kg || null,
    taille_cm: consultation.taille_cm || null,
    pression_arterielle: consultation.pression_arterielle || null,
    frequence_cardiaque: consultation.frequence_cardiaque || null,
    temperature: consultation.temperature || null,
  };

  if (doctorId) {
    insertPayload.doctor_id = doctorId;
  }

  const { data, error } = await supabase
    .from('consultations')
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    console.error('Supabase createConsultation error:', error);
    throw new Error(`Erreur lors de la création de la consultation: ${error.message}`);
  }

  return {
    ...data,
    medecin_id: data.doctor_id,
    is_synced: true,
  };
}

export async function updateConsultation(id: string, updates: Partial<Consultation>): Promise<Consultation> {
  const updatePayload: any = { ...updates };
  delete updatePayload.id;
  delete updatePayload.created_at;
  delete updatePayload.is_synced;
  delete updatePayload.medecin_id;

  const { data, error } = await supabase
    .from('consultations')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Supabase updateConsultation error:', error);
    throw new Error(`Erreur lors de la mise à jour de la consultation: ${error.message}`);
  }

  return {
    ...data,
    medecin_id: data.doctor_id,
    is_synced: true,
  };
}

export async function deleteConsultation(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('consultations')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Supabase deleteConsultation error:', error);
    throw new Error(`Erreur lors de la suppression de la consultation: ${error.message}`);
  }

  return true;
}
