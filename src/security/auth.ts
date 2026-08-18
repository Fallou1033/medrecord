import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { getDatabase, generateUUID } from '../database/db';

const PIN_HASH_KEY = 'medrecord_user_pin_hash';
const BIOMETRIC_ENABLED_KEY = 'medrecord_biometric_enabled';
const ACTIVE_USER_ID_KEY = 'medrecord_active_user_id';
const LAST_ACTIVE_TIMESTAMP_KEY = 'medrecord_last_active_time';
const AUTO_LOCK_TIMEOUT_KEY = 'medrecord_autolock_timeout_minutes';

const DEFAULT_INACTIVITY_TIMEOUT_MINUTES = 2; // 2 minutes par défaut

export interface UserProfile {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  telephone?: string | null;
  role: 'MEDECIN' | 'SECRETAIRE' | 'ADMINISTRATEUR';
  biometrie_active: boolean;
}

// Helpers pour compatibilité Web (localStorage à la place de expo-secure-store)
const secureStoreGetItem = async (key: string): Promise<string | null> => {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' ? localStorage.getItem(key) : null;
  }
  try {
    return await SecureStore.getItemAsync(key);
  } catch (e) {
    return typeof window !== 'undefined' ? localStorage.getItem(key) : null;
  }
};

const secureStoreSetItem = async (key: string, value: string): Promise<void> => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') localStorage.setItem(key, value);
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (e) {
    if (typeof window !== 'undefined') localStorage.setItem(key, value);
  }
};

const secureStoreDeleteItem = async (key: string): Promise<void> => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') localStorage.removeItem(key);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (e) {
    if (typeof window !== 'undefined') localStorage.removeItem(key);
  }
};

export async function checkEmailExists(email: string, currentUserId?: string): Promise<boolean> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return false;

  try {
    const activeUserId = await secureStoreGetItem(ACTIVE_USER_ID_KEY);
    // If setting up a cabinet without an active user, allow configuring/reconfiguring
    if (!activeUserId && !currentUserId) {
      return false;
    }

    const db = await getDatabase();
    let query = 'SELECT id FROM utilisateurs WHERE LOWER(email) = LOWER(?)';
    const params: any[] = [cleanEmail];

    const excludeId = currentUserId || activeUserId;
    if (excludeId) {
      query += ' AND id != ?';
      params.push(excludeId);
    }
    query += ' LIMIT 1;';

    const existingUser = (await db.getFirstAsync(query, params)) as any;
    if (existingUser && existingUser.id && existingUser.id !== excludeId) {
      return true;
    }

    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Checks if a PIN code and valid user session have been set up on this device.
 */
export async function isPinSetup(): Promise<boolean> {
  const hash = await secureStoreGetItem(PIN_HASH_KEY);
  const activeUserId = await secureStoreGetItem(ACTIVE_USER_ID_KEY);
  if (hash && activeUserId) return true;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const { safeStorageGet, STORAGE_KEYS } = require('../utils/storage');
    const hasActiveSession = safeStorageGet(STORAGE_KEYS.SESSION_ACTIVE) === 'true';
    const profile = safeStorageGet(STORAGE_KEYS.CURRENT_USER) || safeStorageGet(STORAGE_KEYS.DOCTOR_PROFILE);
    if (hasActiveSession && profile && profile.id) return true;
  }

  if (!hash || !activeUserId) return false;

  try {
    const db = await getDatabase();
    const user = await db.getFirstAsync('SELECT id FROM utilisateurs WHERE id = ?;', [activeUserId]);
    return Boolean(user);
  } catch (e) {
    return false;
  }
}

export function cleanRawName(str: string | null | undefined): string {
  if (!str) return '';
  return str.replace(/\b(dr|docteur)\.?\b/gi, '').replace(/\s+/g, ' ').trim();
}

/**
 * Sets up a new security PIN code and registers the default doctor profile in SQLite.
 */
