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
import {
  addOrdonnance,
  getOrdonnanceByConsultation,
  getPatientById,
  Patient,
} from '../../database/SQLiteDatabaseManager';
import { getDatabase } from '../../database/db';
import { encryptData, decryptData } from '../../security/encryption';
import { calculateAge, formatDateFR } from '../../utils/helpers';
import { useSecurity } from '../../security/SecurityContext';

export default function CreateOrdonnanceScreen() {
  const router = useRouter();
  const { consultationId, patientId } = useLocalSearchParams<{ consultationId: string; patientId: string }>();
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
    if (consultationId && patientId) {
      loadData();
    }
  }, [consultationId, patientId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Load patient
      const p = await getPatientById(patientId);
      setPatient(p);

      // 2. Check if an ordonnance already exists for this consultation
      const ord = await getOrdonnanceByConsultation(consultationId);
      if (ord) {
        setExistingOrdonnance(ord);
        setContenu(ord.contenu);
      } else {
        // Pre-fill with the treatment from the consultation
        const db = await getDatabase();
        const row = await db.getFirstAsync(
          'SELECT traitement FROM consultations WHERE id = ?;',
          [consultationId]
        ) as any;
        if (row && row.traitement) {
          const decryptedTreatment = await decryptData(row.traitement);
          setContenu(decryptedTreatment || '');
        }
      }

      // 3. Pre-fill weight if constants exist for this consultation
      const db = await getDatabase();
      const weightRow = await db.getFirstAsync(
        'SELECT poids FROM constantes WHERE consultation_id = ?;',
        [consultationId]
      ) as any;
      if (weightRow && weightRow.poids) {
        setPoids(weightRow.poids.toString());
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
            consultation_id: consultationId,
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
      const verificationUrl = `https://verify.medrecord.sn/verify?id=${documentId}&type=ordonnance`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(verificationUrl)}`;

      const docName = user ? `${user.prenom} ${user.nom}` : 'Dr Mohamadou Bamba Diop';
      const docEmail = user ? user.email : 'bamba.diop@medrecord.sn';
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
            .footer { text-align: center; font-size: 11px; color: #888; border-top: 1px solid #ddd; padding-top: 15px; margin-top: 50px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${docName}</h1>
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
            <div style="display: flex; justify-content: space-between; align-items: center; text-align: left;">
              <div>
                <p style="margin: 0;">MedRecord — Logiciel de Gestion de Dossier Médical Numérique • Document généré électroniquement</p>
                <p style="font-size: 9px; color: #aaa; margin: 3px 0 0 0;">ID de vérification : ${documentId}</p>
              </div>
              <div style="text-align: right;">
                <img src="${qrCodeUrl}" alt="QR Code d'authenticité" style="width: 70px; height: 70px; border: 1px solid #ddd; padding: 4px; background: #fff;" />
                <p style="font-size: 8px; color: #aaa; margin: 2px 0 0 0; text-align: center;">Vérifier l'authenticité</p>
              </div>
            </div>
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

      showAlert('Succès', 'Ordonnance générée et partagée avec succès.', [
        {
          text: 'OK',
          onPress: () => {
            // Go back to the consultation details
            router.replace({
              pathname: '/patients/consultation_details' as any,
              params: { id: consultationId },
            });
          },
        },
      ]);
    } catch (err) {
      console.error(err);
      showAlert('Erreur', 'Impossible de générer l\'ordonnance PDF.');
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
        <Link
          href={{
            pathname: '/patients/consultation_details' as any,
            params: { id: consultationId },
          }}
          asChild
        >
          <TouchableOpacity style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </Link>
        <Text style={styles.title}>Rédiger une Ordonnance</Text>
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
          <Text style={styles.label}>Contenu de l'ordonnance *</Text>
          
          {poids ? (
            <View style={styles.infoBadge}>
              <Ionicons name="information-circle-outline" size={14} color="#E67E22" />
              <Text style={styles.infoBadgeText}>Poids patient enregistré : {poids} kg</Text>
            </View>
          ) : null}

          {poids && parseFloat(poids) > 0 ? (
            <View style={styles.calcCard}>
              <View style={styles.calcHeader}>
                <Ionicons name="calculator-outline" size={16} color="#8AC8F9" />
                <Text style={styles.calcTitle}>Dose Paracétamol Enfant (15mg/kg)</Text>
              </View>
              <Text style={styles.calcVal}>
                {(() => {
                  const w = parseFloat(poids);
                  if (isNaN(w) || w <= 0) return '-- mg';
                  const dose = Math.round(w * 15);
                  const mlSirop = Math.round((dose / 24) * 10) / 10; // Sirop standard 120mg/5ml => 24mg/ml
                  return `${dose} mg (${mlSirop} ml de sirop 120mg/5ml)`;
                })()}
              </Text>
            </View>
          ) : null}

          <TextInput
            style={styles.textArea}
            placeholder="Saisissez les médicaments et posologies..."
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={14}
            value={contenu}
            onChangeText={setContenu}
          />
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
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  infoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0F2C3D',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2F5C77',
    marginBottom: 12,
  },
  infoBadgeText: {
    color: '#E67E22',
    fontSize: 13,
    fontWeight: 'bold',
  },
  calcCard: {
    backgroundColor: '#0F2C3D',
    borderWidth: 1,
    borderColor: '#2F5C77',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  calcHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  calcTitle: {
    color: '#8AC8F9',
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  calcVal: {
    color: '#2ECC71',
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 4,
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
    marginTop: 8,
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
});
