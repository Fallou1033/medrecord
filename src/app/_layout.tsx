import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { useEffect } from 'react';

import { SecurityProvider, useSecurity } from '../security/SecurityContext';
import SetupSecurityScreen from '../components/SetupSecurityScreen';
import LockScreen from '../components/LockScreen';
import { initDatabase } from '../database/db';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { ThemePreferenceProvider, useThemePreference } from '../theme/ThemePreferenceContext';

SplashScreen.preventAutoHideAsync();

function MainAppContent() {
  const { isSetup, isLocked, loading } = useSecurity();

  // Initialize SQLite database on startup
  useEffect(() => {
    initDatabase().catch((err) => {
      console.error('MedRecord: Database initialization failed:', err);
    });
  }, []);

  if (loading) {
    return null;
  }

  if (!isSetup) {
    return <SetupSecurityScreen />;
  }

  if (isLocked) {
    return <LockScreen />;
  }

  return <AppTabs />;
}

function TabLayoutContent() {
  const { resolvedTheme } = useThemePreference();
  return (
    <ThemeProvider value={resolvedTheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SecurityProvider>
        <AnimatedSplashOverlay />
        <MainAppContent />
      </SecurityProvider>
    </ThemeProvider>
  );
}

export default function TabLayout() {
  return (
    <ThemePreferenceProvider>
      <TabLayoutContent />
    </ThemePreferenceProvider>
  );
}
