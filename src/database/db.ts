import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

// Import conditionnel pour éviter de lancer le WebWorker OPFS d'expo-sqlite sur le Web
const SQLite = Platform.OS !== 'web' ? require('expo-sqlite') : null;

let dbInstance: any = null;

// ============================================================================
// EMULATEUR SQLITE POUR NAVIGATEURS WEB (localStorage)
// ============================================================================
class WebDatabaseMock {
  async execAsync(query: string): Promise<void> {
    return;
  }

  async runAsync(query: string, params: any[] = []): Promise<{ changes: number; lastInsertRowId: number }> {
    return this.executeSql(query, params);
  }

  async getAllAsync<T>(query: string, params: any[] = []): Promise<T[]> {
    return this.executeSql(query, params);
  }

  async getFirstAsync<T>(query: string, params: any[] = []): Promise<T | null> {
    const list = await this.executeSql(query, params);
    return list.length > 0 ? list[0] : null;
  }

  private async executeSql(q: string, params: any[] = []): Promise<any> {
    const cleanQuery = q.trim().replace(/\s+/g, ' ');
    const upperQuery = cleanQuery.toUpperCase();

    // 1. INSERT INTO
    if (upperQuery.startsWith('INSERT INTO')) {
      const match = cleanQuery.match(/INSERT INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
      if (!match) return { changes: 1, lastInsertRowId: Date.now() };

      const table = match[1].toLowerCase();
      const columns = match[2].split(',').map((c) => c.trim());

      const row: any = {};
      columns.forEach((col, idx) => {
        row[col] = params[idx];
      });

      if (row.created_at === undefined) row.created_at = new Date().toISOString();
      if (row.updated_at === undefined) row.updated_at = new Date().toISOString();
      if (row.is_synced === undefined) row.is_synced = 0;

      const list = JSON.parse(localStorage.getItem(`db_${table}`) || '[]');
      list.push(row);
      localStorage.setItem(`db_${table}`, JSON.stringify(list));
      return { changes: 1, lastInsertRowId: Date.now() };
    }

    // 2. UPDATE
    if (upperQuery.startsWith('UPDATE')) {
      const match = cleanQuery.match(/UPDATE (\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+?)$/i);
      if (!match) return { changes: 0 };

      const table = match[1].toLowerCase();
      const setClause = match[2];
      const whereClause = match[3];

      const list = JSON.parse(localStorage.getItem(`db_${table}`) || '[]');

      // Parse update fields (e.g., "pin_hash = ?, email = ?")
      const fields = setClause.split(',').map((f) => f.split('=')[0].trim());

      // Parse WHERE clause field (e.g., "id = ?")
      const whereField = whereClause.split('=')[0].trim().replace(/.*\./, '');
      const whereVal = params[params.length - 1]; // L'ID recherché est le dernier paramètre

      let changes = 0;
      const newList = list.map((row: any) => {
        if (row[whereField] === whereVal) {
          changes++;
          fields.forEach((field, idx) => {
            row[field] = params[idx];
          });
          row.updated_at = new Date().toISOString();
          row.is_synced = 0;
        }
        return row;
      });

      localStorage.setItem(`db_${table}`, JSON.stringify(newList));
      return { changes, lastInsertRowId: 0 };
    }

    // 3. SELECT
    if (upperQuery.startsWith('SELECT')) {
      const fromMatch = cleanQuery.match(/FROM\s+(\w+)/i);
      if (!fromMatch) return [];
      const table = fromMatch[1].toLowerCase();

      let list = JSON.parse(localStorage.getItem(`db_${table}`) || '[]');

      // Check for COUNT(*) queries
      if (upperQuery.includes('COUNT(*)')) {
        const countWhereMatch = cleanQuery.match(/WHERE\s+(.+?)(?:\s+LIMIT|\s+ORDER|$)/i);
        let countList = list;
        if (countWhereMatch) {
          const whereClause = countWhereMatch[1];
          const matchEqual = whereClause.match(/([\w.]+)\s*=\s*\?/);
          const matchGreaterEqual = whereClause.match(/([\w.]+)\s*>=\s*\?/);
          if (matchEqual) {
            const field = matchEqual[1].toLowerCase().replace(/.*\./, '');
            countList = countList.filter((row: any) => row[field] === params[0]);
          } else if (matchGreaterEqual) {
            const field = matchGreaterEqual[1].toLowerCase().replace(/.*\./, '');
            countList = countList.filter((row: any) => row[field] >= params[0]);
          }
        }
        return [{ count: countList.length }];
      }

      // Handle simple WHERE filters
      const whereMatch = cleanQuery.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/i);
      if (whereMatch) {
        const whereClause = whereMatch[1];

        // Check for range search (e.g. "date_heure >= ? AND date_heure <= ?")
        const matchRange = whereClause.match(/([\w.]+)\s*>=\s*\?\s+AND\s+([\w.]+)\s*<=\s*\?/i);
        // Check for equality (e.g. "id = ?")
        const matchEqual = whereClause.match(/([\w.]+)\s*=\s*\?/);
        // Check for greater or equal (e.g. "date >= ?")
        const matchGreaterEqual = whereClause.match(/([\w.]+)\s*>=\s*\?/);

        if (matchRange) {
          const field = matchRange[1].replace(/.*\./, '').toLowerCase();
          const val1 = params[0];
          const val2 = params[1];
          list = list.filter((row: any) => row[field] >= val1 && row[field] <= val2);
        } else if (matchEqual) {
          const field = matchEqual[1].replace(/.*\./, '').toLowerCase();
          const val = params[0];
          list = list.filter((row: any) => row[field] === val);
        } else if (matchGreaterEqual) {
          const field = matchGreaterEqual[1].replace(/.*\./, '').toLowerCase();
          const val = params[0];
          list = list.filter((row: any) => row[field] >= val);
        }
      }

      // Custom JOIN for appointments list to append patient prenom/nom
      if (table === 'rendez_vous' && upperQuery.includes('JOIN PATIENTS')) {
        const patients = JSON.parse(localStorage.getItem('db_patients') || '[]');
        const { decryptData } = require('../security/encryption');
        const resolvedList = [];
        for (const rv of list) {
          const p = patients.find((p: any) => p.id === rv.patient_id);
          const pNom = p ? (await decryptData(p.nom)) || '' : '';
          const pPrenom = p ? (await decryptData(p.prenom)) || '' : '';
          resolvedList.push({
            ...rv,
            patient_nom: pNom,
            patient_prenom: pPrenom,
            p_nom: p ? p.nom : '',
            p_prenom: p ? p.prenom : '',
          });
        }
        list = resolvedList;
      }

      // ORDER BY sorting
      if (upperQuery.includes('ORDER BY CREATED_AT DESC')) {
        list.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      } else if (upperQuery.includes('ORDER BY DATE_HEURE ASC')) {
        list.sort((a: any, b: any) => new Date(a.date_heure).getTime() - new Date(b.date_heure).getTime());
      } else if (upperQuery.includes('ORDER BY DATE ASC')) {
        list.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      }

      // LIMIT 1 restriction
      if (upperQuery.includes('LIMIT 1')) {
        return list.length > 0 ? [list[0]] : [];
      }

      return list;
    }

    return [];
  }
}

