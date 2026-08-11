import React, { useState, useEffect } from 'react';
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
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter, Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { createConsultation, getPatientById, Patient } from '../../database/SQLiteDatabaseManager';
import { calculateIMC } from '../../utils/helpers';
import { useSecurity } from '../../security/SecurityContext';
import DatePickerDOB from '../../components/DatePickerDOB';

export default function CreateConsultationScreen() {
  const router = useRouter();
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const { user } = useSecurity();

  console.log("MedRecord Debug: CreateConsultationScreen render", { patientId, user });

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

  const [patient, setPatient] = useState<Patient | null>(null);
  const [loadingPatient, setLoadingPatient] = useState(true);

  // Vitals State
  const [temperature, setTemperature] = useState('');
  const [tension, setTension] = useState('');
  const [pulsations, setPulsations] = useState('');
  const [saturation, setSaturation] = useState('');
  const [glycemie, setGlycemie] = useState('');
  const [poids, setPoids] = useState('');
  const [taille, setTaille] = useState('');
  const [imc, setImc] = useState<number | null>(null);

  // Clinical Details State
  const [motif, setMotif] = useState('');
  const [histoire, setHistoire] = useState('');
  const [examenClinique, setExamenClinique] = useState('');
  const [diagnostic, setDiagnostic] = useState('');
  const [traitement, setTraitement] = useState('');
  const [conseils, setConseils] = useState('');
  const [dateControle, setDateControle] = useState(''); // Format: YYYY-MM-DD
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (patientId) {
      loadPatient();
    }
  }, [patientId]);

  // Calculate IMC in real-time when weight or height changes
  useEffect(() => {
    const w = parseFloat(poids);
    const h = parseFloat(taille);
    if (!isNaN(w) && !isNaN(h) && h > 0) {
      const calculated = calculateIMC(w, h);
      setImc(calculated);
    } else {
      setImc(null);
    }
  }, [poids, taille]);

  const loadPatient = async () => {
    setLoadingPatient(true);
    try {
      const p = await getPatientById(patientId);
      if (!p) {
        showAlert('Erreur', 'Patient non trouvé');
        router.back();
        return;
      }
      setPatient(p);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPatient(false);
    }
  };



  const handleSubmit = async () => {
    if (!motif.trim() || !diagnostic.trim()) {
      showAlert('Champs requis', 'Veuillez renseigner au moins le motif et le diagnostic.');
      return;
    }

    if (!user) {
      showAlert('Erreur', 'Session utilisateur non active.');
      return;
    }

    // Validate control date if set
    if (dateControle.trim()) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dateControle)) {
        showAlert('Date invalide', 'La date de contrôle doit être au format AAAA-MM-JJ.');
        return;
      }
    }

    setLoading(true);
    try {
      // Build vitals structure
      const hasVitals = temperature || tension || pulsations || saturation || glycemie || poids || taille;
      const constantesDetails = hasVitals
        ? {
            temperature: parseFloat(temperature) || null,
            tension_arterielle: tension.trim() || null,
            frequence_cardiaque: parseInt(pulsations, 10) || null,
            saturation: parseInt(saturation, 10) || null,
            glycemie: parseFloat(glycemie) || null,
            poids: parseFloat(poids) || null,
            taille: parseFloat(taille) || null,
          }
        : null;

      await createConsultation(
        {
          patient_id: patientId,
          medecin_id: user.id,
          date: new Date().toISOString(),
          motif: motif.trim(),
          histoire_maladie: histoire.trim() || null,
          examen_clinique: examenClinique.trim() || null,
          diagnostic: diagnostic.trim() || null,
          traitement: traitement.trim() || null,
          conseils: conseils.trim() || null,
          date_controle: dateControle.trim() || null,
        },
        constantesDetails,
        user.id
      );

      showAlert('Succès', 'La consultation a été enregistrée avec succès.', [
        {
          text: 'OK',
          onPress: () => {
            // Redirect back to patient details
            router.replace(`/patients/${patientId}`);
          },
        },
      ]);
    } catch (err) {
      console.error(err);
      showAlert('Erreur', "Impossible d'enregistrer la consultation.");
    } finally {
      setLoading(false);
    }
  };

  if (loadingPatient) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#28C2FF" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.header}>
          <Link href={`/patients/${patientId}`} style={styles.backButton}>
            <View pointerEvents="none">
              <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            </View>
          </Link>
          <Text style={styles.title}>Nouvelle Visite</Text>
          <View style={styles.placeholder} />
        </View>

        {patient && (
          <View style={styles.patientBanner}>
            <Text style={styles.patientBannerName}>
              Patient: {patient.prenom} {patient.nom.toUpperCase()} ({patient.numero_dossier})
            </Text>
          </View>
        )}

        <ScrollView contentContainerStyle={styles.formContainer}>
          {/* Section 1: Vitals (Constantes) */}
          <Text style={styles.sectionTitle}>Constantes Physiologiques</Text>
          
          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>Température (°C)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 37.2"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                value={temperature}
                onChangeText={setTemperature}
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>Tension Artérielle</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 12/8"
                placeholderTextColor="#9ca3af"
                value={tension}
                onChangeText={setTension}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>Fréq. Cardiaque (bpm)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 75"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                value={pulsations}
                onChangeText={setPulsations}
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>Saturation (SpO2 %)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 98"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                value={saturation}
                onChangeText={setSaturation}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>Poids (kg)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 78.5"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                value={poids}
                onChangeText={setPoids}
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>Taille (cm)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 180"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                value={taille}
                onChangeText={setTaille}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>Glycémie (g/L)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 0.95"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
                value={glycemie}
                onChangeText={setGlycemie}
              />
            </View>
            
            {/* Display calculated IMC */}
            <View style={[styles.inputGroup, { flex: 1, justifyContent: 'center' }]}>
              <Text style={styles.label}>IMC Calculé</Text>
              <View style={styles.imcBox}>
                <Text style={[styles.imcText, imc ? { color: '#28C2FF' } : null]}>
                  {imc ? `${imc} kg/m²` : '--'}
                </Text>
              </View>
            </View>
          </View>

          {/* Section 2: Clinical Details */}
          <Text style={styles.sectionTitle}>Observation Clinique</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Motif de consultation *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsContainer}>
              {['Consultation routine', 'Fièvre isolée', 'Toux & Syndrome grippal', 'Douleurs abdominales', 'Céphalées persistantes'].map((item) => (
                <TouchableOpacity key={item} style={styles.chip} onPress={() => setMotif(item)}>
                  <Text style={styles.chipText}>{item}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput
              style={styles.input}
              placeholder="Saisissez le motif principal..."
              placeholderTextColor="#9ca3af"
              value={motif}
              onChangeText={setMotif}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Histoire de la maladie</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Antécédents immédiats, durée des symptômes..."
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={3}
              value={histoire}
              onChangeText={setHistoire}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Examen Clinique</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Signes physiques relevés par le médecin..."
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={4}
              value={examenClinique}
              onChangeText={setExamenClinique}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Diagnostic Médical *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsContainer}>
              {['Paludisme simple', 'Syndrome grippal', 'Hypertension artérielle', 'Gastro-entérite aiguë', 'Infection respiratoire'].map((item) => (
                <TouchableOpacity key={item} style={styles.chip} onPress={() => setDiagnostic(item)}>
                  <Text style={styles.chipText}>{item}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput
              style={styles.input}
              placeholder="Ex: Hypertension artérielle modérée, Paludisme simple..."
              placeholderTextColor="#9ca3af"
              value={diagnostic}
              onChangeText={setDiagnostic}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Traitement & Ordonnance</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Médicaments prescrits, posologie, durée..."
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={4}
              value={traitement}
              onChangeText={setTraitement}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Conseils Hygiéno-Diététiques</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Conseils de repos, alimentation, activité..."
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={3}
              value={conseils}
              onChangeText={setConseils}
            />
          </View>

          <View style={styles.inputGroup}>
            <DatePickerDOB
              label="Date de contrôle *"
              value={dateControle}
              onChange={setDateControle}
            />
          </View>

          {/* Pediatric Dose Calculator */}
          <View style={styles.calcCard}>
            <View style={styles.calcHeader}>
              <Ionicons name="calculator-outline" size={18} color="#8AC8F9" />
              <Text style={styles.calcTitle}>Calculateur Dose Pédiatrique (Paracétamol)</Text>
            </View>
            <Text style={styles.calcDescription}>
              Dosage standard : 15 mg/kg par prise (max 4 prises/24h, soit 60 mg/kg/jour).
            </Text>
            <View style={styles.calcRow}>
              <View style={[styles.inputGroup, { flex: 1, marginBottom: 0 }]}>
                <Text style={styles.calcLabel}>Poids du patient (kg)</Text>
                <TextInput
                  style={[styles.input, styles.calcInput]}
                  placeholder="Poids"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numeric"
                  value={poids}
                  onChangeText={setPoids}
                />
              </View>
              <View style={[styles.calcResultGroup, { flex: 1.5 }]}>
                <Text style={styles.calcResultLabel}>Dose recommandée par prise</Text>
                <Text style={styles.calcResultVal}>
                  {(() => {
                    const w = parseFloat(poids);
                    if (isNaN(w) || w <= 0) return '-- mg';
                    const dose = Math.round(w * 15);
                    const mlSirop = Math.round((dose / 24) * 10) / 10; // Sirop standard 120mg/5ml => 24mg/ml
                    return `${dose} mg (${mlSirop} ml de sirop 120mg/5ml)`;
                  })()}
                </Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.submitButton, loading && styles.disabledButton]}
            onPress={handleSubmit}
            disabled={loading}
          >
            <Text style={styles.submitButtonText}>
              {loading ? 'Enregistrement...' : 'Enregistrer la consultation'}
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
  centerContainer: {
    flex: 1,
    backgroundColor: '#0F2C3D',
    justifyContent: 'center',
    alignItems: 'center',
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
  patientBanner: {
    backgroundColor: '#2F5C77',
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  patientBannerName: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
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
  row: {
    flexDirection: 'row',
    gap: 12,
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
  textArea: {
    textAlignVertical: 'top',
  },
  imcBox: {
    backgroundColor: '#1E3E52',
    borderWidth: 1,
    borderColor: '#2F5C77',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imcText: {
    color: '#8AC8F9',
    fontSize: 15,
    fontWeight: 'bold',
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
  chipsContainer: {
    flexDirection: 'row',
    marginBottom: 10,
    marginTop: 2,
  },
  chip: {
    backgroundColor: '#0F2C3D',
    borderWidth: 1,
    borderColor: '#2F5C77',
    borderRadius: 15,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  chipText: {
    color: '#8AC8F9',
    fontSize: 12,
    fontWeight: '600',
  },
  micButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0F2C3D',
    borderWidth: 1,
    borderColor: '#2F5C77',
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  micButtonActive: {
    borderColor: '#FF6B6B',
    backgroundColor: '#1C161D',
  },
  micText: {
    color: '#8AC8F9',
    fontSize: 11,
    fontWeight: 'bold',
  },
  calcCard: {
    backgroundColor: '#1A3344',
    borderWidth: 1,
    borderColor: '#2F5C77',
    borderRadius: 15,
    padding: 16,
    marginTop: 16,
    marginBottom: 8,
    gap: 10,
  },
  calcHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  calcTitle: {
    color: '#8AC8F9',
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  calcDescription: {
    color: '#D1E6F3',
    fontSize: 12,
    lineHeight: 16,
  },
  calcRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-end',
  },
  calcLabel: {
    color: '#8AC8F9',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  calcInput: {
    height: 40,
    paddingVertical: 8,
    fontSize: 14,
  },
  calcResultGroup: {
    backgroundColor: '#0F2C3D',
    borderWidth: 1,
    borderColor: '#2F5C77',
    borderRadius: 10,
    padding: 10,
    height: 60,
    justifyContent: 'center',
  },
  calcResultLabel: {
    color: '#8AC8F9',
    fontSize: 10,
    textTransform: 'uppercase',
    fontWeight: 'bold',
  },
  calcResultVal: {
    color: '#2ECC71',
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 4,
  },
});
