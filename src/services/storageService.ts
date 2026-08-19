import { Platform } from 'react-native';
import { DoctorProfile } from '../types';

/**
 * Clés standardisées et canoniques de l'application MedRecord.
 * Toutes les anciennes clés arbitraires ou dupliquées sont regroupées ici.
 */
export const CANONICAL_STORAGE_KEYS = {
  // Session active du médecin connecté
  SESSION_ACTIVE: 'medrecord_session_active',
  ACTIVE_DOCTOR_ID: 'medrecord_active_doctor_id',
  ACTIVE_DOCTOR_PROFILE: 'medrecord_active_doctor_profile',
  PIN_HASH: 'medrecord_active_pin_hash',
  LAST_ACTIVE_TIME: 'medrecord_last_active_time',
  AUTOLOCK_TIMEOUT: 'medrecord_autolock_timeout_minutes',
  AUTH_TOKEN: 'medrecord_auth_token',
  
  // Clés historiques à nettoyer pour éviter les conflits
  LEGACY_KEYS: [
    'medrecord_current_user',
    'medrecord_doctor_profile',
    'doctor_profile_meta',
    'medrecord_doctor',
    'doctor_profile',
    'medrecord_active_user_id',
    'medrecord_user_pin_hash',
  ] as const,
};

/**
 * Récupère de façon sécurisée un élément du localStorage (Web).
 */
export function storageGet<T = any>(key: string, fallback: T | null = null): T | null {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    try {
      const item = localStorage.getItem(key);
      if (!item) return fallback;
      try {
        return JSON.parse(item) as T;
      } catch {
        return item as unknown as T;
      }
    } catch (e) {
      console.warn(`[StorageService] Impossible de lire "${key}":`, e);
      return fallback;
    }
  }
  return fallback;
}

/**
 * Enregistre de façon sécurisée un élément dans le localStorage (Web).
 */
export function storageSet(key: string, value: any): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    try {
      const strValue = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, strValue);
    } catch (e) {
      console.warn(`[StorageService] Impossible d'écrire "${key}":`, e);
    }
  }
}

/**
 * Supprime un élément du localStorage (Web).
 */
export function storageRemove(key: string): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn(`[StorageService] Impossible de supprimer "${key}":`, e);
    }
  }
}

/**
 * Sauvegarde la session du médecin actif de façon canonique.
 */
export function saveActiveDoctorSession(doctor: DoctorProfile): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // Écriture des clés canoniques
    storageSet(CANONICAL_STORAGE_KEYS.SESSION_ACTIVE, 'true');
    storageSet(CANONICAL_STORAGE_KEYS.ACTIVE_DOCTOR_ID, doctor.id);
    storageSet(CANONICAL_STORAGE_KEYS.ACTIVE_DOCTOR_PROFILE, doctor);
    storageSet(CANONICAL_STORAGE_KEYS.AUTH_TOKEN, 'true');
    if (doctor.pin_hash) {
      storageSet(CANONICAL_STORAGE_KEYS.PIN_HASH, doctor.pin_hash);
    }

    // Rétrocompatibilité contrôlée pour éviter toute désynchronisation
    storageSet('medrecord_current_user', doctor);
    storageSet('medrecord_doctor_profile', doctor);
    storageSet('medrecord_active_user_id', doctor.id);
  }
}

/**
 * Récupère le profil du médecin actuellement actif en session.
 */
export function getActiveDoctorSession(): DoctorProfile | null {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const isSessionActive = storageGet(CANONICAL_STORAGE_KEYS.SESSION_ACTIVE) === 'true';
    if (!isSessionActive) return null;

    const directProfile = storageGet<DoctorProfile>(CANONICAL_STORAGE_KEYS.ACTIVE_DOCTOR_PROFILE);
    if (directProfile && directProfile.id) return directProfile;

    const fallbackProfile = storageGet<DoctorProfile>('medrecord_current_user') || storageGet<DoctorProfile>('medrecord_doctor_profile');
    if (fallbackProfile && fallbackProfile.id) return fallbackProfile;
  }
  return null;
}

/**
 * Purge immédiatement et intégralement TOUTES les clés de session active.
 * GARANTIE : Ne touche jamais aux bases de données médicales (`db_patients`, etc.).
 */
export function clearActiveDoctorSession(): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // 1. Suppression des clés canoniques
    storageRemove(CANONICAL_STORAGE_KEYS.SESSION_ACTIVE);
    storageRemove(CANONICAL_STORAGE_KEYS.ACTIVE_DOCTOR_ID);
    storageRemove(CANONICAL_STORAGE_KEYS.ACTIVE_DOCTOR_PROFILE);
    storageRemove(CANONICAL_STORAGE_KEYS.PIN_HASH);
    storageRemove(CANONICAL_STORAGE_KEYS.LAST_ACTIVE_TIME);
    storageRemove(CANONICAL_STORAGE_KEYS.AUTH_TOKEN);

    // 2. Nettoyage exhaustif des anciennes clés résiduelles
    CANONICAL_STORAGE_KEYS.LEGACY_KEYS.forEach((legacyKey) => {
      storageRemove(legacyKey);
    });

    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.clear();
      } catch (e) {}
    }
  }
}