/**
 * Gets or opens the SQLite database instance.
 */
export async function getDatabase(): Promise<any> {
  if (dbInstance) {
    return dbInstance;
  }

  if (Platform.OS === 'web') {
    dbInstance = new WebDatabaseMock();
    return dbInstance;
  }

  dbInstance = await SQLite.openDatabaseAsync('medrecord.db');
  return dbInstance;
}

/**
 * Initializes the SQLite database tables and configurations.
 */
export async function initDatabase(): Promise<void> {
  const db = await getDatabase();

  if (Platform.OS === 'web') {
    const tables = [
      'utilisateurs',
      'patients',
      'antecedents',
      'consultations',
      'constantes',
      'examens',
      'ordonnances',
      'certificats',
      'vaccinations',
      'rendez_vous',
      'journal_audit',
    ];
    tables.forEach((table) => {
      if (!localStorage.getItem(`db_${table}`)) {
        localStorage.setItem(`db_${table}`, JSON.stringify([]));
      }
    });
    console.log('MedRecord: Local Web Database (localStorage) initialized successfully.');
    return;
  }

  // Enable foreign keys
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync('PRAGMA journal_mode = WAL;');

  // Create tables
  await db.execAsync(`
    -- 1. Table Utilisateurs
    CREATE TABLE IF NOT EXISTS utilisateurs (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      nom TEXT NOT NULL,
      prenom TEXT NOT NULL,
      telephone TEXT,
      role TEXT NOT NULL CHECK (role IN ('MEDECIN', 'SECRETAIRE', 'ADMINISTRATEUR')),
      pin_hash TEXT,
      biometrie_active INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    -- 2. Table Patients
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      numero_dossier TEXT UNIQUE NOT NULL,
      nom TEXT NOT NULL,
      prenom TEXT NOT NULL,
      sexe TEXT NOT NULL CHECK (sexe IN ('M', 'F')),
      date_naissance TEXT NOT NULL,
      telephone TEXT,
      adresse TEXT,
      profession TEXT,
      personne_prevenir TEXT,
      groupe_sanguin TEXT CHECK (groupe_sanguin IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
      photo_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      is_synced INTEGER DEFAULT 0
    );

    -- 3. Table Antécédents
    CREATE TABLE IF NOT EXISTS antecedents (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('MEDICAL', 'CHIRURGICAL', 'TRAUMATIQUE', 'OBSTETRICAL', 'FAMILIAL', 'ALLERGIE', 'TRAITEMENT_CHRONIQUE')),
      description TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      is_synced INTEGER DEFAULT 0,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    -- 4. Table Consultations
    CREATE TABLE IF NOT EXISTS consultations (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      medecin_id TEXT NOT NULL,
      date TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      motif TEXT NOT NULL,
      histoire_maladie TEXT,
      examen_clinique TEXT,
      diagnostic TEXT,
      traitement TEXT,
      conseils TEXT,
      date_controle TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      is_synced INTEGER DEFAULT 0,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY (medecin_id) REFERENCES utilisateurs(id) ON DELETE RESTRICT
    );

    -- 5. Table Constantes
    CREATE TABLE IF NOT EXISTS constantes (
      id TEXT PRIMARY KEY,
      consultation_id TEXT UNIQUE NOT NULL,
      temperature REAL,
      tension_arterielle TEXT,
      frequence_cardiaque INTEGER,
      saturation INTEGER,
      glycemie REAL,
      poids REAL,
      taille REAL,
      imc REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      is_synced INTEGER DEFAULT 0,
      FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE
    );

    -- 6. Table Examens
    CREATE TABLE IF NOT EXISTS examens (
      id TEXT PRIMARY KEY,
      consultation_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('BIOLOGIE', 'IMAGERIE', 'ECG', 'SCANNER', 'IRM', 'ECHOGRAPHIE', 'RADIOGRAPHIE')),
      fichier_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      is_synced INTEGER DEFAULT 0,
      FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE
    );

    -- 7. Table Ordonnances
    CREATE TABLE IF NOT EXISTS ordonnances (
      id TEXT PRIMARY KEY,
      consultation_id TEXT UNIQUE NOT NULL,
      contenu TEXT NOT NULL,
      date TEXT NOT NULL,
      pdf_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      is_synced INTEGER DEFAULT 0,
      FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE
    );

    -- 8. Table Certificats
    CREATE TABLE IF NOT EXISTS certificats (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('MEDICAL', 'ACCIDENT_TRAVAIL', 'APTITUDE', 'INAPTITUDE', 'ARRET_TRAVAIL')),
      description TEXT NOT NULL,
      date_debut TEXT NOT NULL,
      date_fin TEXT,
      pdf_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      is_synced INTEGER DEFAULT 0,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    -- 9. Table Vaccinations
    CREATE TABLE IF NOT EXISTS vaccinations (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      vaccin TEXT NOT NULL,
      date_administration TEXT NOT NULL,
      date_rappel TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      is_synced INTEGER DEFAULT 0,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    -- 10. Table Rendez-vous
    CREATE TABLE IF NOT EXISTS rendez_vous (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      medecin_id TEXT NOT NULL,
      date_heure TEXT NOT NULL,
      statut TEXT DEFAULT 'PROGRAMME' CHECK (statut IN ('PROGRAMME', 'CONFIRME', 'ANNULE', 'REALISE')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      is_synced INTEGER DEFAULT 0,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY (medecin_id) REFERENCES utilisateurs(id) ON DELETE RESTRICT
    );

    -- 11. Table Journal Audit
    CREATE TABLE IF NOT EXISTS journal_audit (
      id TEXT PRIMARY KEY,
      utilisateur_id TEXT,
      action TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'READ')),
      table_cible TEXT NOT NULL,
      cible_id TEXT,
      description TEXT,
      date TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    -- 12. Table Examens Paracliniques
    CREATE TABLE IF NOT EXISTS examens_paracliniques (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      consultation_id TEXT,
      categorie TEXT NOT NULL,
      intitule_autre TEXT,
      date_examen TEXT NOT NULL,
      compte_rendu TEXT NOT NULL,
      fichier_url TEXT,
      fichier_nom TEXT,
      fichier_type TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      is_synced INTEGER DEFAULT 0,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
  `);
  
  // Migration: Add telephone column to utilisateurs if not present
  try {
    await db.execAsync('ALTER TABLE utilisateurs ADD COLUMN telephone TEXT;');
    console.log('MedRecord: Migrated utilisateurs table to add telephone column.');
  } catch (err) {
    // Column already exists, safe to ignore
  }

  console.log('MedRecord: SQLite database initialized successfully.');
}

