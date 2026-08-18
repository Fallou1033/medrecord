import { Platform } from 'react-native';
import { getDatabase } from '../database/db';
import { safeStorageGet, STORAGE_KEYS } from '../utils/storage';

export type AuditAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'LOGOUT'
  | 'CABINET_SETUP'
  | 'PIN_CHANGE'
  | 'PATIENT_CREATE'
  | 'PATIENT_VIEW'
  | 'PATIENT_UPDATE'
  | 'PATIENT_DELETE'
  | 'CONSULTATION_CREATE'
  | 'CONSULTATION_UPDATE'
  | 'ORDONNANCE_EXPORT'
  | 'DATABASE_BACKUP'
  | 'SETTINGS_UPDATE';

export type AuditCriticite = 'INFO' | 'SUCCESS' | 'WARNING' | 'DANGER';

export interface AuditLogEntry {
  id: string;
  utilisateur_id: string | null;
  action: AuditAction;
  table_cible: string;
  cible_id: string | null;
  description: string;
  criticite: AuditCriticite;
  date: string;
}

/**
 * Enregistre un événement dans le Journal d'Audit médical de manière synchrone et persistante.
 */
export async function logAuditEvent(
  action: AuditAction,
  tableCible: string,
  cibleId?: string | null,
  description?: string,
  criticite?: AuditCriticite,
  utilisateurId?: string | null
): Promise<void> {
  const logId = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const dateIso = new Date().toISOString();

  // Déterminer la criticité par défaut si non fournie
  let finalCriticite: AuditCriticite = criticite || 'INFO';
  if (!criticite) {
    if (action === 'LOGIN_FAILURE') finalCriticite = 'WARNING';
    else if (action === 'PATIENT_DELETE') finalCriticite = 'DANGER';
    else if (action === 'LOGIN_SUCCESS' || action === 'CABINET_SETUP') finalCriticite = 'SUCCESS';
  }

  // Récupérer l'utilisateur courant si non spécifié
  let userId = utilisateurId || null;
  if (!userId) {
    const currentUser = safeStorageGet<any>(STORAGE_KEYS.CURRENT_USER);
    userId = currentUser?.id || currentUser?.email || 'Dr Praticien';
  }

  const finalDesc = description || getDefaultDescription(action, cibleId);

  try {
    const db = await getDatabase();

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const logs: AuditLogEntry[] = JSON.parse(localStorage.getItem('db_journal_audit') || '[]');
      const newEntry: AuditLogEntry = {
        id: logId,
        utilisateur_id: userId,
        action,
        table_cible: tableCible,
        cible_id: cibleId || null,
        description: finalDesc,
        criticite: finalCriticite,
        date: dateIso,
      };
      logs.unshift(newEntry); // Le plus récent en premier
      // Garder les 1000 derniers événements en mémoire locale
      if (logs.length > 1000) logs.pop();
      localStorage.setItem('db_journal_audit', JSON.stringify(logs));
    } else {
      await db.runAsync(
        `INSERT INTO journal_audit (id, utilisateur_id, action, table_cible, cible_id, description, criticite, date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [logId, userId, action, tableCible, cibleId || null, finalDesc, finalCriticite, dateIso]
      );
    }
  } catch (error) {
    console.warn('MedRecord AuditLogger: Failed to log audit event:', error);
  }
}

/**
 * Récupère les logs d'audit avec tri chronologique décroissant.
 */
export async function getAuditLogs(
  limit: number = 200,
  filterAction?: string
): Promise<AuditLogEntry[]> {
  try {
    const db = await getDatabase();

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      let logs: AuditLogEntry[] = JSON.parse(localStorage.getItem('db_journal_audit') || '[]');
      if (filterAction && filterAction !== 'ALL') {
        logs = logs.filter((l) => l.action.includes(filterAction));
      }
      return logs.slice(0, limit);
    }

    let query = 'SELECT * FROM journal_audit';
    const params: any[] = [];
    if (filterAction && filterAction !== 'ALL') {
      query += ' WHERE action LIKE ?';
      params.push(`%${filterAction}%`);
    }
    query += ' ORDER BY date DESC LIMIT ?;';
    params.push(limit);

    const rows = (await db.getAllAsync(query, params)) as AuditLogEntry[];
    return rows || [];
  } catch (error) {
    console.warn('MedRecord AuditLogger: Failed to fetch audit logs:', error);
    return [];
  }
}

/**
 * Génère et déclenche le téléchargement du journal d'audit au format CSV conforme.
 */
export function exportAuditLogsCsv(logs: AuditLogEntry[]): string {
  const headers = ['Date & Heure (ISO)', 'Praticien / Utilisateur', 'Action', 'Module Cible', 'ID Cible', 'Niveau Criticite', 'Description'];
  const rows = logs.map((l) => [
    `"${l.date}"`,
    `"${(l.utilisateur_id || 'Praticien').replace(/"/g, '""')}"`,
    `"${l.action}"`,
    `"${l.table_cible}"`,
    `"${(l.cible_id || '-').replace(/"/g, '""')}"`,
    `"${l.criticite}"`,
    `"${(l.description || '').replace(/"/g, '""')}"`,
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `medrecord_audit_log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return csvContent;
}

/**
 * Descriptions explicites en français pour chaque type d'action.
 */
function getDefaultDescription(action: AuditAction, cibleId?: string | null): string {
  switch (action) {
    case 'LOGIN_SUCCESS':
      return 'Connexion réussie au cabinet médical';
    case 'LOGIN_FAILURE':
      return 'Tentative d\'accès rejetée (code PIN ou identifiant incorrect)';
    case 'LOGOUT':
      return 'Déconnexion du cabinet médical';
    case 'CABINET_SETUP':
      return 'Configuration initiale du profil et du cabinet médical';
    case 'PIN_CHANGE':
      return 'Modification du code PIN d\'accès';
    case 'PATIENT_CREATE':
      return `Création d'une nouvelle fiche patient ${cibleId ? `(#${cibleId.slice(0, 8)})` : ''}`;
    case 'PATIENT_VIEW':
      return `Consultation du dossier médical patient ${cibleId ? `(#${cibleId.slice(0, 8)})` : ''}`;
    case 'PATIENT_UPDATE':
      return `Mise à jour des informations du dossier patient ${cibleId ? `(#${cibleId.slice(0, 8)})` : ''}`;
    case 'PATIENT_DELETE':
      return `Suppression du dossier patient ${cibleId ? `(#${cibleId.slice(0, 8)})` : ''}`;
    case 'CONSULTATION_CREATE':
      return `Enregistrement d'une nouvelle consultation médicale ${cibleId ? `(#${cibleId.slice(0, 8)})` : ''}`;
    case 'CONSULTATION_UPDATE':
      return `Modification des données cliniques d'une consultation ${cibleId ? `(#${cibleId.slice(0, 8)})` : ''}`;
    case 'ORDONNANCE_EXPORT':
      return `Impression / Export PDF d'une ordonnance médicale`;
    case 'DATABASE_BACKUP':
      return 'Sauvegarde de la base de données du cabinet';
    case 'SETTINGS_UPDATE':
      return 'Modification des paramètres du cabinet';
    default:
      return `Action exécutée : ${action}`;
  }
}
