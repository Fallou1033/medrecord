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

export default function SetupSecurityScreen() {
  const { setupSecurity } = useSecurity();
  const [nom, setNom] = useState('Diop');
  const [prenom, setPrenom] = useState('Mohamadou Bamba');
  const [email, setEmail] = useState('bamba.diop@medrecord.sn');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSetup = async () => {
    if (!nom || !prenom || !email || !pin || !confirmPin) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs.');
      return;
    }

    if (pin.length !== 4 || isNaN(Number(pin))) {
      Alert.alert('Erreur', 'Le code PIN doit être composé de 4 chiffres.');
      return;
    }

    if (pin !== confirmPin) {
      Alert.alert('Erreur', 'Les codes PIN ne correspondent pas.');
      return;
    }

    setLoading(true);
    try {
      // Prepend Dr if not present
      const formattedNom = nom.startsWith('Dr ') ? nom : `Dr ${nom}`;
      await setupSecurity(pin, formattedNom, prenom, email);
    } catch (error) {
      Alert.alert('Erreur', "Impossible d'enregistrer le code PIN.");
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
              style={styles.input}
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor="#9ca3af"
            />
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
