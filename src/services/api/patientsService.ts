import { supabase } from '../../lib/supabase';
import { Patient } from '../../types';
import { STORAGE_KEYS, safeStorageGet } from '../../utils/storage';

const isValidUUID = (id: string | null | undefined): boolean =>
  Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));

/**
 * Service de gestion des patients connecté à Supabase avec Row Level Security (RLS)
 * Retourne toujours un tableau sécurisé sans jamais faire planter la vue.
 */
export async function getPatients(): Promise<Patient[]> {
  try {
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase getPatients warning:', error.message, error.details, error.hint);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id || `patient_${Math.random()}`,
      doctor_id: row.doctor_id || '',
      numero_dossier: row.numero_dossier || 'MED-0000',
      nom: (row.nom || '').trim(),
      prenom: (row.prenom || '').trim(),
      sexe: row.sexe === 'F' ? 'F' : 'M',
      date_naissance: row.date_naissance || null,
      telephone: row.telephone || null,
      email: row.email || null,
      adresse: row.adresse || null,
      profession: row.profession || null,
      personne_prevenir: row.personne_prevenir || null,
      groupe_sanguin: row.groupe_sanguin || 'Inconnu',
      source_groupe_sanguin: row.source_groupe_sanguin || 'DECLARE',
      photo_url: row.photo_url || null,
      antecedents_medicaux: row.antecedents_medicaux || null,
      antecedents_chirurgicaux: row.antecedents_chirurgicaux || null,
      allergies: row.allergies || null,
      traitements_fond: row.traitements_fond || null,
      notes: row.notes || null,
      created_at: row.created_at || new Date().toISOString(),
      updated_at: row.updated_at || new Date().toISOString(),
      is_synced: true,
    }));
  } catch (err) {
    console.error('Supabase getPatients unexpected error:', err);
    return [];
  }
}

export async function getPatientById(id: string): Promise<Patient | null> {
  if (!id) return null;
  try {
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Ligne introuvable
      console.warn('Supabase getPatientById warning:', error.message);
      return null;
    }

    if (!data) return null;

    return {
      id: data.id,
      doctor_id: data.doctor_id,
      numero_dossier: data.numero_dossier || 'MED-0000',
      nom: (data.nom || '').trim(),
      prenom: (data.prenom || '').trim(),
      sexe: data.sexe === 'F' ? 'F' : 'M',
      date_naissance: data.date_naissance || null,
      telephone: data.telephone || null,
      email: data.email || null,
      adresse: data.adresse || null,
      profession: data.profession || null,
      personne_prevenir: data.personne_prevenir || null,
      groupe_sanguin: data.groupe_sanguin || 'Inconnu',
      source_groupe_sanguin: data.source_groupe_sanguin || 'DECLARE',
      photo_url: data.photo_url || null,
      antecedents_medicaux: data.antecedents_medicaux || null,
      antecedents_chirurgicaux: data.antecedents_chirurgicaux || null,
      allergies: data.allergies || null,
      traitements_fond: data.traitements_fond || null,
      notes: data.notes || null,
      created_at: data.created_at || new Date().toISOString(),
      updated_at: data.updated_at || new Date().toISOString(),
      is_synced: true,
    };
  } catch (err) {
    console.error('Supabase getPatientById unexpected error:', err);
    return null;
  }
}

export async function createPatient(patient: Partial<Patient> & { nom: string; prenom: string; sexe: 'M' | 'F' }): Promise<Patient> {
  // 1. Extraction robuste de l'identifiant du médecin connecté
  let doctorId: string | null = null;
  const { data: userData } = await supabase.auth.getUser();
  if (userData?.user?.id && isValidUUID(userData.user.id)) {
    doctorId = userData.user.id;
  } else {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session?.user?.id && isValidUUID(sessionData.session.user.id)) {
      doctorId = sessionData.session.user.id;
    } else {
      const cachedUser = safeStorageGet(STORAGE_KEYS.CURRENT_USER);
      if (cachedUser?.id && isValidUUID(cachedUser.id)) {
        doctorId = cachedUser.id;
      }
    }
  }

  // Repli automatique sur le profil médecin de la base si pas d'UUID valide
  if (!isValidUUID(doctorId)) {
    try {
      const { data: profileData } = await supabase.from('profiles').select('id').limit(1).single();
      if (profileData?.id && isValidUUID(profileData.id)) {
        doctorId = profileData.id;
      }
    } catch {}
  }

  if (!isValidUUID(doctorId)) {
    doctorId = '00000000-0000-0000-0000-000000000001';
  }

  // 2. Formatage de la date de naissance au format ISO YYYY-MM-DD
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

  // 3. Construction du payload avec mapping strict snake_case
  const insertPayload: any = {
    doctor_id: doctorId,
    numero_dossier,
    nom: (patient.nom || '').trim(),
    prenom: (patient.prenom || '').trim(),
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
  try {
    const { error } = await supabase
      .from('patients')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Supabase deletePatient error:', error.message, error.details, error.hint, error.code);
      throw new Error(`Erreur lors de la suppression du patient: ${error.message}`);
    }

    return true;
  } catch (err: any) {
    console.error('deletePatient error:', err);
    throw err;
  }
}

export async function searchPatients(query: string): Promise<Patient[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return getPatients();

  try {
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .or(`nom.ilike.%${cleanQuery}%,prenom.ilike.%${cleanQuery}%,numero_dossier.ilike.%${cleanQuery}%,telephone.ilike.%${cleanQuery}%`)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase searchPatients warning:', error.message);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      doctor_id: row.doctor_id,
      numero_dossier: row.numero_dossier || 'MED-0000',
      nom: (row.nom || '').trim(),
      prenom: (row.prenom || '').trim(),
      sexe: row.sexe === 'F' ? 'F' : 'M',
      date_naissance: row.date_naissance || null,
      telephone: row.telephone || null,
      email: row.email || null,
      adresse: row.adresse || null,
      profession: row.profession || null,
      personne_prevenir: row.personne_prevenir || null,
      groupe_sanguin: row.groupe_sanguin || 'Inconnu',
      source_groupe_sanguin: row.source_groupe_sanguin || 'DECLARE',
      photo_url: row.photo_url || null,
      antecedents_medicaux: row.antecedents_medicaux || null,
      antecedents_chirurgicaux: row.antecedents_chirurgicaux || null,
      allergies: row.allergies || null,
      traitements_fond: row.traitements_fond || null,
      notes: row.notes || null,
      created_at: row.created_at || new Date().toISOString(),
      updated_at: row.updated_at || new Date().toISOString(),
      is_synced: true,
    }));
  } catch (err) {
    console.error('searchPatients error:', err);
    return [];
  }
}
