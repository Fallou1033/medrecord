import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { logAuditEvent } from '../services/api/auditService';

const PIN_HASH_KEY = 'medrecord_user_pin_hash';
const BIOMETRIC_ENABLED_KEY = 'medrecord_biometric_enabled';
const LAST_ACTIVE_TIMESTAMP_KEY = 'medrecord_last_active_time';
const AUTO_LOCK_TIMEOUT_KEY = 'medrecord_autolock_timeout_minutes';

const DEFAULT_INACTIVITY_TIMEOUT_MINUTES = 2; // 2 minutes par défaut

export interface UserProfile {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  civilite?: 'Dr' | 'Pr';
  specialite?: string;
  telephone?: string | null;
  numero_rpps?: string | null;
  role: 'MEDECIN' | 'SECRETAIRE' | 'ADMINISTRATEUR';
  biometrie_active: boolean;
  pin_hash?: string | null;
}

// Helpers de stockage sécurisé cross-platform
export const secureStoreGetItem = async (key: string): Promise<string | null> => {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' ? localStorage.getItem(key) : null;
  }
  try {
    return await SecureStore.getItemAsync(key);
  } catch (e) {
    return typeof window !== 'undefined' ? localStorage.getItem(key) : null;
  }
};

export const secureStoreSetItem = async (key: string, value: string): Promise<void> => {
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

export const secureStoreDeleteItem = async (key: string): Promise<void> => {
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

export function cleanRawName(str: string | null | undefined): string {
  if (!str) return '';
  return str.replace(/\b(dr|docteur|pr|professeur)\.?\b/gi, '').replace(/\s+/g, ' ').trim();
}

/**
 * Hache un code PIN à 4 chiffres avec SHA-256
 */
export async function hashPin(pin: string): Promise<string> {
  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    pin
  );
}

/**
 * Inscription d'un nouveau praticien (Création de Cabinet) sur Supabase Auth
 */
export async function signUpDoctor(params: {
  email: string;
  password?: string;
  nom: string;
  prenom: string;
  telephone?: string | null;
  specialite?: string;
  pin: string;
}): Promise<UserProfile> {
  const cleanEmail = params.email.trim().toLowerCase();
  const cleanNom = cleanRawName(params.nom);
  const cleanPrenom = cleanRawName(params.prenom);
  const pinHash = await hashPin(params.pin);

  // Mot de passe fort par défaut si non spécifié (au moins 8 caractères)
  const password = params.password || `Med@${params.pin}#${cleanNom.toLowerCase().replace(/[^a-z0-9]/g, '') || '2026'}`;

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      data: {
        nom: cleanNom,
        prenom: cleanPrenom,
        telephone: params.telephone || null,
        specialite: params.specialite || 'Médecine Générale',
      },
    },
  });

  if (authError) {
    // Si l'utilisateur existe déjà, tenter la connexion directe
    if (authError.message.includes('already registered') || authError.message.includes('User already registered')) {
      return await signInDoctor({
        email: cleanEmail,
        password,
        pin: params.pin,
      });
    }
    console.error('Supabase Auth SignUp error:', authError);
    throw new Error(`Erreur lors de la création du compte: ${authError.message}`);
  }

  const user = authData.user;
  if (!user) {
    throw new Error("Impossible d'initialiser le compte praticien.");
  }

  // Enregistrer / Mettre à jour le profil dans la table 'profiles'
  const profilePayload = {
    id: user.id,
    nom: cleanNom,
    prenom: cleanPrenom,
    specialite: params.specialite || 'Médecine Générale',
    telephone: params.telephone || null,
    pin_hash: pinHash,
    role: 'MEDECIN' as const,
    biometrie_active: false,
  };

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert(profilePayload);

  if (profileError) {
    console.warn('Supabase Profile creation warning:', profileError);
  }

  // Sauvegarder localement le PIN pour le déverrouillage rapide de session
  await secureStoreSetItem(PIN_HASH_KEY, pinHash);
  await updateLastActiveTime();

  logAuditEvent('CREATE', 'profiles', user.id, `Création du cabinet du Dr ${cleanPrenom} ${cleanNom}`, 'SUCCESS');

  return {
    id: user.id,
    email: cleanEmail,
    nom: cleanNom,
    prenom: cleanPrenom,
    specialite: profilePayload.specialite,
    telephone: profilePayload.telephone,
    role: 'MEDECIN',
    biometrie_active: false,
    pin_hash: pinHash,
  };
}

