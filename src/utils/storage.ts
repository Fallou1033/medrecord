import { Platform } from 'react-native';

export const STORAGE_KEYS = {
  SESSION_ACTIVE: 'medrecord_session_active',
  CURRENT_USER: 'medrecord_current_user',
  DOCTOR_PROFILE: 'medrecord_doctor_profile',
  DOCTOR_META: 'doctor_profile_meta',
  DOCTOR_LEGACY: 'medrecord_doctor',
  DOCTOR_OFFICIAL: 'doctor_profile',
  AUTH_TOKEN: 'medrecord_auth_token',
  ACTIVE_USER_ID: 'medrecord_active_user_id',
  PIN_HASH: 'medrecord_user_pin_hash',
  LAST_ACTIVE_TIME: 'medrecord_last_active_time',
};

/**
 * Safely retrieves an item from web localStorage or returns fallback value.
 */
export function safeStorageGet<T = any>(key: string, fallback: T | null = null): T | null {
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
      console.warn(`[Storage] Failed to read key "${key}":`, e);
      return fallback;
    }
  }
  return fallback;
}

/**
 * Retrieves the stored doctor profile across active session keys.
 */
export function getAnyStoredDoctorProfile(): any | null {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return (
      safeStorageGet(STORAGE_KEYS.CURRENT_USER) ||
      safeStorageGet(STORAGE_KEYS.DOCTOR_PROFILE) ||
      null
    );
  }
  return null;
}

/**
 * Retrieves any stored PIN hash.
 */
export function getAnyStoredPinHash(): string | null {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const directHash = safeStorageGet<string>(STORAGE_KEYS.PIN_HASH);
    if (directHash) return directHash;
    const meta = safeStorageGet(STORAGE_KEYS.DOCTOR_META);
    if (meta?.pin_hash) return meta.pin_hash;
    const profile = getAnyStoredDoctorProfile();
    if (profile?.pin_hash) return profile.pin_hash;
  }
  return null;
}

/**
 * Safely saves an item to web localStorage.
 */
export function safeStorageSet(key: string, value: any): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    try {
      const strValue = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, strValue);
    } catch (e) {
      console.warn(`[Storage] Failed to write key "${key}":`, e);
    }
  }
}

/**
 * Safely removes an item from web localStorage.
 */
export function safeStorageRemove(key: string): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn(`[Storage] Failed to remove key "${key}":`, e);
    }
  }
}

/**
 * Purges all active session and stored profile keys on logout.
 */
export function purgeActiveSession(): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    safeStorageRemove(STORAGE_KEYS.SESSION_ACTIVE);
    safeStorageRemove(STORAGE_KEYS.CURRENT_USER);
    safeStorageRemove(STORAGE_KEYS.DOCTOR_PROFILE);
    safeStorageRemove(STORAGE_KEYS.DOCTOR_META);
    safeStorageRemove(STORAGE_KEYS.DOCTOR_LEGACY);
    safeStorageRemove(STORAGE_KEYS.DOCTOR_OFFICIAL);
    safeStorageRemove(STORAGE_KEYS.AUTH_TOKEN);
    safeStorageRemove(STORAGE_KEYS.ACTIVE_USER_ID);
    safeStorageRemove(STORAGE_KEYS.PIN_HASH);
    safeStorageRemove(STORAGE_KEYS.LAST_ACTIVE_TIME);

    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.clear();
      } catch (e) {}
    }
  }
}

/**
 * Persists an authenticated doctor session across all relevant storage keys.
 */
export function persistActiveSession(doctorProfile: any): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    safeStorageSet(STORAGE_KEYS.SESSION_ACTIVE, 'true');
    safeStorageSet(STORAGE_KEYS.CURRENT_USER, doctorProfile);
    safeStorageSet(STORAGE_KEYS.DOCTOR_PROFILE, doctorProfile);
    safeStorageSet(STORAGE_KEYS.DOCTOR_LEGACY, doctorProfile);
    safeStorageSet(STORAGE_KEYS.DOCTOR_OFFICIAL, doctorProfile);
    safeStorageSet(STORAGE_KEYS.DOCTOR_META, doctorProfile);
    safeStorageSet(STORAGE_KEYS.AUTH_TOKEN, 'true');
    if (doctorProfile?.id) {
      safeStorageSet(STORAGE_KEYS.ACTIVE_USER_ID, doctorProfile.id);
    }
    if (doctorProfile?.pin_hash) {
      safeStorageSet(STORAGE_KEYS.PIN_HASH, doctorProfile.pin_hash);
    }
  }
}