/**
 * Helper to generate a standard v4 UUID.
 */
export function generateUUID(): string {
  if (Platform.OS === 'web') {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0,
        v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  return Crypto.randomUUID();
}

/**
 * Helper to generate a patient folder number (e.g. PAT-2026-00001).
 */
export async function generatePatientFolderNumber(): Promise<string> {
  const db = await getDatabase();
  const currentYear = new Date().getFullYear();

  const row = (await db.getFirstAsync('SELECT COUNT(*) as count FROM patients;')) as { count: number } | null;
  const nextSeq = (row?.count || 0) + 1;
  const paddedSeq = String(nextSeq).padStart(5, '0');

  return `PAT-${currentYear}-${paddedSeq}`;
}

/**
 * Triggers a manual audit log entry in the local database.
 */
export async function writeAuditLog(
  userId: string | null,
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'READ',
  tableCible: string,
  cibleId: string | null,
  description: string
): Promise<void> {
  try {
    const db = await getDatabase();
    const id = generateUUID();
    await db.runAsync(
      `INSERT INTO journal_audit (id, utilisateur_id, action, table_cible, cible_id, description) 
       VALUES (?, ?, ?, ?, ?, ?);`,
      [id, userId, action, tableCible, cibleId, description]
    );
  } catch (error) {
    console.error('MedRecord: Failed to write audit log:', error);
  }
}
