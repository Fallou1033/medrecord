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
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter, Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getPatientById } from '../../services/api/patientsService';
import { getConsultationById } from '../../services/api/consultationsService';
import {
  addOrdonnance,
  getOrdonnanceByConsultation,
} from '../../database/SQLiteDatabaseManager';
import { Patient } from '../../types';
import { getDatabase } from '../../database/db';
import { encryptData, decryptData } from '../../security/encryption';
import { calculateAge, formatDateFR } from '../../utils/helpers';
import { useSecurity } from '../../security/SecurityContext';

export default function CreateOrdonnanceScreen() {
  const router = useRouter();
  const { consultationId, patientId, treatment, traitement } = useLocalSearchParams<{
    consultationId?: string;
    patientId?: string;
    treatment?: string;
    traitement?: string;
  }>();
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
  const [contenu, setContenu] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [existingOrdonnance, setExistingOrdonnance] = useState<any>(null);

  const [signature, setSignature] = useState('');
  const [poids, setPoids] = useState('');

  useEffect(() => {
    if (Platform.OS === 'web') {
      const savedSig = localStorage.getItem('doctor_signature');
      if (savedSig) setSignature(savedSig);
    } else {
      const SecureStore = require('expo-secure-store');
      SecureStore.getItemAsync('doctor_signature')
        .then((savedSig: string) => {
          if (savedSig) setSignature(savedSig);
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [consultationId, patientId, treatment, traitement]);

  const loadData = async () => {
    setLoading(true);
    try {
      // 0. Pré-remplissage immédiat depuis les paramètres d'URL si transmis
      const paramTreatment = treatment ? decodeURIComponent(treatment) : (traitement ? decodeURIComponent(traitement) : '');
      if (paramTreatment) {
        setContenu(paramTreatment);
      }

      // 1. Charger le dossier patient depuis Supabase
      if (patientId) {
        const p = await getPatientById(patientId);
        if (p) setPatient(p);
      }

      // 2. Charger les données de la consultation (traitement, poids) depuis Supabase
      if (consultationId) {
        try {
          const c = await getConsultationById(consultationId);
          if (c) {
            if (!paramTreatment && c.traitement) {
              setContenu(c.traitement);
            }
            if (c.poids_kg) {
              setPoids(c.poids_kg.toString());
            }
            if (!patient && c.patient_id) {
              const p = await getPatientById(c.patient_id);
              if (p) setPatient(p);
            }
          }
        } catch (e) {
          console.warn('Could not fetch consultation for ordonnance prefill:', e);
        }

        // Vérifier si une ordonnance existait déjà en local
        try {
          const ord = await getOrdonnanceByConsultation(consultationId);
          if (ord) {
            setExistingOrdonnance(ord);
            if (!paramTreatment && ord.contenu) {
              setContenu(ord.contenu);
            }
          }
        } catch (e) {}
      }
    } catch (err) {
      console.error(err);
      showAlert('Erreur', 'Impossible de charger les données.');
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePDF = async () => {
    if (!contenu.trim()) {
      showAlert('Erreur', 'L\'ordonnance est vide.');
      return;
    }

    if (!patient || !user) return;

    setGenerating(true);
    try {
      // 1. Create or save the ordonnance in DB
      let documentId = '';
      if (!existingOrdonnance) {
        const newOrd = await addOrdonnance(
          {
            consultation_id: consultationId || '',
            contenu: contenu.trim(),
            date: new Date().toISOString().split('T')[0],
            pdf_url: null, // Local temporary PDF initially
          },
          user.id
        );
        setExistingOrdonnance(newOrd);
        documentId = newOrd.id;
      } else {
        // Update existing ordonnance content
        const db = await getDatabase();
        const enc = await encryptData(contenu.trim());
        await db.runAsync(
          'UPDATE ordonnances SET contenu = ?, is_synced = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?;',
          [enc, existingOrdonnance.id]
        );
        documentId = existingOrdonnance.id;
      }

      // 2. Generate PDF HTML String
      const age = calculateAge(patient.date_naissance);
      const dateStr = formatDateFR(new Date());

      const formatDoctorName = (nameStr: string) => {
        const clean = nameStr.replace(/\b(dr|docteur)\.?\b/gi, '').replace(/\s+/g, ' ').trim();
        return clean ? `Dr ${clean}` : 'Dr Daouda Diallo';
      };

      const rawDocName = user ? `${user.prenom || ''} ${user.nom || ''}`.trim() : 'Daouda Diallo';
      const docName = formatDoctorName(rawDocName);
      const docEmail = user ? user.email : 'falludiop10008@gmail.com';
      const docPhone = user && user.telephone ? user.telephone : '+221 77 123 4567';

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #222; }
            .header { text-align: center; border-bottom: 2px solid #1B4B66; padding-bottom: 20px; margin-bottom: 30px; }
            .header h1 { margin: 0; color: #1B4B66; font-size: 24px; text-transform: uppercase; letter-spacing: 1px; }
            .header p { margin: 5px 0 0 0; color: #555; font-size: 14px; }
            .meta { display: flex; justify-content: space-between; margin-bottom: 30px; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 10px; }
            .patient-info { margin-bottom: 35px; background-color: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #1B4B66; }
            .patient-info p { margin: 5px 0; font-size: 15px; }
            .title { text-align: center; font-size: 20px; font-weight: bold; margin-bottom: 30px; letter-spacing: 2px; color: #1B4B66; }
            .content { font-size: 16px; line-height: 1.8; min-height: 250px; white-space: pre-wrap; margin-bottom: 40px; }
            .signature { text-align: right; margin-top: 30px; font-size: 15px; }
            .signature img { max-height: 70px; width: auto; margin-top: 5px; margin-bottom: 5px; }
            .footer { text-align: left; font-size: 11px; color: #888; border-top: 1px solid #ddd; padding-top: 15px; margin-top: 50px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${docName.toUpperCase()}</h1>
            <p>Médecin Généraliste • Cabinet Médical Privé</p>
            <p>Dakar, Sénégal • Tél: ${docPhone} • Email: ${docEmail}</p>
          </div>
          <div class="meta">
            <div><strong>Date:</strong> ${dateStr}</div>
            <div><strong>Dossier N°:</strong> ${patient.numero_dossier}</div>
          </div>
          <div class="patient-info">
            <p><strong>Patient(e) :</strong> ${patient.prenom} ${patient.nom.toUpperCase()}</p>
            <p><strong>Âge :</strong> ${age} ans &nbsp;&nbsp;&nbsp;&nbsp; <strong>Sexe :</strong> ${patient.sexe === 'M' ? 'Masculin' : 'Féminin'}</p>
          </div>
          <div class="title">ORDONNANCE</div>
          <div class="content">${contenu.replace(/\n/g, '<br/>')}</div>
          <div class="signature">
            <p>Signature & Cachet du Médecin</p>
            ${signature ? `<img src="${signature}" alt="Signature" />` : '<br/><br/>'}
            <p><strong>${docName}</strong></p>
          </div>
          <div class="footer">
            <p style="margin: 0;">MedRecord — Logiciel de Gestion de Dossier Médical Numérique • Document généré électroniquement</p>
          </div>
        </body>
        </html>
      `;

      // 3. Print to File
      const { uri } = await Print.printToFileAsync({ html: htmlContent });

      // 4. Share PDF File
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Ordonnance_${patient.nom.toUpperCase()}_${dateStr}`,
        UTI: 'com.adobe.pdf',
      });
      
      showAlert('Succès', 'Ordonnance générée et partagée avec succès.');
    } catch (err) {
      console.error(err);
      showAlert('Erreur', 'Impossible de générer le PDF.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#28C2FF" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Link href={`/patients/${patientId}`} style={styles.backButton}>
          <View pointerEvents="none">
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </View>
        </Link>
        <Text style={styles.title}>Rédiger l'Ordonnance</Text>
        <View style={styles.placeholder} />
      </View>

      {patient && (
        <View style={styles.patientBanner}>
          <Text style={styles.patientBannerText}>
            Patient: {patient.prenom} {patient.nom.toUpperCase()} ({patient.numero_dossier})
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.contentContainer}>
        <View style={styles.prescriptionCard}>
          <Text style={styles.label}>Contenu de la prescription</Text>
          <TextInput
            style={styles.textArea}
            placeholder="Rédigez les médicaments, posologies, durées de traitement ici..."
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={15}
            value={contenu}
            onChangeText={setContenu}
          />
        </View>

        {/* Pediatric Dose Calculator Card */}
        <View style={styles.calcCard}>
          <View style={styles.calcHeader}>
            <Ionicons name="calculator-outline" size={18} color="#8AC8F9" />
            <Text style={styles.calcTitle}>Calculateur Dose Pédiatrique (Aide à la Prescription)</Text>
          </View>
          <Text style={styles.calcDescription}>
            Saisissez le poids de l'enfant pour obtenir instantanément la posologie du paracétamol (15 mg/kg par prise, max 4 prises/24h, soit 60 mg/kg/j).
          </Text>
          <View style={styles.calcRow}>
            <View style={[styles.inputGroup, { flex: 1, marginBottom: 0 }]}>
              <Text style={styles.calcLabel}>Poids (kg)</Text>
              <TextInput
                style={[styles.input, styles.calcInput]}
                placeholder="Ex: 12"
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
          style={[styles.generateButton, generating && styles.disabledButton]}
          onPress={handleGeneratePDF}
          disabled={generating}
        >
          {generating ? (
            <ActivityIndicator color="#0F2C3D" />
          ) : (
            <>
              <Ionicons name="print-outline" size={22} color="#0F2C3D" />
              <Text style={styles.generateButtonText}>Générer & Partager l'Ordonnance PDF</Text>
            </>
          )}
        </TouchableOpacity>
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
  patientBannerText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  contentContainer: {
    padding: 20,
    gap: 20,
    paddingBottom: 120,
  },
  prescriptionCard: {
    backgroundColor: '#1E3E52',
    borderWidth: 1,
    borderColor: '#2F5C77',
    borderRadius: 15,
    padding: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8AC8F9',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  textArea: {
    backgroundColor: '#0F2C3D',
    color: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2F5C77',
    textAlignVertical: 'top',
    minHeight: 250,
  },
  generateButton: {
    backgroundColor: '#28C2FF',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    borderRadius: 10,
  },
  generateButtonText: {
    color: '#0F2C3D',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabledButton: {
    opacity: 0.6,
  },
  calcCard: {
    backgroundColor: '#1A3344',
    borderWidth: 1,
    borderColor: '#2F5C77',
    borderRadius: 15,
    padding: 16,
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
  inputGroup: {
    flexDirection: 'column',
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
