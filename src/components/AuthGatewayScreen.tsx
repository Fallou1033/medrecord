import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSecurity } from '../security/SecurityContext';
import SetupSecurityScreen from './SetupSecurityScreen';

interface OtpInputProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
}

function OtpPinInput({ label, value, onChange }: OtpInputProps) {
  const inputsRef = useRef<(TextInput | null)[]>([]);
  const digits = Array.from({ length: 4 }, (_, i) => value[i] || '');

  const handleChangeText = (text: string, index: number) => {
    const cleanDigit = text.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = cleanDigit;
    const combined = newDigits.join('');
    onChange(combined);

    if (cleanDigit && index < 3) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        inputsRef.current[index - 1]?.focus();
      }
    }
  };

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'center' }}>
        {[0, 1, 2, 3].map((idx) => {
          const isFilled = Boolean(digits[idx]);
          return (
            <TextInput
              key={idx}
              ref={(el) => { inputsRef.current[idx] = el; }}
              style={[
                styles.otpBox,
                isFilled && styles.otpBoxFilled,
              ]}
              value={digits[idx]}
              onChangeText={(txt) => handleChangeText(txt, idx)}
              onKeyPress={(e) => handleKeyPress(e, idx)}
              keyboardType="number-pad"
              maxLength={1}
              secureTextEntry
              selectTextOnFocus
            />
          );
        })}
      </View>
    </View>
  );
}

