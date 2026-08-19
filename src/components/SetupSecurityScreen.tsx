import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSecurity } from '../security/SecurityContext';
import { checkEmailExists } from '../security/auth';
import PhoneInputInternational from './PhoneInputInternational';

const SPECIALITIES = [
  'Médecine Générale',
  'Pédiatrie',
  'Cardiologie',
  'Gynécologie-Obstétrique',
  'Dermatologie',
  'Chirurgie Générale',
  'Neurologie',
  'Ophtalmologie',
  'Otorhinolaryngologie (ORL)',
  'Psychiatrie',
  'Urgentiste',
  'Autre...',
];

interface OtpInputProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
}

function OtpPinInput({ label, value, onChange }: OtpInputProps) {
  const inputsRef = useRef<(TextInput | null)[]>([]);
  const digits = Array.from({ length: 4 }, (_, i) => value[i] || '');

  const handleChangeText = (text: string, index: number) => {
    const cleanDigit = text.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = cleanDigit;
    const combined = newDigits.join('');
    onChange(combined);

    if (cleanDigit && index < 3) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        inputsRef.current[index - 1]?.focus();
      }
    }
  };

  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'center' }}>
        {[0, 1, 2, 3].map((idx) => {
          const isFilled = Boolean(digits[idx]);
          return (
            <TextInput
              key={idx}
              ref={(el) => { inputsRef.current[idx] = el; }}
              style={[
                styles.otpBox,
                isFilled && styles.otpBoxFilled,
              ]}
              value={digits[idx]}
              onChangeText={(txt) => handleChangeText(txt, idx)}
              onKeyPress={(e) => handleKeyPress(e, idx)}
              keyboardType="number-pad"
              maxLength={1}
              secureTextEntry
              selectTextOnFocus
            />
          );
        })}
      </View>
    </View>
  );
}