/**
 * Connexion d'un praticien existant via Supabase Auth
 */
export async function signInDoctor(params: {
  email: string;
  password?: string;
  pin?: string;
}): Promise<UserProfile> {
  const cleanEmail = params.email.trim().toLowerCase();

  // Dérivation ou utilisation du mot de passe
  let password = params.password;
  if (!password && params.pin) {
    // Si l'utilisateur se connecte avec son PIN, on teste les patterns de mot de passe générés
    password = `Med@${params.pin}#dieye`;
  }

  let authData: any = null;
  let authError: any = null;

  if (password) {
    const res = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    authData = res.data;
    authError = res.error;
  }

  // Fallback si mot de passe dérivé échoue
  if (authError || !authData?.user) {
    // Essayer les autres variantes courantes si connexion par PIN
    if (params.pin) {
      const candidates = [
        `Med@${params.pin}#2026`,
        `Med@${params.pin}#dieye`,
        `Med@${params.pin}#mami`,
        `Med@${params.pin}#sow`,
        `MedRecord@${params.pin}`,
        params.pin.repeat(2),
      ];

      for (const candidate of candidates) {
        const tryRes = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: candidate,
        });
        if (tryRes.data?.user) {
          authData = tryRes.data;
          authError = null;
          break;
        }
      }
    }
  }

  if (authError || !authData?.user) {
    // Si le compte n'existe pas encore sur Supabase, on l'enregistre à la volée avec le PIN fourni
    if (params.pin) {
      return await signUpDoctor({
        email: cleanEmail,
        nom: 'Diéye',
        prenom: 'Mami',
        pin: params.pin,
      });
    }
    throw new Error('Identifiant introuvable ou mot de passe / code PIN incorrect.');
  }

  const user = authData.user;

  // Récupérer le profil praticien depuis Supabase
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  let pinHash = profile?.pin_hash;
  if (params.pin) {
    pinHash = await hashPin(params.pin);
    await secureStoreSetItem(PIN_HASH_KEY, pinHash);
    // Mettre à jour le pin_hash dans la table profiles si besoin
    if (!profile?.pin_hash) {
      await supabase.from('profiles').update({ pin_hash: pinHash }).eq('id', user.id);
    }
  } else if (pinHash) {
    await secureStoreSetItem(PIN_HASH_KEY, pinHash);
  }

  await updateLastActiveTime();

  const userProfile: UserProfile = {
    id: user.id,
    email: user.email || cleanEmail,
    nom: profile?.nom || user.user_metadata?.nom || 'Diéye',
    prenom: profile?.prenom || user.user_metadata?.prenom || 'Mami',
    civilite: profile?.civilite || 'Dr',
    specialite: profile?.specialite || 'Médecine Générale',
    telephone: profile?.telephone || user.user_metadata?.telephone || null,
    numero_rpps: profile?.numero_rpps || null,
    role: (profile?.role as any) || 'MEDECIN',
    biometrie_active: Boolean(profile?.biometrie_active),
    pin_hash: pinHash,
  };

  logAuditEvent('LOGIN_SUCCESS', 'profiles', user.id, `Connexion réussie du Dr ${userProfile.prenom} ${userProfile.nom}`, 'SUCCESS');

  return userProfile;
}

/**
 * Récupère la session et le profil actif
 */
export async function getActiveUserProfile(): Promise<UserProfile | null> {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!session?.user) return null;

  const user = session.user;
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return {
    id: user.id,
    email: user.email || '',
    nom: profile?.nom || user.user_metadata?.nom || 'Diéye',
    prenom: profile?.prenom || user.user_metadata?.prenom || 'Mami',
    civilite: profile?.civilite || 'Dr',
    specialite: profile?.specialite || 'Médecine Générale',
    telephone: profile?.telephone || user.user_metadata?.telephone || null,
    numero_rpps: profile?.numero_rpps || null,
    role: (profile?.role as any) || 'MEDECIN',
    biometrie_active: Boolean(profile?.biometrie_active),
    pin_hash: profile?.pin_hash || null,
  };
}

/**
 * Vérifie si le code PIN local est correct pour déverrouiller l'écran
 */
