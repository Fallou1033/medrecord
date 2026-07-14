import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme as useRNColorScheme, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemePreferenceContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  resolvedTheme: 'light' | 'dark';
}

const ThemePreferenceContext = createContext<ThemePreferenceContextType | null>(null);

export const ThemePreferenceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemScheme = useRNColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    // Load theme from localStorage on Web, default to 'system'
    if (Platform.OS === 'web') {
      const savedMode = localStorage.getItem('theme_preference') as ThemeMode;
      if (savedMode) {
        setThemeModeState(savedMode);
      }
    } else {
      SecureStore.getItemAsync('theme_preference')
        .then((savedMode) => {
          if (savedMode) {
            setThemeModeState(savedMode as ThemeMode);
          }
        })
        .catch(() => {});
    }
  }, []);

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    if (Platform.OS === 'web') {
      localStorage.setItem('theme_preference', mode);
    } else {
      await SecureStore.setItemAsync('theme_preference', mode);
    }
  };

  const resolvedTheme = themeMode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : themeMode;

  return (
    <ThemePreferenceContext.Provider value={{ themeMode, setThemeMode, resolvedTheme }}>
      {children}
    </ThemePreferenceContext.Provider>
  );
};

export const useThemePreference = () => {
  const context = useContext(ThemePreferenceContext);
  if (!context) {
    throw new Error('useThemePreference must be used within a ThemePreferenceProvider');
  }
  return context;
};