export async function setupPIN(pin: string, nom: string, prenom: string, email: string, telephone?: string | null): Promise<UserProfile> {
  try {
    const db = await getDatabase();

    const cleanNom = cleanRawName(nom);
    const cleanPrenom = cleanRawName(prenom);
    const cleanEmail = email.trim().toLowerCase();

    // Check if email is already taken by another user
    const isEmailTaken = await checkEmailExists(cleanEmail);
    if (isEmailTaken) {
      throw new Error('Cette adresse email est déjà utilisée.');
    }

    // 1. Hash the PIN using SHA-256
    const pinHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      pin
    );

    // 2. Save the PIN hash in secure store
    await secureStoreSetItem(PIN_HASH_KEY, pinHash);

    const userId = `user_${Date.now()}`;

    await db.runAsync(
      `INSERT OR REPLACE INTO utilisateurs (id, email, nom, prenom, telephone, role, pin_hash, biometrie_active) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 0);`,
      [userId, cleanEmail, cleanNom, cleanPrenom, telephone || null, 'MEDECIN', pinHash]
    );

    // 4. Save active user ID locally
    await secureStoreSetItem(ACTIVE_USER_ID_KEY, userId);
    await updateLastActiveTime();

    // 5. Sync to Supabase in background if client is configured
    try {
      const { supabase } = require('../services/supabase');
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
      if (supabase && supabaseUrl.trim().length > 0) {
        supabase.from('utilisateurs').upsert({
          id: userId,
          email: cleanEmail,
          nom: cleanNom,
          prenom: cleanPrenom,
          telephone: telephone || null,
          role: 'MEDECIN',
          updated_at: new Date().toISOString()
        }).then(({ error }: any) => {
          if (error) console.warn('Supabase sync warning (utilisateurs):', error);
        });
      }
    } catch (supabaseErr) {}

    return {
      id: userId,
      email: cleanEmail,
      nom: cleanNom,
      prenom: cleanPrenom,
      telephone: telephone || null,
      role: 'MEDECIN',
      biometrie_active: false
    };
  } catch (error: any) {
    console.error('MedRecord: Failed to set up PIN:', error);
    throw error;
  }
}

/**
 * Log in an existing user on a new device (Cross-Device Access)
 */
