import { supabase } from '../../lib/supabase';

export type AuditAction = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'LOGOUT' | 'EXPORT_PDF';
export type AuditCriticality = 'INFO' | 'WARNING' | 'CRITICAL' | 'SUCCESS';

export interface AuditLogEntry {
  id: string;
  doctor_id?: string;
  action: string;
  table_cible: string;
  cible_id?: string | null;
  description?: string | null;
  criticite: AuditCriticality;
  created_at: string;
}

/**
 * Service de journalisation médico-légale sécurisé (Supabase Cloud RLS)
 */
export async function logAuditEvent(
  action: AuditAction | string,
  table_cible: string,
  cible_id?: string | null,
  description?: string | null,
  criticite: AuditCriticality = 'INFO'
): Promise<void> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const doctorId = userData?.user?.id;

    const payload: any = {
      action,
      table_cible,
      cible_id: cible_id ? String(cible_id) : null,
      description: description || null,
      criticite,
    };

    if (doctorId) {
      payload.doctor_id = doctorId;
    }

    const { error } = await supabase
      .from('journal_audit')
      .insert(payload);

    if (error) {
      console.warn('Supabase audit log insert error (non-fatal):', error.message);
    }
  } catch (err) {
    console.warn('Supabase audit logging exception (non-fatal):', err);
  }
}

export async function getAuditLogs(): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase
    .from('journal_audit')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Supabase getAuditLogs error:', error);
    throw new Error(`Erreur lors de la récupération des journaux: ${error.message}`);
  }

  return data || [];
}
