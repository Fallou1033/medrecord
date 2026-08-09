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
import { addCertificat, getPatientById, Patient } from '../../database/SQLiteDatabaseManager';
import { calculateAge, formatDateFR } from '../../utils/helpers';
import { useSecurity } from '../../security/SecurityContext';
import DatePickerDOB from '../../components/DatePickerDOB';

type CertType = 'MEDICAL' | 'ACCIDENT_TRAVAIL' | 'APTITUDE' | 'INAPTITUDE' | 'ARRET_TRAVAIL';

export default function CreateCertificatScreen() {
  const router = useRouter();
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const { user } = useSecurity();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [type, setType] = useState<CertType>('MEDICAL');
  const [description, setDescription] = useState('');
  const [dateDebut, setDateDebut] = useState(new Date().toISOString().split('T')[0]); // YYYY-MM-DD
  const [dateFin, setDateFin] = useState(''); // YYYY-MM-DD (optional, for sick leaves)
  const [signature, setSignature] = useState('');

  const formatDoctorName = (nameStr: string) => {
    const clean = nameStr.replace(/\b(dr|docteur)\.?\b/gi, '').replace(/\s+/g, ' ').trim();
    return clean ? `Dr ${clean}` : 'Dr Mohamadou Bamba Diop';
  };

  const calculateDaysCount = (startStr: string, endStr: string): number => {
    if (!startStr || !endStr) return 0;
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
    if (end < start) return 0;
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  const generateTemplateText = (t: CertType, start: string, end: string, dName: string): string => {
    if (t === 'ARRET_TRAVAIL') {
      const days = calculateDaysCount(start, end);
      const daysText = days > 0 ? `${days}` : '___';
      const startFormatted = start ? formatDateFR(start) : '___';
      const endFormatted = end ? formatDateFR(end) : '___';
      return `Je soussigné, ${dName}, certifie que l'état de santé du patient susnommé nécessite un arrêt de travail d'une durée de ${daysText} jours, allant du ${startFormatted} au ${endFormatted} inclus. Ce présent certificat lui est délivré pour valoir et faire valoir ce que de droit.`;
    }
    if (t === 'MEDICAL') {
      return `Je soussigné, ${dName}, certifie après examen médical effectué ce jour, que l'état de santé du patient susmentionné justifie...`;
    }
    if (t === 'ACCIDENT_TRAVAIL') {
      return `Je soussigné, ${dName}, certifie avoir examiné ce jour le patient susnommé, qui déclare avoir été victime d'un accident de travail. Les constatations cliniques initiales sont : `;
    }
    if (t === 'APTITUDE') {
      return `Je soussigné, ${dName}, certifie après examen clinique ce jour n'avoir pas constaté de contre-indication médicale à la pratique de : `;
    }
    if (t === 'INAPTITUDE') {
      return `Je soussigné, ${dName}, certifie après examen clinique ce jour que le patient susnommé présente une inaptitude médicale temporaire à : `;
    }
    return '';
  };

  useEffect(() => {
    if (patientId) {
      loadPatient();
    }
  }, [patientId]);

  // Update description template whenever type or dates change
  useEffect(() => {
    const rawDocName = user ? `${user.prenom || ''} ${user.nom || ''}`.trim() : 'Mohamadou Bamba Diop';
    const docName = formatDoctorName(rawDocName);
    setDescription(generateTemplateText(type, dateDebut, dateFin, docName));
  }, [type, dateDebut, dateFin, user]);

  // Load signature
  useEffect(() => {
    const loadSignature = async () => {
      try {
        if (Platform.OS === 'web') {
          const savedSig = localStorage.getItem('doctor_signature');
          if (savedSig) setSignature(savedSig);
        } else {
          const SecureStore = require('expo-secure-store');
          const savedSig = await SecureStore.getItemAsync('doctor_signature');
          if (savedSig) setSignature(savedSig);
        }
      } catch (e) {
        console.warn('Failed to load signature:', e);
      }
    };
    loadSignature();
  }, []);

  const loadPatient = async () => {
    setLoading(true);
    try {
      const p = await getPatientById(patientId);
      setPatient(p);
    } catch (err) {
      console.error(err);
      Alert.alert('Erreur', 'Impossible de charger le patient.');
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePDF = async () => {
    if (!description.trim() || !dateDebut.trim()) {
      Alert.alert('Erreur', 'Veuillez remplir les champs obligatoires.');
      return;
    }

    // Basic date validations
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateDebut) || (dateFin.trim() && !dateRegex.test(dateFin))) {
      Alert.alert('Date invalide', 'Le format de date doit être AAAA-MM-JJ.');
      return;
    }

    if (!patient || !user) return;

    setGenerating(true);
    try {
      // 1. Save Certificat in local SQLite (encrypted)
      const newCert = await addCertificat(
        {
          patient_id: patientId,
          type,
          description: description.trim(),
          date_debut: dateDebut.trim(),
          date_fin: dateFin.trim() || null,
          pdf_url: null, // Temporary
        },
        user.id
      );

      // 2. Generate PDF HTML
      const documentId = newCert.id;
      const age = calculateAge(patient.date_naissance);
      const dateStr = formatDateFR(new Date());

      const rawDocName = user ? `${user.prenom || ''} ${user.nom || ''}`.trim() : 'Mohamadou Bamba Diop';
      const docName = formatDoctorName(rawDocName);
      const docNameUpper = docName.toUpperCase();
      const docEmail = user ? user.email : 'falludiop10008@gmail.com';
      const docPhone = user && user.telephone ? user.telephone : '+221 77 123 4567';

      const typeLabels: Record<CertType, string> = {
        MEDICAL: 'CERTIFICAT MEDICAL',
        ACCIDENT_TRAVAIL: "INITIAL D'ACCIDENT DE TRAVAIL",
        APTITUDE: "D'APTITUDE PHYSIQUE",
        INAPTITUDE: "D'INAPTITUDE PHYSIQUE",
        ARRET_TRAVAIL: 'DE DISPENSE / ARRET DE TRAVAIL',
      };

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
            .title { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 40px; color: #1B4B66; border-top: 1px solid #eee; border-bottom: 1px solid #eee; padding: 12px; text-transform: uppercase; letter-spacing: 1px; }
            .content { font-size: 16px; line-height: 2; min-height: 200px; text-align: justify; margin-bottom: 40px; text-indent: 30px; }
            .signature { text-align: right; margin-top: 30px; font-size: 15px; }
            .signature img { max-height: 70px; width: auto; margin-top: 5px; margin-bottom: 5px; }
            .footer { text-align: left; font-size: 11px; color: #888; border-top: 1px solid #ddd; padding-top: 15px; margin-top: 50px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${docNameUpper}</h1>
            <p>Médecin Généraliste • Cabinet Médical Privé</p>
            <p>Dakar, Sénégal • Tél: ${docPhone} • Email: ${docEmail}</p>
          </div>
          <div class="meta">
            <div><strong>Fait à Dakar, le :</strong> ${dateStr}</div>
            <div><strong>Dossier N°:</strong> ${patient.numero_dossier}</div>
          </div>
          <div class="patient-info">
            <p><strong>Patient(e) :</strong> ${patient.prenom} ${patient.nom.toUpperCase()}</p>
            <p><strong>Né(e) le :</strong> ${formatDateFR(patient.date_naissance)} (${age} ans) &nbsp;&nbsp;&nbsp;&nbsp; <strong>Sexe :</strong> ${patient.sexe === 'M' ? 'Masculin' : 'Féminin'}</p>
          </div>
          <div class="title">CERTIFICAT MEDICAL ${typeLabels[type]}</div>
          <div class="content">
            ${description.replace(/\n/g, '<br/>')}
          </div>
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

      // 2. Print to PDF File
      const { uri } = await Print.printToFileAsync({ html: htmlContent });

      // 3. Share PDF File
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Certificat_${patient.nom.toUpperCase()}_${dateStr}`,
        UTI: 'com.adobe.pdf',
      });

      Alert.alert('Succès', 'Certificat généré et partagé avec succès.', [
        { text: 'OK', onPress: () => router.replace(`/patients/${patientId}`) },
      ]);
    } catch (err) {
      console.error(err);
      Alert.alert('Erreur', 'Impossible de générer le certificat PDF.');
    } finally {
      setGenerating(false);
    }
  };

  const certTypes: { type: CertType; label: string }[] = [
    { type: 'MEDICAL', label: 'Médical' },
    { type: 'ACCIDENT_TRAVAIL', label: 'Accident Travail' },
    { type: 'APTITUDE', label: 'Aptitude' },
    { type: 'INAPTITUDE', label: 'Inaptitude' },
    { type: 'ARRET_TRAVAIL', label: 'Arrêt de travail' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Link href={`/patients/${patientId}`} asChild>
          <TouchableOpacity style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </Link>
        <Text style={styles.title}>Rédiger un Certificat</Text>
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
        <View style={styles.formCard}>
          <Text style={styles.label}>Type de certificat</Text>
          <View style={styles.typeContainer}>
            {certTypes.map((item) => (
              <TouchableOpacity
                key={item.type}
                style={[styles.typeBtn, type === item.type && styles.typeBtnActive]}
                onPress={() => setType(item.type)}
              >
                <Text style={[styles.typeBtnText, type === item.type && styles.typeBtnTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ gap: 14 }}>
            <DatePickerDOB
              label="Date de début *"
              value={dateDebut}
              onChange={setDateDebut}
            />

            {type === 'ARRET_TRAVAIL' && (
              <DatePickerDOB
                label="Date de fin"
                value={dateFin}
                onChange={setDateFin}
              />
            )}
          </View>

          <Text style={styles.label}>Rédaction du corps du certificat</Text>
          <TextInput
            style={styles.textArea}
            placeholder="Rédigez le certificat médical..."
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={12}
            value={description}
            onChangeText={setDescription}
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
              <Text style={styles.generateButtonText}>Générer & Partager le Certificat PDF</Text>
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
  formCard: {
    backgroundColor: '#1E3E52',
    borderWidth: 1,
    borderColor: '#2F5C77',
    borderRadius: 15,
    padding: 16,
    gap: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8AC8F9',
    textTransform: 'uppercase',
  },
  typeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
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
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  inputGroup: {
    marginBottom: 8,
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
  textArea: {
    backgroundColor: '#0F2C3D',
    color: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2F5C77',
    textAlignVertical: 'top',
    minHeight: 200,
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
