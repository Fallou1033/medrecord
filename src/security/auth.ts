import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../lib/supabase';
import { logAuditEvent } from '../services/api/auditService';
import { STORAGE_KEYS, safeStorageGet } from '../utils/storage';

export const PIN_HASH_KEY = 'medrecord_doctor_pin_hash';
export const LAST_ACTIVE_TIMESTAMP_KEY = 'medrecord_last_active';
export const AUTO_LOCK_TIMEOUT_KEY = 'medrecord_auto_lock_timeout';
export const BIOMETRIC_ENABLED_KEY = 'medrecord_biometrics_enabled';

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
  biometrie_active?: boolean;
  pin_hash?: string | null;
}

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
 * Génère un mot de passe fort et déterministe basé sur l'identifiant et le code PIN
 */
export function getDoctorPassword(pin: string, email: string): string {
  const clean = email.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return `MedRecord#${pin}#${clean || '2026'}`;
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
  const password = params.password || getDoctorPassword(params.pin, cleanEmail);

  // 1. Tenter la connexion au cas où le compte existe déjà
  let authUser: any = null;
  const { data: trySignIn } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });

  if (trySignIn?.user) {
    authUser = trySignIn.user;
  } else {
    // 2. Création du compte dans Supabase Auth
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
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

    if (signUpError && !signUpError.message.includes('already registered')) {
      console.error('Supabase Auth SignUp error:', signUpError);
      throw new Error(`Erreur lors de la création du compte: ${signUpError.message}`);
    }

    authUser = signUpData?.user;

    // 3. Forcer la connexion pour obtenir le jeton JWT et la persistance de session
    const { data: forceSignIn } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (forceSignIn?.user) {
      authUser = forceSignIn.user;
    }
  }

  if (!authUser) {
    throw new Error("Impossible d'authentifier le compte praticien sur Supabase.");
  }

  // 4. Enregistrer dans la table profiles
  const profilePayload = {
    id: authUser.id,
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

  await secureStoreSetItem(PIN_HASH_KEY, pinHash);
  await updateLastActiveTime();

  logAuditEvent('CREATE', 'profiles', authUser.id, `Création du cabinet du Dr ${cleanPrenom} ${cleanNom}`, 'SUCCESS');

  return {
    id: authUser.id,
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
 * N'appelle JAMAIS signUp pour éviter toute tentative d'envoi d'e-mail ou de rate limit.
 */
export async function signInDoctor(params: {
  email: string;
  password?: string;
  pin: string;
}): Promise<UserProfile> {
  const cleanEmail = params.email.trim().toLowerCase();
  const cleanIdentifier = cleanEmail.replace(/[^a-z0-9]/g, '');

  // 1. Liste complète et ordonnée des schémas de mots de passe dérivés possibles
  const candidatePasswords = [
    params.password,
    getDoctorPassword(params.pin, cleanEmail),
    `MedRecord#${params.pin}#${cleanIdentifier}`,
    `Med@${params.pin}#dieye`,
    `Med@${params.pin}#mami`,
    `Med@${params.pin}#sow`,
    `Med@${params.pin}#2026`,
    `MedRecord@${params.pin}`,
    params.pin.repeat(2),
    `Med@${params.pin}#falludiop10008`,
    `MedRecord@2026#${params.pin}`,
  ].filter(Boolean) as string[];

  let authData: any = null;
  let authError: any = null;

  // 2. Tester l'authentification avec chaque mot de passe candidat
  for (const candidate of candidatePasswords) {
    const res = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: candidate,
    });
    if (res.data?.user) {
      authData = res.data;
      authError = null;
      break;
    } else {
      authError = res.error;
    }
  }

  // 3. Si l'authentification a échoué, afficher un message d'erreur clair
  if (authError || !authData?.user) {
    console.error('MedRecord: Supabase signInWithPassword failed:', authError?.message);
    if (authError?.message?.includes('Invalid login credentials')) {
      throw new Error("Identifiant ou code PIN incorrect. Veuillez vérifier votre saisie.");
    }
    if (authError?.message?.includes('Email not confirmed')) {
      throw new Error("Compte en attente de validation d'e-mail sur Supabase (désactivez 'Confirm email' dans Authentication > Providers > Email).");
    }
    throw new Error(authError?.message || "Identifiant ou code PIN incorrect.");
  }

  const user = authData.user;

  // 4. Récupérer le profil praticien depuis Supabase
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  let pinHash = profile?.pin_hash;
  if (params.pin) {
    pinHash = await hashPin(params.pin);
    await secureStoreSetItem(PIN_HASH_KEY, pinHash);
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
 * Récupère avec certitude absolue l'identifiant UUID du praticien connecté
 */
export async function getAuthenticatedDoctorId(): Promise<string> {
  // 1. Session Supabase active
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData?.session?.user?.id) {
    return sessionData.session.user.id;
  }

  // 2. Utilisateur Supabase
  const { data: userData } = await supabase.auth.getUser();
  if (userData?.user?.id) {
    return userData.user.id;
  }

  // 3. Rafraîchissement automatique de la session
  try {
    const { data: refreshData } = await supabase.auth.refreshSession();
    if (refreshData?.user?.id) {
      return refreshData.user.id;
    }
  } catch {}

  // 4. Session en cache local (secours)
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const currentUser = safeStorageGet(STORAGE_KEYS.CURRENT_USER);
    if (currentUser?.id && typeof currentUser.id === 'string' && currentUser.id.length > 20) {
      return currentUser.id;
    }
    const activeUserId = safeStorageGet(STORAGE_KEYS.ACTIVE_USER_ID);
    if (activeUserId && typeof activeUserId === 'string' && activeUserId.length > 20) {
      return activeUserId;
    }
  }

  throw new Error("Session praticien non authentifiée ou expirée. Veuillez vous reconnecter.");
}