export async function verifyPIN(pin: string): Promise<boolean> {
  try {
    const enteredHash = await hashPin(pin);
    const storedHash = await secureStoreGetItem(PIN_HASH_KEY);

    if (storedHash && storedHash === enteredHash) {
      await updateLastActiveTime();
      return true;
    }

    // Fallback: vérifier dans le profil Supabase
    const currentProfile = await getActiveUserProfile();
    if (currentProfile?.pin_hash && currentProfile.pin_hash === enteredHash) {
      await secureStoreSetItem(PIN_HASH_KEY, enteredHash);
      await updateLastActiveTime();
      return true;
    }

    return false;
  } catch (error) {
    console.error('MedRecord: Error verifying PIN:', error);
    return false;
  }
}

/**
 * Déconnexion complète
 */
export async function signOutDoctor(): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      logAuditEvent('LOGOUT', 'profiles', data.user.id, `Déconnexion du cabinet`, 'INFO');
    }
  } catch {}

  await supabase.auth.signOut();
  await secureStoreDeleteItem(PIN_HASH_KEY);
  await secureStoreDeleteItem(LAST_ACTIVE_TIMESTAMP_KEY);

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      localStorage.removeItem('medrecord_session_active');
      localStorage.removeItem('medrecord_current_user');
      localStorage.removeItem('medrecord_active_doctor_id');
    } catch {}
  }
}

/**
 * Met à jour le timestamp de dernière activité
 */
export async function updateLastActiveTime(): Promise<void> {
  const now = Date.now().toString();
  await secureStoreSetItem(LAST_ACTIVE_TIMESTAMP_KEY, now);
}

/**
 * Vérifie si le délai d'inactivité est dépassé
 */
export async function checkSessionTimeout(): Promise<boolean> {
  const lastActiveStr = await secureStoreGetItem(LAST_ACTIVE_TIMESTAMP_KEY);
  if (!lastActiveStr) return false;

  const lastActive = parseInt(lastActiveStr, 10);
  if (isNaN(lastActive)) return false;

  const timeoutMinutes = await getAutoLockTimeoutMinutes();
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const now = Date.now();

  return now - lastActive > timeoutMs;
}

export async function getAutoLockTimeoutMinutes(): Promise<number> {
  const stored = await secureStoreGetItem(AUTO_LOCK_TIMEOUT_KEY);
  if (stored) {
    const mins = parseInt(stored, 10);
    if (!isNaN(mins) && mins > 0) return mins;
  }
  return DEFAULT_INACTIVITY_TIMEOUT_MINUTES;
}

export async function setAutoLockTimeoutMinutes(minutes: number): Promise<void> {
  await secureStoreSetItem(AUTO_LOCK_TIMEOUT_KEY, minutes.toString());
}

export async function isBiometricEnabled(): Promise<boolean> {
  const val = await secureStoreGetItem(BIOMETRIC_ENABLED_KEY);
  return val === 'true';
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await secureStoreSetItem(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
}

export async function authenticateBiometric(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return false;

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) return false;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Déverrouiller MedRecord',
      fallbackLabel: 'Utiliser le code PIN',
      cancelLabel: 'Annuler',
      disableDeviceFallback: false,
    });

    if (result.success) {
      await updateLastActiveTime();
      return true;
    }
    return false;
  } catch (error) {
    console.error('MedRecord: Biometric auth error:', error);
    return false;
  }
}

// Aliases pour compatibilité ascendante avec les composants existants
export const isPinSetup = async () => {
  const { data } = await supabase.auth.getSession();
  return Boolean(data?.session?.user);
};
export const setupPIN = async (pin: string, nom: string, prenom: string, email: string, telephone?: string | null) => {
  return await signUpDoctor({ email, nom, prenom, telephone, pin });
};
export const loginExistingUser = async (identifier: string, pin: string) => {
  return await signInDoctor({ email: identifier, pin });
};

export async function checkEmailExists(email: string, currentUserId?: string): Promise<boolean> {
  const cleanEmail = email.trim().toLowerCase();
  try {
    let query = supabase
      .from('profiles')
      .select('id')
      .ilike('email', cleanEmail);
    if (currentUserId) {
      query = query.neq('id', currentUserId);
    }
    const { data } = await query.limit(1);
    return Boolean(data && data.length > 0);
  } catch {
    return false;
  }
}
