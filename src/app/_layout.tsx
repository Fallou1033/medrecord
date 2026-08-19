import React, { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { AppState, AppStateStatus, Platform, View, Text, TouchableOpacity } from 'react-native';
import { useFonts } from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';

import { SecurityProvider, useSecurity } from '../security/SecurityContext';
import AuthGatewayScreen, { WelcomeGateway, CrossDeviceLoginView } from '../components/AuthGatewayScreen';
import SetupSecurityScreen from '../components/SetupSecurityScreen';
import LockScreen from '../components/LockScreen';
import { initDatabase } from '../database/db';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { ThemePreferenceProvider, useThemePreference } from '../theme/ThemePreferenceContext';
import { getGoogleToken, backupDatabaseToDrive } from '../services/googleDriveService';
import { STORAGE_KEYS, safeStorageGet, persistActiveSession } from '../utils/storage';
import { AppView } from '../types';

if (Platform.OS !== 'web') {
  SplashScreen.preventAutoHideAsync().catch(() => {});
}

function MainAppContent() {
  const { user, isSetup, isLocked, loading, logout } = useSecurity();

  const [activeView, setActiveView] = React.useState<AppView>(() => {
    const isSessionActive = safeStorageGet(STORAGE_KEYS.SESSION_ACTIVE) === 'true';
    const hasCurrentUser = Boolean(safeStorageGet(STORAGE_KEYS.CURRENT_USER));
    return isSessionActive && hasCurrentUser ? 'dashboard' : 'welcome';
  });

  const [currentDoctor, setCurrentDoctor] = React.useState<any>(() => {
    const isSessionActive = safeStorageGet(STORAGE_KEYS.SESSION_ACTIVE) === 'true';
    if (!isSessionActive) return null;
    return safeStorageGet(STORAGE_KEYS.CURRENT_USER) || user;
  });

  // Sync state when security context finishes loading or when user logs out
  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync().catch(() => {});
      const isSessionActive = Boolean(user && safeStorageGet(STORAGE_KEYS.SESSION_ACTIVE) === 'true');
      if (isSessionActive) {
        setActiveView('dashboard');
      } else {
        // Only reset to welcome if previously on dashboard (i.e. user explicitly logged out)
        setActiveView((prev) => (prev === 'dashboard' ? 'welcome' : prev));
      }
    }
  }, [loading, user]);

  const handleLoginSuccess = (doctorData: any) => {
    persistActiveSession(doctorData);
    setCurrentDoctor(doctorData);
    setActiveView('dashboard');
  };

  // Load Ionicons font for Expo Web
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  // Inject Ionicons CSS font-face into Web DOM safely
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const styleId = 'expo-vector-icons-ionicons';
      if (!document.getElementById(styleId)) {
        try {
          const fontAsset = require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf');
          const fontUrl = typeof fontAsset === 'string' ? fontAsset : (fontAsset?.default || fontAsset?.uri || fontAsset);
          if (fontUrl && typeof fontUrl === 'string') {
            const iconFontStyles = `@font-face {
              font-family: 'Ionicons';
              src: url('${fontUrl}') format('truetype');
            }`;
            const style = document.createElement('style');
            style.id = styleId;
            style.type = 'text/css';
            style.appendChild(document.createTextNode(iconFontStyles));
            document.head.appendChild(style);
          }
        } catch (e) {
          console.warn('MedRecord Web: Could not inject Ionicons font CSS:', e);
        }
      }
    }
  }, []);

  // Initialize SQLite database & Setup Auto-Backup
  useEffect(() => {
    initDatabase().catch((err) => {
      console.error('MedRecord: Database initialization failed:', err);
    });

    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background') {
        try {
          const token = await getGoogleToken();
          if (token) {
            await backupDatabaseToDrive();
          }
        } catch (error) {
          console.warn('MedRecord Auto-Backup: Background sync failed:', error);
        }
      }
    };
    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    const intervalId = setInterval(async () => {
      try {
        const token = await getGoogleToken();
        if (token) {
          await backupDatabaseToDrive();
        }
      } catch (error) {
        console.warn('MedRecord Auto-Backup: Periodic background sync failed:', error);
      }
    }, 5 * 60 * 1000);

    return () => {
      appStateSub.remove();
      clearInterval(intervalId);
    };
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0F2C3D', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#28C2FF', fontSize: 20, fontWeight: 'bold' }}>MedRecord</Text>
      </View>
    );
  }

  // Calcul direct et fiable de l'état d'authentification
  const isSessionActive = Boolean(
    user && safeStorageGet(STORAGE_KEYS.SESSION_ACTIVE) === 'true'
  );

  // 1. Si une session praticien est active :
  if (isSessionActive) {
    if (isLocked) {
      return <LockScreen />;
    }
    return <AppTabs />;
  }

  // 2. Si aucune session active (déconnecté ou première installation) :
  switch (activeView) {
    case 'login':
      return (
        <View style={{ flex: 1, backgroundColor: '#0F172A' }}>
          <TouchableOpacity
            onPress={() => setActiveView('welcome')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingTop: 16, zIndex: 10 }}
          >
            <Ionicons name="arrow-back" size={20} color="#28C2FF" />
            <Text style={{ color: '#28C2FF', fontWeight: 'bold', fontSize: 14 }}>Retour au choix d'accueil</Text>
          </TouchableOpacity>
          <CrossDeviceLoginView
            onSuccess={handleLoginSuccess}
            onSwitchToCreate={() => setActiveView('setup')}
          />
        </View>
      );
    case 'setup':
      return (
        <View style={{ flex: 1, backgroundColor: '#0F172A' }}>
          <TouchableOpacity
            onPress={() => setActiveView('welcome')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingTop: 16, zIndex: 10 }}
          >
            <Ionicons name="arrow-back" size={20} color="#28C2FF" />
            <Text style={{ color: '#28C2FF', fontWeight: 'bold', fontSize: 14 }}>Retour au choix d'accueil</Text>
          </TouchableOpacity>
          <SetupSecurityScreen
            onSetupSuccess={handleLoginSuccess}
          />
        </View>
      );
    default:
      return (
        <WelcomeGateway
          onNewDoctor={() => setActiveView('setup')}
          onExistingDoctor={() => setActiveView('login')}
        />
      );
  }
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

class WebErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('MedRecord App Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#0F2C3D', justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 }}>
          <Text style={{ color: '#28C2FF', fontSize: 26, fontWeight: 'bold' }}>MedRecord</Text>
          <Text style={{ color: '#FFFFFF', fontSize: 15, textAlign: 'center' }}>
            Accès rétabli — Cliquez sur Recharger pour relancer l'application.
          </Text>
          {this.state.error?.message && (
            <Text style={{ color: '#8AC8F9', fontSize: 11, textAlign: 'center', backgroundColor: '#1E3E52', padding: 8, borderRadius: 6, maxWidth: '90%' }}>
              Erreur : {String(this.state.error.message)}
            </Text>
          )}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <TouchableOpacity
              style={{ backgroundColor: '#28C2FF', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10 }}
              onPress={() => {
                this.setState({ hasError: false, error: null });
                if (typeof window !== 'undefined') {
                  window.location.reload();
                }
              }}
            >
              <Text style={{ color: '#0F2C3D', fontWeight: 'bold' }}>Recharger l'application</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ backgroundColor: '#FF6B6B', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10 }}
              onPress={() => {
                if (typeof window !== 'undefined' && window.localStorage) {
                  try {
                    window.localStorage.clear();
                  } catch (e) {}
                  window.location.reload();
                }
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>Purger Cache & Données</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

export default function TabLayout() {
  return (
    <WebErrorBoundary>
      <ThemePreferenceProvider>
        <TabLayoutContent />
      </ThemePreferenceProvider>
    </WebErrorBoundary>
  );
}
