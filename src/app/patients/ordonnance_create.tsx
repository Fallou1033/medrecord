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
  ActivityIndicator,
  Platform,
  StatusBar,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../../lib/supabase';
import { getPatientById } from '../../services/api/patientsService';
import { getConsultationById } from '../../services/api/consultationsService';
import {
  addOrdonnance,
  getOrdonnanceByConsultation,
} from '../../database/SQLiteDatabaseManager';
import { Patient } from '../../types';
import { getDatabase } from '../../database/db';
import { encryptData, decryptData } from '../../security/encryption';
import { calculateAge, formatDateFR, formatDoctorName } from '../../utils/helpers';
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
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const generateOrdonnanceHTML = (documentId: string) => {
    if (!patient) return '';
    const age = calculateAge(patient.date_naissance);
    const dateStr = formatDateFR(new Date());

    const formatDoctorName = (nameStr: string) => {
      const clean = nameStr.replace(/\b(dr|docteur)\.?\b/gi, '').replace(/\s+/g, ' ').trim();
      return clean ? `Dr ${clean}` : 'Dr Daouda Diallo';
    };

    const rawDocName = user ? `${user.prenom || ''} ${user.nom || ''}`.trim() : 'Daouda Diallo';
    const docName = formatDoctorName(rawDocName);
    const docNameUpper = docName.toUpperCase();

    const docSpeciality = (user as any)?.specialite || 'Médecin Généraliste';
    const docCabinet = (user as any)?.cabinet || 'Cabinet Médical Privé';
    const docAddress = (user as any)?.adresse || 'Dakar, Sénégal';
    const docEmail = user?.email || 'falludiop10008@gmail.com';
    const docPhone = user?.telephone || '+221 77 123 4567';

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Ordonnance Medicale - ${patient.prenom} ${patient.nom.toUpperCase()}</title>
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
      .ordonnance-container {
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
    .ordonnance-container {
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
      margin: 10px 0 8px 0;
    }
    .title-text {
      font-size: 18px;
      font-weight: 800;
      letter-spacing: 3px;
      color: #0F2C3D;
      text-transform: uppercase;
      border-bottom: 2px solid #0F2C3D;
      display: inline-block;
      padding-bottom: 2px;
    }
    .rx-body {
      font-size: 13px;
      line-height: 1.6;
      min-height: 140px;
      white-space: pre-wrap;
      color: #000000;
      padding: 4px 0;
      margin-bottom: 10px;
    }
    .footer-table {
      width: 100%;
      margin-top: 10px;
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
  <div class="ordonnance-container">
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
          <div style="font-size: 10px; color: #666;">
            <em>« Ordonnance médicale valide selon la législation en vigueur. »</em>
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
          consultation_id: consultationId || '',
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

  const executeWebIframePrint = (htmlContent: string) => {
    return new Promise<void>((resolve) => {
      try {
        const isMobile = typeof navigator !== 'undefined' && (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768);

        if (isMobile) {
          // On Mobile browsers (Chrome Android / Safari iOS), inject HTML into an isolated popup window to guarantee clean printing
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

        // Desktop / Fallback iframe printing
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

  const handlePrintOrdonnance = async () => {
    setGenerating(true);
    try {
      const docId = await handleSaveOrdonnance();
      if (!docId) return;
      const htmlContent = generateOrdonnanceHTML(docId);

      if (Platform.OS === 'web') {
        await executeWebIframePrint(htmlContent);
      } else {
        await Print.printAsync({ html: htmlContent });
      }
    } catch (err) {
      console.error('Print error:', err);
      if (Platform.OS === 'web') {
        window.print();
      } else {
        showAlert('Erreur', 'Impossible de lancer l\'impression.');
      }
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

      const cleanNom = (patient.nom || 'PATIENT').trim().replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
      const cleanPrenom = (patient.prenom || '').trim().replace(/[^a-zA-Z0-9]/g, '_');
      const dateFileStr = new Date().toLocaleDateString('fr-FR').replace(/\//g, '_');
      const pdfFileName = `Ordonnance_${cleanNom}_${cleanPrenom}_${dateFileStr}.pdf`;

      if (Platform.OS === 'web') {
        // On Web, open native browser print dialog (Save as PDF) seamlessly with zero alert errors
        await executeWebIframePrint(htmlContent);
      } else {
        try {
          const { uri } = await Print.printToFileAsync({ html: htmlContent });
          const targetUri = `${FileSystem.cacheDirectory}${pdfFileName}`;
          try {
            await FileSystem.copyAsync({ from: uri, to: targetUri });
          } catch (copyErr) {
            console.log('FileSystem copy error:', copyErr);
          }
          const fileToShare = (await FileSystem.getInfoAsync(targetUri)).exists ? targetUri : uri;
          await Sharing.shareAsync(fileToShare, {
            mimeType: 'application/pdf',
            dialogTitle: `Ordonnance_${cleanNom}_${cleanPrenom}`,
            UTI: 'com.adobe.pdf',
          });
        } catch (nativeErr) {
          console.error('Native PDF export error:', nativeErr);
          await Print.printAsync({ html: htmlContent });
        }
      }
    } catch (err) {
      console.error('PDF Export Detailed Error:', err);
      if (Platform.OS === 'web') {
        window.print();
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleShareWhatsApp = async () => {
    if (!patient) return;
    if (!contenu.trim()) {
      showAlert('Ordonnance vide', 'Veuillez rédiger le contenu de l\'ordonnance avant de la partager.');
      return;
    }

    const phoneRaw = patient.telephone ? patient.telephone.trim() : '';
    if (!phoneRaw) {
      showAlert('Aucun numéro', 'Aucun numéro de téléphone n\'est renseigné pour ce patient.');
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
    const docName = formatDoctorName(rawDocName);
    const dateStr = formatDateFR(new Date());
    const dateFileStr = new Date().toLocaleDateString('fr-FR').replace(/\//g, '_');
    const cleanNom = (patient.nom || 'PATIENT').trim().replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
    const cleanPrenom = (patient.prenom || '').trim().replace(/[^a-zA-Z0-9]/g, '_');
    const pdfFileName = `Ordonnance_${cleanNom}_${cleanPrenom}_${dateFileStr}.pdf`;

    setGenerating(true);
    try {
      const docId = await handleSaveOrdonnance();
      const htmlContent = generateOrdonnanceHTML(docId || 'DOC-ORD');

      // 1. Tentative d'hébergement du document PDF / HTML sur Supabase Storage
      let publicDocUrl: string | null = null;
      try {
        const bucketNames = ['prescriptions', 'documents', 'medical-documents'];
        const filePath = `ordonnances/${docId || Date.now()}_${pdfFileName}`;
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        for (const bName of bucketNames) {
          const { data: upData, error: upErr } = await supabase.storage
            .from(bName)
            .upload(filePath, blob, { contentType: 'text/html;charset=utf-8', upsert: true });
          if (!upErr && upData) {
            const { data: pubData } = supabase.storage.from(bName).getPublicUrl(upData.path);
            if (pubData?.publicUrl) {
              publicDocUrl = pubData.publicUrl;
              break;
            }
          }
        }
      } catch (storageErr) {
        console.warn('Storage upload note:', storageErr);
      }

      // Lien direct vers le document officiel
      const directDocLink = publicDocUrl || (
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? `${window.location.origin}${window.location.pathname}#/patients/ordonnance_create?consultationId=${consultationId || ''}&patientId=${patientId}`
          : `https://fallou1033.github.io/medrecord/#/patients/ordonnance_create?consultationId=${consultationId || ''}&patientId=${patientId}`
      );

      // Message d'accompagnement officiel complet avec lien direct et récapitulatif
      const message = `Bonjour ${patient.prenom} ${patient.nom.toUpperCase()},\n\nVoici votre ordonnance médicale officielle émise par le ${docName} le ${dateStr}.\n\n📄 *Document officiel à consulter / télécharger* :\n${directDocLink}\n\n📋 *Traitement prescrit* :\n${contenu.trim()}\n\n---\n*Cabinet Médical* — Document officiel MedRecord`;
      const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;

      if (Platform.OS === 'web') {
        const htmlFileName = `Ordonnance_${cleanNom}_${cleanPrenom}_${dateFileStr}.html`;

        // A. Sur smartphone / Mobile Web : tentative de partage natif avec fichier joint
        if (typeof navigator !== 'undefined' && navigator.canShare) {
          try {
            const docFile = new File([htmlContent], htmlFileName, { type: 'text/html' });
            if (navigator.canShare({ files: [docFile] })) {
              await navigator.share({
                files: [docFile],
                title: `Ordonnance - ${patient.prenom} ${patient.nom.toUpperCase()}`,
                text: message,
              });
              return;
            }
          } catch (shareErr) {
            console.log('Mobile Web share fallback to WhatsApp Web:', shareErr);
          }
        }

        // B. Sur Ordinateur (Desktop) : Téléchargement direct du fichier + ouverture de la discussion WhatsApp
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = blobUrl;
        downloadLink.download = htmlFileName;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        setTimeout(() => {
          document.body.removeChild(downloadLink);
          URL.revokeObjectURL(blobUrl);
        }, 500);

        window.open(whatsappUrl, '_blank');
      } else {
        // Sur Mobile Natif (Android / iOS) :
        // 1. Génération immédiate du véritable fichier PDF officiel
        const { uri } = await Print.printToFileAsync({ html: htmlContent });
        
        // 2. Attribution d'un nom de fichier clair et professionnel (ex : Ordonnance_Nom_Patient_Date.pdf)
        const targetUri = `${FileSystem.cacheDirectory}${pdfFileName}`;
        try {
          await FileSystem.copyAsync({ from: uri, to: targetUri });
        } catch (copyErr) {
          console.log('FileSystem copy error:', copyErr);
        }

        const fileToShare = (await FileSystem.getInfoAsync(targetUri)).exists ? targetUri : uri;

        // 3. Partage natif du document PDF vers WhatsApp en pièce jointe directe
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileToShare, {
            mimeType: 'application/pdf',
            dialogTitle: `Partager l'ordonnance PDF de ${patient.prenom} ${patient.nom.toUpperCase()}`,
            UTI: 'com.adobe.pdf',
          });
        } else {
          await Linking.openURL(whatsappUrl);
        }
      }
    } catch (err) {
      console.error('WhatsApp PDF Share error:', err);
      const message = `Bonjour ${patient.prenom} ${patient.nom.toUpperCase()},\n\nVoici votre ordonnance médicale officielle délivrée par le ${docName} du ${dateStr} :\n\n📋 *Traitement prescrit* :\n${contenu.trim()}\n\n---\n*Cabinet Médical* — MedRecord`;
      const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
      if (Platform.OS === 'web') {
        window.open(whatsappUrl, '_blank');
      } else {
        await Linking.openURL(whatsappUrl);
      }
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
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (patientId) {
              router.push(`/patients/${patientId}`);
            } else if (patient?.id) {
              router.push(`/patients/${patient.id}`);
            } else {
              router.back();
            }
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
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
            style={[styles.actionBtn, styles.singlePrintBtn, generating && styles.disabledButton]}
            onPress={handlePrintOrdonnance}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator color="#0F2C3D" />
            ) : (
              <>
                <Ionicons name="print-outline" size={20} color="#0F2C3D" />
                <Text style={styles.singlePrintBtnText}>Imprimer / PDF</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.whatsappBtn, generating && styles.disabledButton]}
            onPress={handleShareWhatsApp}
            disabled={generating}
            activeOpacity={0.7}
          >
            {generating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
                <Text style={styles.whatsappBtnText}>📲 Partager WhatsApp</Text>
              </>
            )}
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
  singlePrintBtn: {
    backgroundColor: '#28C2FF',
    flex: 1,
    shadowColor: '#28C2FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  singlePrintBtnText: {
    color: '#0F2C3D',
    fontSize: 15,
    fontWeight: 'bold',
  },
  whatsappBtn: {
    backgroundColor: '#25D366',
    flex: 1,
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  whatsappBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  disabledButton: {
    opacity: 0.5,
  },
});
