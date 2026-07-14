import React, { useState, useEffect } from 'react';
import { SymbolView } from 'expo-symbols';
import {
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { useSecurity } from '../security/SecurityContext';
import { verifyPIN } from '../security/auth';
import { useThemePreference } from '../theme/ThemePreferenceContext';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';

export default function SettingsScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const theme = useTheme();

  const { user, setupSecurity } = useSecurity();
  const [nom, setNom] = useState(user?.nom || '');
  const [prenom, setPrenom] = useState(user?.prenom || '');
  const [email, setEmail] = useState(user?.email || '');
  const [newPin, setNewPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [saving, setSaving] = useState(false);

  // Synchronise les états locaux avec l'utilisateur global s'il change
  useEffect(() => {
    if (user) {
      setNom(user.nom);
      setPrenom(user.prenom);
      setEmail(user.email);
    }
  }, [user]);

  const [signature, setSignature] = useState('');

  useEffect(() => {
    if (Platform.OS === 'web') {
      const savedSig = localStorage.getItem('doctor_signature');
      if (savedSig) setSignature(savedSig);
    } else {
      SecureStore.getItemAsync('doctor_signature')
        .then((savedSig) => {
          if (savedSig) setSignature(savedSig);
        })
        .catch(() => {});
    }
  }, []);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets[0].base64) {
      const base64Image = `data:image/png;base64,${result.assets[0].base64}`;
      setSignature(base64Image);
    }
  };

  const handleSaveProfile = async () => {
    if (!prenom.trim() || !nom.trim() || !email.trim()) {
      alert("Champs obligatoires\n\nVeuillez renseigner le prénom, le nom et l'adresse email.");
      return;
    }

    if (!currentPin.trim()) {
      alert("Code PIN requis\n\nVeuillez saisir votre code PIN actuel pour valider les modifications.");
      return;
    }

    setSaving(true);
    try {
      // 1. Valider le code PIN actuel de l'utilisateur
      const pinIsValid = await verifyPIN(currentPin.trim());
      if (!pinIsValid) {
        alert("Code PIN actuel incorrect\n\nLe code PIN saisi n'est pas valide.");
        setSaving(false);
        return;
      }

      // 2. Déterminer le code PIN final à enregistrer
      const finalPin = newPin.trim() ? newPin.trim() : currentPin.trim();

      if (newPin.trim() && newPin.trim().length !== 4) {
        alert("Nouveau PIN invalide\n\nLe nouveau code PIN doit comporter précisément 4 chiffres.");
        setSaving(false);
        return;
      }

      // 3. Mettre à jour dans la base locale et le secure store
      await setupSecurity(finalPin, nom.trim(), prenom.trim(), email.trim());

      // 4. Enregistrer la signature
      if (Platform.OS === 'web') {
        localStorage.setItem('doctor_signature', signature);
      } else {
        await SecureStore.setItemAsync('doctor_signature', signature);
      }

      alert("Succès\n\nVotre profil de médecin et vos identifiants de sécurité ont été mis à jour !");
      setNewPin('');
      setCurrentPin('');
    } catch (e) {
      console.error(e);
      alert("Erreur\n\nUne erreur est survenue lors de la mise à jour du profil.");
    } finally {
      setSaving(false);
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
      paddingTop: 80,
      paddingBottom: Spacing.four,
    },
  });

  const { themeMode, setThemeMode } = useThemePreference();

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="subtitle">Paramètres</ThemedText>
          <ThemedText style={styles.centerText} themeColor="textSecondary">
            Configuration du Cabinet Médical Privé{'\n'}Dr {user ? `${user.prenom} ${user.nom}` : 'Mohamadou Bamba Diop'}
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.sectionsWrapper}>
          <Collapsible title="Identité du Docteur & Profil">
            <View style={styles.formContainer}>
              <View style={styles.inputGroup}>
                <ThemedText style={styles.label}>Prénom</ThemedText>
                <TextInput
                  style={styles.input}
                  placeholder="Prénom"
                  placeholderTextColor="#9ca3af"
                  value={prenom}
                  onChangeText={setPrenom}
                />
              </View>

              <View style={styles.inputGroup}>
                <ThemedText style={styles.label}>Nom de famille</ThemedText>
                <TextInput
                  style={styles.input}
                  placeholder="Nom"
                  placeholderTextColor="#9ca3af"
                  value={nom}
                  onChangeText={setNom}
                />
              </View>

              <View style={styles.inputGroup}>
                <ThemedText style={styles.label}>Adresse Email</ThemedText>
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor="#9ca3af"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                />
              </View>

              <View style={styles.inputGroup}>
                <ThemedText style={styles.label}>Nouveau Code PIN (4 chiffres - optionnel)</ThemedText>
                <TextInput
                  style={styles.input}
                  placeholder="Laisser vide pour ne pas modifier"
                  placeholderTextColor="#9ca3af"
                  value={newPin}
                  onChangeText={setNewPin}
                  keyboardType="numeric"
                  maxLength={4}
                  secureTextEntry
                />
              </View>

              <View style={styles.inputGroup}>
                <ThemedText style={styles.label}>Signature du Médecin (pour les ordonnances et certificats)</ThemedText>
                {signature ? (
                  <View style={styles.signaturePreviewContainer}>
                    <Image source={{ uri: signature }} style={styles.signatureImage} />
                    <TouchableOpacity style={styles.sigClearBtn} onPress={() => setSignature('')}>
                      <ThemedText style={styles.sigClearBtnText}>Supprimer</ThemedText>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.sigUploadBtn} onPress={pickImage}>
                    <ThemedText style={styles.sigUploadBtnText}>Téléverser une image de signature</ThemedText>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.inputGroup}>
                <ThemedText style={styles.label}>Confirmer avec le PIN actuel *</ThemedText>
                <TextInput
                  style={styles.inputCurrentPin}
                  placeholder="Saisissez votre PIN actuel pour enregistrer"
                  placeholderTextColor="#9ca3af"
                  value={currentPin}
                  onChangeText={setCurrentPin}
                  keyboardType="numeric"
                  maxLength={4}
                  secureTextEntry
                />
              </View>

              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveProfile}
                disabled={saving}>
                {saving ? (
                  <ActivityIndicator size="small" color="#0F2C3D" />
                ) : (
                  <ThemedText style={styles.saveButtonText}>Enregistrer les modifications</ThemedText>
                )}
              </TouchableOpacity>
            </View>
          </Collapsible>

          <Collapsible title="Sécurité & Verrouillage">
            <ThemedText type="small">
              Le verrouillage automatique est activé et se déclenche après 2 minutes d'inactivité pour garantir le respect du secret médical. Les clés de cryptage AES-256 locales protègent vos données cliniques.
            </ThemedText>
          </Collapsible>

          <Collapsible title="Apparence & Thème">
            <View style={styles.themeContainer}>
              <ThemedText style={styles.label}>Mode d'affichage de l'application</ThemedText>
              <View style={styles.themeOptions}>
                {(['light', 'dark', 'system'] as const).map((mode) => {
                  const isActive = themeMode === mode;
                  const labels = {
                    light: 'Clair',
                    dark: 'Sombre',
                    system: 'Système',
                  };
                  return (
                    <TouchableOpacity
                      key={mode}
                      style={[
                        styles.themeBtn,
                        isActive && styles.themeBtnActive,
                      ]}
                      onPress={() => setThemeMode(mode)}
                    >
                      <ThemedText
                        style={[
                          styles.themeBtnText,
                          isActive && styles.themeBtnTextActive,
                        ]}
                      >
                        {labels[mode]}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </Collapsible>
        </ThemedView>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  container: {
    maxWidth: MaxContentWidth,
    flexGrow: 1,
  },
  titleContainer: {
    gap: Spacing.three,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.six,
  },
  centerText: {
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  linkButton: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.five,
    justifyContent: 'center',
    gap: Spacing.one,
    alignItems: 'center',
  },
  sectionsWrapper: {
    gap: Spacing.five,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  formContainer: {
    paddingVertical: 12,
    gap: 12,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    color: '#8AC8F9',
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#1E3E52',
    borderWidth: 1,
    borderColor: '#2F5C77',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    color: '#FFFFFF',
    fontSize: 14,
  },
  inputCurrentPin: {
    backgroundColor: '#1E3E52',
    borderWidth: 1,
    borderColor: '#FF6B6B',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    color: '#FFFFFF',
    fontSize: 14,
  },
  saveButton: {
    backgroundColor: '#28C2FF',
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    color: '#0F2C3D',
    fontWeight: 'bold',
    fontSize: 14,
  },
  themeContainer: {
    paddingVertical: 12,
    gap: 12,
  },
  themeOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  themeBtn: {
    flex: 1,
    backgroundColor: '#1E3E52',
    borderWidth: 1,
    borderColor: '#2F5C77',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeBtnActive: {
    backgroundColor: '#28C2FF',
    borderColor: '#28C2FF',
  },
  themeBtnText: {
    color: '#8AC8F9',
    fontSize: 13,
    fontWeight: '600',
  },
  themeBtnTextActive: {
    color: '#0F2C3D',
    fontWeight: 'bold',
  },
  signaturePreviewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#0F2C3D',
    borderWidth: 1,
    borderColor: '#2F5C77',
    borderRadius: 8,
    padding: 10,
  },
  signatureImage: {
    width: 120,
    height: 60,
    borderRadius: 4,
  },
  sigClearBtn: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  sigClearBtnText: {
    color: '#0F2C3D',
    fontWeight: 'bold',
    fontSize: 12,
  },
  sigUploadBtn: {
    backgroundColor: '#0F2C3D',
    borderWidth: 1,
    borderColor: '#2F5C77',
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sigUploadBtnText: {
    color: '#28C2FF',
    fontWeight: 'bold',
    fontSize: 13,
  },
});
