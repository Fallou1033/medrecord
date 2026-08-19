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
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter, Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { createConsultation } from '../../services/api/consultationsService';
import { getPatientById, getPatients } from '../../services/api/patientsService';
import { logAuditEvent } from '../../services/api/auditService';
import { Patient } from '../../types';
import { calculateIMC } from '../../utils/helpers';
import { useSecurity } from '../../security/SecurityContext';
import DatePickerDOB from '../../components/DatePickerDOB';

// Draft Auto-save Helpers
async function saveConsultationDraft(pId: string, data: any) {
  try {
    const key = `draft_consultation_${pId || 'new'}`;
    const jsonStr = JSON.stringify(data);
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, jsonStr);
    } else {
      const SecureStore = require('expo-secure-store');
      await SecureStore.setItemAsync(key, jsonStr);
    }
  } catch (e) {
    console.warn('Failed to save consultation draft', e);
  }
}

async function loadConsultationDraft(pId: string) {
  try {
    const key = `draft_consultation_${pId || 'new'}`;
    let jsonStr: string | null = null;
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') jsonStr = localStorage.getItem(key);
    } else {
      const SecureStore = require('expo-secure-store');
      jsonStr = await SecureStore.getItemAsync(key);
    }
    return jsonStr ? JSON.parse(jsonStr) : null;
  } catch (e) {
    return null;
  }
}

async function clearConsultationDraft(pId: string) {
  try {
    const key = `draft_consultation_${pId || 'new'}`;
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } else {
      const SecureStore = require('expo-secure-store');
      await SecureStore.deleteItemAsync(key);
    }
  } catch (e) {
    console.warn('Failed to clear consultation draft', e);
  }
}

