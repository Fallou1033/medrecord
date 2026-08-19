import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import {
  isPinSetup,
  verifyPIN,
  authenticateBiometric,
  signUpDoctor,
  signInDoctor,
  signOutDoctor,
  getActiveUserProfile,
  updateLastActiveTime,
  checkSessionTimeout,
  setBiometricEnabled,
  isBiometricEnabled,
  getAutoLockTimeoutMinutes,
  setAutoLockTimeoutMinutes,
  cleanRawName,
  UserProfile,
} from './auth';
import {
  STORAGE_KEYS,
  safeStorageGet,
  persistActiveSession,
  purgeActiveSession,
} from '../utils/storage';

interface SecurityContextType {
  isLocked: boolean;
  isSetup: boolean;
  user: UserProfile | null;
  biometricsEnabled: boolean;
  autoLockMinutes: number;
  loading: boolean;
  loginUser: (identifier: string, pin: string, password?: string) => Promise<any>;
  setupSecurity: (pin: string, nom: string, prenom: string, email: string, telephone?: string | null) => Promise<any>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  unlockWithBiometrics: () => Promise<boolean>;
  lock: () => void;
  logout: () => Promise<void>;
  toggleBiometrics: (enabled: boolean) => Promise<void>;
  updateAutoLockTimeout: (minutes: number) => Promise<void>;
}

const SecurityContext = createContext<SecurityContextType | null>(null);