export default function SetupSecurityScreen({ onSetupSuccess }: { onSetupSuccess?: (docData: any) => void }) {
  const { setupSecurity } = useSecurity();
  const [civilite, setCivilite] = useState<'Dr' | 'Pr'>('Dr');
  const [specialite, setSpecialite] = useState('Médecine Générale');
  const [modalSpecialiteVisible, setModalSpecialiteVisible] = useState(false);

  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [telephone, setTelephone] = useState('');
  const [numeroOrdre, setNumeroOrdre] = useState('');

  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const validateEmailUniqueness = async (emailToTest: string) => {
    const clean = emailToTest.trim().toLowerCase();
    if (!clean) {
      setEmailError('');
      return true;
    }
    const isFormatOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
    if (!isFormatOk) {
      setEmailError('Format d\'adresse email invalide.');
      return false;
    }
    setEmailError('');
    return true;
  };

  const showAlert = (title: string, message: string) => {
    setErrorMsg(message);
    if (Platform.OS === 'web') {
      alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const isPinComplete = pin.length === 4 && confirmPin.length === 4;
  const isPinMatch = isPinComplete && pin === confirmPin;
  const isFormValid =
    nom.trim().length > 0 &&
    prenom.trim().length > 0 &&
    email.trim().length > 0 &&
    telephone.trim().length > 0 &&
    isPinMatch;

  const handleSetup = async () => {
    setErrorMsg('');
    if (!nom.trim() || !prenom.trim() || !email.trim() || !telephone.trim() || !pin || !confirmPin) {
      showAlert('Champs requis', 'Veuillez remplir tous les champs obligatoires (prénom, nom, email, téléphone et code PIN).');
      return;
    }

    const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());
    if (!isEmailValid) {
      showAlert('Email invalide', 'Veuillez saisir une adresse e-mail valide (ex: dr.diop@cabinet.sn).');
      return;
    }

    const cleanPhone = telephone.trim().replace(/[\s\-\(\)\+]/g, '');
    const isPhoneValid = /^[0-9]{8,15}$/.test(cleanPhone);
    if (!isPhoneValid) {
      showAlert('Téléphone invalide', 'Veuillez saisir un numéro de téléphone valide.');
      return;
    }

    if (nom.trim().length < 2 || prenom.trim().length < 2 || /^([a-zA-Z0-9])\1{4,}$/.test(nom.trim()) || /^([a-zA-Z0-9])\1{4,}$/.test(prenom.trim())) {
      showAlert('Nom ou Prénom invalide', 'Veuillez saisir un prénom et un nom de famille valides.');
      return;
    }

    if (pin.length !== 4 || isNaN(Number(pin))) {
      showAlert('Code PIN invalide', 'Le code PIN doit être composé exactement de 4 chiffres.');
      return;
    }

    if (pin !== confirmPin) {
      showAlert('Erreur de confirmation', 'Les deux codes PIN saisis ne correspondent pas.');
      return;
    }

    setLoading(true);
    try {
      const rawNom = nom.trim().replace(/\b(dr|docteur|pr|professeur)\.?\b/gi, '').trim();
      const rawPrenom = prenom.trim().replace(/\b(dr|docteur|pr|professeur)\.?\b/gi, '').trim();

      const Crypto = require('expo-crypto');
      const pinHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        pin
      );

      // 1. Initialiser le profil utilisateur et la sécurité SQLite / SecureStore
      const profile = await setupSecurity(pin, rawNom, rawPrenom, email.trim(), telephone.trim());

      const docProfileData = {
        id: profile?.id || `user_${Date.now()}`,
        civilite,
        specialite,
        numero_rpps: numeroOrdre.trim(),
        nom: rawNom,
        prenom: rawPrenom,
        email: email.trim(),
        telephone: telephone.trim(),
        phone: telephone.trim(),
        pin,
        pin_hash: pinHash,
        role: 'MEDECIN',
      };

      // 2. Sauvegarde des métadonnées du cabinet
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const { STORAGE_KEYS, safeStorageSet, persistActiveSession } = require('../utils/storage');
        const { saveActiveDoctorSession } = require('../services/storageService');
        saveActiveDoctorSession(docProfileData);
        safeStorageSet(STORAGE_KEYS.DOCTOR_META, docProfileData);
        safeStorageSet(STORAGE_KEYS.DOCTOR_PROFILE, docProfileData);
        safeStorageSet(STORAGE_KEYS.CURRENT_USER, docProfileData);
        persistActiveSession(docProfileData);
      }

      if (onSetupSuccess) {
        onSetupSuccess(docProfileData);
      }
    } catch (err: any) {
      console.error('MedRecord: Error creating cabinet profile:', err);
      showAlert('Erreur de configuration', err.message || 'Une erreur est survenue lors de la sauvegarde du cabinet.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.card}>
          {/* Card Header */}
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <View style={styles.iconCircle}>
              <Ionicons name="shield-checkmark" size={28} color="#28C2FF" />
            </View>
            <Text style={styles.title}>Configuration Sécurisée</Text>
            <Text style={styles.subtitle}>
              Bienvenue sur MedRecord. Configurez le profil de votre cabinet et votre code PIN d'accès.
            </Text>
          </View>

          {errorMsg !== '' && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={18} color="#FF6B6B" />
              <Text style={styles.errorBoxText}>{errorMsg}</Text>
            </View>
          )}

          {/* LIGNE 1 : Civilité + Spécialité */}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            <View style={{ width: 110 }}>
              <Text style={styles.label}>Civilité</Text>
              <View style={{ flexDirection: 'row', gap: 6, backgroundColor: '#0F2C3D', borderRadius: 8, padding: 3, borderWidth: 1, borderColor: '#334155' }}>
                {(['Dr', 'Pr'] as const).map((civ) => (
                  <TouchableOpacity
                    key={civ}
                    style={[
                      styles.civBtn,
                      civilite === civ && styles.civBtnActive,
                    ]}
                    onPress={() => setCivilite(civ)}
                  >
                    <Text style={[styles.civText, civilite === civ && styles.civTextActive]}>{civ}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Spécialité Médicale</Text>
              <TouchableOpacity
                style={styles.selectBtn}
                onPress={() => setModalSpecialiteVisible(true)}
              >
                <Text style={styles.selectBtnText} numberOfLines={1}>
                  {specialite}
                </Text>
                <Ionicons name="chevron-down" size={16} color="#8AC8F9" />
              </TouchableOpacity>
            </View>
          </View>

          {/* LIGNE 2 : Prénom et Nom de famille (2 colonnes) */}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Prénom *</Text>
              <TextInput
                style={styles.input}
                placeholder="ex: Mohamadou Bamba"
                value={prenom}
                onChangeText={setPrenom}
                placeholderTextColor="#64748B"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Nom de famille *</Text>
              <TextInput
                style={styles.input}
                placeholder="ex: Diop"
                value={nom}
                onChangeText={setNom}
                placeholderTextColor="#64748B"
              />
            </View>
          </View>

          {/* LIGNE 3 : Adresse Email + Mention d'aide */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Adresse Email *</Text>
            <TextInput
              style={[styles.input, emailError ? { borderColor: '#FF6B6B', borderWidth: 1.5 } : null]}
              placeholder="ex: dr.diop@cabinet-medrecord.sn"
              value={email}
              onChangeText={(val) => {
                setEmail(val);
                if (emailError) setEmailError('');
              }}
              onBlur={() => validateEmailUniqueness(email)}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor="#64748B"
            />
            {!!emailError ? (
              <Text style={{ color: '#FF6B6B', fontSize: 12, marginTop: 4, fontWeight: 'bold' }}>
                ⚠️ {emailError}
              </Text>
            ) : (
              <Text style={styles.helpHint}>
                💡 Sert pour la récupération d'accès et les sauvegardes de votre cabinet.
              </Text>
            )}
          </View>

          {/* LIGNE 4 : Numéro de Téléphone avec Sélecteur d'Indicatif */}
          <View style={styles.inputGroup}>
            <PhoneInputInternational
              label="Numéro de Téléphone *"
              value={telephone}
              onChange={setTelephone}
            />
          </View>

          {/* LIGNE 5 : N° Ordre des Médecins / RPPS (Optionnel) */}
          <View style={styles.inputGroup}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={styles.label}>N° Ordre des Médecins / RPPS</Text>
              <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>(Facultatif)</Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="ex: 123456789"
              value={numeroOrdre}
              onChangeText={setNumeroOrdre}
              keyboardType="number-pad"
              placeholderTextColor="#64748B"
            />
            <Text style={styles.helpHint}>
              Servira uniquement à pré-remplir l'en-tête de vos ordonnances et certificats.
            </Text>
          </View>

          {/* SÉCURITÉ : Code PIN (Pattern 4 Cases / OTP) */}
          <View style={styles.pinSection}>
            <Text style={styles.sectionTitle}>Sécurité & Code PIN (4 chiffres)</Text>

            <View style={{ gap: 14 }}>
              <OtpPinInput
                label="Définir le Code PIN (4 chiffres) *"
                value={pin}
                onChange={setPin}
              />

              <OtpPinInput
                label="Confirmer le Code PIN *"
                value={confirmPin}
                onChange={setConfirmPin}
              />
            </View>

            {/* Indicateur visuel temps réel de validation du PIN */}
            {isPinComplete && (
              <View style={[
                styles.pinMatchBadge,
                isPinMatch ? styles.pinMatchSuccess : styles.pinMatchError
              ]}>
                <Ionicons
                  name={isPinMatch ? "checkmark-circle" : "close-circle"}
                  size={18}
                  color={isPinMatch ? "#2ECC71" : "#FF6B6B"}
                />
                <Text style={[
                  styles.pinMatchText,
                  { color: isPinMatch ? "#2ECC71" : "#FF6B6B" }
                ]}>
                  {isPinMatch
                    ? "✓ Codes PIN identiques"
                    : "✗ Les deux codes PIN ne correspondent pas"}
                </Text>
              </View>
            )}
          </View>

          {/* Bouton d'action principal */}
          <TouchableOpacity
            style={[
              styles.button,
              (!isFormValid || loading) && styles.buttonDisabled,
            ]}
            onPress={handleSetup}
            disabled={!isFormValid || loading}
          >
            <Ionicons name="rocket-outline" size={20} color={isFormValid ? "#0F172A" : "#64748B"} />
            <Text style={[styles.buttonText, !isFormValid && styles.buttonTextDisabled]}>
              {loading ? 'Activation du Cabinet...' : 'Activer mon Cabinet MedRecord'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Modal Sélection de la Spécialité */}
      <Modal animationType="slide" transparent={true} visible={modalSpecialiteVisible} onRequestClose={() => setModalSpecialiteVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sélectionner une Spécialité</Text>
              <TouchableOpacity onPress={() => setModalSpecialiteVisible(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={SPECIALITIES}
              keyExtractor={(item) => item}
              renderItem={({ item }) => {
                const isSelected = item === specialite;
                return (
                  <TouchableOpacity
                    style={[styles.specialiteItem, isSelected && styles.specialiteItemActive]}
                    onPress={() => {
                      setSpecialite(item);
                      setModalSpecialiteVisible(false);
                    }}
                  >
                    <Ionicons
                      name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                      size={18}
                      color={isSelected ? "#28C2FF" : "#64748B"}
                    />
                    <Text style={[styles.specialiteItemText, isSelected && styles.specialiteItemTextActive]}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A', // MedRecord Slate Dark
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: '#1E293B', // MedRecord Dark Card
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 10,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(40, 194, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#28C2FF',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    borderWidth: 1,
    borderColor: '#FF6B6B',
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
  },
  errorBoxText: {
    color: '#FF6B6B',
    fontSize: 12,
    fontWeight: 'bold',
    flex: 1,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8AC8F9',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#0F2C3D',
    color: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  helpHint: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
  },
  civBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  civBtnActive: {
    backgroundColor: '#28C2FF',
  },
  civText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: 'bold',
  },
  civTextActive: {
    color: '#0F172A',
  },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F2C3D',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  selectBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  pinSection: {
    backgroundColor: '#0F2C3D',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
    gap: 12,
  },
  sectionTitle: {
    color: '#28C2FF',
    fontSize: 13,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  otpBox: {
    width: 48,
    height: 48,
    backgroundColor: '#1E293B',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#334155',
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  otpBoxFilled: {
    borderColor: '#28C2FF',
    backgroundColor: 'rgba(40, 194, 255, 0.1)',
  },
  pinMatchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: 8,
    justifyContent: 'center',
  },
  pinMatchSuccess: {
    backgroundColor: 'rgba(46, 204, 113, 0.15)',
    borderWidth: 1,
    borderColor: '#2ECC71',
  },
  pinMatchError: {
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    borderWidth: 1,
    borderColor: '#FF6B6B',
  },
  pinMatchText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#28C2FF',
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: '#334155',
    opacity: 0.6,
  },
  buttonText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: 'bold',
  },
  buttonTextDisabled: {
    color: '#64748B',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '65%',
    padding: 16,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  specialiteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  specialiteItemActive: {
    backgroundColor: '#0F2C3D',
  },
  specialiteItemText: {
    color: '#94A3B8',
    fontSize: 14,
  },
  specialiteItemTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});