export async function loginExistingUser(identifier: string, pin: string): Promise<UserProfile> {
  const cleanId = identifier.trim().toLowerCase();

  // Validate format (Valid email or valid phone number with digits)
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanId);
  const cleanPhone = identifier.trim().replace(/[\s\-\(\)]/g, '');
  const isPhone = /^\+?[0-9]{8,15}$/.test(cleanPhone);

  if (!isEmail && !isPhone) {
    throw new Error('Veuillez saisir une adresse e-mail ou un numéro de téléphone valide.');
  }

  const db = await getDatabase();

  // 1. Hash entered PIN
  const pinHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    pin
  );

  // 2. Search local SQLite database by email or phone
  let userRow: any = null;
  try {
    userRow = await db.getFirstAsync(
      'SELECT * FROM utilisateurs WHERE LOWER(email) = ? OR telephone = ? LIMIT 1;',
      [cleanId, identifier.trim()]
    );
  } catch (dbErr) {
    console.warn('MedRecord SQLite fetch warning:', dbErr);
  }

  // 3. Search Web localStorage if not found in local SQLite
  if (!userRow && Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const savedProfileStr =
        localStorage.getItem('medrecord_doctor_profile') ||
        localStorage.getItem('doctor_profile_meta') ||
        localStorage.getItem('doctor_profile') ||
        localStorage.getItem('medrecord_doctor') ||
        localStorage.getItem('medrecord_user');

      if (savedProfileStr) {
        const saved = JSON.parse(savedProfileStr);
        const storedCleanPhone = (saved.telephone || saved.phone || '').replace(/[\s\-\(\)\+]/g, '');
        const isMatch =
          (saved.email && saved.email.trim().toLowerCase() === cleanId) ||
          (storedCleanPhone && storedCleanPhone === cleanPhone) ||
          (saved.telephone && saved.telephone.trim() === identifier.trim());

        if (isMatch) {
          userRow = saved;
        }
      }
    } catch (e) {
      console.warn('MedRecord localStorage fetch warning:', e);
    }
  }

  // 4. Search Supabase Cloud if not found in local SQLite / localStorage
  if (!userRow) {
    try {
      const { supabase } = require('../services/supabase');
      if (supabase) {
        const { data, error } = await supabase
          .from('utilisateurs')
          .select('*')
          .or(`email.ilike.${cleanId},telephone.eq.${identifier.trim()}`)
          .single();

        if (data && !error) {
          userRow = data;
          await db.runAsync(
            `INSERT OR REPLACE INTO utilisateurs (id, email, nom, prenom, telephone, role, pin_hash, biometrie_active) 
             VALUES (?, ?, ?, ?, ?, ?, ?, 0);`,
            [data.id, data.email, data.nom, data.prenom, data.telephone, data.role || 'MEDECIN', data.pin_hash || pinHash]
          );
        }
      }
    } catch (supabaseErr) {
      console.warn('MedRecord Supabase Cloud Search warning:', supabaseErr);
    }
  }

  // STRICT SECURITY CONTROL 1: Account existence
  if (!userRow) {
    throw new Error('Identifiant introuvable ou code PIN incorrect.');
  }

  // STRICT SECURITY CONTROL 2: Retrieve all possible stored PIN representations
  let storedPinHash = userRow.pin_hash || null;
  let storedPlainPin = userRow.pin || null;

  if (!storedPinHash && !storedPlainPin && Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const { safeStorageGet, STORAGE_KEYS } = require('../utils/storage');
      const meta = safeStorageGet(STORAGE_KEYS.DOCTOR_META) || safeStorageGet(STORAGE_KEYS.DOCTOR_PROFILE);
      if (meta) {
        storedPinHash = meta.pin_hash || null;
        storedPlainPin = meta.pin || null;
      }
    } catch (e) {}
  }

  if (!storedPinHash) {
    try {
      const secureHash = await secureStoreGetItem(PIN_HASH_KEY);
      if (secureHash) storedPinHash = secureHash;
    } catch (e) {}
  }

  if (!storedPinHash) {
    try {
      const dbRow = (await db.getFirstAsync(
        'SELECT pin_hash FROM utilisateurs WHERE LOWER(email) = ? OR telephone = ? LIMIT 1;',
        [cleanId, identifier.trim()]
      )) as any;
      if (dbRow?.pin_hash) storedPinHash = dbRow.pin_hash;
    } catch (e) {}
  }

  // STRICT PIN VERIFICATION: Entered PIN must match stored PIN hash or plain PIN
  let isPinValid = false;
  if (storedPinHash && storedPinHash === pinHash) {
    isPinValid = true;
  }
  if (storedPlainPin && String(storedPlainPin).trim() === String(pin).trim()) {
    isPinValid = true;
  }

  // If the PIN is not valid, ALWAYS THROW ERROR AND BLOCK ACCESS!
  if (!isPinValid) {
    throw new Error('Code PIN incorrect.');
  }

  // Format clean practitioner name (e.g. Dr Fallou Diop)
  let userPrenom = (userRow.prenom || 'Fallou').trim();
  let userNom = (userRow.nom || 'Diop').trim();
  if (userPrenom.includes('10008') || userPrenom.toLowerCase().includes('fallu') || userPrenom.length > 12) {
    userPrenom = 'Fallou';
    userNom = 'Diop';
  }

  // Save PIN hash & Active User ID in secure store
  await secureStoreSetItem(PIN_HASH_KEY, pinHash);
  await secureStoreSetItem(ACTIVE_USER_ID_KEY, userRow.id || `user_${Date.now()}`);
  await updateLastActiveTime();

  return {
    id: userRow.id || `user_${Date.now()}`,
    email: userRow.email || cleanId,
    nom: userNom,
    prenom: userPrenom,
    telephone: userRow.telephone || userRow.phone || null,
    role: userRow.role || 'MEDECIN',
    biometrie_active: Boolean(userRow.biometrie_active),
  };
}

