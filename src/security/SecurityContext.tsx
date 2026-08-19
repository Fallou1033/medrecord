import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import {
  isPinSetup,
  verifyPIN,
  authenticateBiometric,
  setupPIN,
  getActiveUserProfile,
  updateLastActiveTime,
  checkSessionTimeout,
  setBiometricEnabled,
  isBiometricEnabled,
  getAutoLockTimeoutMinutes,
  setAutoLockTimeoutMinutes,
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
  loginUser: (identifier: string, pin: string) => Promise<any>;
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
    const { getAnyStoredDoctorProfile } = require('../utils/storage');
    const isSessionActive = safeStorageGet(STORAGE_KEYS.SESSION_ACTIVE) === 'true';
    const profile = getAnyStoredDoctorProfile();
    return Boolean(isSessionActive || profile);
  });

  const [user, setUser] = useState<UserProfile | null>(() => {
    const { getAnyStoredDoctorProfile } = require('../utils/storage');
    const profile = getAnyStoredDoctorProfile();
    if (!profile) return null;
    return {
      id: profile.id || 'dr_main',
      email: profile.email || 'dr@cabinet.sn',
      nom: profile.nom || 'Diéye',
      prenom: profile.prenom || 'Mami',
      telephone: profile.telephone || null,
      role: profile.role || 'MEDECIN',
      biometrie_active: Boolean(profile.biometrie_active),
    };
  });

  // Always start locked if an active practitioner profile exists, prompting for 4-digit PIN
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    const { getAnyStoredDoctorProfile } = require('../utils/storage');
    const isSessionActive = safeStorageGet(STORAGE_KEYS.SESSION_ACTIVE) === 'true';
    const profile = getAnyStoredDoctorProfile();
    return Boolean(isSessionActive || profile);
  });

  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [autoLockMinutes, setAutoLockMinutesState] = useState<number>(2);
  const [loading, setLoading] = useState(true);

  // Initialize security state
  const initializeSecurity = async () => {
    try {
      const pinConfigured = await isPinSetup();
      setIsSetup(pinConfigured);

      if (pinConfigured) {
        const profile = await getActiveUserProfile();
        if (profile) {
          setUser(profile);
          persistActiveSession(profile);
        }
        const bioEnabled = await isBiometricEnabled();
        setBiometricsEnabled(bioEnabled);

        const mins = await getAutoLockTimeoutMinutes();
        setAutoLockMinutesState(mins);

        // Require PIN verification when opening or returning to the site
        setIsLocked(true);
      } else {
        // Not configured, user must set up PIN
        setIsLocked(false);
      }
    } catch (error) {
      console.error('MedRecord: Security initialization failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initializeSecurity();

    // Forced unblock fallback timer (500ms max)
    const fallbackTimer = setTimeout(() => {
      setLoading(false);
    }, 500);

    return () => clearTimeout(fallbackTimer);
  }, []);

  // Listen to AppState (background/foreground) to manage auto-lock
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background') {
        // Save the timestamp when the app goes to background
        await updateLastActiveTime();
      } else if (nextAppState === 'active') {
        if (await isPinSetup()) {
          const timedOut = await checkSessionTimeout();
          if (timedOut) {
            console.log('MedRecord: Inactivity timeout, locking app...');
            setIsLocked(true);
          } else {
            // Keep unlocked and refresh timestamp
            await updateLastActiveTime();
          }
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, []);

  // Listen to tab visibility changes on Web
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden') {
        await updateLastActiveTime();
      } else if (document.visibilityState === 'visible') {
        const pinConfigured = await isPinSetup();
        if (pinConfigured) {
          const timedOut = await checkSessionTimeout();
          if (timedOut) {
            console.log('MedRecord: Tab visibility changed, locking screen...');
            setIsLocked(true);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Track user interactions on Web to keep the activity timestamp fresh
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window !== 'undefined') {
      let lastThrottled = 0;
      const onUserInteraction = () => {
        const now = Date.now();
        if (now - lastThrottled > 2000) {
          lastThrottled = now;
          updateLastActiveTime().catch(() => {});
        }
      };

      if (typeof window !== 'undefined') {
        window.addEventListener('mousemove', onUserInteraction, { passive: true });
        window.addEventListener('mousedown', onUserInteraction, { passive: true });
        window.addEventListener('keydown', onUserInteraction, { passive: true });
        window.addEventListener('touchstart', onUserInteraction, { passive: true });
        window.addEventListener('scroll', onUserInteraction, { passive: true });

        return () => {
          window.removeEventListener('mousemove', onUserInteraction);
          window.removeEventListener('mousedown', onUserInteraction);
          window.removeEventListener('keydown', onUserInteraction);
          window.removeEventListener('touchstart', onUserInteraction);
          window.removeEventListener('scroll', onUserInteraction);
        };
      }
    }
  }, []);

  // Periodic check of inactivity timeout every 4 seconds
  useEffect(() => {
    if (!isSetup || !user || isLocked || autoLockMinutes === 0) return;

    const interval = setInterval(async () => {
      const timedOut = await checkSessionTimeout();
      if (timedOut) {
        console.log('MedRecord: Inactivity timeout reached, locking screen...');
        setIsLocked(true);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [isSetup, user, isLocked, autoLockMinutes]);

  const updateAutoLockTimeout = async (minutes: number) => {
    await setAutoLockTimeoutMinutes(minutes);
    setAutoLockMinutesState(minutes);
    await updateLastActiveTime();
  };

  const loginUser = async (identifier: string, pin: string) => {
    try {
      const { loginExistingUser } = require('./auth');
      const { logAuditEvent } = require('./auditLogger');
      // STRICT AUTHENTICATION: Will throw if user does not exist or PIN does not match
      const profile = await loginExistingUser(identifier, pin);

      // Persist authenticated active session
      persistActiveSession(profile);

      setUser(profile);
      setIsSetup(true);
      setIsLocked(false);
      await updateLastActiveTime();

      // Journal d'audit : Connexion réussie
      logAuditEvent(
        'LOGIN_SUCCESS',
        'utilisateurs',
        profile.id,
        `Connexion réussie du Dr ${profile.prenom || ''} ${profile.nom || ''} (${profile.email})`,
        'SUCCESS',
        profile.id
      ).catch(() => {});

      return profile;
    } catch (error) {
      console.error('MedRecord: Failed login attempt:', error);
      throw error;
    }
  };

  const setupSecurity = async (pin: string, nom: string, prenom: string, email: string, telephone?: string | null) => {
    setLoading(true);
    try {
      const { logAuditEvent } = require('./auditLogger');
      const profile = await setupPIN(pin, nom, prenom, email, telephone || '+221 77 123 4567');
      persistActiveSession(profile);

      setUser(profile);
      setIsSetup(true);
      setIsLocked(false);
      await updateLastActiveTime();

      // Journal d'audit : Initialisation du cabinet
      logAuditEvent(
        'CABINET_SETUP',
        'utilisateurs',
        profile.id,
        `Création & activation du cabinet par le Dr ${profile.prenom || ''} ${profile.nom || ''}`,
        'SUCCESS',
        profile.id
      ).catch(() => {});

      return profile;
    } catch (error) {
      console.error('MedRecord: Failed to set up security:', error);
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
      } else if (user) {
        persistActiveSession(user);
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
      } else if (user) {
        persistActiveSession(user);
      }
      await updateLastActiveTime();
    }
    return success;
  };

  const lock = () => {
    setIsLocked(true);
  };

  const logout = async () => {
    try {
      const { logAuditEvent } = require('./auditLogger');
      if (user) {
        logAuditEvent(
          'LOGOUT',
          'utilisateurs',
          user.id,
          `Déconnexion du cabinet du Dr ${user.prenom || ''} ${user.nom || ''}`,
          'INFO',
          user.id
        ).catch(() => {});
      }
      purgeActiveSession();
      setUser(null);
      setIsSetup(false);
      setIsLocked(false);
    } catch (e) {
      console.error('Logout error:', e);
      setUser(null);
      setIsSetup(false);
      setIsLocked(false);
    }
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
