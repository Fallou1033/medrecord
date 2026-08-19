import { supabase } from '../../lib/supabase';
import { RendezVous } from '../../types';
import { getAuthenticatedDoctorId } from '../../security/auth';

const normalizeStatus = (st: string | undefined): 'PLANIFIE' | 'HONORE' | 'ANNULE' => {
  if (!st) return 'PLANIFIE';
  const upper = st.toUpperCase().trim();
  if (upper === 'PROGRAMME' || upper === 'PLANIFIE' || upper === 'CONFIRME') return 'PLANIFIE';
  if (upper === 'HONORE' || upper === 'REALISE' || upper === 'EFFECTUE' || upper === 'TERMINE') return 'HONORE';
  if (upper === 'ANNULE') return 'ANNULE';
  return 'PLANIFIE';
};

/**
 * Service de gestion des rendez-vous connecté à Supabase avec RLS
 */
export async function getAppointments(): Promise<RendezVous[]> {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .select('*, patients(nom, prenom, telephone, numero_dossier)')
      .order('date_heure', { ascending: true });

    if (error) {
      console.warn('Supabase getAppointments warning:', error.message, error.details);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      patient_id: row.patient_id,
      doctor_id: row.doctor_id,
      medecin_id: row.doctor_id,
      patient_name: row.patients ? `${row.patients.prenom || ''} ${row.patients.nom || ''}`.trim() : 'Patient',
      patient_telephone: row.patients?.telephone || null,
      patient_numero_dossier: row.patients?.numero_dossier || null,
      date_heure: row.date_heure,
      motif: row.motif || null,
      statut: row.statut || 'PLANIFIE',
      notes: row.notes || null,
      created_at: row.created_at || new Date().toISOString(),
      updated_at: row.updated_at || new Date().toISOString(),
      is_synced: true,
    }));
  } catch (err) {
    console.error('getAppointments unexpected error:', err);
    return [];
  }
}

export async function createAppointment(appointment: Omit<RendezVous, 'id' | 'created_at' | 'updated_at'>): Promise<RendezVous> {
  const doctorId = await getAuthenticatedDoctorId();

  const insertPayload: any = {
    doctor_id: doctorId,
    patient_id: appointment.patient_id,
    date_heure: appointment.date_heure,
    statut: normalizeStatus(appointment.statut),
    motif: appointment.motif || null,
    notes: appointment.notes || null,
  };

  const { data, error } = await supabase
    .from('appointments')
    .insert(insertPayload)
    .select('*, patients(nom, prenom, telephone, numero_dossier)')
    .single();

  if (error) {
    console.error('Supabase createAppointment error:', error.message, error.details, error.hint, error.code);
    throw new Error(`[Supabase ${error.code || 'ERR'}] ${error.message}${error.details ? ` (${error.details})` : ''}`);
  }

  return {
    id: data.id,
    patient_id: data.patient_id,
    doctor_id: data.doctor_id,
    medecin_id: data.doctor_id,
    patient_name: data.patients ? `${data.patients.prenom || ''} ${data.patients.nom || ''}`.trim() : 'Patient',
    patient_telephone: data.patients?.telephone || null,
    patient_numero_dossier: data.patients?.numero_dossier || null,
    date_heure: data.date_heure,
    statut: data.statut,
    motif: data.motif,
    notes: data.notes,
    created_at: data.created_at,
    updated_at: data.updated_at,
    is_synced: true,
  };
}

export async function updateAppointment(id: string, updates: Partial<RendezVous>): Promise<RendezVous> {
  const updatePayload: any = { ...updates };
  delete updatePayload.id;
  delete updatePayload.created_at;
  delete updatePayload.is_synced;
  delete updatePayload.patient_name;
  delete updatePayload.patient_nom;
  delete updatePayload.patient_prenom;
  delete updatePayload.patient_telephone;
  delete updatePayload.patient_numero_dossier;

  if (updatePayload.statut) {
    updatePayload.statut = normalizeStatus(updatePayload.statut);
  }

  const { data, error } = await supabase
    .from('appointments')
    .update(updatePayload)
    .eq('id', id)
    .select('*, patients(nom, prenom, telephone, numero_dossier)')
    .single();

  if (error) {
    console.error('Supabase updateAppointment error:', error.message, error.details, error.hint, error.code);
    throw new Error(`Erreur lors de la mise à jour du rendez-vous: ${error.message}`);
  }

  return {
    id: data.id,
    patient_id: data.patient_id,
    doctor_id: data.doctor_id,
    medecin_id: data.doctor_id,
    patient_name: data.patients ? `${data.patients.prenom || ''} ${data.patients.nom || ''}`.trim() : 'Patient',
    patient_telephone: data.patients?.telephone || null,
    patient_numero_dossier: data.patients?.numero_dossier || null,
    date_heure: data.date_heure,
    statut: data.statut,
    motif: data.motif,
    notes: data.notes,
    created_at: data.created_at,
    updated_at: data.updated_at,
    is_synced: true,
  };
}

export async function deleteAppointment(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('appointments')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Supabase deleteAppointment error:', error.message, error.details, error.hint, error.code);
    throw new Error(`Erreur lors de la suppression du rendez-vous: ${error.message}`);
  }

  return true;
}
