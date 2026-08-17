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
  ActivityIndicator,
  Platform,
  Image,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import {
  getPatientById,
  getPatients,
  addExamenParaclinique,
  Patient,
  ExamenParaclinique,
} from '../../database/SQLiteDatabaseManager';
import { calculateAge, formatDateFR } from '../../utils/helpers';
import { useSecurity } from '../../security/SecurityContext';
import DatePickerDOB from '../../components/DatePickerDOB';

type CategorieExamen = 'Radiographie' | 'Scanner' | 'NFS' | 'Ionogramme' | 'Autres';

export default function CreateParacliniqueScreen() {
  const router = useRouter();
  const { patientId: initialPatientId, consultationId } = useLocalSearchParams<{ patientId?: string; consultationId?: string }>();
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

  const [selectedPatientId, setSelectedPatientId] = useState<string | undefined>(initialPatientId);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [allPatients, setAllPatients] = useState<Patient[]>([]);
  const [loadingPatient, setLoadingPatient] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [categorie, setCategorie] = useState<CategorieExamen>('Radiographie');
  const [intituleAutre, setIntituleAutre] = useState('');
  const [dateExamen, setDateExamen] = useState(new Date().toISOString().split('T')[0]);
  const [compteRendu, setCompteRendu] = useState('');

  // File Upload State
  const [fichierUrl, setFichierUrl] = useState<string | null>(null);
  const [fichierNom, setFichierNom] = useState<string | null>(null);
  const [fichierType, setFichierType] = useState<'image' | 'pdf' | 'other' | null>(null);

  useEffect(() => {
    loadPatientsList();
  }, [initialPatientId]);

  const loadPatientsList = async () => {
    setLoadingPatient(true);
    try {
      const list = await getPatients();
      setAllPatients(list);

      const targetId = initialPatientId || (list.length > 0 ? list[0].id : undefined);
      if (targetId) {
        setSelectedPatientId(targetId);
        const p = await getPatientById(targetId);
        setPatient(p);
      }
    } catch (e) {
      console.error('Error loading patient for paraclinique:', e);
    } finally {
      setLoadingPatient(false);
    }
  };

  const handleSelectPatient = async (pId: string) => {
    setSelectedPatientId(pId);
    setLoadingPatient(true);
    try {
      const p = await getPatientById(pId);
      setPatient(p);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPatient(false);
    }
  };

  const handlePickDocument = async () => {
    try {
      if (Platform.OS === 'web') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,application/pdf';
        input.onchange = (e: any) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (event: any) => {
              setFichierUrl(event.target.result);
              setFichierNom(file.name);
              setFichierType(file.type.includes('pdf') ? 'pdf' : 'image');
            };
            reader.readAsDataURL(file);
          }
        };
        input.click();
      } else {
        const res = await DocumentPicker.getDocumentAsync({
          type: ['image/*', 'application/pdf'],
          copyToCacheDirectory: true,
        });

        if (!res.canceled && res.assets && res.assets.length > 0) {
          const asset = res.assets[0];
          setFichierUrl(asset.uri);
          setFichierNom(asset.name);
          setFichierType(asset.mimeType?.includes('pdf') ? 'pdf' : 'image');
        }
      }
    } catch (err) {
      console.error('File pick error:', err);
      showAlert('Erreur Upload', 'Impossible d\'importer le document.');
    }
  };

  const handlePickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showAlert('Permission refusée', 'Accès aux photos requis pour téléverser une pièce jointe.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        base64: Platform.OS === 'web',
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        const uri = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        setFichierUrl(uri);
        setFichierNom(`Examen_${categorie}_${Date.now()}.jpg`);
        setFichierType('image');
      }
    } catch (err) {
      console.error('Image pick error:', err);
    }
  };

  const handleSaveExamen = async () => {
    if (!selectedPatientId) {
      showAlert('Erreur', 'Veuillez sélectionner un patient.');
      return;
    }
    if (categorie === 'Autres' && !intituleAutre.trim()) {
      showAlert('Champ requis', 'Veuillez préciser l\'intitulé de l\'examen.');
      return;
    }
    if (!compteRendu.trim()) {
      showAlert('Champ requis', 'Veuillez saisir le compte-rendu ou les conclusions médicales.');
      return;
    }

    if (!user) return;

    setSubmitting(true);
    try {
      await addExamenParaclinique(
        {
          patient_id: selectedPatientId,
          consultation_id: consultationId || null,
          categorie,
          intitule_autre: categorie === 'Autres' ? intituleAutre.trim() : null,
          date_examen: dateExamen,
          compte_rendu: compteRendu.trim(),
          fichier_url: fichierUrl,
          fichier_nom: fichierNom,
          fichier_type: fichierType,
        },
        user.id
      );

      showAlert('Succès', 'Examen paraclinique enregistré avec succès.', [
        {
          text: 'OK',
          onPress: () => {
            router.replace(`/patients/${selectedPatientId}`);
          },
        },
      ]);
    } catch (err) {
      console.error('Failed to save paraclinique exam:', err);
      showAlert('Erreur', 'Impossible d\'enregistrer l\'examen paraclinique.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingPatient) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#28C2FF" />
        <Text style={styles.loadingText}>Chargement du dossier patient...</Text>
      </View>
    );
  }

  const age = patient ? calculateAge(patient.date_naissance) : null;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F2C3D" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nouvel Examen Paraclinique</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Patient Picker horizontal selector */}
        {allPatients.length > 0 && (
          <View style={styles.patientPickerCard}>
            <Text style={styles.pickerTitle}>Patient sélectionné :</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {allPatients.map((p) => {
                const isSelected = p.id === selectedPatientId;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.patientPill, isSelected && styles.patientPillActive]}
                    onPress={() => handleSelectPatient(p.id)}
                  >
                    <Text style={[styles.patientPillText, isSelected && styles.patientPillTextActive]}>
                      {p.prenom} {p.nom.toUpperCase()} ({p.numero_dossier})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Selected Patient Meta Card */}
        {patient && (
          <View style={styles.patientMetaCard}>
            <Ionicons name="person-circle-outline" size={36} color="#28C2FF" />
            <View style={{ flex: 1 }}>
              <Text style={styles.patientNameText}>{patient.prenom} {patient.nom.toUpperCase()}</Text>
              <Text style={styles.patientSubText}>
                {patient.sexe === 'M' ? 'Homme' : 'Femme'} • {age} ans • N° {patient.numero_dossier}
              </Text>
            </View>
          </View>
        )}

        {/* Form Card */}
        <View style={styles.formCard}>
          {/* 1. Category Selection */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>1. Catégorie d'Examen *</Text>
            <View style={styles.categoryGrid}>
              {(
                [
                  { key: 'Radiographie', icon: 'camera-outline', label: 'Radiographie' },
                  { key: 'Scanner', icon: 'body-outline', label: 'Scanner' },
                  { key: 'NFS', icon: 'fitness-outline', label: 'NFS (Sanguin)' },
                  { key: 'Ionogramme', icon: 'flask-outline', label: 'Ionogramme' },
                  { key: 'Autres', icon: 'ellipsis-horizontal-circle-outline', label: 'Autres Examens' },
                ] as { key: CategorieExamen; icon: any; label: string }[]
              ).map((cat) => {
                const isSel = categorie === cat.key;
                return (
                  <TouchableOpacity
                    key={cat.key}
                    style={[styles.catBtn, isSel && styles.catBtnActive]}
                    onPress={() => setCategorie(cat.key)}
                  >
                    <Ionicons name={cat.icon} size={18} color={isSel ? '#0F2C3D' : '#8AC8F9'} />
                    <Text style={[styles.catBtnText, isSel && styles.catBtnTextActive]}>{cat.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* If Category is Autres */}
          {categorie === 'Autres' && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Intitulé de l'examen *</Text>
              <TextInput
                style={styles.inputText}
                placeholder="Ex: Échographie Abdominale, ECG, IRM Cérébrale..."
                placeholderTextColor="#94A3B8"
                value={intituleAutre}
                onChangeText={setIntituleAutre}
              />
            </View>
          )}

          {/* 2. Date of Exam */}
          <View style={styles.inputGroup}>
            <DatePickerDOB
              label="2. Date de l'Examen *"
              value={dateExamen}
              onChange={setDateExamen}
            />
          </View>

          {/* 3. Clinical Report / Conclusion */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>3. Compte-Rendu / Conclusion Médicale *</Text>
            <TextInput
              style={styles.textArea}
              placeholder="Saisissez le compte-rendu radiologique, les valeurs biologiques ou les conclusions du médecin/biologiste..."
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={6}
              value={compteRendu}
              onChangeText={setCompteRendu}
            />
          </View>

          {/* 4. Upload Attachment */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>4. Pièce Jointe (Photo / PDF)</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={styles.uploadBtn} onPress={handlePickDocument}>
                <Ionicons name="document-attach-outline" size={18} color="#0F2C3D" />
                <Text style={styles.uploadBtnText}>Joindre PDF / Doc</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.uploadBtn, { backgroundColor: '#8AC8F9' }]} onPress={handlePickImage}>
                <Ionicons name="image-outline" size={18} color="#0F2C3D" />
                <Text style={styles.uploadBtnText}>Prendre / Choisir Photo</Text>
              </TouchableOpacity>
            </View>

            {/* File Preview */}
            {fichierUrl && (
              <View style={styles.previewBox}>
                {fichierType === 'image' ? (
                  <Image source={{ uri: fichierUrl }} style={styles.previewImage} />
                ) : (
                  <Ionicons name="document-text" size={36} color="#28C2FF" />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.previewName} numberOfLines={1}>
                    {fichierNom || 'Fichier joint'}
                  </Text>
                  <Text style={styles.previewType}>
                    Type : {fichierType === 'pdf' ? 'Document PDF' : 'Image Photo'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => { setFichierUrl(null); setFichierNom(null); setFichierType(null); }}>
                  <Ionicons name="close-circle" size={22} color="#FF6B6B" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Submit Buttons */}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()} disabled={submitting}>
              <Text style={styles.cancelBtnText}>Annuler</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.submitBtn} onPress={handleSaveExamen} disabled={submitting}>
              {submitting ? (
                <ActivityIndicator color="#0F2C3D" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#0F2C3D" />
                  <Text style={styles.submitBtnText}>Enregistrer l'Examen</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
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
  loadingText: {
    color: '#8AC8F9',
    marginTop: 12,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#1E3E52',
    borderBottomWidth: 1,
    borderBottomColor: '#2F5C77',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  patientPickerCard: {
    backgroundColor: '#1E3E52',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2F5C77',
    gap: 8,
  },
  pickerTitle: {
    color: '#8AC8F9',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  patientPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#0F2C3D',
    borderWidth: 1,
    borderColor: '#2F5C77',
  },
  patientPillActive: {
    backgroundColor: '#28C2FF',
    borderColor: '#28C2FF',
  },
  patientPillText: {
    color: '#D1E6F3',
    fontSize: 12,
  },
  patientPillTextActive: {
    color: '#0F2C3D',
    fontWeight: 'bold',
  },
  patientMetaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1E3E52',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2F5C77',
  },
  patientNameText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  patientSubText: {
    color: '#8AC8F9',
    fontSize: 13,
  },
  formCard: {
    backgroundColor: '#1E3E52',
    borderRadius: 15,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2F5C77',
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    color: '#8AC8F9',
    fontSize: 13,
    fontWeight: 'bold',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  catBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0F2C3D',
    borderWidth: 1,
    borderColor: '#2F5C77',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  catBtnActive: {
    backgroundColor: '#28C2FF',
    borderColor: '#28C2FF',
  },
  catBtnText: {
    color: '#8AC8F9',
    fontSize: 13,
    fontWeight: '600',
  },
  catBtnTextActive: {
    color: '#0F2C3D',
    fontWeight: 'bold',
  },
  inputText: {
    backgroundColor: '#0F2C3D',
    borderColor: '#2F5C77',
    borderWidth: 1,
    borderRadius: 8,
    color: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  textArea: {
    backgroundColor: '#0F2C3D',
    borderColor: '#2F5C77',
    borderWidth: 1,
    borderRadius: 8,
    color: '#FFFFFF',
    padding: 12,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  uploadBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#28C2FF',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  uploadBtnText: {
    color: '#0F2C3D',
    fontWeight: 'bold',
    fontSize: 12,
  },
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#0F2C3D',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2F5C77',
    marginTop: 8,
  },
  previewImage: {
    width: 44,
    height: 44,
    borderRadius: 6,
  },
  previewName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  previewType: {
    color: '#8AC8F9',
    fontSize: 11,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#2F5C77',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  submitBtn: {
    flex: 2,
    backgroundColor: '#28C2FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  submitBtnText: {
    color: '#0F2C3D',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
