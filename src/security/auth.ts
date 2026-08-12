import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { getDatabase, generateUUID } from '../database/db';

const PIN_HASH_KEY = 'medrecord_user_pin_hash';
const BIOMETRIC_ENABLED_KEY = 'medrecord_biometric_enabled';
const ACTIVE_USER_ID_KEY = 'medrecord_active_user_id';
const LAST_ACTIVE_TIMESTAMP_KEY = 'medrecord_last_active_time';

const INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes auto-lock

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

/**
 * Checks if an email address already exists in the database/storage for another user.
 */
export async function checkEmailExists(email: string, currentUserId?: string): Promise<boolean> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return false;

  try {
    const db = await getDatabase();
    
    // 1. Check SQLite database
    let query = 'SELECT id FROM utilisateurs WHERE LOWER(email) = LOWER(?)';
    const params: any[] = [cleanEmail];

    if (currentUserId) {
      query += ' AND id != ?';
      params.push(currentUserId);
    }
    query += ' LIMIT 1;';

    const existingUser = (await db.getFirstAsync(query, params)) as any;
    if (existingUser) {
      return true;
    }

    // 2. Check remote Supabase if available
    try {
      const { supabase } = require('../services/supabase');
      if (supabase) {
        let sbQuery = supabase.from('utilisateurs').select('id').eq('email', cleanEmail);
        if (currentUserId) {
          sbQuery = sbQuery.neq('id', currentUserId);
        }
        const { data } = await sbQuery.limit(1);
        if (data && data.length > 0) {
          return true;
        }
      }
    } catch (e) {
      // Supabase offline/not configured fallback
    }

    return false;
  } catch (error) {
    console.warn('MedRecord: Failed to check email uniqueness:', error);
    return false;
  }
}

/**
 * Checks if a PIN code has been set up on this device.
 */
export async function isPinSetup(): Promise<boolean> {
  const hash = await secureStoreGetItem(PIN_HASH_KEY);
  return !!hash;
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
    
    // Check if default user already exists
    let user = (await db.getFirstAsync('SELECT * FROM utilisateurs LIMIT 1;')) as any;
    let userId = user?.id;

    // Check email uniqueness
    const isEmailTaken = await checkEmailExists(email, userId);
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

    if (!user) {
      userId = generateUUID();
      await db.runAsync(
        `INSERT INTO utilisateurs (id, email, nom, prenom, telephone, role, pin_hash, biometrie_active) 
         VALUES (?, ?, ?, ?, ?, ?, ?, 0);`,
        [userId, email, cleanNom, cleanPrenom, telephone || null, 'MEDECIN', pinHash]
      );
    } else {
      // Update existing user's PIN
      await db.runAsync(
        `UPDATE utilisateurs SET pin_hash = ?, email = ?, nom = ?, prenom = ?, telephone = ? WHERE id = ?;`,
        [pinHash, email, cleanNom, cleanPrenom, telephone || null, userId]
      );
    }

    // 4. Save active user ID locally
    await secureStoreSetItem(ACTIVE_USER_ID_KEY, userId);

    // 5. Sync to Supabase in background if client is configured
    try {
      const { supabase } = require('../services/supabase');
      if (supabase) {
        // Upsert to both possible user tables in Supabase (utilisateurs/profiles)
        supabase.from('utilisateurs').upsert({
          id: userId,
          email,
          nom,
          prenom,
          telephone: telephone || null,
          role: 'MEDECIN',
          updated_at: new Date().toISOString()
        }).then(({ error }: any) => {
          if (error) console.warn('Supabase sync warning (utilisateurs):', error);
        });

        supabase.from('profiles').upsert({
          id: userId,
          email,
          nom,
          prenom,
          telephone: telephone || null,
          role: 'MEDECIN',
          updated_at: new Date().toISOString()
        }).then(({ error }: any) => {
          if (error) console.warn('Supabase sync warning (profiles):', error);
        });
      }
    } catch (supabaseErr) {
      console.warn('MedRecord: Failed to background-sync profile to Supabase:', supabaseErr);
    }

    return {
      id: userId,
      email,
      nom,
      prenom,
      telephone,
      role: 'MEDECIN',
      biometrie_active: false
    };
  } catch (error) {
    console.error('MedRecord: Failed to set up PIN:', error);
    throw new Error('Failed to configure PIN code.');
  }
}

/**
 * Authenticates the user using their PIN code.
 */
export async function verifyPIN(pin: string): Promise<boolean> {
  try {
    const storedHash = await secureStoreGetItem(PIN_HASH_KEY);
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
 * Gets the current authenticated user profile from SQLite.
 */
export async function getActiveUserProfile(): Promise<UserProfile | null> {
  try {
    const userId = await secureStoreGetItem(ACTIVE_USER_ID_KEY);
    const db = await getDatabase();
    
    let user = userId ? (await db.getFirstAsync(
      'SELECT id, email, nom, prenom, telephone, role, biometrie_active FROM utilisateurs WHERE id = ?;',
      [userId]
    )) as any : null;

    if (!user) {
      // Si la session est orpheline (ex: crash précédent), on récupère le premier utilisateur existant
      user = (await db.getFirstAsync('SELECT * FROM utilisateurs LIMIT 1;')) as any;
      if (user) {
        await secureStoreSetItem(ACTIVE_USER_ID_KEY, user.id);
      }
    }

    if (!user) {
      // S'il n'y a aucun utilisateur mais qu'un PIN est configuré, on recrée un profil médecin par défaut
      const defaultId = generateUUID();
      const defaultEmail = 'bamba.diop@medrecord.sn';
      const defaultNom = 'Diop';
      const defaultPrenom = 'Mohamadou Bamba';
      const defaultTelephone = '+221 77 123 4567';
      const hash = await secureStoreGetItem(PIN_HASH_KEY);
      
      await db.runAsync(
        `INSERT INTO utilisateurs (id, email, nom, prenom, telephone, role, pin_hash, biometrie_active) 
         VALUES (?, ?, ?, ?, ?, ?, ?, 0);`,
        [defaultId, defaultEmail, defaultNom, defaultPrenom, defaultTelephone, 'MEDECIN', hash]
      );
      
      await secureStoreSetItem(ACTIVE_USER_ID_KEY, defaultId);
      
      return {
        id: defaultId,
        email: defaultEmail,
        nom: defaultNom,
        prenom: defaultPrenom,
        telephone: defaultTelephone,
        role: 'MEDECIN',
        biometrie_active: false
      };
    }

    if (user) {
      const cleanedNom = cleanRawName(user.nom);
      const cleanedPrenom = cleanRawName(user.prenom);

      if (cleanedNom !== user.nom || cleanedPrenom !== user.prenom) {
        await db.runAsync('UPDATE utilisateurs SET nom = ?, prenom = ? WHERE id = ?;', [
          cleanedNom,
          cleanedPrenom,
          user.id,
        ]);
      }

      return {
        id: user.id,
        email: user.email,
        nom: cleanedNom,
        prenom: cleanedPrenom,
        telephone: user.telephone,
        role: user.role,
        biometrie_active: user.biometrie_active === 1,
      };
    }

    return null;
  } catch (error) {
    console.error('MedRecord: Failed to get active user profile:', error);
    return null;
  }
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
    const lastActiveStr = await secureStoreGetItem(LAST_ACTIVE_TIMESTAMP_KEY);
    if (!lastActiveStr) return true; // Timeout if never set

    const lastActive = parseInt(lastActiveStr, 10);
    const elapsed = Date.now() - lastActive;

    return elapsed > INACTIVITY_TIMEOUT_MS;
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
