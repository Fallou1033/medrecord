import React, { useState, useEffect } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Text,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';

import {
  getConnectedUser,
  loginToGoogleDrive,
  logoutFromGoogleDrive,
  getLatestBackupTimestamp,
  backupDatabaseToDrive,
  restoreDatabaseFromDrive,
  GoogleDriveUser,
  saveGoogleTokenAndFetchProfile,
} from '../services/googleDriveService';
import { useSecurity } from '../security/SecurityContext';
import { verifyPIN, checkEmailExists } from '../security/auth';
import { useThemePreference } from '../theme/ThemePreferenceContext';
import {
  getAuditLogs,
  exportAuditLogsCsv,
  AuditLogEntry,
} from '../security/auditLogger';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function SettingsScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const theme = useTheme();
  const { themeMode, setThemeMode } = useThemePreference();
  const { user, setupSecurity, logout, lock, autoLockMinutes, updateAutoLockTimeout } = useSecurity();

  // Active modal section: 'profile' | 'cabinet' | 'security' | 'audit' | 'backup' | 'theme' | 'about' | null
  const [activeModal, setActiveModal] = useState<string | null>(null);

  // Doctor Profile state
  const [nom, setNom] = useState(user?.nom || '');
  const [prenom, setPrenom] = useState(user?.prenom || '');
  const [email, setEmail] = useState(user?.email || '');
  const [emailError, setEmailError] = useState('');
  const [telephone, setTelephone] = useState(user?.telephone || '');
  const [newPin, setNewPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [avatar, setAvatar] = useState('');
  const [signature, setSignature] = useState('');

  // Audit Logs state
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditFilter, setAuditFilter] = useState('ALL');

  const loadAuditLogs = async (filter: string = 'ALL') => {
    setLoadingAudit(true);
    try {
      const logs = await getAuditLogs(200, filter);
      setAuditLogs(logs);
    } catch (e) {
      console.error('Failed to load audit logs:', e);
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    if (activeModal === 'audit') {
      loadAuditLogs(auditFilter);
    }
  }, [activeModal, auditFilter]);

  // Cabinet Info State
  const [cabinetNom, setCabinetNom] = useState('Cabinet Médical Privé');
  const [cabinetAdresse, setCabinetAdresse] = useState('Dakar, Sénégal');
  const [cabinetPhone, setCabinetPhone] = useState('+221 77 123 45 67');
  const [cabinetHeader, setCabinetHeader] = useState('Consultations & Soins Médicaux Généralistes');

  // Google Drive & Backup state
  const [googleUser, setGoogleUser] = useState<GoogleDriveUser | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [customToken, setCustomToken] = useState('');

  const cleanRawName = (str: string | null | undefined): string => {
    if (!str) return '';
    return str.replace(/\b(dr|docteur)\.?\b/gi, '').replace(/\s+/g, ' ').trim();
  };

  useEffect(() => {
    loadGoogleDriveStatus();
    loadCabinetDetails();
  }, []);

  const loadGoogleDriveStatus = async () => {
    const connectedUser = await getConnectedUser();
    setGoogleUser(connectedUser);
    const time = await getLatestBackupTimestamp();
    setLastBackup(time);

    // Load doctor avatar photo & signature
    if (Platform.OS === 'web') {
      const savedAvatar = localStorage.getItem('doctor_avatar');
      if (savedAvatar) setAvatar(savedAvatar);
      const savedSig = localStorage.getItem('doctor_signature');
      if (savedSig) setSignature(savedSig);
    } else {
      SecureStore.getItemAsync('doctor_avatar')
        .then((savedAvatar) => savedAvatar && setAvatar(savedAvatar))
        .catch(() => {});
      SecureStore.getItemAsync('doctor_signature')
        .then((savedSig) => savedSig && setSignature(savedSig))
        .catch(() => {});
    }
  };

  const loadCabinetDetails = async () => {
    if (Platform.OS === 'web') {
      const cNom = localStorage.getItem('cabinet_nom');
      const cAdr = localStorage.getItem('cabinet_adresse');
      const cTel = localStorage.getItem('cabinet_phone');
      const cHead = localStorage.getItem('cabinet_header');
      if (cNom) setCabinetNom(cNom);
      if (cAdr) setCabinetAdresse(cAdr);
      if (cTel) setCabinetPhone(cTel);
      if (cHead) setCabinetHeader(cHead);
    } else {
      SecureStore.getItemAsync('cabinet_nom').then((val) => val && setCabinetNom(val)).catch(() => {});
      SecureStore.getItemAsync('cabinet_adresse').then((val) => val && setCabinetAdresse(val)).catch(() => {});
      SecureStore.getItemAsync('cabinet_phone').then((val) => val && setCabinetPhone(val)).catch(() => {});
      SecureStore.getItemAsync('cabinet_header').then((val) => val && setCabinetHeader(val)).catch(() => {});
    }
  };

  // Synchronise local state with global user
  useEffect(() => {
    if (user) {
      setNom(cleanRawName(user.nom));
      setPrenom(cleanRawName(user.prenom));
      setEmail(user.email);
      setTelephone(user.telephone || '');
    }
  }, [user]);

  const validateEmailUniqueness = async (emailToTest: string) => {
    if (!emailToTest.trim()) {
      setEmailError('');
      return true;
    }
    const isTaken = await checkEmailExists(emailToTest.trim(), user?.id);
    if (isTaken) {
      setEmailError('Cette adresse email est déjà utilisée.');
      return false;
    } else {
      setEmailError('');
      return true;
    }
  };

  const handleSaveProfile = async () => {
    if (!prenom.trim() || !nom.trim() || !email.trim() || !telephone.trim()) {
      alert("Champs obligatoires\n\nVeuillez renseigner le prénom, le nom, l'adresse email et le numéro de téléphone.");
      return;
    }

    const isEmailAvailable = await validateEmailUniqueness(email);
    if (!isEmailAvailable) {
      alert("Adresse email indisponible\n\nCette adresse email est déjà associée à un autre compte.");
      return;
    }

    if (!currentPin.trim()) {
      alert("Code PIN requis\n\nVeuillez saisir votre code PIN actuel pour valider les modifications.");
      return;
    }

    setSaving(true);
    try {
      const pinIsValid = await verifyPIN(currentPin.trim());
      if (!pinIsValid) {
        alert("Code PIN actuel incorrect\n\nLe code PIN saisi n'est pas valide.");
        setSaving(false);
        return;
      }

      const finalPin = newPin.trim() ? newPin.trim() : currentPin.trim();

      if (newPin.trim() && newPin.trim().length !== 4) {
        alert("Nouveau PIN invalide\n\nLe nouveau code PIN doit comporter précisément 4 chiffres.");
        setSaving(false);
        return;
      }

      const cleanNomVal = cleanRawName(nom);
      const cleanPrenomVal = cleanRawName(prenom);
      await setupSecurity(finalPin, cleanNomVal, cleanPrenomVal, email.trim(), telephone.trim());
      setNom(cleanNomVal);
      setPrenom(cleanPrenomVal);

      if (Platform.OS === 'web') {
        localStorage.setItem('doctor_signature', signature);
        localStorage.setItem('doctor_avatar', avatar);
      } else {
        await SecureStore.setItemAsync('doctor_signature', signature);
        await SecureStore.setItemAsync('doctor_avatar', avatar);
      }

      alert("Succès\n\nVotre profil de médecin a été mis à jour avec succès !");
      setNewPin('');
      setCurrentPin('');
      setActiveModal(null);
    } catch (e: any) {
      console.error(e);
      alert("Erreur\n\n" + (e.message || "Une erreur est survenue lors de la mise à jour."));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCabinet = async () => {
    if (Platform.OS === 'web') {
      localStorage.setItem('cabinet_nom', cabinetNom);
      localStorage.setItem('cabinet_adresse', cabinetAdresse);
      localStorage.setItem('cabinet_phone', cabinetPhone);
      localStorage.setItem('cabinet_header', cabinetHeader);
    } else {
      await SecureStore.setItemAsync('cabinet_nom', cabinetNom);
      await SecureStore.setItemAsync('cabinet_adresse', cabinetAdresse);
      await SecureStore.setItemAsync('cabinet_phone', cabinetPhone);
      await SecureStore.setItemAsync('cabinet_header', cabinetHeader);
    }
    alert("Succès\n\nInformations du cabinet enregistrées !");
    setActiveModal(null);
  };

  const handleGoogleLogin = async () => {
    try {
      const docName = `Dr ${prenom.trim()} ${nom.trim()}`;
      const docEmail = email.trim();
      const connectedUser = await loginToGoogleDrive(docName, docEmail, avatar);
      setGoogleUser(connectedUser);
      const time = await getLatestBackupTimestamp();
      setLastBackup(time);
      alert("Succès\n\nConnexion à Google Drive établie !");
    } catch (e) {
      console.error(e);
      alert("Erreur\n\nImpossible de se connecter à Google Drive.");
    }
  };

  const handleGoogleLogout = async () => {
    try {
      await logoutFromGoogleDrive();
      setGoogleUser(null);
      setLastBackup(null);
      alert("Succès\n\nDéconnexion réussie.");
    } catch (e) {
      console.error(e);
    }
  };

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      await backupDatabaseToDrive();
      const time = await getLatestBackupTimestamp();
      setLastBackup(time);
      alert("Succès\n\nSauvegarde effectuée !");
    } catch (e: any) {
      alert("Erreur\n\n" + e.message);
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      await restoreDatabaseFromDrive();
      alert("Succès\n\nDonnées restaurées !");
    } catch (e: any) {
      alert("Erreur\n\n" + e.message);
    } finally {
      setRestoring(false);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled && result.assets && result.assets[0].base64) {
      setSignature(`data:image/png;base64,${result.assets[0].base64}`);
    }
  };

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled && result.assets && result.assets[0].base64) {
      setAvatar(`data:image/png;base64,${result.assets[0].base64}`);
    }
  };

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: 40,
      paddingBottom: Spacing.four,
    },
  });

  return (
    <ScrollView
      style={styles.pageBackground}
      contentContainerStyle={[styles.scrollContent, contentPlatformStyle]}
    >
      {/* 1. Header Simplifié & Élégant */}
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>Paramètres</Text>
        <Text style={styles.headerSubtitle}>
          Gérez les préférences de votre compte et du cabinet
        </Text>
      </View>

      {/* 2. Liste Structurée des Menus dans un Conteneur Card Luxe */}
      <View style={styles.menuContainer}>
        {/* Item 1: Profil du Médecin */}
        <TouchableOpacity
          style={styles.menuCard}
          activeOpacity={0.7}
          onPress={() => setActiveModal('profile')}
        >
          <View style={styles.iconBadge}>
            <Ionicons name="person-outline" size={22} color="#28C2FF" />
          </View>
          <View style={styles.menuTextGroup}>
            <Text style={styles.menuTitle}>Profil du Médecin</Text>
            <Text style={styles.menuSubtitle}>
              Informations personnelles, spécialité, contact, signature
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#64748B" />
        </TouchableOpacity>

        {/* Item 2: Informations du Cabinet */}
        <TouchableOpacity
          style={styles.menuCard}
          activeOpacity={0.7}
          onPress={() => setActiveModal('cabinet')}
        >
          <View style={styles.iconBadge}>
            <Ionicons name="business-outline" size={22} color="#28C2FF" />
          </View>
          <View style={styles.menuTextGroup}>
            <Text style={styles.menuTitle}>Informations du Cabinet</Text>
            <Text style={styles.menuSubtitle}>
              Nom de la structure, adresse, téléphone, en-tête des ordonnances & logo
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#64748B" />
        </TouchableOpacity>

        {/* Item 3: Sécurité & Verrouillage */}
        <TouchableOpacity
          style={styles.menuCard}
          activeOpacity={0.7}
          onPress={() => setActiveModal('security')}
        >
          <View style={styles.iconBadge}>
            <Ionicons name="shield-checkmark-outline" size={22} color="#28C2FF" />
          </View>
          <View style={styles.menuTextGroup}>
            <Text style={styles.menuTitle}>Sécurité & Verrouillage</Text>
            <Text style={styles.menuSubtitle}>
              Code PIN, mot de passe, délai de verrouillage automatique
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#64748B" />
        </TouchableOpacity>

        {/* Item 3.5: Journal d'Audit & Traçabilité */}
        <TouchableOpacity
          style={styles.menuCard}
          activeOpacity={0.7}
          onPress={() => setActiveModal('audit')}
        >
          <View style={[styles.iconBadge, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
            <Ionicons name="finger-print-outline" size={22} color="#10B981" />
          </View>
          <View style={styles.menuTextGroup}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.menuTitle}>Journal d'Audit & Traçabilité</Text>
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>CONFORME</Text>
              </View>
            </View>
            <Text style={styles.menuSubtitle}>
              Historique des accès, consultations, modifications et sécurité
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#64748B" />
        </TouchableOpacity>

        {/* Item 4: Sauvegarde & Synchronisation */}
        <TouchableOpacity
          style={styles.menuCard}
          activeOpacity={0.7}
          onPress={() => setActiveModal('backup')}
        >
          <View style={styles.iconBadge}>
            <Ionicons name="cloud-upload-outline" size={22} color="#28C2FF" />
          </View>
          <View style={styles.menuTextGroup}>
            <Text style={styles.menuTitle}>Sauvegarde & Synchronisation</Text>
            <Text style={styles.menuSubtitle}>
              Sauvegarde cloud, export local et restauration des données
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#64748B" />
        </TouchableOpacity>

        {/* Item 5: Apparence & Thème */}
        <TouchableOpacity
          style={styles.menuCard}
          activeOpacity={0.7}
          onPress={() => setActiveModal('theme')}
        >
          <View style={styles.iconBadge}>
            <Ionicons name="color-palette-outline" size={22} color="#28C2FF" />
          </View>
          <View style={styles.menuTextGroup}>
            <Text style={styles.menuTitle}>Apparence & Thème</Text>
            <Text style={styles.menuSubtitle}>
              Mode sombre / clair, contraste et affichage
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#64748B" />
        </TouchableOpacity>

        {/* Item 6: À propos & Support */}
        <TouchableOpacity
          style={styles.menuCard}
          activeOpacity={0.7}
          onPress={() => setActiveModal('about')}
        >
          <View style={styles.iconBadge}>
            <Ionicons name="information-circle-outline" size={22} color="#28C2FF" />
          </View>
          <View style={styles.menuTextGroup}>
            <Text style={styles.menuTitle}>À propos & Support</Text>
            <Text style={styles.menuSubtitle}>
              Version de l'application (v1.0), aide et contact technique
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#64748B" />
        </TouchableOpacity>

        {/* Item 7: Déconnexion */}
        <TouchableOpacity
          style={[styles.menuCardLast, { backgroundColor: 'rgba(255, 107, 107, 0.1)', borderColor: '#FF6B6B', marginTop: 12 }]}
          activeOpacity={0.7}
          onPress={() => {
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              if (window.confirm("Voulez-vous vous déconnecter de votre cabinet ?")) {
                logout();
              }
            } else {
              Alert.alert('Déconnexion', 'Voulez-vous vous déconnecter de ce cabinet ?', [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Déconnexion', style: 'destructive', onPress: logout }
              ]);
            }
          }}
        >
          <View style={[styles.iconBadge, { backgroundColor: 'rgba(255, 107, 107, 0.2)' }]}>
            <Ionicons name="log-out-outline" size={22} color="#FF6B6B" />
          </View>
          <View style={styles.menuTextGroup}>
            <Text style={[styles.menuTitle, { color: '#FF6B6B' }]}>Se déconnecter du Cabinet</Text>
            <Text style={styles.menuSubtitle}>
              Réinitialiser la session locale et changer d'appareil / compte
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#FF6B6B" />
        </TouchableOpacity>
      </View>

      {/* ================= MODAL 1: PROFIL DU MÉDECIN ================= */}
      <Modal
        visible={activeModal === 'profile'}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setActiveModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Profil du Médecin</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <Ionicons name="close-circle" size={26} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Prénom *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Prénom"
                  placeholderTextColor="#94A3B8"
                  value={prenom}
                  onChangeText={setPrenom}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Nom de famille *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Nom"
                  placeholderTextColor="#94A3B8"
                  value={nom}
                  onChangeText={setNom}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Adresse Email *</Text>
                <TextInput
                  style={[styles.textInput, emailError ? { borderColor: '#FF6B6B', borderWidth: 1.5 } : null]}
                  placeholder="Email"
                  placeholderTextColor="#94A3B8"
                  value={email}
                  onChangeText={(val) => {
                    setEmail(val);
                    if (emailError) setEmailError('');
                  }}
                  onBlur={() => validateEmailUniqueness(email)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                {!!emailError && (
                  <Text style={styles.errorText}>⚠️ {emailError}</Text>
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Numéro de Téléphone (9 chiffres max) *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Ex: 771234567"
                  placeholderTextColor="#94A3B8"
                  value={telephone}
                  onChangeText={(txt) => setTelephone(txt.replace(/\D/g, '').slice(0, 9))}
                  keyboardType="number-pad"
                  maxLength={9}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Nouveau PIN (optionnel)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="4 chiffres"
                    placeholderTextColor="#94A3B8"
                    value={newPin}
                    onChangeText={setNewPin}
                    keyboardType="numeric"
                    maxLength={4}
                    secureTextEntry
                  />
                </View>

                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>PIN actuel *</Text>
                  <TextInput
                    style={[styles.textInput, { borderColor: '#28C2FF' }]}
                    placeholder="PIN actuel"
                    placeholderTextColor="#94A3B8"
                    value={currentPin}
                    onChangeText={setCurrentPin}
                    keyboardType="numeric"
                    maxLength={4}
                    secureTextEntry
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Photo de Profil du Médecin</Text>
                {avatar ? (
                  <View style={styles.imagePreviewContainer}>
                    <Image source={{ uri: avatar }} style={styles.avatarPreview} />
                    <TouchableOpacity style={styles.removeBtn} onPress={() => setAvatar('')}>
                      <Text style={styles.removeBtnText}>Supprimer photo</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.uploadBtn} onPress={pickAvatar}>
                    <Ionicons name="camera-outline" size={18} color="#28C2FF" />
                    <Text style={styles.uploadBtnText}>Téléverser une photo de profil</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Signature du Médecin (pour ordonnances & certificats)</Text>
                {signature ? (
                  <View style={styles.imagePreviewContainer}>
                    <Image source={{ uri: signature }} style={styles.signaturePreview} />
                    <TouchableOpacity style={styles.removeBtn} onPress={() => setSignature('')}>
                      <Text style={styles.removeBtnText}>Supprimer signature</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.uploadBtn} onPress={pickImage}>
                    <Ionicons name="pencil-outline" size={18} color="#28C2FF" />
                    <Text style={styles.uploadBtnText}>Téléverser une image de signature</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={styles.saveSubmitBtn}
                onPress={handleSaveProfile}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#0F2C3D" />
                ) : (
                  <Text style={styles.saveSubmitBtnText}>Enregistrer le profil</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL 2: INFORMATIONS DU CABINET ================= */}
      <Modal
        visible={activeModal === 'cabinet'}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setActiveModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Informations du Cabinet</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <Ionicons name="close-circle" size={26} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Nom de la structure / Cabinet *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Ex: Cabinet Médical Privé"
                  placeholderTextColor="#94A3B8"
                  value={cabinetNom}
                  onChangeText={setCabinetNom}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Adresse de l'établissement</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Ex: Dakar, Liberté 6 Extension"
                  placeholderTextColor="#94A3B8"
                  value={cabinetAdresse}
                  onChangeText={setCabinetAdresse}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Téléphone fixe / secrétariat</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Ex: +221 33 825 00 00"
                  placeholderTextColor="#94A3B8"
                  value={cabinetPhone}
                  onChangeText={setCabinetPhone}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>En-tête personnalisé des Ordonnance & Certificats</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Ex: Consultations, Soins & Suivi Médical"
                  placeholderTextColor="#94A3B8"
                  value={cabinetHeader}
                  onChangeText={setCabinetHeader}
                />
              </View>

              <TouchableOpacity
                style={styles.saveSubmitBtn}
                onPress={handleSaveCabinet}
              >
                <Text style={styles.saveSubmitBtnText}>Enregistrer le cabinet</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL 3: SÉCURITÉ & VERROUILLAGE ================= */}
      <Modal
        visible={activeModal === 'security'}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setActiveModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sécurité & Verrouillage</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <Ionicons name="close-circle" size={26} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalScroll}>
              <View style={styles.infoBadgeBox}>
                <Ionicons name="shield-checkmark" size={24} color="#28C2FF" />
                <Text style={styles.infoBadgeTitle}>Protection & Secret Médical</Text>
                <Text style={styles.infoBadgeDesc}>
                  Toutes les données cliniques sont chiffrées en AES-256. L'écran se verrouille automatiquement en cas d'inactivité pour éviter toute indiscrétion en cabinet.
                </Text>
              </View>

              {/* Minuteur d'Inactivité Personnalisable */}
              <View style={{ marginTop: 20 }}>
                <Text style={styles.inputLabel}>Délai de Verrouillage Automatique</Text>
                <Text style={{ fontSize: 12, color: '#94A3B8', marginBottom: 10 }}>
                  Choisissez la durée d'inactivité avant le masquage automatique des dossiers médicaux :
                </Text>

                <View style={{ gap: 8 }}>
                  {[
                    { minutes: 1, label: '1 minute', tag: 'Ultra Sécurisé' },
                    { minutes: 2, label: '2 minutes', tag: 'Recommandé en cabinet' },
                    { minutes: 5, label: '5 minutes', tag: 'Standard' },
                    { minutes: 10, label: '10 minutes', tag: null },
                    { minutes: 15, label: '15 minutes', tag: null },
                    { minutes: 0, label: 'Désactivé', tag: 'Non recommandé' },
                  ].map((opt) => {
                    const isSelected = autoLockMinutes === opt.minutes;
                    return (
                      <TouchableOpacity
                        key={opt.minutes}
                        style={[
                          styles.timeoutOptionRow,
                          isSelected && styles.timeoutOptionActive,
                        ]}
                        onPress={() => updateAutoLockTimeout(opt.minutes)}
                        activeOpacity={0.7}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                          <Ionicons
                            name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                            size={18}
                            color={isSelected ? '#28C2FF' : '#64748B'}
                          />
                          <Text style={[styles.timeoutOptionLabel, isSelected && { color: '#FFFFFF', fontWeight: 'bold' }]}>
                            {opt.label}
                          </Text>
                          {opt.tag && (
                            <View style={[styles.timeoutTag, isSelected && { backgroundColor: 'rgba(40, 194, 255, 0.2)' }]}>
                              <Text style={[styles.timeoutTagText, isSelected && { color: '#28C2FF' }]}>{opt.tag}</Text>
                            </View>
                          )}
                        </View>
                        {isSelected && <Ionicons name="checkmark-circle" size={18} color="#28C2FF" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Bouton Verrouiller Maintenant */}
              <TouchableOpacity
                style={[styles.saveSubmitBtn, { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', marginTop: 20 }]}
                onPress={() => {
                  setActiveModal(null);
                  setTimeout(() => {
                    lock();
                  }, 100);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="lock-closed" size={16} color="#28C2FF" />
                  <Text style={[styles.saveSubmitBtnText, { color: '#28C2FF' }]}>Verrouiller l'écran maintenant</Text>
                </View>
              </TouchableOpacity>

              {/* Bouton Modifier Code PIN */}
              <TouchableOpacity
                style={[styles.saveSubmitBtn, { marginTop: 4 }]}
                onPress={() => {
                  setActiveModal('profile');
                }}
              >
                <Text style={styles.saveSubmitBtnText}>Modifier mon Code PIN (4 chiffres)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL 3.5: JOURNAL D'AUDIT & TRAÇABILITÉ ================= */}
      <Modal
        visible={activeModal === 'audit'}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setActiveModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: 680, maxHeight: '92%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(16, 185, 129, 0.15)', justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="finger-print" size={20} color="#10B981" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Journal d'Audit & Traçabilité</Text>
                  <Text style={{ fontSize: 12, color: '#94A3B8' }}>Registre médico-légal des accès et des actions</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <Ionicons name="close-circle" size={26} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Quick Actions Bar */}
            <View style={styles.auditActionBar}>
              <View style={styles.auditFilterTabs}>
                {[
                  { id: 'ALL', label: 'Tous' },
                  { id: 'LOGIN', label: 'Sécurité' },
                  { id: 'PATIENT', label: 'Patients' },
                  { id: 'CONSULTATION', label: 'Consultations' },
                ].map((tab) => (
                  <TouchableOpacity
                    key={tab.id}
                    style={[styles.auditFilterPill, auditFilter === tab.id && styles.auditFilterPillActive]}
                    onPress={() => setAuditFilter(tab.id)}
                  >
                    <Text style={[styles.auditFilterText, auditFilter === tab.id && styles.auditFilterTextActive]}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={styles.auditExportBtn}
                onPress={() => {
                  if (auditLogs.length === 0) {
                    alert("Aucun événement à exporter pour le moment.");
                    return;
                  }
                  exportAuditLogsCsv(auditLogs);
                }}
              >
                <Ionicons name="download-outline" size={16} color="#0F2C3D" />
                <Text style={styles.auditExportBtnText}>Exporter CSV</Text>
              </TouchableOpacity>
            </View>

            {/* Stats row */}
            <View style={styles.auditStatsRow}>
              <View style={styles.auditStatCard}>
                <Text style={styles.auditStatVal}>{auditLogs.length}</Text>
                <Text style={styles.auditStatLabel}>Événements</Text>
              </View>
              <View style={styles.auditStatCard}>
                <Text style={[styles.auditStatVal, { color: '#10B981' }]}>
                  {auditLogs.filter(l => l.criticite === 'SUCCESS').length}
                </Text>
                <Text style={styles.auditStatLabel}>Succès</Text>
              </View>
              <View style={styles.auditStatCard}>
                <Text style={[styles.auditStatVal, { color: '#F59E0B' }]}>
                  {auditLogs.filter(l => l.criticite === 'WARNING' || l.criticite === 'DANGER').length}
                </Text>
                <Text style={styles.auditStatLabel}>Alertes Sécurité</Text>
              </View>
            </View>

            {/* Audit Logs List */}
            <ScrollView style={styles.auditScroll} showsVerticalScrollIndicator={true}>
              {loadingAudit ? (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#28C2FF" />
                  <Text style={{ color: '#94A3B8', marginTop: 12, fontSize: 13 }}>Chargement du registre d'audit...</Text>
                </View>
              ) : auditLogs.length === 0 ? (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <Ionicons name="shield-checkmark" size={42} color="#334155" />
                  <Text style={{ color: '#94A3B8', marginTop: 12, fontSize: 14 }}>Aucun événement enregistré pour ce filtre.</Text>
                </View>
              ) : (
                <View style={{ gap: 8, paddingBottom: 20 }}>
                  {auditLogs.map((log) => {
                    const badgeColor =
                      log.criticite === 'SUCCESS' ? '#10B981' :
                      log.criticite === 'WARNING' ? '#F59E0B' :
                      log.criticite === 'DANGER' ? '#EF4444' : '#28C2FF';

                    const badgeBg =
                      log.criticite === 'SUCCESS' ? 'rgba(16, 185, 129, 0.15)' :
                      log.criticite === 'WARNING' ? 'rgba(245, 158, 11, 0.15)' :
                      log.criticite === 'DANGER' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(40, 194, 255, 0.15)';

                    const dateFormatted = new Date(log.date).toLocaleString('fr-FR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    });

                    return (
                      <View key={log.id} style={styles.auditLogRow}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <View style={[styles.auditBadge, { backgroundColor: badgeBg }]}>
                            <Text style={[styles.auditBadgeText, { color: badgeColor }]}>{log.action}</Text>
                          </View>
                          <Text style={styles.auditDateText}>{dateFormatted}</Text>
                        </View>
                        <Text style={styles.auditDescText}>{log.description}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <Ionicons name="person-outline" size={12} color="#64748B" />
                          <Text style={styles.auditUserText}>Auteur : {log.utilisateur_id || 'Praticien'}</Text>
                          <Text style={styles.auditSeparator}>•</Text>
                          <Text style={styles.auditModuleText}>Module : {log.table_cible}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL 4: SAUVEGARDE & SYNCHRONISATION ================= */}
      <Modal
        visible={activeModal === 'backup'}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setActiveModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sauvegarde & Synchronisation</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <Ionicons name="close-circle" size={26} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              {googleUser ? (
                <View style={styles.backupCardContent}>
                  <View style={styles.userGoogleRow}>
                    <Image
                      source={avatar ? { uri: avatar } : require('../../assets/images/favicon.png')}
                      style={styles.userGoogleAvatar}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.userGoogleName}>Dr {prenom.trim()} {nom.trim()}</Text>
                      <Text style={styles.userGoogleEmail}>{email.trim()}</Text>
                    </View>
                  </View>

                  <Text style={styles.lastBackupText}>
                    Dernière sauvegarde : {lastBackup ? new Date(lastBackup).toLocaleString('fr-FR') : 'Aucune'}
                  </Text>

                  <View style={{ gap: 10, marginTop: 12 }}>
                    <TouchableOpacity
                      style={styles.backupRunBtn}
                      onPress={handleBackup}
                      disabled={backingUp}
                    >
                      {backingUp ? (
                        <ActivityIndicator size="small" color="#0F2C3D" />
                      ) : (
                        <Text style={styles.backupRunBtnText}>⚡ Sauvegarder Maintenant</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.restoreRunBtn}
                      onPress={handleRestore}
                      disabled={restoring}
                    >
                      {restoring ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.restoreRunBtnText}>📥 Restaurer la base de données</Text>
                      )}
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity style={styles.logoutGoogleBtn} onPress={handleGoogleLogout}>
                    <Text style={styles.logoutGoogleBtnText}>Déconnecter Google Drive</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.backupCardContent}>
                  <Text style={styles.backupIntroText}>
                    Sauvegardez l'intégralité de vos dossiers cliniques de façon sécurisée et synchronisez-les entre vos appareils mobile et ordinateur.
                  </Text>

                  <TouchableOpacity
                    style={styles.loginGoogleBtn}
                    onPress={handleGoogleLogin}
                    disabled={saving}
                  >
                    <Ionicons name="logo-google" size={18} color="#0F2C3D" />
                    <Text style={styles.loginGoogleBtnText}>Connexion Google Drive</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL 5: APPARENCE & THÈME ================= */}
      <Modal
        visible={activeModal === 'theme'}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setActiveModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Apparence & Thème</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <Ionicons name="close-circle" size={26} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalScroll}>
              <TouchableOpacity
                style={[styles.themeOptionRow, themeMode === 'dark' && styles.themeOptionActive]}
                onPress={() => setThemeMode('dark')}
              >
                <Ionicons name="moon-outline" size={20} color="#28C2FF" />
                <Text style={styles.themeOptionText}>Mode Sombre Pro (Recommandé)</Text>
                {themeMode === 'dark' && <Ionicons name="checkmark" size={20} color="#28C2FF" />}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.themeOptionRow, themeMode === 'light' && styles.themeOptionActive]}
                onPress={() => setThemeMode('light')}
              >
                <Ionicons name="sunny-outline" size={20} color="#28C2FF" />
                <Text style={styles.themeOptionText}>Mode Clair</Text>
                {themeMode === 'light' && <Ionicons name="checkmark" size={20} color="#28C2FF" />}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= MODAL 6: À PROPOS & SUPPORT ================= */}
      <Modal
        visible={activeModal === 'about'}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setActiveModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>À propos de MedRecord</Text>
              <TouchableOpacity onPress={() => setActiveModal(null)}>
                <Ionicons name="close-circle" size={26} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalScroll}>
              <View style={{ alignItems: 'center', marginVertical: 12 }}>
                <Ionicons name="medical" size={48} color="#28C2FF" />
                <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#FFFFFF', marginTop: 8 }}>
                  MedRecord Pro
                </Text>
                <Text style={{ fontSize: 13, color: '#94A3B8', marginTop: 2 }}>
                  Version 1.0.0 (Production Release)
                </Text>
              </View>

              <Text style={{ fontSize: 13, color: '#CBD5E1', textAlign: 'center', lineHeight: 20 }}>
                Plateforme médicale intelligente de gestion de dossier patient électronique (DPE), ordonnances et certificats conformes.
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pageBackground: {
    flex: 1,
    backgroundColor: '#0F172A', // Slate 900 dark background
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  headerContainer: {
    marginBottom: 24,
    paddingTop: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 4,
    fontWeight: '400',
  },
  menuContainer: {
    backgroundColor: '#1E293B', // Slate 800
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155', // Slate 700
    overflow: 'hidden',
  },
  menuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  menuCardLast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  menuTextGroup: {
    flex: 1,
    paddingRight: 8,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  menuSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 3,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 540,
    backgroundColor: '#1E293B',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  modalScroll: {
    maxHeight: 520,
  },
  formGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8AC8F9',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#0F172A',
    color: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#334155',
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 13,
    marginTop: 6,
    fontWeight: 'bold',
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 14,
  },
  uploadBtnText: {
    color: '#28C2FF',
    fontWeight: '600',
    fontSize: 14,
  },
  imagePreviewContainer: {
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  avatarPreview: {
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  signaturePreview: {
    width: 200,
    height: 80,
    resizeMode: 'contain',
  },
  removeBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  removeBtnText: {
    color: '#FF6B6B',
    fontSize: 12,
    fontWeight: '600',
  },
  saveSubmitBtn: {
    backgroundColor: '#28C2FF',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  saveSubmitBtnText: {
    color: '#0F2C3D',
    fontWeight: 'bold',
    fontSize: 15,
  },
  infoBadgeBox: {
    alignItems: 'center',
    backgroundColor: '#0F172A',
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  infoBadgeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 8,
  },
  infoBadgeDesc: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  backupCardContent: {
    backgroundColor: '#0F172A',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  userGoogleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  userGoogleAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  userGoogleName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  userGoogleEmail: {
    fontSize: 13,
    color: '#94A3B8',
  },
  lastBackupText: {
    fontSize: 12,
    color: '#28C2FF',
    fontWeight: '600',
    marginBottom: 8,
  },
  backupRunBtn: {
    backgroundColor: '#28C2FF',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  backupRunBtnText: {
    color: '#0F2C3D',
    fontWeight: 'bold',
    fontSize: 14,
  },
  restoreRunBtn: {
    backgroundColor: '#334155',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  restoreRunBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  logoutGoogleBtn: {
    marginTop: 14,
    alignItems: 'center',
  },
  logoutGoogleBtnText: {
    color: '#FF6B6B',
    fontSize: 13,
    fontWeight: '600',
  },
  backupIntroText: {
    fontSize: 14,
    color: '#CBD5E1',
    lineHeight: 20,
    marginBottom: 14,
  },
  loginGoogleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#28C2FF',
    paddingVertical: 14,
    borderRadius: 10,
  },
  loginGoogleBtnText: {
    color: '#0F2C3D',
    fontWeight: 'bold',
    fontSize: 14,
  },
  themeOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#0F172A',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 10,
  },
  themeOptionActive: {
    borderColor: '#28C2FF',
    backgroundColor: '#1E3E52',
  },
  themeOptionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  auditActionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  auditFilterTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  auditFilterPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
  },
  auditFilterPillActive: {
    backgroundColor: '#28C2FF',
    borderColor: '#28C2FF',
  },
  auditFilterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  auditFilterTextActive: {
    color: '#0F2C3D',
    fontWeight: 'bold',
  },
  auditExportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#28C2FF',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  auditExportBtnText: {
    color: '#0F2C3D',
    fontWeight: 'bold',
    fontSize: 12,
  },
  auditStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  auditStatCard: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  auditStatVal: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#28C2FF',
  },
  auditStatLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  auditScroll: {
    maxHeight: 460,
  },
  auditLogRow: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  auditBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  auditBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  auditDateText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  auditDescText: {
    fontSize: 13,
    color: '#F1F5F9',
    marginVertical: 4,
    lineHeight: 18,
  },
  auditUserText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  auditSeparator: {
    fontSize: 11,
    color: '#64748B',
  },
  auditModuleText: {
    fontSize: 11,
    color: '#64748B',
    fontStyle: 'italic',
  },
  proBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  proBadgeText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#10B981',
    letterSpacing: 0.5,
  },
  timeoutOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  timeoutOptionActive: {
    borderColor: '#28C2FF',
    backgroundColor: 'rgba(40, 194, 255, 0.08)',
  },
  timeoutOptionLabel: {
    fontSize: 14,
    color: '#CBD5E1',
    fontWeight: '500',
  },
  timeoutTag: {
    backgroundColor: 'rgba(148, 163, 184, 0.15)',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  timeoutTagText: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },
});