export const SecurityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSetup, setIsSetup] = useState<boolean>(() => {
    return safeStorageGet(STORAGE_KEYS.SESSION_ACTIVE) === 'true';
  });

  const [user, setUser] = useState<UserProfile | null>(() => {
    const cached = safeStorageGet(STORAGE_KEYS.CURRENT_USER);
    if (!cached) return null;
    return cached;
  });

  const [isLocked, setIsLocked] = useState<boolean>(() => {
    return safeStorageGet(STORAGE_KEYS.SESSION_ACTIVE) === 'true';
  });

  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [autoLockMinutes, setAutoLockMinutesState] = useState<number>(2);
  const [loading, setLoading] = useState(true);

  // Initialisation de la session Supabase
  const initializeSecurity = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;

      if (session?.user) {
        const profile = await getActiveUserProfile();
        if (profile) {
          setUser(profile);
          setIsSetup(true);
          persistActiveSession(profile);
          setIsLocked(false);
        } else {
          setIsSetup(false);
          setIsLocked(false);
        }
      } else {
        // Si pas de session Supabase active, tenter l'auto-reconnexion avec le cache
        const cachedUser = safeStorageGet(STORAGE_KEYS.CURRENT_USER);
        if (cachedUser?.email && cachedUser?.pin) {
          try {
            const profile = await signInDoctor({
              email: cachedUser.email,
              pin: cachedUser.pin,
            });
            if (profile) {
              setUser(profile);
              setIsSetup(true);
              persistActiveSession(profile);
              setIsLocked(false);
            }
          } catch {
            setUser(null);
            setIsSetup(false);
            setIsLocked(false);
            purgeActiveSession();
          }
        } else {
          setUser(null);
          setIsSetup(false);
          setIsLocked(false);
        }
      }

      const bioEnabled = await isBiometricEnabled();
      setBiometricsEnabled(bioEnabled);

      const mins = await getAutoLockTimeoutMinutes();
      setAutoLockMinutesState(mins);
    } catch (error) {
      console.error('MedRecord: Supabase auth initialization failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initializeSecurity();

    // Abonnement aux changements d'état d'authentification Supabase
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const profile = await getActiveUserProfile();
        if (profile) {
          setUser(profile);
          setIsSetup(true);
          persistActiveSession(profile);
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setIsSetup(false);
        setIsLocked(false);
        purgeActiveSession();
      }
    });

    const fallbackTimer = setTimeout(() => {
      setLoading(false);
    }, 800);

    return () => {
      authListener?.subscription?.unsubscribe();
      clearTimeout(fallbackTimer);
    };
  }, []);

  // Gestion du verrouillage automatique après inactivité
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background') {
        await updateLastActiveTime();
      } else if (nextAppState === 'active') {
        if (user) {
          const timedOut = await checkSessionTimeout();
          if (timedOut) {
            setIsLocked(true);
          } else {
            await updateLastActiveTime();
          }
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [user]);

  // Support Web pour l'inactivité
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    let lastThrottled = 0;
    const onUserInteraction = () => {
      const now = Date.now();
      if (now - lastThrottled > 2000) {
        lastThrottled = now;
        updateLastActiveTime().catch(() => {});
      }
    };

    window.addEventListener('mousemove', onUserInteraction, { passive: true });
    window.addEventListener('mousedown', onUserInteraction, { passive: true });
    window.addEventListener('keydown', onUserInteraction, { passive: true });
    window.addEventListener('touchstart', onUserInteraction, { passive: true });

    return () => {
      window.removeEventListener('mousemove', onUserInteraction);
      window.removeEventListener('mousedown', onUserInteraction);
      window.removeEventListener('keydown', onUserInteraction);
      window.removeEventListener('touchstart', onUserInteraction);
    };
  }, []);

  const updateAutoLockTimeout = async (minutes: number) => {
    await setAutoLockTimeoutMinutes(minutes);
    setAutoLockMinutesState(minutes);
    await updateLastActiveTime();
  };

  const loginUser = async (identifier: string, pin: string, password?: string) => {
    try {
      const profile = await signInDoctor({
        email: identifier,
        password,
        pin,
      });

      persistActiveSession(profile);
      setUser(profile);
      setIsSetup(true);
      setIsLocked(false);
      await updateLastActiveTime();

      return profile;
    } catch (error) {
      console.error('MedRecord: Failed Supabase login attempt:', error);
      throw error;
    }
  };

  const setupSecurity = async (pin: string, nom: string, prenom: string, email: string, telephone?: string | null) => {
    setLoading(true);
    try {
      const profile = await signUpDoctor({
        email,
        nom,
        prenom,
        telephone: telephone || null,
        pin,
      });

      persistActiveSession(profile);
      setUser(profile);
      setIsSetup(true);
      setIsLocked(false);
      await updateLastActiveTime();

      return profile;
    } catch (error) {
      console.error('MedRecord: Failed Supabase setup:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const unlockWithPin = async (pin: string): Promise<boolean> => {
    const success = await verifyPIN(pin);
    if (success) {
      setIsLocked(false);
      const profile = await getActiveUserProfile();
      if (profile) {
        setUser(profile);
        persistActiveSession(profile);
      }
      await updateLastActiveTime();
    }
    return success;
  };

  const unlockWithBiometrics = async (): Promise<boolean> => {
    const success = await authenticateBiometric();
    if (success) {
      setIsLocked(false);
      const profile = await getActiveUserProfile();
      if (profile) {
        setUser(profile);
        persistActiveSession(profile);
      }
      await updateLastActiveTime();
    }
    return success;
  };

  const lock = () => {
    setIsLocked(true);
  };

  const logout = async () => {
    await signOutDoctor();
    setUser(null);
    setIsSetup(false);
    setIsLocked(false);
  };

  const toggleBiometrics = async (enabled: boolean) => {
    await setBiometricEnabled(enabled);
    setBiometricsEnabled(enabled);
  };

  return (
    <SecurityContext.Provider
      value={{
        isLocked,
        isSetup,
        user,
        biometricsEnabled,
        autoLockMinutes,
        loading,
        loginUser,
        setupSecurity,
        unlockWithPin,
        unlockWithBiometrics,
        lock,
        logout,
        toggleBiometrics,
        updateAutoLockTimeout,
      }}
    >
      {children}
    </SecurityContext.Provider>
  );
};

export const useSecurity = () => {
  const context = useContext(SecurityContext);
  if (!context) {
    throw new Error('useSecurity must be used within a SecurityProvider');
  }
  return context;
};