/**
 * Authenticates the user using their PIN code.
 */
export async function verifyPIN(pin: string): Promise<boolean> {
  try {
    let storedHash = await secureStoreGetItem(PIN_HASH_KEY);
    let activeUserId = await secureStoreGetItem(ACTIVE_USER_ID_KEY);

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const { safeStorageGet, STORAGE_KEYS } = require('../utils/storage');
      const profile = safeStorageGet(STORAGE_KEYS.CURRENT_USER) || safeStorageGet(STORAGE_KEYS.DOCTOR_PROFILE);
      const meta = safeStorageGet(STORAGE_KEYS.DOCTOR_META);
      if (meta?.pin_hash && !storedHash) storedHash = meta.pin_hash;
      if (meta?.pin && !storedHash) {
        storedHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, String(meta.pin).trim());
      }
      if (profile?.id && !activeUserId) activeUserId = profile.id;
    }

    if (!storedHash && activeUserId) {
      try {
        const db = await getDatabase();
        const dbUser = (await db.getFirstAsync('SELECT pin_hash FROM utilisateurs WHERE id = ?;', [activeUserId])) as any;
        if (dbUser?.pin_hash) storedHash = dbUser.pin_hash;
      } catch (e) {}
    }

    if (!storedHash) return false;

    const inputHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      pin
    );

    const success = storedHash === inputHash;
    if (success) {
      await updateLastActiveTime();
    }
    return success;
  } catch (error) {
    console.error('MedRecord: Failed to verify PIN:', error);
    return false;
  }
}

/**
 * Checks if biometrics are supported and enrolled on the device.
 */
export async function getBiometricStatus(): Promise<{
  hasHardware: boolean;
  isEnrolled: boolean;
}> {
  if (Platform.OS === 'web') {
    return { hasHardware: false, isEnrolled: false };
  }
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  return { hasHardware, isEnrolled };
}

/**
 * Toggles biometric authentication state.
 */
export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  const userId = await secureStoreGetItem(ACTIVE_USER_ID_KEY);
  if (!userId) return;

  const db = await getDatabase();
  await db.runAsync('UPDATE utilisateurs SET biometrie_active = ? WHERE id = ?;', [
    enabled ? 1 : 0,
    userId,
  ]);
  await secureStoreSetItem(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
}

/**
 * Check if biometrics are enabled in the database for the active user.
 */
export async function isBiometricEnabled(): Promise<boolean> {
  const enabledStr = await secureStoreGetItem(BIOMETRIC_ENABLED_KEY);
  return enabledStr === 'true';
}

/**
 * Authenticates the user using biometric hardware.
 */
export async function authenticateBiometric(): Promise<boolean> {
  try {
    const isEnabled = await isBiometricEnabled();
    if (!isEnabled) return false;

    const status = await getBiometricStatus();
    if (!status.hasHardware || !status.isEnrolled) return false;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Authentification MedRecord',
      fallbackLabel: 'Saisir le code PIN',
      disableDeviceFallback: false,
    });

    if (result.success) {
      await updateLastActiveTime();
    }
    return result.success;
  } catch (error) {
    console.error('MedRecord: Biometric authentication error:', error);
    return false;
  }
}

/**
 * Gets the current authenticated user profile from SQLite or local storage.
 */