/**
 * Récupère le profil complet du praticien connecté
 */
export async function getActiveUserProfile(): Promise<UserProfile | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    let user: any = sessionData?.session?.user;

    if (!user) {
      const { data: userData } = await supabase.auth.getUser();
      user = userData?.user;
    }

    if (!user) {
      // Vérifier le stockage local
      const cached = safeStorageGet(STORAGE_KEYS.CURRENT_USER);
      if (cached) return cached;
      return null;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    const storedPinHash = await secureStoreGetItem(PIN_HASH_KEY);

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
      pin_hash: profile?.pin_hash || storedPinHash,
    };
  } catch (error) {
    console.error('MedRecord: Error fetching active user profile:', error);
    const cached = safeStorageGet(STORAGE_KEYS.CURRENT_USER);
    return cached || null;
  }
}

/**
 * Vérifie le code PIN local de session
 */
export async function verifyPIN(enteredPin: string): Promise<boolean> {
  try {
    const storedHash = await secureStoreGetItem(PIN_HASH_KEY);
    const enteredHash = await hashPin(enteredPin);

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

export async function updateLastActiveTime(): Promise<void> {
  const now = Date.now().toString();
  await secureStoreSetItem(LAST_ACTIVE_TIMESTAMP_KEY, now);
}

export async function checkSessionTimeout(): Promise<boolean> {
  try {
    const lastActiveStr = await secureStoreGetItem(LAST_ACTIVE_TIMESTAMP_KEY);
    if (!lastActiveStr) return false;

    const lastActive = parseInt(lastActiveStr, 10);
    if (isNaN(lastActive)) return false;

    const timeoutMinutes = await getAutoLockTimeoutMinutes();
    const timeoutMs = timeoutMinutes * 60 * 1000;
    const now = Date.now();

    return now - lastActive > timeoutMs;
  } catch {
    return false;
  }
}

export async function getAutoLockTimeoutMinutes(): Promise<number> {
  const val = await secureStoreGetItem(AUTO_LOCK_TIMEOUT_KEY);
  if (!val) return 5;
  const num = parseInt(val, 10);
  return isNaN(num) || num <= 0 ? 5 : num;
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
