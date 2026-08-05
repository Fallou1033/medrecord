import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { createPatient } from '../../database/SQLiteDatabaseManager';
import { useSecurity } from '../../security/SecurityContext';

export default function CreatePatientScreen() {
  const router = useRouter();
  const { user } = useSecurity();

  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [sexe, setSexe] = useState<'M' | 'F'>('M');
  const [dateNaissance, setDateNaissance] = useState(''); // Format: YYYY-MM-DD
  const [telephone, setTelephone] = useState('');
  const [adresse, setAdresse] = useState('');
  const [profession, setProfession] = useState('');
  const [personnePrevenir, setPersonnePrevenir] = useState('');
  const [groupeSanguin, setGroupeSanguin] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const showAlert = (title: string, message: string, buttons?: { text: string; onPress?: () => void }[]) => {
    if (Platform.OS === 'web') {
      alert(`${title}\n\n${message}`);
      if (buttons && buttons.length > 0 && buttons[0].onPress) {
        buttons[0].onPress();
      }
    } else {
      Alert.alert(title, message, buttons);
    }
  };

  const handleSubmit = async () => {
    if (!nom.trim() || !prenom.trim() || !dateNaissance.trim()) {
      showAlert('Champs requis', 'Veuillez saisir le nom, le prénom et la date de naissance.');
      return;
    }

    // Basic date validation (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateNaissance)) {
      showAlert('Date invalide', 'La date de naissance doit être au format AAAA-MM-JJ (ex: 1990-05-15).');
      return;
    }

    if (!user) {
      showAlert('Erreur', 'Session utilisateur non active.');
      return;
    }

    setLoading(true);
    try {
      await createPatient(
        {
          nom: nom.trim(),
          prenom: prenom.trim(),
          sexe,
          date_naissance: dateNaissance,
          telephone: telephone.trim() || null,
          adresse: adresse.trim() || null,
          profession: profession.trim() || null,
          personne_prevenir: personnePrevenir.trim() || null,
          groupe_sanguin: (groupeSanguin as any) || null,
          photo_url: null, // Photo profile optional in V1
        },
        user.id
      );

      showAlert('Succès', 'Le dossier patient a été créé avec succès.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('Failed to create patient:', error);
      showAlert('Erreur', "Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setLoading(false);
    }
  };

  const selectGender = (g: 'M' | 'F') => {
    setSexe(g);
  };

  const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.header}>
          <Link href="/patients" style={styles.backButton}>
            <View pointerEvents="none">
              <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            </View>
          </Link>
          <Text style={styles.title}>Nouveau Patient</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView contentContainerStyle={styles.formContainer}>
          <Text style={styles.sectionTitle}>Identité & État Civil</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nom de famille *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Diop"
              placeholderTextColor="#9ca3af"
              value={nom}
              onChangeText={setNom}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Prénom *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Ibrahima"
              placeholderTextColor="#9ca3af"
              value={prenom}
              onChangeText={setPrenom}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Sexe *</Text>
            <View style={styles.genderContainer}>
              <TouchableOpacity
                style={[styles.genderBtn, sexe === 'M' && styles.genderBtnActive]}
                onPress={() => selectGender('M')}
              >
                <Ionicons name="male" size={18} color={sexe === 'M' ? '#0F2C3D' : '#8AC8F9'} />
                <Text style={[styles.genderText, sexe === 'M' && styles.genderTextActive]}>Masculin</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.genderBtn, sexe === 'F' && styles.genderBtnActive]}
                onPress={() => selectGender('F')}
              >
                <Ionicons name="female" size={18} color={sexe === 'F' ? '#0F2C3D' : '#FFB2C9'} />
                <Text style={[styles.genderText, sexe === 'F' && styles.genderTextActive]}>Féminin</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Date de naissance (AAAA-MM-JJ) *</Text>
            <TextInput
              style={styles.input}
              placeholder="AAAA-MM-JJ"
              placeholderTextColor="#9ca3af"
              value={dateNaissance}
              onChangeText={setDateNaissance}
              keyboardType="numeric"
              maxLength={10}
            />
          </View>

          <Text style={styles.sectionTitle}>Coordonnées & Médical</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Téléphone</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: +221 77 123 45 67"
              placeholderTextColor="#9ca3af"
              value={telephone}
              onChangeText={setTelephone}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Adresse</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Dakar, Liberté 6"
              placeholderTextColor="#9ca3af"
              value={adresse}
              onChangeText={setAdresse}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Profession</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Enseignant"
              placeholderTextColor="#9ca3af"
              value={profession}
              onChangeText={setProfession}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Personne à prévenir (Nom & Téléphone)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Aminata Diop (Épouse) - 77 000 00 00"
              placeholderTextColor="#9ca3af"
              value={personnePrevenir}
              onChangeText={setPersonnePrevenir}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Groupe Sanguin</Text>
            <View style={styles.bloodContainer}>
              {bloodGroups.map((group) => (
                <TouchableOpacity
                  key={group}
                  style={[styles.bloodBtn, groupeSanguin === group && styles.bloodBtnActive]}
                  onPress={() => setGroupeSanguin(groupeSanguin === group ? null : group)}
                >
                  <Text style={[styles.bloodText, groupeSanguin === group && styles.bloodTextActive]}>
                    {group}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.submitButton, loading && styles.disabledButton]}
            onPress={handleSubmit}
            disabled={loading}
          >
            <Text style={styles.submitButtonText}>
              {loading ? 'Enregistrement...' : 'Créer le dossier patient'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F2C3D',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 80 : (Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 16),
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2F5C77',
    ...Platform.select({
      web: {
        backgroundColor: '#1E3E52',
      },
    }),
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  placeholder: {
    width: 24,
  },
  formContainer: {
    padding: 20,
    paddingBottom: 120,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#28C2FF',
    marginTop: 16,
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8AC8F9',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#1E3E52',
    color: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2F5C77',
  },
  genderContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  genderBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1E3E52',
    borderWidth: 1,
    borderColor: '#2F5C77',
    padding: 12,
    borderRadius: 10,
  },
  genderBtnActive: {
    backgroundColor: '#28C2FF',
    borderColor: '#28C2FF',
  },
  genderText: {
    color: '#8AC8F9',
    fontSize: 15,
    fontWeight: '600',
  },
  genderTextActive: {
    color: '#0F2C3D',
  },
  bloodContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bloodBtn: {
    width: '22%',
    aspectRatio: 1.5,
    backgroundColor: '#1E3E52',
    borderWidth: 1,
    borderColor: '#2F5C77',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bloodBtnActive: {
    backgroundColor: '#28C2FF',
    borderColor: '#28C2FF',
  },
  bloodText: {
    color: '#8AC8F9',
    fontSize: 14,
    fontWeight: 'bold',
  },
  bloodTextActive: {
    color: '#0F2C3D',
  },
  submitButton: {
    backgroundColor: '#28C2FF',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  submitButtonText: {
    color: '#0F2C3D',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabledButton: {
    opacity: 0.6,
  },
});
