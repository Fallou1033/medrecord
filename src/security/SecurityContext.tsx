import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
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

interface SecurityContextType {
  isLocked: boolean;
  isSetup: boolean;
  user: UserProfile | null;
  biometricsEnabled: boolean;
  loading: boolean;
  setupSecurity: (pin: string, nom: string, prenom: string, email: string, telephone?: string | null) => Promise<void>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  unlockWithBiometrics: () => Promise<boolean>;
  lock: () => void;
  toggleBiometrics: (enabled: boolean) => Promise<void>;
}

const SecurityContext = createContext<SecurityContextType | null>(null);

export const SecurityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLocked, setIsLocked] = useState(true);
  const [isSetup, setIsSetup] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  // Initialize security state
  const initializeSecurity = async () => {
    try {
      const pinConfigured = await isPinSetup();
      setIsSetup(pinConfigured);

      if (pinConfigured) {
        const profile = await getActiveUserProfile();
        setUser(profile);
        const bioEnabled = await isBiometricEnabled();
        setBiometricsEnabled(bioEnabled);
        
        // Always lock on fresh app start
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

  const setupSecurity = async (pin: string, nom: string, prenom: string, email: string, telephone?: string | null) => {
    setLoading(true);
    try {
      const profile = await setupPIN(pin, nom, prenom, email, telephone || '+221 77 123 4567');
      setUser(profile);
      setIsSetup(true);
      setIsLocked(false);
      await updateLastActiveTime();
    } catch (error) {
      console.error('MedRecord: Failed to save PIN setup:', error);
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
      setUser(profile);
    }
    return success;
  };

  const unlockWithBiometrics = async (): Promise<boolean> => {
    const success = await authenticateBiometric();
    if (success) {
      setIsLocked(false);
      const profile = await getActiveUserProfile();
      setUser(profile);
    }
    return success;
  };

  const lock = () => {
    setIsLocked(true);
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
        setupSecurity,
        unlockWithPin,
        unlockWithBiometrics,
        lock,
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