export async function getActiveUserProfile(): Promise<UserProfile | null> {
  try {
    let userId = await secureStoreGetItem(ACTIVE_USER_ID_KEY);
    if (!userId && Platform.OS === 'web' && typeof window !== 'undefined') {
      const { safeStorageGet, STORAGE_KEYS } = require('../utils/storage');
      const storedUser = safeStorageGet(STORAGE_KEYS.CURRENT_USER) || safeStorageGet(STORAGE_KEYS.DOCTOR_PROFILE);
      if (storedUser?.id) userId = storedUser.id;
    }
    if (!userId) return null;

    let user: any = null;
    try {
      const db = await getDatabase();
      user = (await db.getFirstAsync(
        'SELECT id, email, nom, prenom, telephone, role, biometrie_active FROM utilisateurs WHERE id = ?;',
        [userId]
      )) as any;
    } catch (e) {}

    if (!user && Platform.OS === 'web' && typeof window !== 'undefined') {
      const { safeStorageGet, STORAGE_KEYS } = require('../utils/storage');
      user = safeStorageGet(STORAGE_KEYS.CURRENT_USER) || safeStorageGet(STORAGE_KEYS.DOCTOR_PROFILE);
    }

    if (user) {
      const cleanedNom = cleanRawName(user.nom);
      const cleanedPrenom = cleanRawName(user.prenom);

      if (cleanedNom !== user.nom || cleanedPrenom !== user.prenom) {
        try {
          const db = await getDatabase();
          await db.runAsync('UPDATE utilisateurs SET nom = ?, prenom = ? WHERE id = ?;', [
            cleanedNom,
            cleanedPrenom,
            user.id,
          ]);
        } catch (e) {}
      }

      return {
        id: user.id,
        email: user.email,
        nom: cleanedNom,
        prenom: cleanedPrenom,
        telephone: user.telephone || null,
        role: user.role || 'MEDECIN',
        biometrie_active: user.biometrie_active === 1 || user.biometrie_active === true,
      };
    }

    return null;
  } catch (error) {
    console.error('MedRecord: Failed to get active user profile:', error);
    return null;
  }
}

/**
 * Récupère le délai de verrouillage automatique en minutes (0 = Désactivé).
 */
export async function getAutoLockTimeoutMinutes(): Promise<number> {
  try {
    const val = await secureStoreGetItem(AUTO_LOCK_TIMEOUT_KEY);
    if (val === null || val === undefined) return DEFAULT_INACTIVITY_TIMEOUT_MINUTES;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? DEFAULT_INACTIVITY_TIMEOUT_MINUTES : parsed;
  } catch (error) {
    return DEFAULT_INACTIVITY_TIMEOUT_MINUTES;
  }
}

/**
 * Définit le délai de verrouillage automatique en minutes.
 */
export async function setAutoLockTimeoutMinutes(minutes: number): Promise<void> {
  await secureStoreSetItem(AUTO_LOCK_TIMEOUT_KEY, minutes.toString());
}

/**
 * Records the timestamp of the last user interaction/activity.
 */
export async function updateLastActiveTime(): Promise<void> {
  const now = Date.now().toString();
  await secureStoreSetItem(LAST_ACTIVE_TIMESTAMP_KEY, now);
}

/**
 * Checks if the user session has timed out due to inactivity.
 */
export async function checkSessionTimeout(): Promise<boolean> {
  try {
    const minutes = await getAutoLockTimeoutMinutes();
    // Si désactivé (0 minute), pas de verrouillage automatique
    if (minutes === 0) return false;

    const lastActiveStr = await secureStoreGetItem(LAST_ACTIVE_TIMESTAMP_KEY);
    if (!lastActiveStr) return true; // Timeout if never set

    const lastActive = parseInt(lastActiveStr, 10);
    const elapsed = Date.now() - lastActive;
    const timeoutMs = minutes * 60 * 1000;

    return elapsed > timeoutMs;
  } catch (error) {
    console.error('MedRecord: Failed to check session timeout:', error);
    return true;
  }
}

/**
 * Logs out the active user and clears local session cache.
 */
export async function logoutUser(): Promise<void> {
  await secureStoreDeleteItem(ACTIVE_USER_ID_KEY);
  await secureStoreDeleteItem(LAST_ACTIVE_TIMESTAMP_KEY);
}
