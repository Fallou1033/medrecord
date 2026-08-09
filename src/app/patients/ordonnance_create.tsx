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

  const generateOrdonnanceHTML = (documentId: string) => {
    if (!patient) return '';
    const age = calculateAge(patient.date_naissance);
    const dateStr = formatDateFR(new Date());
    const verificationUrl = `https://verify.medrecord.sn/verify?id=${documentId}&type=ordonnance`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(verificationUrl)}`;

    const docName = user ? `Dr ${user.prenom} ${user.nom}` : 'Dr Mohamadou Bamba Diop';
    const docSpeciality = user?.specialite || 'Médecin Généraliste';
    const docCabinet = user?.cabinet || 'Cabinet Médical Privé';
    const docAddress = user?.adresse || 'Dakar, Sénégal';
    const docEmail = user?.email || 'bamba.diop@medrecord.sn';
    const docPhone = user?.telephone || '+221 77 123 4567';

    return `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="utf-8">
        <title>Ordonnance Medicale - ${patient.prenom} ${patient.nom.toUpperCase()}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm 15mm 15mm 15mm;
          }
          @media print {
            html, body {
              background: #ffffff !important;
              color: #000000 !important;
              font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
          * {
            box-sizing: border-box;
          }
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            background-color: #ffffff;
            color: #111111;
            margin: 0;
            padding: 20px;
            font-size: 14px;
            line-height: 1.6;
          }
          .header-table {
            width: 100%;
            border-collapse: collapse;
            border-bottom: 2px solid #0F2C3D;
            padding-bottom: 12px;
            margin-bottom: 20px;
          }
          .doc-info {
            text-align: left;
            vertical-align: top;
          }
          .doc-name {
            font-size: 20px;
            font-weight: bold;
            color: #0F2C3D;
            margin: 0;
            text-transform: uppercase;
          }
          .doc-sub {
            font-size: 13px;
            color: #333333;
            margin: 3px 0;
            font-weight: 600;
          }
          .doc-contact {
            font-size: 12px;
            color: #555555;
            margin: 2px 0;
          }
          .date-box {
            text-align: right;
            vertical-align: top;
            font-size: 13px;
            font-weight: 600;
            color: #333333;
          }
          .patient-card {
            background-color: #F4F7F9;
            border: 1px solid #D0D7DE;
            border-left: 5px solid #0F2C3D;
            border-radius: 6px;
            padding: 12px 16px;
            margin-bottom: 25px;
          }
          .patient-name {
            font-size: 15px;
            font-weight: bold;
            color: #0F2C3D;
            margin: 0 0 6px 0;
          }
          .patient-details {
            font-size: 13px;
            color: #333333;
            margin: 0;
          }
          .title-banner {
            text-align: center;
            margin: 25px 0;
          }
          .title-text {
            font-size: 22px;
            font-weight: 800;
            letter-spacing: 3px;
            color: #0F2C3D;
            text-transform: uppercase;
            border-bottom: 2px solid #0F2C3D;
            display: inline-block;
            padding-bottom: 4px;
          }
          .rx-body {
            font-size: 15px;
            line-height: 1.9;
            min-height: 320px;
            white-space: pre-wrap;
            color: #000000;
            padding: 10px 5px;
            margin-bottom: 30px;
          }
          .footer-table {
            width: 100%;
            margin-top: 30px;
            border-collapse: collapse;
          }
          .signature-box {
            text-align: right;
            vertical-align: top;
            width: 50%;
          }
          .signature-title {
            font-size: 13px;
            font-weight: bold;
            color: #0F2C3D;
            margin-bottom: 8px;
          }
          .signature-img {
            max-height: 75px;
            width: auto;
            margin: 6px 0;
          }
          .signature-doc {
            font-size: 13px;
            font-weight: bold;
            color: #222222;
          }
          .bottom-bar {
            margin-top: 40px;
            padding-top: 10px;
            border-top: 1px solid #E1E4E8;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 10px;
            color: #666666;
          }
          .qr-img {
            width: 65px;
            height: 65px;
            border: 1px solid #DDDDDD;
            padding: 3px;
            background: #FFFFFF;
          }
        </style>
      </head>
      <body>
        <table class="header-table">
          <tr>
            <td class="doc-info">
              <div class="doc-name">${docName}</div>
              <div class="doc-sub">${docSpeciality} • ${docCabinet}</div>
              <div class="doc-contact">${docAddress} • Tél: ${docPhone}</div>
              <div class="doc-contact">Email: ${docEmail}</div>
            </td>
            <td class="date-box">
              Fait à Dakar, le ${dateStr}<br/>
              <span style="font-size: 11px; color: #666; font-weight: normal;">Dossier N°: ${patient.numero_dossier}</span>
            </td>
          </tr>
        </table>

        <div class="patient-card">
          <div class="patient-name">ORDONNANCE POUR : ${patient.prenom} ${patient.nom.toUpperCase()}</div>
          <div class="patient-details">
            ${patient.date_naissance ? `<strong>Né(e) le :</strong> ${formatDateFR(patient.date_naissance)}` : ''}
            ${age ? ` (${age} ans)` : ''}
            &nbsp;&nbsp;|&nbsp;&nbsp;
            <strong>Sexe :</strong> ${patient.sexe === 'M' ? 'Masculin' : 'Féminin'}
            ${poids ? `&nbsp;&nbsp;|&nbsp;&nbsp;<strong>Poids :</strong> ${poids} kg` : ''}
          </div>
        </div>

        <div class="title-banner">
          <span class="title-text">ORDONNANCE</span>
        </div>

        <div class="rx-body">${contenu.replace(/\n/g, '<br/>')}</div>

        <table class="footer-table">
          <tr>
            <td style="vertical-align: bottom; width: 50%;">
              <div style="font-size: 11px; color: #666;">
                <em>« Ordonnance médicale valide selon la législation en vigueur. »</em>
              </div>
            </td>
            <td class="signature-box">
              <div class="signature-title">Signature & Cachet du Médecin</div>
              ${signature ? `<img src="${signature}" class="signature-img" alt="Signature" />` : '<div style="height: 60px;"></div>'}
              <div class="signature-doc">${docName}</div>
            </td>
          </tr>
        </table>

        <div class="bottom-bar">
          <div>
            <p style="margin: 0; font-weight: bold; color: #0F2C3D;">MedRecord — Système de Dossier Médical Numérique</p>
            <p style="margin: 2px 0 0 0; color: #888888;">ID Document unique : ${documentId}</p>
          </div>
          <div style="text-align: right;">
            <img src="${qrCodeUrl}" class="qr-img" alt="QR Code" />
          </div>
        </div>
      </body>
      </html>
    `;
  };

  const handleSaveOrdonnance = async (): Promise<string | null> => {
    if (!contenu.trim()) {
      showAlert('Erreur', 'L\'ordonnance est vide.');
      return null;
    }
    if (!patient || !user) return null;

    let documentId = '';
    if (!existingOrdonnance) {
      const newOrd = await addOrdonnance(
        {
          consultation_id: consultationId,
          contenu: contenu.trim(),
          date: new Date().toISOString().split('T')[0],
          pdf_url: null,
        },
        user.id
      );
      setExistingOrdonnance(newOrd);
      documentId = newOrd.id;
    } else {
      const db = await getDatabase();
      const enc = await encryptData(contenu.trim());
      await db.runAsync(
        'UPDATE ordonnances SET contenu = ?, is_synced = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?;',
        [enc, existingOrdonnance.id]
      );
      documentId = existingOrdonnance.id;
    }
    return documentId;
  };

  const handlePrintOrdonnance = async () => {
    setGenerating(true);
    try {
      const docId = await handleSaveOrdonnance();
      if (!docId) return;

      if (Platform.OS === 'web') {
        window.print();
      } else {
        const htmlContent = generateOrdonnanceHTML(docId);
        await Print.printAsync({ html: htmlContent });
      }
    } catch (err) {
      console.error('Print error:', err);
      showAlert('Erreur', 'Impossible de lancer l\'impression.');
    } finally {
      setGenerating(false);
    }
  };

  const handleExportPDF = async () => {
    setGenerating(true);
    try {
      const docId = await handleSaveOrdonnance();
      if (!docId || !patient) return;
      const htmlContent = generateOrdonnanceHTML(docId);

      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Ordonnance_${patient.nom.toUpperCase()}`,
        UTI: 'com.adobe.pdf',
      });
    } catch (err) {
      console.error('Export error:', err);
      showAlert('Erreur', 'Impossible de générer le fichier PDF.');
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
                  const mlSirop = Math.round((dose / 24) * 10) / 10;
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

        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.printBtn, generating && styles.disabledButton]}
            onPress={handlePrintOrdonnance}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator color="#0F2C3D" />
            ) : (
              <>
                <Ionicons name="print-outline" size={20} color="#0F2C3D" />
                <Text style={styles.printBtnText}>Imprimer l'Ordonnance</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.exportBtn, generating && styles.disabledButton]}
            onPress={handleExportPDF}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="download-outline" size={20} color="#FFFFFF" />
                <Text style={styles.exportBtnText}>Exporter PDF</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Dedicated Clean A4 Print View for Web Browsers */}
      {Platform.OS === 'web' && (
        <div
          className="ordonnance-print-view"
          dangerouslySetInnerHTML={{
            __html: generateOrdonnanceHTML(existingOrdonnance?.id || 'DOCUMENT_OFFICIEL'),
          }}
        />
      )}
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
    width: 44,
  },
  patientBanner: {
    backgroundColor: '#1E3E52',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2F5C77',
  },
  patientBannerText: {
    color: '#28C2FF',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 60,
  },
  prescriptionCard: {
    backgroundColor: '#1E3E52',
    borderRadius: 15,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2F5C77',
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#8AC8F9',
    marginBottom: 12,
  },
  infoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2F5C77',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  infoBadgeText: {
    color: '#E67E22',
    fontSize: 12,
    fontWeight: 'bold',
  },
  calcCard: {
    backgroundColor: '#0F2C3D',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2F5C77',
  },
  calcHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  calcTitle: {
    color: '#8AC8F9',
    fontSize: 12,
    fontWeight: 'bold',
  },
  calcVal: {
    color: '#28C2FF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  textArea: {
    backgroundColor: '#0F2C3D',
    color: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    lineHeight: 24,
    borderWidth: 1,
    borderColor: '#2F5C77',
    minHeight: 220,
    textAlignVertical: 'top',
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    padding: 16,
  },
  printBtn: {
    backgroundColor: '#28C2FF',
  },
  printBtnText: {
    color: '#0F2C3D',
    fontSize: 15,
    fontWeight: 'bold',
  },
  exportBtn: {
    backgroundColor: '#2F5C77',
  },
  exportBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  disabledButton: {
    opacity: 0.6,
  },
});