function CrossDeviceLoginView({ onSwitchToCreate }: { onSwitchToCreate: () => void }) {
  const { loginUser } = useSecurity();
  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState(0);

  // Real-time format validation
  const cleanId = identifier.trim().toLowerCase();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanId);
  const cleanPhone = identifier.trim().replace(/[\s\-\(\)\+]/g, '');
  const isPhone = /^[0-9]{8,15}$/.test(cleanPhone);
  const isHasInput = identifier.trim().length > 0;
  const isIdentifierValid = !isHasInput || isEmail || isPhone;

  // Lockout countdown timer
  React.useEffect(() => {
    if (lockoutTime <= 0) return;
    const interval = setInterval(() => {
      setLockoutTime((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setErrorMsg('');
          setFailedAttempts(0);
          return 0;
        }
        setErrorMsg(`Trop d'échecs consécutifs. Veuillez patienter ${prev - 1}s.`);
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutTime]);

  const showAlert = (title: string, message: string) => {
    setErrorMsg(message);
    if (Platform.OS === 'web') {
      // Inline red box is displayed, but show alert as fallback
    } else {
      Alert.alert(title, message);
    }
  };

  const handleLogin = async () => {
    if (lockoutTime > 0) return;
    setErrorMsg('');

    if (!isEmail && !isPhone) {
      setErrorMsg('Veuillez saisir une adresse e-mail ou un numéro de téléphone valide.');
      setPin('');
      return;
    }

    if (pin.length !== 4) {
      setErrorMsg('Le code PIN d\'accès doit comporter exactement 4 chiffres.');
      setPin('');
      return;
    }

    setLoading(true);
    try {
      await loginUser(identifier.trim(), pin);
      setFailedAttempts(0);
    } catch (err: any) {
      console.error(err);
      const nextFailed = failedAttempts + 1;
      setFailedAttempts(nextFailed);
      setPin(''); // Automatically clear PIN boxes on failure

      if (nextFailed >= 5) {
        setLockoutTime(30);
        setErrorMsg('Trop d\'échecs consécutifs (5/5). Compte bloqué pendant 30 secondes.');
      } else {
        setErrorMsg('Identifiant ou code PIN incorrect. Accès refusé.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={{ alignItems: 'center', marginBottom: 20 }}>
        <View style={styles.iconCircle}>
          <Ionicons name="key-outline" size={28} color="#28C2FF" />
        </View>
        <Text style={styles.title}>Connexion Nouvel Appareil</Text>
        <Text style={styles.subtitle}>
          Connectez-vous avec vos identifiants pour synchroniser immédiatement votre cabinet et retrouver tous vos dossiers patients.
        </Text>
      </View>

      {errorMsg !== '' && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={18} color="#FF6B6B" />
          <Text style={styles.errorBoxText}>{errorMsg}</Text>
        </View>
      )}

      {/* Saisie Identifiant (Email ou Téléphone) */}
      <View style={{ marginBottom: 16 }}>
        <Text style={styles.label}>Adresse Email ou Numéro de Téléphone *</Text>
        <TextInput
          style={[
            styles.input,
            !isIdentifierValid && { borderColor: '#FF6B6B', borderWidth: 2 }
          ]}
          placeholder="ex: dr.diop@cabinet.sn ou +221 77 123 45 67"
          value={identifier}
          onChangeText={(val) => {
            setIdentifier(val);
            if (errorMsg) setErrorMsg('');
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholderTextColor="#64748B"
        />
        {!isIdentifierValid && (
          <Text style={{ color: '#FF6B6B', fontSize: 12, marginTop: 4, fontWeight: 'bold' }}>
            ⚠️ Veuillez saisir une adresse e-mail ou un numéro de téléphone valide.
          </Text>
        )}
      </View>

      {/* Saisie Code PIN (OTP 4 cases) */}
      <OtpPinInput
        label="Code PIN d'Accès (4 chiffres) *"
        value={pin}
        onChange={setPin}
      />

      {/* Bouton de Connexion */}
      <TouchableOpacity
        style={[
          styles.button,
          (!isEmail && !isPhone || pin.length !== 4 || loading || lockoutTime > 0) && styles.buttonDisabled,
        ]}
        onPress={handleLogin}
        disabled={!isEmail && !isPhone || pin.length !== 4 || loading || lockoutTime > 0}
      >
        <Ionicons name="sync-outline" size={20} color={(isEmail || isPhone) && pin.length === 4 && lockoutTime === 0 ? "#0F172A" : "#64748B"} />
        <Text style={[styles.buttonText, (!isEmail && !isPhone || pin.length !== 4 || lockoutTime > 0) && styles.buttonTextDisabled]}>
          {loading
            ? 'Connexion & Synchronisation...'
            : lockoutTime > 0
            ? `Bloqué (${lockoutTime}s)`
            : 'Se connecter & Synchroniser mon Cabinet'}
        </Text>
      </TouchableOpacity>

      {/* Switcher vers Création */}
      <TouchableOpacity onPress={onSwitchToCreate} style={{ marginTop: 20, alignItems: 'center' }}>
        <Text style={{ color: '#28C2FF', fontSize: 13, fontWeight: '600' }}>
          Vous n'avez pas encore de cabinet ? <Text style={{ textDecorationLine: 'underline' }}>Créer mon cabinet</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function AuthGatewayScreen() {
  const [mode, setMode] = useState<'MODE_SELECTION' | 'CREATE_CABINET' | 'LOGIN_DEVICE'>('MODE_SELECTION');

  if (mode === 'CREATE_CABINET') {
    return (
      <View style={{ flex: 1, backgroundColor: '#0F172A' }}>
        <TouchableOpacity
          onPress={() => setMode('MODE_SELECTION')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingTop: 16, zIndex: 10 }}
        >
          <Ionicons name="arrow-back" size={20} color="#28C2FF" />
          <Text style={{ color: '#28C2FF', fontWeight: 'bold', fontSize: 14 }}>Retour au choix d'accueil</Text>
        </TouchableOpacity>
        <SetupSecurityScreen />
      </View>
    );
  }

  if (mode === 'LOGIN_DEVICE') {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <TouchableOpacity
            onPress={() => setMode('MODE_SELECTION')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }}
          >
            <Ionicons name="arrow-back" size={20} color="#28C2FF" />
            <Text style={{ color: '#28C2FF', fontWeight: 'bold', fontSize: 14 }}>Retour au choix d'accueil</Text>
          </TouchableOpacity>
          <CrossDeviceLoginView onSwitchToCreate={() => setMode('CREATE_CABINET')} />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.card}>
          {/* Logo & Welcome Header */}
          <View style={{ alignItems: 'center', marginBottom: 28 }}>
            <View style={styles.mainLogoCircle}>
              <Ionicons name="shield-checkmark" size={36} color="#28C2FF" />
            </View>
            <Text style={styles.mainTitle}>Bienvenue sur MedRecord</Text>
            <Text style={styles.mainSubtitle}>
              La solution médicale sécurisée pour la gestion de votre cabinet et des dossiers patients.
            </Text>
          </View>

          {/* Action 1 : Créer mon cabinet */}
          <TouchableOpacity
            style={styles.primaryActionButton}
            onPress={() => setMode('CREATE_CABINET')}
          >
            <View style={styles.actionIconCircle}>
              <Ionicons name="medical-outline" size={24} color="#0F172A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.primaryActionTitle}>Créer mon cabinet</Text>
              <Text style={styles.primaryActionSubtitle}>
                Première installation / Configuration initiale de votre profil médecin et code PIN.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#0F172A" />
          </TouchableOpacity>

          {/* Action 2 : Déjà inscrit ? Se connecter */}
          <TouchableOpacity
            style={styles.secondaryActionButton}
            onPress={() => setMode('LOGIN_DEVICE')}
          >
            <View style={styles.secondaryActionIconCircle}>
              <Ionicons name="phone-portrait-outline" size={24} color="#28C2FF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.secondaryActionTitle}>Déjà inscrit ? Se connecter</Text>
              <Text style={styles.secondaryActionSubtitle}>
                Accès depuis un nouvel ordinateur, tablette ou téléphone avec synchronisation cloud.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#28C2FF" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 10,
  },
  mainLogoCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(40, 194, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#28C2FF',
  },
  mainTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#28C2FF',
    textAlign: 'center',
    marginBottom: 8,
  },
  mainSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  primaryActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#28C2FF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  actionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15, 23, 42, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryActionTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  primaryActionSubtitle: {
    color: '#1E293B',
    fontSize: 12,
  },
  secondaryActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#0F2C3D',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#28C2FF',
  },
  secondaryActionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(40, 194, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryActionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  secondaryActionSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(40, 194, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#28C2FF',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    borderWidth: 1,
    borderColor: '#FF6B6B',
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
  },
  errorBoxText: {
    color: '#FF6B6B',
    fontSize: 12,
    fontWeight: 'bold',
    flex: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8AC8F9',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#0F2C3D',
    color: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  otpBox: {
    width: 48,
    height: 48,
    backgroundColor: '#1E293B',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#334155',
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  otpBoxFilled: {
    borderColor: '#28C2FF',
    backgroundColor: 'rgba(40, 194, 255, 0.1)',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#28C2FF',
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: '#334155',
    opacity: 0.6,
  },
  buttonText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: 'bold',
  },
  buttonTextDisabled: {
    color: '#64748B',
  },
});
