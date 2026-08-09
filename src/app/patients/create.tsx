import React, { useState, useEffect, useRef } from 'react';
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
import * as SecureStore from 'expo-secure-store';
import { createPatient } from '../../database/SQLiteDatabaseManager';
import { useSecurity } from '../../security/SecurityContext';
import DatePickerDOB from '../../components/DatePickerDOB';

const DRAFT_KEY = 'draft_new_patient';

async function savePatientDraft(draft: any) {
  try {
    const hasData = Object.values(draft).some(val => typeof val === 'string' && val.trim().length > 0);
    if (!hasData) {
      await clearPatientDraft();
      return;
    }
    const jsonStr = JSON.stringify(draft);
    if (Platform.OS === 'web') {
      localStorage.setItem(DRAFT_KEY, jsonStr);
    } else {
      await SecureStore.setItemAsync(DRAFT_KEY, jsonStr);
    }
  } catch (e) {
    console.warn('Failed to save patient draft', e);
  }
}

async function loadPatientDraft() {
  try {
    let jsonStr: string | null = null;
    if (Platform.OS === 'web') {
      jsonStr = localStorage.getItem(DRAFT_KEY);
    } else {
      jsonStr = await SecureStore.getItemAsync(DRAFT_KEY);
    }
    return jsonStr ? JSON.parse(jsonStr) : null;
  } catch (e) {
    return null;
  }
}

async function clearPatientDraft() {
  try {
    if (Platform.OS === 'web') {
      localStorage.removeItem(DRAFT_KEY);
    } else {
      await SecureStore.deleteItemAsync(DRAFT_KEY);
    }
  } catch (e) {
    console.warn('Failed to clear patient draft', e);
  }
}

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
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);

  const isInitialMount = useRef(true);

  // Restore draft on initial load
  useEffect(() => {
    (async () => {
      const draft = await loadPatientDraft();
      if (draft) {
        if (draft.nom) setNom(draft.nom);
        if (draft.prenom) setPrenom(draft.prenom);
        if (draft.sexe) setSexe(draft.sexe);
        if (draft.dateNaissance) setDateNaissance(draft.dateNaissance);
        if (draft.telephone) setTelephone(draft.telephone);
        if (draft.adresse) setAdresse(draft.adresse);
        if (draft.profession) setProfession(draft.profession);
        if (draft.personnePrevenir) setPersonnePrevenir(draft.personnePrevenir);
        if (draft.groupeSanguin) setGroupeSanguin(draft.groupeSanguin);

        const hasAnyContent = Boolean(
          (draft.nom && draft.nom.trim()) ||
          (draft.prenom && draft.prenom.trim()) ||
          (draft.dateNaissance && draft.dateNaissance.trim()) ||
          (draft.telephone && draft.telephone.trim())
        );

        if (hasAnyContent) {
          setHasRestoredDraft(true);
        }
      }
    })();
  }, []);

  // Save draft on change (after initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    savePatientDraft({
      nom,
      prenom,
      sexe,
      dateNaissance,
      telephone,
      adresse,
      profession,
      personnePrevenir,
      groupeSanguin,
    });
  }, [nom, prenom, sexe, dateNaissance, telephone, adresse, profession, personnePrevenir, groupeSanguin]);

  const handleResetForm = async () => {
    setNom('');
    setPrenom('');
    setSexe('M');
    setDateNaissance('');
    setTelephone('');
    setAdresse('');
    setProfession('');
    setPersonnePrevenir('');
    setGroupeSanguin(null);
    setHasRestoredDraft(false);
    await clearPatientDraft();
  };

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
    if (!nom.trim() || !prenom.trim()) {
      showAlert('Champs requis', 'Veuillez au moins saisir le nom de famille et le prénom.');
      return;
    }

    // Optional date validation (YYYY-MM-DD) if filled
    if (dateNaissance.trim()) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dateNaissance.trim())) {
        showAlert('Date invalide', 'La date de naissance doit être au format AAAA-MM-JJ (ex: 1990-05-15).');
        return;
      }
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
          date_naissance: dateNaissance.trim() || null,
          telephone: telephone.trim() || null,
          adresse: adresse.trim() || null,
          profession: profession.trim() || null,
          personne_prevenir: personnePrevenir.trim() || null,
          groupe_sanguin: (groupeSanguin as any) || null,
          photo_url: null, // Photo profile optional in V1
        },
        user.id
      );

      // Clear draft on successful creation
      await clearPatientDraft();
      setHasRestoredDraft(false);

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
          <TouchableOpacity onPress={handleResetForm} style={styles.headerResetBtn} accessibilityLabel="Réinitialiser">
            <Ionicons name="trash-outline" size={20} color="#FF6B6B" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.formContainer}>
          {hasRestoredDraft && (
            <View style={styles.draftBanner}>
              <Ionicons name="bookmark" size={18} color="#28C2FF" />
              <Text style={styles.draftBannerText}>
                Saisie conservée : Brouillon restauré automatiquement.
              </Text>
              <TouchableOpacity onPress={handleResetForm} style={styles.draftResetBtn}>
                <Text style={styles.draftResetText}>Effacer</Text>
              </TouchableOpacity>
            </View>
          )}

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

          <DatePickerDOB
            value={dateNaissance}
            onChange={setDateNaissance}
            label="Date de naissance (facultatif)"
          />

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
  headerResetBtn: {
    padding: 8,
    borderRadius: 8,
  },
  formContainer: {
    padding: 20,
    paddingBottom: 120,
  },
  draftBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E3E52',
    borderColor: '#28C2FF',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  draftBannerText: {
    flex: 1,
    color: '#D1E6F3',
    fontSize: 13,
    fontWeight: '500',
  },
  draftResetBtn: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  draftResetText: {
    color: '#0F2C3D',
    fontSize: 12,
    fontWeight: 'bold',
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
  dateInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E3E52',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2F5C77',
    paddingRight: 12,
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
