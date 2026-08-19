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

type CertType = 'CM_REPOS' | 'CM_VISITE' | 'CM_COUPS_BLESSURES' | 'APTITUDE' | 'INAPTITUDE';

export default function CreateCertificatScreen() {
  const router = useRouter();
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const { user } = useSecurity();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [type, setType] = useState<CertType>('CM_REPOS');
  const [description, setDescription] = useState('');
  const [dateDebut, setDateDebut] = useState(new Date().toISOString().split('T')[0]); // YYYY-MM-DD
  const [dateFin, setDateFin] = useState(''); // YYYY-MM-DD (optional, for sick leaves)
  const [ittJours, setIttJours] = useState('5'); // Incapacité Totale de Travail en jours
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

  const generateTemplateText = (t: CertType, start: string, end: string, itt: string, dName: string): string => {
    if (t === 'CM_REPOS') {
      const days = calculateDaysCount(start, end);
      const daysText = days > 0 ? `${days}` : '___';
      const startFormatted = start ? formatDateFR(start) : '___';
      const endFormatted = end ? formatDateFR(end) : '___';
      return `Je soussigné, ${dName}, certifie que l'état de santé du patient susnommé nécessite un repos médical d'une durée de ${daysText} jours, allant du ${startFormatted} au ${endFormatted} inclus. Ce présent certificat lui est délivré pour valoir et faire valoir ce que de droit.`;
    }
    if (t === 'CM_VISITE') {
      return `Je soussigné, ${dName}, certifie avoir examiné ce jour le patient susnommé dans le cadre d'une visite / contre-visite médicale. Les constatations cliniques établies sont les suivantes : `;
    }
    if (t === 'CM_COUPS_BLESSURES') {
      const ittText = itt ? `${itt}` : '___';
      return `Je soussigné, ${dName}, certifie avoir examiné ce jour le patient susnommé qui présente des lésions de coups et blessures. Les constatations cliniques entraînent une Incapacité Totale de Travail (ITT) fixée à ${ittText} jours, sous réserve de complications ultérieures.`;
    }
    if (t === 'APTITUDE') {
      return `Je soussigné, ${dName}, certifie après examen clinique ce jour n'avoir pas constaté de contre-indication médicale à l'aptitude physique et sportive de : `;
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

  // Update description template whenever type or dates or ITT change
  useEffect(() => {
    const rawDocName = user ? `${user.prenom || ''} ${user.nom || ''}`.trim() : 'Mohamadou Bamba Diop';
    const docName = formatDoctorName(rawDocName);
    setDescription(generateTemplateText(type, dateDebut, dateFin, ittJours, docName));
  }, [type, dateDebut, dateFin, ittJours, user]);

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

  const executeWebIframePrint = (htmlContent: string) => {
    return new Promise<void>((resolve) => {
      try {
        const isMobile = typeof navigator !== 'undefined' && (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768);

        if (isMobile) {
          const printWin = window.open('', '_blank');
          if (printWin) {
            printWin.document.open();
            printWin.document.write(htmlContent);
            printWin.document.close();
            printWin.focus();
            setTimeout(() => {
              printWin.print();
              resolve();
            }, 500);
            return;
          }
        }

        const printFrame = document.createElement('iframe');
        printFrame.style.position = 'fixed';
        printFrame.style.right = '0';
        printFrame.style.bottom = '0';
        printFrame.style.width = '0';
        printFrame.style.height = '0';
        printFrame.style.border = '0';
        printFrame.style.visibility = 'hidden';
        document.body.appendChild(printFrame);

        const frameDoc = printFrame.contentWindow?.document;
        if (frameDoc) {
          frameDoc.open();
          frameDoc.write(htmlContent);
          frameDoc.close();

          setTimeout(() => {
            printFrame.contentWindow?.focus();
            printFrame.contentWindow?.print();
            setTimeout(() => {
              if (document.body.contains(printFrame)) {
                document.body.removeChild(printFrame);
              }
              resolve();
            }, 1000);
          }, 400);
        } else {
          resolve();
        }
      } catch (e) {
        console.error('Web iframe print error:', e);
        resolve();
      }
    });
  };

  const generateCertificatHTML = (documentId: string) => {
    if (!patient) return '';
    const age = calculateAge(patient.date_naissance);
    const dateStr = formatDateFR(new Date());

    const rawDocName = user ? `${user.prenom || ''} ${user.nom || ''}`.trim() : 'Mohamadou Bamba Diop';
    const docName = formatDoctorName(rawDocName);
    const docNameUpper = docName.toUpperCase();

    const docSpeciality = (user as any)?.specialite || 'Médecin Généraliste';
    const docCabinet = (user as any)?.cabinet || 'Cabinet Médical Privé';
    const docAddress = (user as any)?.adresse || 'Dakar, Sénégal';
    const docEmail = user ? user.email : 'falludiop10008@gmail.com';
    const docPhone = user && user.telephone ? user.telephone : '+221 77 123 4567';

    const typeLabels: Record<CertType, string> = {
      CM_REPOS: 'CERTIFICAT MÉDICAL DE REPOS',
      CM_VISITE: 'CERTIFICAT MÉDICAL DE VISITE / CONTRE-VISITE',
      CM_COUPS_BLESSURES: 'CERTIFICAT MÉDICAL DE COUPS ET BLESSURES',
      APTITUDE: "CERTIFICAT MÉDICAL D'APTITUDE",
      INAPTITUDE: "CERTIFICAT MÉDICAL D'INAPTITUDE",
    };

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Certificat Medical - ${patient.prenom} ${patient.nom.toUpperCase()}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm 10mm;
    }
    @media print {
      nav, header, footer, .navbar, button, .btn, .no-print, input, textarea {
        display: none !important;
      }
      body, html {
        background: #ffffff !important;
        color: #000000 !important;
        margin: 0 !important;
        padding: 0 !important;
        font-family: Arial, Helvetica, sans-serif !important;
      }
      .certificat-container {
        width: 100% !important;
        max-height: 100vh !important;
        box-sizing: border-box;
        page-break-inside: avoid !important;
      }
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: Arial, Helvetica, sans-serif;
      background-color: #ffffff;
      color: #111111;
      margin: 0;
      padding: 8px;
      font-size: 13px;
      line-height: 1.5;
    }
    .certificat-container {
      width: 100%;
      max-width: 800px;
      margin: 0 auto;
      padding: 8px;
      background: #ffffff;
      page-break-inside: avoid !important;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
      border-bottom: 2px solid #0F2C3D;
      padding-bottom: 6px;
      margin-bottom: 8px;
    }
    .doc-info {
      text-align: left;
      vertical-align: top;
    }
    .doc-name {
      font-size: 17px;
      font-weight: bold;
      color: #0F2C3D;
      margin: 0;
      text-transform: uppercase;
    }
    .doc-sub {
      font-size: 12px;
      color: #333333;
      margin: 2px 0;
      font-weight: 600;
    }
    .doc-contact {
      font-size: 11px;
      color: #555555;
      margin: 1px 0;
    }
    .date-box {
      text-align: right;
      vertical-align: top;
      font-size: 12px;
      font-weight: 600;
      color: #333333;
    }
    .patient-card {
      background-color: #F4F7F9;
      border: 1px solid #D0D7DE;
      border-left: 5px solid #0F2C3D;
      border-radius: 5px;
      padding: 8px 12px;
      margin-bottom: 8px;
    }
    .patient-name {
      font-size: 14px;
      font-weight: bold;
      color: #0F2C3D;
      margin: 0 0 3px 0;
    }
    .patient-details {
      font-size: 12px;
      color: #333333;
      margin: 0;
    }
    .title-banner {
      text-align: center;
      margin: 12px 0 10px 0;
    }
    .title-text {
      font-size: 18px;
      font-weight: 800;
      letter-spacing: 2px;
      color: #0F2C3D;
      text-transform: uppercase;
      border-bottom: 2px solid #0F2C3D;
      display: inline-block;
      padding-bottom: 2px;
    }
    .cert-body {
      font-size: 13.5px;
      line-height: 1.8;
      min-height: 180px;
      white-space: pre-wrap;
      color: #000000;
      padding: 6px 0;
      margin-bottom: 12px;
      text-align: justify;
    }
    .footer-table {
      width: 100%;
      margin-top: 15px;
      border-collapse: collapse;
    }
    .signature-box {
      text-align: right;
      vertical-align: top;
      width: 50%;
    }
    .signature-title {
      font-size: 11px;
      font-weight: bold;
      color: #0F2C3D;
      margin-bottom: 4px;
    }
    .signature-img {
      max-height: 50px;
      width: auto;
      margin: 2px 0;
    }
    .signature-doc {
      font-size: 12px;
      font-weight: bold;
      color: #222222;
    }
    .bottom-bar {
      margin-top: 12px;
      padding-top: 6px;
      border-top: 1px solid #E1E4E8;
      text-align: left;
      font-size: 10px;
      color: #666666;
    }
  </style>
</head>
<body>
  <div class="certificat-container">
    <table class="header-table">
      <tr>
        <td class="doc-info">
          <div class="doc-name">${docNameUpper}</div>
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
      <div class="patient-name">CERTIFICAT MÉDICAL POUR : ${patient.prenom} ${patient.nom.toUpperCase()}</div>
      <div class="patient-details">
        ${patient.date_naissance ? `<strong>Né(e) le :</strong> ${formatDateFR(patient.date_naissance)}` : ''}
        ${age ? ` (${age} ans)` : ''}
        &nbsp;&nbsp;|&nbsp;&nbsp;
        <strong>Sexe :</strong> ${patient.sexe === 'M' ? 'Masculin' : 'Féminin'}
      </div>
    </div>

    <div class="title-banner">
      <span class="title-text">${typeLabels[type]}</span>
    </div>

    <div class="cert-body">${description.replace(/\n/g, '<br/>')}</div>

    <table class="footer-table">
      <tr>
        <td style="vertical-align: bottom; width: 50%;">
          <div style="font-size: 10px; color: #666;">
            <em>« Certificat médical délivré pour valoir et faire valoir ce que de droit. »</em>
          </div>
        </td>
        <td class="signature-box">
          <div class="signature-title">Signature & Cachet du Médecin</div>
          ${signature ? `<img src="${signature}" class="signature-img" alt="Signature" />` : '<div style="height: 40px;"></div>'}
          <div class="signature-doc">${docName}</div>
        </td>
      </tr>
    </table>

    <div class="bottom-bar">
      <p style="margin: 0; font-weight: bold; color: #0F2C3D;">MedRecord — Système de Dossier Médical Numérique</p>
    </div>
  </div>
</body>
</html>`;
  };

  const handleGeneratePDF = async () => {
    if (!description.trim() || !dateDebut.trim()) {
      Alert.alert('Erreur', 'Veuillez remplir les champs obligatoires.');
      return;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateDebut) || (dateFin.trim() && !dateRegex.test(dateFin))) {
      Alert.alert('Date invalide', 'Le format de date doit être AAAA-MM-JJ.');
      return;
    }

    if (!patient || !user) return;

    setGenerating(true);
    try {
      const newCert = await addCertificat(
        {
          patient_id: patientId,
          type,
          description: description.trim(),
          date_debut: dateDebut.trim(),
          date_fin: dateFin.trim() || null,
          pdf_url: null,
        },
        user.id
      );

      const htmlContent = generateCertificatHTML(newCert.id);

      if (Platform.OS === 'web') {
        await executeWebIframePrint(htmlContent);
      } else {
        await Print.printAsync({ html: htmlContent });
      }
    } catch (err) {
      console.error('Certificat PDF generation error:', err);
      Alert.alert('Erreur', 'Impossible de lancer l\'impression.');
    } finally {
      setGenerating(false);
    }
  };

  const handleShareWhatsApp = async () => {
    if (!patient) return;
    if (!description.trim()) {
      Alert.alert('Certificat vide', 'Veuillez rédiger le contenu du certificat avant de le partager.');
      return;
    }

    const phoneRaw = patient.telephone ? patient.telephone.trim() : '';
    if (!phoneRaw) {
      Alert.alert('Aucun numéro', 'Aucun numéro de téléphone n\'est renseigné pour ce patient.');
      return;
    }

    let cleanPhone = phoneRaw.replace(/[^0-9+]/g, '');
    if (cleanPhone.startsWith('+')) {
      cleanPhone = cleanPhone.substring(1);
    }
    if (cleanPhone.startsWith('00')) {
      cleanPhone = cleanPhone.substring(2);
    }
    if (cleanPhone.length === 9 && /^(77|78|76|70|75|33)/.test(cleanPhone)) {
      cleanPhone = '221' + cleanPhone;
    }

    const rawDocName = user ? `${user.prenom || ''} ${user.nom || ''}`.trim() : 'Mohamadou Bamba Diop';
    const cleanDocName = formatDoctorName(rawDocName);
    const dateStr = formatDateFR(new Date());

    try {
      let certId = 'DOC-CERT';
      if (user) {
        const newCert = await addCertificat(
          {
            patient_id: patientId,
            type,
            description: description.trim(),
            date_debut: dateDebut.trim(),
            date_fin: dateFin.trim() || null,
            pdf_url: null,
          },
          user.id
        );
        certId = newCert.id;
      }

      const htmlContent = generateCertificatHTML(certId);

      const baseUrl = Platform.OS === 'web'
        ? window.location.origin + window.location.pathname
        : 'https://fallou1033.github.io/medrecord/';
      const directDocLink = `${baseUrl}#/patients/certificat_create?patientId=${patientId}`;

      if (Platform.OS === 'web') {
        // Option A: Partage du fichier réel via l'API Web Share (navigator.share) sur mobile web
        const fileName = `Certificat_${patient.nom.toUpperCase()}_${patient.prenom}.html`;
        const docFile = new File([htmlContent], fileName, { type: 'text/html' });

        if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [docFile] })) {
          try {
            await navigator.share({
              files: [docFile],
              title: `Certificat Médical - ${patient.prenom} ${patient.nom.toUpperCase()}`,
              text: `Bonjour ${patient.prenom} ${patient.nom.toUpperCase()},\n\nVoici votre certificat médical délivré par le ${cleanDocName} le ${dateStr}.\n\n📄 Document officiel à consulter et télécharger au format PDF A4.`,
            });
            return;
          } catch (shareErr) {
            console.log('Web Share annulé ou non supporté, repli sur le lien WhatsApp Web:', shareErr);
          }
        }

        // Option B (Desktop / WhatsApp Web): Déclencher l'impression/PDF + envoi du lien direct dans WhatsApp Web
        await executeWebIframePrint(htmlContent);

        const message = `Bonjour ${patient.prenom} ${patient.nom.toUpperCase()},\n\nVoici votre certificat médical délivré par le ${cleanDocName} du ${dateStr} :\n\n📄 *CONSULTER & TÉLÉCHARGER LE CERTIFICAT PDF* :\n${directDocLink}\n\nVous pouvez cliquer sur le lien ci-dessus pour le télécharger et l'imprimer.\n\n---\n*MedRecord* - Dossier Médical Numérique`;
        const whatsappUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;

        window.open(whatsappUrl, '_blank');
      } else {
        // Mobile Native App (iOS / Android): Générer et partager le fichier PDF binaire directement
        setGenerating(true);
        const { uri } = await Print.printToFileAsync({ html: htmlContent });
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Certificat_${patient.nom.toUpperCase()}_${dateStr}`,
          UTI: 'com.adobe.pdf',
        });
      }
    } catch (err) {
      console.error('WhatsApp share error:', err);
      Alert.alert('Erreur', 'Impossible de préparer le document pour le partage.');
    } finally {
      setGenerating(false);
    }
  };

  const certTypes: { type: CertType; label: string }[] = [
    { type: 'CM_REPOS', label: 'CM de Repos' },
    { type: 'CM_VISITE', label: 'Visite / Contre-visite' },
    { type: 'CM_COUPS_BLESSURES', label: 'Coups & Blessures' },
    { type: 'APTITUDE', label: 'Aptitude' },
    { type: 'INAPTITUDE', label: 'Inaptitude' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (patientId) {
              router.push(`/patients/${patientId}`);
            } else {
              router.back();
            }
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
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
              label="Date d'établissement *"
              value={dateDebut}
              onChange={setDateDebut}
            />

            {type === 'CM_REPOS' && (
              <DatePickerDOB
                label="Date de fin de repos (calcul de durée)"
                value={dateFin}
                onChange={setDateFin}
              />
            )}

            {type === 'CM_COUPS_BLESSURES' && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Incapacité Totale de Travail (ITT en jours) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: 5, 10, 15..."
                  placeholderTextColor="#9ca3af"
                  value={ittJours}
                  onChangeText={(val) => setIttJours(val.replace(/[^\d]/g, ''))}
                  keyboardType="numeric"
                />
              </View>
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

        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.singlePrintBtn, generating && styles.disabledButton]}
            onPress={handleGeneratePDF}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator color="#0F2C3D" />
            ) : (
              <>
                <Ionicons name="print-outline" size={20} color="#0F2C3D" />
                <Text style={styles.singlePrintBtnText}>🖨️ Imprimer / PDF</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.whatsappBtn]}
            onPress={handleShareWhatsApp}
          >
            <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
            <Text style={styles.whatsappBtnText}>📲 Partager WhatsApp</Text>
          </TouchableOpacity>
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
  actionsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  singlePrintBtn: {
    backgroundColor: '#28C2FF',
  },
  singlePrintBtnText: {
    color: '#0F2C3D',
    fontSize: 15,
    fontWeight: 'bold',
  },
  whatsappBtn: {
    backgroundColor: '#25D366',
  },
  whatsappBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  disabledButton: {
    opacity: 0.6,
  },
});
