import React, { useState } from 'react';
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
import { useSecurity } from '../security/SecurityContext';
import { checkEmailExists } from '../security/auth';

export default function SetupSecurityScreen() {
  const { setupSecurity } = useSecurity();
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const validateEmailUniqueness = async (emailToTest: string) => {
    if (!emailToTest.trim()) {
      setEmailError('');
      return true;
    }
    const isTaken = await checkEmailExists(emailToTest.trim());
    if (isTaken) {
      setEmailError('Cette adresse email est déjà utilisée.');
      return false;
    } else {
      setEmailError('');
      return true;
    }
  };

  const showAlert = (title: string, message: string) => {
    setErrorMsg(message);
    if (Platform.OS === 'web') {
      alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleSetup = async () => {
    setErrorMsg('');
    if (!nom.trim() || !prenom.trim() || !email.trim() || !pin || !confirmPin) {
      showAlert('Champs requis', 'Veuillez remplir tous les champs obligatoires.');
      return;
    }

    const isEmailAvailable = await validateEmailUniqueness(email);
    if (!isEmailAvailable) {
      showAlert('Adresse email indisponible', 'Cette adresse email est déjà utilisée.');
      return;
    }

    if (pin.length !== 4 || isNaN(Number(pin))) {
      showAlert('Code PIN invalide', 'Le code PIN doit être composé exactement de 4 chiffres.');
      return;
    }

    if (pin !== confirmPin) {
      showAlert('Erreur de confirmation', 'Les deux codes PIN saisis ne correspondent pas.');
      return;
    }

    setLoading(true);
    try {
      const cleanNom = nom.trim().replace(/\b(dr|docteur)\.?\b/gi, '').replace(/\s+/g, ' ').trim();
      const cleanPrenom = prenom.trim().replace(/\b(dr|docteur)\.?\b/gi, '').replace(/\s+/g, ' ').trim();
      await setupSecurity(pin, cleanNom, cleanPrenom, email.trim());
    } catch (error: any) {
      console.error(error);
      showAlert('Erreur', error.message || "Impossible d'enregistrer le profil et le code PIN.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.card}>
          <Text style={styles.title}>Configuration Sécurisée</Text>
          <Text style={styles.subtitle}>
            Bienvenue sur MedRecord. Veuillez configurer votre profil médecin et votre code PIN d'accès.
          </Text>

          {errorMsg !== '' && (
            <View style={{ backgroundColor: '#FF6B6B22', borderWidth: 1, borderColor: '#FF6B6B', borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <Text style={{ color: '#FF6B6B', fontSize: 13, fontWeight: 'bold', textAlign: 'center' }}>
                ⚠️ {errorMsg}
              </Text>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Prénom</Text>
            <TextInput
              style={styles.input}
              placeholder="Prénom"
              value={prenom}
              onChangeText={setPrenom}
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nom de famille</Text>
            <TextInput
              style={styles.input}
              placeholder="Nom"
              value={nom}
              onChangeText={setNom}
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Adresse Email</Text>
            <TextInput
              style={[styles.input, emailError ? { borderColor: '#FF6B6B', borderWidth: 2 } : null]}
              placeholder="Email"
              value={email}
              onChangeText={(val) => {
                setEmail(val);
                if (emailError) setEmailError('');
              }}
              onBlur={() => validateEmailUniqueness(email)}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor="#9ca3af"
            />
            {!!emailError && (
              <Text style={{ color: '#FF6B6B', fontSize: 12, marginTop: 4, fontWeight: 'bold' }}>
                ⚠️ {emailError}
              </Text>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Code PIN (4 chiffres)</Text>
            <TextInput
              style={styles.input}
              placeholder="••••"
              value={pin}
              onChangeText={setPin}
              keyboardType="numeric"
              maxLength={4}
              secureTextEntry
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Confirmer le Code PIN</Text>
            <TextInput
              style={styles.input}
              placeholder="••••"
              value={confirmPin}
              onChangeText={setConfirmPin}
              keyboardType="numeric"
              maxLength={4}
              secureTextEntry
              placeholderTextColor="#9ca3af"
            />
          </View>

          <TouchableOpacity
            style={styles.button}
            onPress={handleSetup}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Configuration...' : 'Activer MedRecord'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F2C3D', // Sleek medical dark blue
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#1E3E52', // Accent dark background
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#28C2FF', // Electric blue accent
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#D1E6F3',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  inputGroup: {
    marginBottom: 16,
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
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2F5C77',
  },
  button: {
    backgroundColor: '#28C2FF',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: {
    color: '#0F2C3D',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