export default function CreateConsultationScreen() {
  const router = useRouter();
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const { user } = useSecurity();

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
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);
  const isInitialMount = useRef(true);

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

  const [allPatients, setAllPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(patientId || '');

  const effectivePatientId = patientId || selectedPatientId;

  useEffect(() => {
    if (patientId) {
      loadPatient(patientId);
    } else {
      loadAllPatients();
    }
  }, [patientId]);

  // Restore draft on initial mount
  useEffect(() => {
    (async () => {
      const draft = await loadConsultationDraft(effectivePatientId);
      if (draft) {
        if (draft.temperature !== undefined) setTemperature(draft.temperature);
        if (draft.tension !== undefined) setTension(draft.tension);
        if (draft.pulsations !== undefined) setPulsations(draft.pulsations);
        if (draft.saturation !== undefined) setSaturation(draft.saturation);
        if (draft.glycemie !== undefined) setGlycemie(draft.glycemie);
        if (draft.poids !== undefined) setPoids(draft.poids);
        if (draft.taille !== undefined) setTaille(draft.taille);
        if (draft.motif !== undefined) setMotif(draft.motif);
        if (draft.histoire !== undefined) setHistoire(draft.histoire);
        if (draft.examenClinique !== undefined) setExamenClinique(draft.examenClinique);
        if (draft.diagnostic !== undefined) setDiagnostic(draft.diagnostic);
        if (draft.traitement !== undefined) setTraitement(draft.traitement);
        if (draft.conseils !== undefined) setConseils(draft.conseils);
        if (draft.dateControle !== undefined) setDateControle(draft.dateControle);

        const hasContent = Boolean(
          (draft.motif && draft.motif.trim()) ||
          (draft.diagnostic && draft.diagnostic.trim()) ||
          (draft.traitement && draft.traitement.trim()) ||
          (draft.histoire && draft.histoire.trim()) ||
          (draft.examenClinique && draft.examenClinique.trim()) ||
          (draft.poids && draft.poids.trim()) ||
          (draft.temperature && draft.temperature.trim())
        );

        if (hasContent) {
          setHasRestoredDraft(true);
        }
      }
    })();
  }, [effectivePatientId]);

  // Auto-save draft on input change
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const draftData = {
      temperature,
      tension,
      pulsations,
      saturation,
      glycemie,
      poids,
      taille,
      motif,
      histoire,
      examenClinique,
      diagnostic,
      traitement,
      conseils,
      dateControle,
    };

    saveConsultationDraft(effectivePatientId, draftData);
  }, [
    effectivePatientId,
    temperature,
    tension,
    pulsations,
    saturation,
    glycemie,
    poids,
    taille,
    motif,
    histoire,
    examenClinique,
    diagnostic,
    traitement,
    conseils,
    dateControle,
  ]);

  const handleResetDraft = async () => {
    setTemperature('');
    setTension('');
    setPulsations('');
    setSaturation('');
    setGlycemie('');
    setPoids('');
    setTaille('');
    setMotif('');
    setHistoire('');
    setExamenClinique('');
    setDiagnostic('');
    setTraitement('');
    setConseils('');
    setDateControle('');
    setHasRestoredDraft(false);
    await clearConsultationDraft(effectivePatientId);
  };

  const loadAllPatients = async () => {
    setLoadingPatient(true);
    try {
      const list = await getPatients();
      setAllPatients(list);
      if (list.length > 0) {
        setSelectedPatientId(list[0].id);
        setPatient(list[0]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPatient(false);
    }
  };

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

  const loadPatient = async (targetId?: string) => {
    const idToLoad = targetId || patientId || selectedPatientId;
    if (!idToLoad) {
      setLoadingPatient(false);
      return;
    }
    setLoadingPatient(true);
    try {
      const p = await getPatientById(idToLoad);
      if (p) {
        setPatient(p);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPatient(false);
    }
  };

  const handleSubmit = async () => {
    if (!motif.trim()) {
      showAlert('Champs requis', 'Veuillez au moins renseigner le motif de consultation.');
      return;
    }

    const currentPatientId = (patient as any)?.id || selectedPatientId || patientId;
    if (!currentPatientId) {
      showAlert('Erreur', 'Veuillez sélectionner un patient valide.');
      return;
    }

    // Validate control date if set
    if (dateControle.trim()) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dateControle.trim())) {
        showAlert('Date invalide', 'La date de contrôle doit être au format AAAA-MM-JJ.');
        return;
      }
    }

    setLoading(true);
    try {
      await createConsultation({
        patient_id: currentPatientId,
        date: new Date().toISOString(),
        motif: motif.trim(),
        histoire_maladie: histoire.trim() || null,
        examen_clinique: examenClinique.trim() || null,
        diagnostic: diagnostic.trim() || null,
        traitement: traitement.trim() || null,
        conseils: conseils.trim() || null,
        date_controle: dateControle.trim() || null,
        poids_kg: poids ? parseFloat(poids.replace(',', '.')) || null : null,
        taille_cm: taille ? parseFloat(taille.replace(',', '.')) || null : null,
        pression_arterielle: tension.trim() || null,
        frequence_cardiaque: pulsations ? parseInt(pulsations, 10) || null : null,
        temperature: temperature ? parseFloat(temperature.replace(',', '.')) || null : null,
      });

      // Journal d'audit : Consultation créée
      logAuditEvent(
        'CREATE',
        'consultations',
        currentPatientId,
        `Nouvelle consultation enregistrée pour le patient ${patient?.prenom || ''} ${patient?.nom || ''}`,
        'SUCCESS'
      );

      // Effacer le brouillon de cette consultation après enregistrement réussi
      await clearConsultationDraft(currentPatientId);
      setHasRestoredDraft(false);

      showAlert('Succès', 'La consultation a été enregistrée avec succès dans le dossier médical.', [
        {
          text: 'OK',
          onPress: () => {
            router.back();
          },
        },
      ]);
    } catch (err: any) {
      console.error('Failed to create consultation:', err);
      showAlert('Erreur', err?.message || "Impossible d'enregistrer la consultation.");
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
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.title}>Nouvelle Visite</Text>
          <View style={styles.placeholder} />
        </View>

        {patient ? (
          <View style={styles.patientBanner}>
            <Text style={styles.patientBannerName}>
              Patient: {patient.prenom} {patient.nom?.toUpperCase()} ({patient.numero_dossier})
            </Text>
          </View>
        ) : (
          <View style={styles.patientBanner}>
            <Text style={{ color: '#8AC8F9', fontSize: 13, fontWeight: 'bold', marginBottom: 6 }}>
              Sélectionner le patient pour cette consultation *
            </Text>
            {allPatients.length === 0 ? (
              <View style={{ gap: 8 }}>
                <Text style={{ color: '#FF6B6B', fontSize: 13 }}>Aucun patient disponible dans la base.</Text>
                <TouchableOpacity
                  style={{ backgroundColor: '#28C2FF', padding: 8, borderRadius: 6, alignItems: 'center' }}
                  onPress={() => router.push('/patients/create')}
                >
                  <Text style={{ color: '#0F2C3D', fontWeight: 'bold' }}>+ Créer un nouveau patient</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {allPatients.map((p: any) => {
                    const isSelected = ((patient as any)?.id || selectedPatientId) === p.id;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={{
                          backgroundColor: isSelected ? '#28C2FF' : '#1E3E52',
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: isSelected ? '#28C2FF' : '#2F5C77',
                        }}
                        onPress={() => {
                          setSelectedPatientId(p.id);
                          setPatient(p);
                        }}
                      >
                        <Text style={{ color: isSelected ? '#0F2C3D' : '#FFFFFF', fontWeight: 'bold', fontSize: 12 }}>
                          {p.prenom} {p.nom?.toUpperCase()} ({p.numero_dossier})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </View>
        )}

        <ScrollView contentContainerStyle={styles.formContainer}>
          {hasRestoredDraft && (
            <View style={{ backgroundColor: 'rgba(40, 194, 255, 0.15)', borderWidth: 1, borderColor: '#28C2FF', borderRadius: 8, padding: 12, marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <Ionicons name="information-circle" size={20} color="#28C2FF" />
                <Text style={{ color: '#E0F2FE', fontSize: 13, flex: 1 }}>
                  Brouillon de consultation restauré automatiquement.
                </Text>
              </View>
              <TouchableOpacity onPress={handleResetDraft} style={{ backgroundColor: '#EF4444', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' }}>Effacer</Text>
              </TouchableOpacity>
            </View>
          )}

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
