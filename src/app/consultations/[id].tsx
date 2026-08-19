import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { getPatientById } from '../../services/api/patientsService';
import { getConsultationById } from '../../services/api/consultationsService';
import {
  getExamensByConsultation,
  addExamen,
  Examen,
} from '../../database/SQLiteDatabaseManager';
import { Patient, Consultation } from '../../types';
import { formatDateFR } from '../../utils/helpers';
import { useSecurity } from '../../security/SecurityContext';

export default function ConsultationDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSecurity();
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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

  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [examens, setExamens] = useState<Examen[]>([]);
  const [loading, setLoading] = useState(true);

  // Attachment Modal state
  const [modalExamVisible, setModalExamVisible] = useState(false);
  const [examType, setExamType] = useState<Examen['type']>('BIOLOGIE');
  const [addingExamen, setAddingExamen] = useState(false);

  useEffect(() => {
    if (id) {
      loadConsultationData();
    }
  }, [id]);

  const loadConsultationData = async () => {
    setLoading(true);
    try {
      // 1. Charger la consultation depuis Supabase
      const c = await getConsultationById(id);

      if (!c) {
        showAlert('Erreur', 'Consultation non trouvée');
        router.back();
        return;
      }

      // Calcul de l'IMC si poids et taille présents
      let imcVal: string | null = null;
      if (c.poids_kg && c.taille_cm) {
        const hM = c.taille_cm / 100;
        imcVal = (c.poids_kg / (hM * hM)).toFixed(1);
      }

      const formattedConsultation: Consultation = {
        ...c,
        constantes: {
          temperature: c.temperature,
          tension_arterielle: c.pression_arterielle,
          frequence_cardiaque: c.frequence_cardiaque,
          saturation: c.constantes?.saturation || null,
          glycemie: c.constantes?.glycemie || null,
          poids: c.poids_kg,
          taille: c.taille_cm,
          imc: imcVal,
        },
      };

      setConsultation(formattedConsultation);

      // 2. Charger le dossier patient associé depuis Supabase
      const p = await getPatientById(c.patient_id);
      setPatient(p);

      // 3. Charger les examens / pièces jointes
      try {
        const exList = await getExamensByConsultation(id);
        setExamens(exList || []);
      } catch (e) {
        setExamens([]);
      }
    } catch (err: any) {
      console.error('Failed to load consultation details:', err);
      showAlert('Erreur', 'Impossible de charger la consultation.');
    } finally {
      setLoading(false);
    }
  };

  // Document/Image Picker handlers
  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission requise', 'Accès à la galerie refusé.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      saveSelectedExamen(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission requise', 'Accès à la caméra refusé.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      saveSelectedExamen(result.assets[0].uri);
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        saveSelectedExamen(result.assets[0].uri);
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Erreur', 'Impossible de sélectionner le document.');
    }
  };

  const saveSelectedExamen = async (uri: string) => {
    if (!user) return;
    setAddingExamen(true);
    try {
      await addExamen(
        {
          consultation_id: id,
          type: examType,
          fichier_url: uri,
        },
        user.id
      );

      // Reload exam list
      const exList = await getExamensByConsultation(id);
      setExamens(exList);

      setModalExamVisible(false);
      showAlert('Succès', 'Document joint avec succès.');
    } catch (err) {
      console.error(err);
      showAlert('Erreur', "Impossible de lier la pièce jointe.");
    } finally {
      setAddingExamen(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#28C2FF" />
      </View>
    );
  }

  if (!consultation || !patient) return null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.push(`/patients/${consultation.patient_id}`)}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Détail de la Visite</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Date & Patient summary */}
        <View style={styles.metaCard}>
          <Text style={styles.patientName}>
            {patient.prenom} {patient.nom.toUpperCase()}
          </Text>
          <Text style={styles.folderText}>Dossier : {patient.numero_dossier}</Text>
          <Text style={styles.dateText}>Date de consultation : {formatDateFR(consultation.date)}</Text>
        </View>

        {/* Section 1: Vitals if available */}
        {consultation.constantes && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Constantes Physiologiques</Text>
            
            <View style={styles.vitalsGrid}>
              <VitalItem label="Temp." value={consultation.constantes.temperature ? `${consultation.constantes.temperature} °C` : '--'} icon="thermometer-outline" />
              <VitalItem label="Tension" value={consultation.constantes.tension_arterielle || '--'} icon="pulse-outline" />
              <VitalItem label="Pulsations" value={consultation.constantes.frequence_cardiaque ? `${consultation.constantes.frequence_cardiaque} bpm` : '--'} icon="heart-outline" />
              <VitalItem label="SpO2" value={consultation.constantes.saturation ? `${consultation.constantes.saturation} %` : '--'} icon="speedometer-outline" />
              <VitalItem label="Poids" value={consultation.constantes.poids ? `${consultation.constantes.poids} kg` : '--'} icon="body-outline" />
              <VitalItem label="Taille" value={consultation.constantes.taille ? `${consultation.constantes.taille} cm` : '--'} icon="resize-outline" />
              <VitalItem label="Glycémie" value={consultation.constantes.glycemie ? `${consultation.constantes.glycemie} g/L` : '--'} icon="water-outline" />
              <VitalItem label="IMC" value={consultation.constantes.imc ? `${consultation.constantes.imc}` : '--'} icon="calculator-outline" highlight />
            </View>
          </View>
        )}

        {/* Section 2: Clinical Details */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Observation Médicale</Text>

          <ClinicalField label="Motif de la visite" value={consultation.motif} />
          <ClinicalField label="Histoire de la maladie" value={consultation.histoire_maladie} />
          <ClinicalField label="Examen clinique" value={consultation.examen_clinique} />
          <ClinicalField label="Diagnostic retenu" value={consultation.diagnostic} highlight />
          <ClinicalField label="Conseils donnés" value={consultation.conseils} />
          
          {consultation.date_controle && (
            <ClinicalField label="Date de contrôle prévue" value={formatDateFR(consultation.date_controle)} />
          )}
        </View>

        {/* Section 3: Prescribed Treatment & Prescription PDF Action */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Traitement & Ordonnance</Text>
          <Text style={styles.treatmentText}>
            {consultation.traitement || 'Aucun traitement médicamenteux saisi.'}
          </Text>

          <TouchableOpacity
            style={styles.prescriptionButton}
            onPress={() => {
              router.push({
                pathname: '/ordonnances/create',
                params: {
                  consultationId: id,
                  patientId: patient.id,
                  treatment: encodeURIComponent(consultation.traitement || ''),
                },
              });
            }}
          >
            <Ionicons name="document-text-outline" size={20} color="#0F2C3D" />
            <Text style={styles.prescriptionButtonText}>Générer l'Ordonnance PDF</Text>
          </TouchableOpacity>
        </View>

        {/* Section 4: Examens Complémentaires & Pièces Jointes */}
        <View style={styles.card}>
          <View style={styles.cardHeaderFlex}>
            <Text style={styles.cardTitleNoMargin}>Examens & Pièces Jointes</Text>
            <TouchableOpacity
              style={styles.smallAddButton}
              onPress={() => setModalExamVisible(true)}
            >
              <Ionicons name="attach-outline" size={16} color="#0F2C3D" />
              <Text style={styles.smallAddButtonText}>Joindre</Text>
            </TouchableOpacity>
          </View>

          {examens.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="document-outline" size={32} color="#2F5C77" />
              <Text style={styles.emptyText}>Aucun document ou examen lié à cette visite.</Text>
            </View>
          ) : (
            <View style={styles.examList}>
              {examens.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.examRow}
                  onPress={() => {
                    if (item.fichier_url) {
                      Sharing.shareAsync(item.fichier_url);
                    }
                  }}
                >
                  <View style={styles.examIconBg}>
                    <Ionicons
                      name={item.type === 'BIOLOGIE' ? 'flask-outline' : 'image-outline'}
                      size={18}
                      color="#28C2FF"
                    />
                  </View>
                  <View style={styles.examInfo}>
                    <Text style={styles.examTypeName}>{item.type}</Text>
                    <Text style={styles.examFileName} numberOfLines={1}>
                      {item.fichier_url ? item.fichier_url.split('/').pop() : 'Fichier'}
                    </Text>
                  </View>
                  <Ionicons name="share-social-outline" size={18} color="#8AC8F9" />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Modal for adding Examen */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalExamVisible}
        onRequestClose={() => setModalExamVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Joindre un Examen</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.modalLabel}>Type de document</Text>
              <View style={styles.typeContainer}>
                {(['BIOLOGIE', 'IMAGERIE', 'ECG', 'SCANNER', 'IRM'] as Examen['type'][]).map((t) => {
                  const isSel = examType === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[styles.typeBtn, isSel && styles.typeBtnActive]}
                      onPress={() => setExamType(t)}
                    >
                      <Text style={[styles.typeBtnText, isSel && styles.typeBtnTextActive]}>
                        {t}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {addingExamen ? (
              <ActivityIndicator size="large" color="#28C2FF" style={{ marginVertical: 20 }} />
            ) : (
              <View style={styles.pickerOptions}>
                <TouchableOpacity style={styles.pickerBtn} onPress={takePhoto}>
                  <Ionicons name="camera-outline" size={24} color="#28C2FF" />
                  <Text style={styles.pickerBtnText}>Prendre une photo</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.pickerBtn} onPress={pickImage}>
                  <Ionicons name="images-outline" size={24} color="#28C2FF" />
                  <Text style={styles.pickerBtnText}>Choisir une image</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.pickerBtn} onPress={pickDocument}>
                  <Ionicons name="document-attach-outline" size={24} color="#28C2FF" />
                  <Text style={styles.pickerBtnText}>Joindre un PDF</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setModalExamVisible(false)}
              disabled={addingExamen}
            >
              <Text style={styles.modalCancelText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function VitalItem({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  icon: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.vitalItem}>
      <View style={styles.vitalIconBg}>
        <Ionicons name={icon as any} size={16} color="#28C2FF" />
      </View>
      <Text style={styles.vitalLabel}>{label}</Text>
      <Text style={[styles.vitalValue, highlight ? { color: '#28C2FF', fontWeight: 'bold' } : null]}>
        {value}
      </Text>
    </View>
  );
}

function ClinicalField({ label, value, highlight }: { label: string; value: string | null | undefined; highlight?: boolean }) {
  if (!value) return null;
  return (
    <View style={styles.clinicalField}>
      <Text style={styles.clinicalLabel}>{label}</Text>
      <Text style={[styles.clinicalValue, highlight ? { color: '#28C2FF', fontWeight: '600' } : null]}>
        {value}
      </Text>
    </View>
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
    paddingTop: Platform.OS === 'web' ? 80 : 16,
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
  content: {
    padding: 20,
    gap: 16,
    paddingBottom: 40,
  },
  metaCard: {
    backgroundColor: '#1E3E52',
    borderWidth: 1,
    borderColor: '#2F5C77',
    borderRadius: 15,
    padding: 16,
  },
  patientName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  folderText: {
    color: '#28C2FF',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  dateText: {
    color: '#D1E6F3',
    fontSize: 13,
    marginTop: 8,
  },
  card: {
    backgroundColor: '#1E3E52',
    borderWidth: 1,
    borderColor: '#2F5C77',
    borderRadius: 15,
    padding: 16,
  },
  cardHeaderFlex: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2F5C77',
    paddingBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#8AC8F9',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2F5C77',
    paddingBottom: 8,
  },
  cardTitleNoMargin: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#8AC8F9',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  smallAddButton: {
    backgroundColor: '#28C2FF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  smallAddButtonText: {
    color: '#0F2C3D',
    fontWeight: 'bold',
    fontSize: 12,
  },
  vitalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  vitalItem: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0F2C3D',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#2F5C77',
  },
  vitalIconBg: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1E3E52',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vitalLabel: {
    fontSize: 11,
    color: '#8AC8F9',
    flex: 1,
  },
  vitalValue: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  clinicalField: {
    marginBottom: 16,
  },
  clinicalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8AC8F9',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  clinicalValue: {
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 22,
  },
  treatmentText: {
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 22,
    marginBottom: 16,
  },
  prescriptionButton: {
    backgroundColor: '#28C2FF',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 10,
  },
  prescriptionButtonText: {
    color: '#0F2C3D',
    fontSize: 15,
    fontWeight: 'bold',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  emptyText: {
    color: '#8AC8F9',
    fontSize: 13,
    textAlign: 'center',
  },
  examList: {
    gap: 10,
  },
  examRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F2C3D',
    borderWidth: 1,
    borderColor: '#2F5C77',
    borderRadius: 10,
    padding: 12,
    gap: 12,
  },
  examIconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E3E52',
    justifyContent: 'center',
    alignItems: 'center',
  },
  examInfo: {
    flex: 1,
  },
  examTypeName: {
    color: '#28C2FF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  examFileName: {
    color: '#D1E6F3',
    fontSize: 12,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#1E3E52',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2F5C77',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 20,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8AC8F9',
    marginBottom: 8,
  },
  typeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeBtn: {
    backgroundColor: '#0F2C3D',
    borderWidth: 1,
    borderColor: '#2F5C77',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  typeBtnActive: {
    backgroundColor: '#28C2FF',
    borderColor: '#28C2FF',
  },
  typeBtnText: {
    color: '#8AC8F9',
    fontSize: 13,
    fontWeight: '600',
  },
  typeBtnTextActive: {
    color: '#0F2C3D',
  },
  pickerOptions: {
    gap: 12,
    marginBottom: 20,
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F2C3D',
    borderWidth: 1,
    borderColor: '#2F5C77',
    padding: 14,
    borderRadius: 10,
    gap: 12,
  },
  pickerBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  modalCancel: {
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#2F5C77',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});
