import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import CryptoJS from 'crypto-js';
import { Platform } from 'react-native';

const KEY_STORAGE_KEY = 'medrecord_aes_key';
const IV_STORAGE_KEY = 'medrecord_aes_iv';

let cachedKeyHex: string | null = null;
let cachedIvHex: string | null = null;

// Helpers pour compatibilité Web (localStorage à la place de expo-secure-store)
const secureStoreGetItem = async (key: string): Promise<string | null> => {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' ? localStorage.getItem(key) : null;
  }
  try {
    return await SecureStore.getItemAsync(key);
  } catch (e) {
    return typeof window !== 'undefined' ? localStorage.getItem(key) : null;
  }
};

const secureStoreSetItem = async (key: string, value: string): Promise<void> => {
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

/**
 * Convert a Uint8Array to a Hex string.
 */
function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Initializes the AES encryption Key and IV if they do not exist.
 * Stores them in secure store (or localStorage on Web).
 */
export async function initEncryptionKey(): Promise<{ keyHex: string; ivHex: string }> {
  if (cachedKeyHex && cachedIvHex) {
    return { keyHex: cachedKeyHex, ivHex: cachedIvHex };
  }

  try {
    let keyHex = await secureStoreGetItem(KEY_STORAGE_KEY);
    let ivHex = await secureStoreGetItem(IV_STORAGE_KEY);

    if (!keyHex || !ivHex) {
      console.log('MedRecord: Generating new encryption key and IV...');
      
      // Generate 256-bit key (32 bytes)
      let keyBytes;
      try {
        keyBytes = Crypto.getRandomBytes(32);
      } catch (e) {
        keyBytes = new Uint8Array(32);
        if (typeof window !== 'undefined' && window.crypto) {
          window.crypto.getRandomValues(keyBytes);
        } else {
          for (let i = 0; i < 32; i++) {
            keyBytes[i] = Math.floor(Math.random() * 256);
          }
        }
      }
      keyHex = uint8ArrayToHex(keyBytes);

      // Generate 128-bit IV (16 bytes)
      let ivBytes;
      try {
        ivBytes = Crypto.getRandomBytes(16);
      } catch (e) {
        ivBytes = new Uint8Array(16);
        if (typeof window !== 'undefined' && window.crypto) {
          window.crypto.getRandomValues(ivBytes);
        } else {
          for (let i = 0; i < 16; i++) {
            ivBytes[i] = Math.floor(Math.random() * 256);
          }
        }
      }
      ivHex = uint8ArrayToHex(ivBytes);

      await secureStoreSetItem(KEY_STORAGE_KEY, keyHex);
      await secureStoreSetItem(IV_STORAGE_KEY, ivHex);
    }

    cachedKeyHex = keyHex;
    cachedIvHex = ivHex;

    return { keyHex, ivHex };
  } catch (error) {
    console.error('MedRecord: Failed to initialize encryption keys:', error);
    throw new Error('Encryption initialization failed. Secure store is inaccessible.');
  }
}

/**
 * Encrypts a plain text string using AES-256 in CBC mode.
 * Returns the ciphertext as a base64 encoded string.
 */
export async function encryptData(text: string | null | undefined): Promise<string | null> {
  if (text === null || text === undefined) return null;
  if (text === '') return '';

  const { keyHex, ivHex } = await initEncryptionKey();

  const key = CryptoJS.enc.Hex.parse(keyHex);
  const iv = CryptoJS.enc.Hex.parse(ivHex);

  const encrypted = CryptoJS.AES.encrypt(text, key, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return encrypted.toString(); // Output is Base64 encoded string
}

/**
 * Decrypts a base64 encoded ciphertext string using AES-256 in CBC mode.
 * Returns the decrypted plain text.
 */
export async function decryptData(ciphertext: string | null | undefined): Promise<string | null> {
  if (ciphertext === null || ciphertext === undefined) return null;
  if (ciphertext === '') return '';

  try {
    const { keyHex, ivHex } = await initEncryptionKey();

    const key = CryptoJS.enc.Hex.parse(keyHex);
    const iv = CryptoJS.enc.Hex.parse(ivHex);

    const decrypted = CryptoJS.AES.decrypt(ciphertext, key, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
    if (!decryptedText && ciphertext) {
      // In case decryption yields empty string but input wasn't empty, it might be unencrypted legacy data
      return ciphertext;
    }
    return decryptedText;
  } catch (error) {
    console.error('MedRecord: Decryption failed, returning ciphertext as fallback:', error);
    return ciphertext; // Fallback to raw ciphertext if decryption fails
  }
}

/**
 * Utility to clear cached keys from memory.
 * Useful during logout or lock events.
 */
export function clearKeyCache(): void {
  cachedKeyHex = null;
  cachedIvHex = null;
}
