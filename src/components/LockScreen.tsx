import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Vibration,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSecurity } from '../security/SecurityContext';

export default function LockScreen() {
  const { user, biometricsEnabled, unlockWithPin, unlockWithBiometrics, logout } = useSecurity();
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState(0);

  // Automatically trigger biometrics on mount if enabled
  useEffect(() => {
    if (biometricsEnabled && lockoutTime === 0) {
      handleBiometricUnlock();
    }
  }, [biometricsEnabled, lockoutTime]);

  // Gère le compte à rebours de blocage de sécurité (30s)
  useEffect(() => {
    if (lockoutTime <= 0) return;
    const interval = setInterval(() => {
      setLockoutTime((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setErrorMsg('');
          setFailedAttempts(0);
          return 0;
        }
        setErrorMsg(`Trop d'échecs. Réessayez dans ${prev - 1}s.`);
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutTime]);

  const handleKeyPress = (val: string) => {
    if (lockoutTime > 0) return;
    setErrorMsg('');
    if (pin.length < 4) {
      const newPin = pin + val;
      setPin(newPin);

      if (newPin.length === 4) {
        // Delay slightly to let the last dot highlight
        setTimeout(() => {
          verifyPinAttempt(newPin);
        }, 100);
      }
    }
  };

  const handleBackspace = () => {
    if (lockoutTime > 0) return;
    setErrorMsg('');
    if (pin.length > 0) {
      setPin(pin.slice(0, -1));
    }
  };

  const verifyPinAttempt = async (attempt: string) => {
    if (lockoutTime > 0) return;
    const success = await unlockWithPin(attempt);
    if (success) {
      setFailedAttempts(0);
    } else {
      Vibration.vibrate(300);
      setPin('');
      const nextFailed = failedAttempts + 1;
      setFailedAttempts(nextFailed);

      if (nextFailed >= 5) {
        setLockoutTime(30);
        setErrorMsg("Trop d'échecs. Réessayez dans 30s.");
      } else {
        setErrorMsg(`Code PIN incorrect. ${5 - nextFailed} tentatives restantes.`);
      }
    }
  };

  const handleBiometricUnlock = async () => {
    if (lockoutTime > 0) return;
    setErrorMsg('');
    try {
      const success = await unlockWithBiometrics();
      if (!success) {
        console.log('MedRecord: Biometric authentication canceled or failed.');
      }
    } catch (err) {
      console.error('MedRecord: Biometrics error:', err);
    }
  };

  const renderDot = (index: number) => {
    const isActive = pin.length > index;
    return <View key={index} style={[styles.dot, isActive && styles.dotActive]} />;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="lock-closed" size={48} color="#28C2FF" />
        <Text style={styles.title}>MedRecord</Text>
        <Text style={styles.doctorName}>
          {user ? `${user.prenom} ${user.nom}` : 'Dossier Médical Numérique'}
        </Text>
        <Text style={styles.subtitle}>Saisissez votre code PIN d'accès</Text>
      </View>

      <View style={styles.dotsContainer}>
        {[0, 1, 2, 3].map((i) => renderDot(i))}
      </View>

      {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : <View style={styles.errorPlaceholder} />}

      <View style={styles.keyboard}>
        <View style={styles.row}>
          {['1', '2', '3'].map((num) => (
            <TouchableOpacity key={num} style={styles.key} onPress={() => handleKeyPress(num)}>
              <Text style={styles.keyText}>{num}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.row}>
          {['4', '5', '6'].map((num) => (
            <TouchableOpacity key={num} style={styles.key} onPress={() => handleKeyPress(num)}>
              <Text style={styles.keyText}>{num}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.row}>
          {['7', '8', '9'].map((num) => (
            <TouchableOpacity key={num} style={styles.key} onPress={() => handleKeyPress(num)}>
              <Text style={styles.keyText}>{num}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.row}>
          {/* Biometrics Key */}
          {biometricsEnabled ? (
            <TouchableOpacity style={styles.key} onPress={handleBiometricUnlock}>
              <Ionicons name="finger-print" size={28} color="#28C2FF" />
            </TouchableOpacity>
          ) : (
            <View style={[styles.key, styles.emptyKey]} />
          )}

          {/* Zero Key */}
          <TouchableOpacity style={styles.key} onPress={() => handleKeyPress('0')}>
            <Text style={styles.keyText}>0</Text>
          </TouchableOpacity>

          {/* Backspace Key */}
          <TouchableOpacity style={styles.key} onPress={handleBackspace}>
            <Ionicons name="backspace-outline" size={28} color="#D1E6F3" />
          </TouchableOpacity>
        </View>

        {/* Option Déconnexion / Changer de cabinet */}
        <TouchableOpacity
          onPress={() => {
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              if (window.confirm("Voulez-vous vous déconnecter de votre cabinet ?")) {
                localStorage.removeItem('medrecord_session_active');
                localStorage.removeItem('medrecord_current_user');
                localStorage.removeItem('medrecord_doctor');
                localStorage.removeItem('medrecord_auth_token');
                localStorage.removeItem('medrecord_active_user_id');
                if (typeof sessionStorage !== 'undefined') {
                  sessionStorage.clear();
                }
                try { logout(); } catch (e) {}
                window.location.href = window.location.origin + window.location.pathname;
              }
            } else {
              logout();
            }
          }}
          style={{ marginTop: 24, paddingVertical: 8, alignItems: 'center' }}
        >
          <Text style={{ color: '#FF6B6B', fontSize: 13, fontWeight: 'bold' }}>
            🚪 Changer de compte / Se déconnecter
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F2C3D', // Deep medical blue background
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    marginTop: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 12,
  },
  doctorName: {
    fontSize: 18,
    color: '#8AC8F9',
    marginTop: 6,
    fontWeight: '500',
  },
  subtitle: {
    fontSize: 14,
    color: '#D1E6F3',
    marginTop: 12,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
    marginVertical: 24,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#2F5C77',
    backgroundColor: 'transparent',
  },
  dotActive: {
    backgroundColor: '#28C2FF',
    borderColor: '#28C2FF',
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
    fontWeight: '600',
    height: 20,
  },
  errorPlaceholder: {
    height: 20,
  },
  keyboard: {
    width: '80%',
    maxWidth: 320,
    gap: 16,
    marginBottom: 40,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  key: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: '#1E3E52',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 4,
  },
  emptyKey: {
    backgroundColor: 'transparent',
    elevation: 0,
    shadowOpacity: 0,
  },
  keyText: {
    fontSize: 26,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
