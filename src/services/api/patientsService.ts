import { supabase } from '../../lib/supabase';
import { Patient } from '../../types';
import { getAuthenticatedDoctorId } from '../../security/auth';

/**
 * Service de gestion des patients connecté à Supabase avec Row Level Security (RLS)
 */
export async function getPatients(): Promise<Patient[]> {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Supabase getPatients error:', error.message, error.details, error.hint, error.code);
    throw new Error(`Erreur lors de la récupération des patients: ${error.message}`);
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    doctor_id: row.doctor_id,
    numero_dossier: row.numero_dossier,
    nom: row.nom || '',
    prenom: row.prenom || '',
    sexe: row.sexe,
    date_naissance: row.date_naissance,
    telephone: row.telephone,
    email: row.email,
    adresse: row.adresse,
    profession: row.profession,
    personne_prevenir: row.personne_prevenir,
    groupe_sanguin: row.groupe_sanguin || 'Inconnu',
    source_groupe_sanguin: row.source_groupe_sanguin || 'DECLARE',
    photo_url: row.photo_url,
    antecedents_medicaux: row.antecedents_medicaux,
    antecedents_chirurgicaux: row.antecedents_chirurgicaux,
    allergies: row.allergies,
    traitements_fond: row.traitements_fond,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_synced: true,
  }));
}

export async function getPatientById(id: string): Promise<Patient | null> {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // No row found
    console.error('Supabase getPatientById error:', error.message, error.details, error.hint, error.code);
    throw new Error(`Patient introuvable: ${error.message}`);
  }

  return {
    id: data.id,
    doctor_id: data.doctor_id,
    numero_dossier: data.numero_dossier,
    nom: data.nom || '',
    prenom: data.prenom || '',
    sexe: data.sexe,
    date_naissance: data.date_naissance,
    telephone: data.telephone,
    email: data.email,
    adresse: data.adresse,
    profession: data.profession,
    personne_prevenir: data.personne_prevenir,
    groupe_sanguin: data.groupe_sanguin || 'Inconnu',
    source_groupe_sanguin: data.source_groupe_sanguin || 'DECLARE',
    photo_url: data.photo_url,
    antecedents_medicaux: data.antecedents_medicaux,
    antecedents_chirurgicaux: data.antecedents_chirurgicaux,
    allergies: data.allergies,
    traitements_fond: data.traitements_fond,
    notes: data.notes,
    created_at: data.created_at,
    updated_at: data.updated_at,
    is_synced: true,
  };
}

export async function createPatient(patient: Partial<Patient> & { nom: string; prenom: string; sexe: 'M' | 'F' }): Promise<Patient> {
  // Récupération asynchrone et infaillible de l'identifiant du médecin connecté
  const doctorId = await getAuthenticatedDoctorId();

  // Formatage de la date de naissance au format ISO YYYY-MM-DD
  let cleanDateNaissance: string | null = null;
  if (patient.date_naissance && typeof patient.date_naissance === 'string' && patient.date_naissance.trim().length > 0) {
    let dStr = patient.date_naissance.trim();
    if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(dStr)) {
      const p = dStr.split(/[\/\-]/);
      dStr = `${p[2]}-${p[1]}-${p[0]}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) {
      cleanDateNaissance = dStr;
    }
  }

  const numero_dossier = patient.numero_dossier || `MED-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  // Construction du payload avec mapping strict des colonnes snake_case
  const insertPayload: any = {
    doctor_id: doctorId,
    numero_dossier,
    nom: patient.nom?.trim() || '',
    prenom: patient.prenom?.trim() || '',
    sexe: patient.sexe || 'M',
    date_naissance: cleanDateNaissance,
    telephone: patient.telephone?.trim() || null,
    email: patient.email?.trim() || null,
    adresse: patient.adresse?.trim() || null,
    profession: patient.profession?.trim() || null,
    personne_prevenir: patient.personne_prevenir?.trim() || null,
    groupe_sanguin: patient.groupe_sanguin || 'Inconnu',
    source_groupe_sanguin: patient.source_groupe_sanguin || 'DECLARE',
    photo_url: patient.photo_url || null,
    antecedents_medicaux: patient.antecedents_medicaux?.trim() || null,
    antecedents_chirurgicaux: patient.antecedents_chirurgicaux?.trim() || null,
    allergies: patient.allergies?.trim() || null,
    traitements_fond: patient.traitements_fond?.trim() || null,
    notes: patient.notes?.trim() || null,
  };

  console.log('MedRecord: Inserting patient with payload:', insertPayload);

  const { data, error } = await supabase
    .from('patients')
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    console.error('Supabase insert error:', error.message, error.details, error.hint, error.code);
    throw new Error(`[Supabase ${error.code || 'ERR'}] ${error.message}${error.details ? ` (${error.details})` : ''}${error.hint ? ` - ${error.hint}` : ''}`);
  }

  return {
    ...data,
    is_synced: true,
  };
}

export async function updatePatient(id: string, updates: Partial<Patient>): Promise<Patient> {
  const updatePayload: any = { ...updates };
  delete updatePayload.id;
  delete updatePayload.created_at;
  delete updatePayload.is_synced;

  if (updatePayload.date_naissance && typeof updatePayload.date_naissance === 'string') {
    let dStr = updatePayload.date_naissance.trim();
    if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(dStr)) {
      const p = dStr.split(/[\/\-]/);
      dStr = `${p[2]}-${p[1]}-${p[0]}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) {
      updatePayload.date_naissance = dStr;
    } else if (!dStr) {
      updatePayload.date_naissance = null;
    }
  }

  const { data, error } = await supabase
    .from('patients')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Supabase updatePatient error:', error.message, error.details, error.hint, error.code);
    throw new Error(`Erreur lors de la mise à jour du patient: ${error.message}`);
  }

  return {
    ...data,
    is_synced: true,
  };
}

export async function deletePatient(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('patients')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Supabase deletePatient error:', error.message, error.details, error.hint, error.code);
    throw new Error(`Erreur lors de la suppression du patient: ${error.message}`);
  }

  return true;
}

export async function searchPatients(query: string): Promise<Patient[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return getPatients();

  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .or(`nom.ilike.%${cleanQuery}%,prenom.ilike.%${cleanQuery}%,numero_dossier.ilike.%${cleanQuery}%,telephone.ilike.%${cleanQuery}%`)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Supabase searchPatients error:', error.message, error.details, error.hint, error.code);
    throw new Error(`Erreur de recherche: ${error.message}`);
  }

  return data || [];
}
