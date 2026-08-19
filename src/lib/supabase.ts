import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://sjjtixlgmuxycqvgbivp.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_CjCXrPrCSKbiGlDDRlURGA_CLIoriAA';

/**
 * Adaptateur de stockage cross-platform pour persister les sessions Supabase (JWT)
 * de manière sécurisée aussi bien sur le Web (localStorage standard) que sur mobile (expo-secure-store).
 */
const customStorageAdapter = {
  getItem: (key: string): string | null | Promise<string | null> => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
    if (Platform.OS !== 'web') {
      try {
        const SecureStore = require('expo-secure-store');
        return SecureStore.getItemAsync(key);
      } catch {
        return null;
      }
    }
    return null;
  },
  setItem: (key: string, value: string): void | Promise<void> => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
      return;
    }
    if (Platform.OS !== 'web') {
      try {
        const SecureStore = require('expo-secure-store');
        return SecureStore.setItemAsync(key, value);
      } catch {}
    }
  },
  removeItem: (key: string): void | Promise<void> => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
      return;
    }
    if (Platform.OS !== 'web') {
      try {
        const SecureStore = require('expo-secure-store');
        return SecureStore.deleteItemAsync(key);
      } catch {}
    }
  },
};

/**
 * Client Supabase Singleton avec persistance automatique et rafraîchissement des tokens
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: customStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

export default supabase;
