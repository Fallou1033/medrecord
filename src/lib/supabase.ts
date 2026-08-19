import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://sjjtixlgmuxycqvgbivp.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_CjCXrPrCSKbiGlDDRlURGA_CLIoriAA';

/**
 * Adaptateur de stockage cross-platform pour persister les sessions Supabase (JWT)
 * de manière sécurisée aussi bien sur le Web que sur mobile.
 */
const customStorageAdapter = {
  getItem: (key: string): string | null => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        return localStorage.getItem(key);
      }
      return null;
    }
    try {
      const SecureStore = require('expo-secure-store');
      return SecureStore.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(key, value);
      }
      return;
    }
    try {
      const SecureStore = require('expo-secure-store');
      SecureStore.setItem(key, value);
    } catch {}
  },
  removeItem: (key: string): void => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem(key);
      }
      return;
    }
    try {
      const SecureStore = require('expo-secure-store');
      SecureStore.deleteItemAsync(key);
    } catch {}
  },
};

/**
 * Client Supabase Singleton avec gestion sécurisée des sessions JWT
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: customStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export default supabase;
