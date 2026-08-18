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
  loading: boolean;
  loginUser: (identifier: string, pin: string) => Promise<any>;
  setupSecurity: (pin: string, nom: string, prenom: string, email: string, telephone?: string | null) => Promise<any>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  unlockWithBiometrics: () => Promise<boolean>;
  lock: () => void;
  logout: () => Promise<void>;
  toggleBiometrics: (enabled: boolean) => Promise<void>;
}

const SecurityContext = createContext<SecurityContextType | null>(null);

export const SecurityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSetup, setIsSetup] = useState<boolean>(() => {
    const isSessionActive = safeStorageGet(STORAGE_KEYS.SESSION_ACTIVE) === 'true';
    const activeUserId = safeStorageGet(STORAGE_KEYS.ACTIVE_USER_ID);
    return Boolean(isSessionActive && activeUserId);
  });

  const [user, setUser] = useState<UserProfile | null>(() => {
    const isSessionActive = safeStorageGet(STORAGE_KEYS.SESSION_ACTIVE) === 'true';
    if (!isSessionActive) return null;
    return (
      safeStorageGet<UserProfile>(STORAGE_KEYS.CURRENT_USER) ||
      safeStorageGet<UserProfile>(STORAGE_KEYS.DOCTOR_PROFILE) ||
      null
    );
  });

  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
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
        
        // Locked state
        setIsLocked(false);
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

  const loginUser = async (identifier: string, pin: string) => {
    try {
      const { loginExistingUser } = require('./auth');
      // STRICT AUTHENTICATION: Will throw if user does not exist or PIN does not match
      const profile = await loginExistingUser(identifier, pin);

      // Persist authenticated active session
      persistActiveSession(profile);

      setUser(profile);
      setIsSetup(true);
      setIsLocked(false);
      await updateLastActiveTime();
      return profile;
    } catch (error) {
      console.error('MedRecord: Failed login attempt:', error);
      throw error;
    }
  };

  const setupSecurity = async (pin: string, nom: string, prenom: string, email: string, telephone?: string | null) => {
    setLoading(true);
    try {
      const profile = await setupPIN(pin, nom, prenom, email, telephone || '+221 77 123 4567');
      persistActiveSession(profile);

      setUser(profile);
      setIsSetup(true);
      setIsLocked(false);
      await updateLastActiveTime();
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
      if (profile) setUser(profile);
    }
    return success;
  };

  const unlockWithBiometrics = async (): Promise<boolean> => {
    const success = await authenticateBiometric();
    if (success) {
      setIsLocked(false);
      const profile = await getActiveUserProfile();
      if (profile) setUser(profile);
    }
    return success;
  };

  const lock = () => {
    setIsLocked(true);
  };

  const logout = async () => {
    try {
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
        loading,
        loginUser,
        setupSecurity,
        unlockWithPin,
        unlockWithBiometrics,
        lock,
        logout,
        toggleBiometrics,
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
