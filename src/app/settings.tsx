import React, { useState, useEffect } from 'react';
import { SymbolView } from 'expo-symbols';
import { Ionicons } from '@expo/vector-icons';
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
import { verifyPIN, checkEmailExists } from '../security/auth';
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
  const [emailError, setEmailError] = useState('');
  const [telephone, setTelephone] = useState(user?.telephone || '');
  const [newPin, setNewPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [avatar, setAvatar] = useState('');

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

  const [googleUser, setGoogleUser] = useState<GoogleDriveUser | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [customToken, setCustomToken] = useState('');

  useEffect(() => {
    loadGoogleDriveStatus();
  }, []);

  const loadGoogleDriveStatus = async () => {
    const user = await getConnectedUser();
    setGoogleUser(user);
    const time = await getLatestBackupTimestamp();
    setLastBackup(time);

    // Load doctor avatar photo
    if (Platform.OS === 'web') {
      const savedAvatar = localStorage.getItem('doctor_avatar');
      if (savedAvatar) setAvatar(savedAvatar);
    } else {
      SecureStore.getItemAsync('doctor_avatar')
        .then((savedAvatar) => {
          if (savedAvatar) setAvatar(savedAvatar);
        })
        .catch(() => {});
    }
  };

  const handleSaveToken = async () => {
    if (!customToken.trim()) {
      alert("Erreur\n\nVeuillez coller un jeton d'accès Google valide.");
      return;
    }
    setSaving(true);
    try {
      const user = await saveGoogleTokenAndFetchProfile(customToken.trim());
      setGoogleUser(user);
      const time = await getLatestBackupTimestamp();
      setLastBackup(time);
      setCustomToken('');
      alert("Succès\n\nConnexion réelle Google Drive établie !");
    } catch (e: any) {
      alert("Erreur d'authentification\n\nJeton invalide ou expiré.\nDétails : " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const docName = `Dr ${prenom.trim()} ${nom.trim()}`;
      const docEmail = email.trim();
      const user = await loginToGoogleDrive(docName, docEmail, avatar);
      setGoogleUser(user);
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
      alert("Succès\n\nDéconnexion de Google Drive réussie.");
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
      alert("Succès\n\nSauvegarde des données médicales effectuée avec succès !");
    } catch (e: any) {
      console.error(e);
      alert("Erreur de sauvegarde\n\n" + e.message);
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestore = async () => {
    const confirmRestore = confirm 
      ? confirm("Attention : Restauration des données\n\nCette action va écraser l'intégralité de vos données cliniques actuelles sur cet appareil par celles de votre Google Drive. Voulez-vous continuer ?")
      : true;

    if (!confirmRestore) return;

    setRestoring(true);
    try {
      await restoreDatabaseFromDrive();
      alert("Succès\n\nDonnées restaurées avec succès !");
    } catch (e: any) {
      console.error(e);
      alert("Erreur de restauration\n\n" + e.message);
    } finally {
      setRestoring(false);
    }
  };

  const cleanRawName = (str: string | null | undefined): string => {
    if (!str) return '';
    return str.replace(/\b(dr|docteur)\.?\b/gi, '').replace(/\s+/g, ' ').trim();
  };

  // Synchronise les états locaux avec l'utilisateur global s'il change
  useEffect(() => {
    if (user) {
      setNom(cleanRawName(user.nom));
      setPrenom(cleanRawName(user.prenom));
      setEmail(user.email);
      setTelephone(user.telephone || '');
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

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets[0].base64) {
      const base64Image = `data:image/png;base64,${result.assets[0].base64}`;
      setAvatar(base64Image);
    }
  };

  const handleSaveProfile = async () => {
    if (!prenom.trim() || !nom.trim() || !email.trim() || !telephone.trim()) {
      alert("Champs obligatoires\n\nVeuillez renseigner le prénom, le nom, l'adresse email et le numéro de téléphone.");
      return;
    }

    // Vérifier l'unicité de l'adresse email
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
      const cleanNom = cleanRawName(nom);
      const cleanPrenom = cleanRawName(prenom);
      await setupSecurity(finalPin, cleanNom, cleanPrenom, email.trim(), telephone.trim());
      setNom(cleanNom);
      setPrenom(cleanPrenom);

      // 4. Enregistrer la signature & la photo de profil
      if (Platform.OS === 'web') {
        localStorage.setItem('doctor_signature', signature);
        localStorage.setItem('doctor_avatar', avatar);
      } else {
        await SecureStore.setItemAsync('doctor_signature', signature);
        await SecureStore.setItemAsync('doctor_avatar', avatar);
      }

      alert("Succès\n\nVotre profil de médecin et vos identifiants de sécurité ont été mis à jour !");
      setNewPin('');
      setCurrentPin('');
    } catch (e: any) {
      console.error(e);
      alert("Erreur\n\n" + (e.message || "Une erreur est survenue lors de la mise à jour du profil."));
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
            Configuration du Cabinet Médical Privé{'\n'}
            {(() => {
              const raw = `${user?.prenom || ''} ${user?.nom || ''}`.replace(/(Dr\.?|Docteur)\s*/gi, '').trim();
              return `Dr ${raw || 'Fallou Diop'}`;
            })()}
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.sectionsWrapper}>
          <Collapsible title="Identité du Docteur & Profil">
            <View style={styles.formContainer}>
              <View style={styles.inputGroup}>
                <ThemedText style={styles.label}>Prénom *</ThemedText>
                <TextInput
                  style={styles.input}
                  placeholder="Prénom"
                  placeholderTextColor="#9ca3af"
                  value={prenom}
                  onChangeText={setPrenom}
                />
              </View>

              <View style={styles.inputGroup}>
                <ThemedText style={styles.label}>Nom de famille *</ThemedText>
                <TextInput
                  style={styles.input}
                  placeholder="Nom"
                  placeholderTextColor="#9ca3af"
                  value={nom}
                  onChangeText={setNom}
                />
              </View>

              <View style={styles.inputGroup}>
                <ThemedText style={styles.label}>Adresse Email *</ThemedText>
                <TextInput
                  style={[styles.input, emailError ? { borderColor: '#FF6B6B', borderWidth: 2 } : null]}
                  placeholder="Email"
                  placeholderTextColor="#9ca3af"
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
                  <ThemedText style={{ color: '#FF6B6B', fontSize: 13, marginTop: 6, fontWeight: 'bold' }}>
                    ⚠️ {emailError}
                  </ThemedText>
                )}
              </View>

              <View style={styles.inputGroup}>
                <ThemedText style={styles.label}>Numéro de téléphone *</ThemedText>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: +221 77 123 45 67"
                  placeholderTextColor="#9ca3af"
                  value={telephone}
                  onChangeText={setTelephone}
                  keyboardType="phone-pad"
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <ThemedText style={styles.label}>Nouveau PIN (optionnel)</ThemedText>
                  <TextInput
                    style={styles.input}
                    placeholder="Nouveau code PIN"
                    placeholderTextColor="#9ca3af"
                    value={newPin}
                    onChangeText={setNewPin}
                    keyboardType="numeric"
                    maxLength={4}
                    secureTextEntry
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <ThemedText style={styles.label}>PIN actuel (obligatoire) *</ThemedText>
                  <TextInput
                    style={styles.inputCurrentPin}
                    placeholder="Saisir PIN actuel"
                    placeholderTextColor="#9ca3af"
                    value={currentPin}
                    onChangeText={setCurrentPin}
                    keyboardType="numeric"
                    maxLength={4}
                    secureTextEntry
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <ThemedText style={styles.label}>Photo de Profil du Médecin</ThemedText>
                {avatar ? (
                  <View style={styles.signaturePreviewContainer}>
                    <Image source={{ uri: avatar }} style={[styles.signatureImage, { width: 80, height: 80, borderRadius: 40 }]} />
                    <TouchableOpacity style={styles.sigClearBtn} onPress={() => setAvatar('')}>
                      <ThemedText style={styles.sigClearBtnText}>Supprimer</ThemedText>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.sigUploadBtn} onPress={pickAvatar}>
                    <ThemedText style={styles.sigUploadBtnText}>Téléverser une photo de profil</ThemedText>
                  </TouchableOpacity>
                )}
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

          <Collapsible title="Sauvegarde & Restauration Google Drive">
            <View style={styles.backupContainer}>
              {googleUser ? (
                <View style={styles.googleProfile}>
                  <View style={styles.googleUserRow}>
                    <Image
                      source={avatar ? { uri: avatar } : require('../../assets/images/favicon.png')}
                      style={styles.googleAvatar}
                    />
                    <View style={styles.googleMeta}>
                      <ThemedText style={styles.googleName}>Dr {prenom.trim()} {nom.trim()}</ThemedText>
                      <ThemedText style={styles.googleEmail}>{email.trim()}</ThemedText>
                    </View>
                  </View>

                  <ThemedText style={styles.backupStatus}>
                    Dernière sauvegarde : {lastBackup ? new Date(lastBackup).toLocaleString('fr-FR') : 'Aucune'}
                  </ThemedText>

                  <View style={styles.backupActions}>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.backupBtn]}
                      onPress={handleBackup}
                      disabled={backingUp}>
                      {backingUp ? (
                        <ActivityIndicator size="small" color="#0F2C3D" />
                      ) : (
                        <ThemedText style={styles.actionBtnText}>Sauvegarder Maintenant</ThemedText>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionBtn, styles.restoreBtn]}
                      onPress={handleRestore}
                      disabled={restoring}>
                      {restoring ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <ThemedText style={[styles.actionBtnText, { color: '#FFFFFF' }]}>Restaurer la base</ThemedText>
                      )}
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity style={styles.googleLogoutBtn} onPress={handleGoogleLogout}>
                    <ThemedText style={styles.googleLogoutBtnText}>Déconnecter Google Drive</ThemedText>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[styles.googleEmpty, Platform.OS === 'web' && ({ boxSizing: 'border-box', maxWidth: '100%', overflow: 'hidden' } as any)]}>
                  {(() => {
                    const rawName = `${user?.prenom || ''} ${user?.nom || ''}`.replace(/(Dr\.?|Docteur)\s*/gi, '').trim();
                    const activeDocName = rawName ? `Dr ${rawName}` : 'du médecin connecté';
                    const activeDocEmail = email || user?.email || 'compte Google';
                    return (
                      <>
                        <ThemedText
                          style={[
                            styles.googleEmptyText,
                            { marginBottom: 12 },
                            Platform.OS === 'web' && ({ wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'normal' } as any)
                          ]}
                        >
                          Activez la sauvegarde cloud automatique sur le compte Google du <ThemedText style={{ fontWeight: 'bold', color: '#28C2FF' }}>{activeDocName}</ThemedText> (<ThemedText style={[Platform.OS === 'web' && ({ wordBreak: 'break-word', overflowWrap: 'anywhere' } as any), { color: '#28C2FF' }]}>{activeDocEmail}</ThemedText>).
                        </ThemedText>

                        <TouchableOpacity
                          style={[
                            styles.googleLoginBtn,
                            { marginVertical: 6, backgroundColor: '#28C2FF', paddingVertical: 14, paddingHorizontal: 12, width: '100%' },
                            Platform.OS === 'web' && ({ boxSizing: 'border-box', maxWidth: '100%' } as any)
                          ]}
                          onPress={handleGoogleLogin}
                          disabled={saving}
                        >
                          <ThemedText
                            style={[
                              styles.googleLoginBtnText,
                              { color: '#0F2C3D', fontWeight: 'bold', textAlign: 'center' },
                              Platform.OS === 'web' && ({ wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'normal' } as any)
                            ]}
                          >
                            Connecter Google Drive{'\n'}({activeDocEmail})
                          </ThemedText>
                        </TouchableOpacity>
                      </>
                    );
                  })()}

                  <View style={[{ width: '100%', maxWidth: '100%' }, Platform.OS === 'web' && ({ boxSizing: 'border-box' } as any)]}>
                    <Collapsible title="Option avancée : Coller un Jeton Google OAuth2">
                      <View style={[{ width: '100%', marginVertical: 10 }, Platform.OS === 'web' && ({ boxSizing: 'border-box' } as any)]}>
                        <TextInput
                          style={styles.input}
                          placeholder="Coller le Jeton Google (ya29...)"
                          placeholderTextColor="#9ca3af"
                          value={customToken}
                          onChangeText={setCustomToken}
                          secureTextEntry
                        />
                        <TouchableOpacity
                          style={[
                            styles.googleLoginBtn,
                            { marginTop: 8, backgroundColor: '#1E3E52' },
                            Platform.OS === 'web' && ({ boxSizing: 'border-box', maxWidth: '100%' } as any)
                          ]}
                          onPress={handleSaveToken}
                          disabled={saving}
                        >
                          <ThemedText
                            style={[
                              styles.googleLoginBtnText,
                              Platform.OS === 'web' && ({ wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'normal' } as any)
                            ]}
                          >
                            {saving ? 'Validation...' : 'Valider Jeton Personnalisé'}
                          </ThemedText>
                        </TouchableOpacity>
                      </View>
                    </Collapsible>
                  </View>
                </View>
              )}
            </View>
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
    width: '100%',
  },
  contentContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  container: {
    width: '100%',
    maxWidth: MaxContentWidth,
    flexDirection: 'column',
    gap: Spacing.four,
  },
  titleContainer: {
    gap: Spacing.two,
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.four,
    width: '100%',
  },
  centerText: {
    textAlign: 'center',
    width: '100%',
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
    width: '100%',
    paddingHorizontal: 0,
    paddingTop: Spacing.three,
  },
  formContainer: {
    paddingVertical: 12,
    gap: 12,
    width: '100%',
  },
  inputGroup: {
    gap: 6,
    width: '100%',
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
    width: '100%',
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
    width: '100%',
  },
  saveButton: {
    backgroundColor: '#28C2FF',
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    width: '100%',
  },
  saveButtonText: {
    color: '#0F2C3D',
    fontWeight: 'bold',
    fontSize: 14,
    textAlign: 'center',
  },
  themeContainer: {
    paddingVertical: 12,
    gap: 12,
    width: '100%',
  },
  themeOptions: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
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
    minWidth: 0,
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
    width: '100%',
  },
  signatureImage: {
    width: 100,
    height: 50,
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
    width: '100%',
  },
  sigUploadBtnText: {
    color: '#28C2FF',
    fontWeight: 'bold',
    fontSize: 13,
    textAlign: 'center',
  },
  backupContainer: {
    paddingVertical: 12,
    gap: 12,
    width: '100%',
  },
  googleProfile: {
    gap: 16,
    width: '100%',
  },
  googleUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#0F2C3D',
    borderWidth: 1,
    borderColor: '#2F5C77',
    borderRadius: 10,
    padding: 12,
    width: '100%',
  },
  googleAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  googleMeta: {
    flex: 1,
    minWidth: 0,
  },
  googleName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  googleEmail: {
    color: '#8AC8F9',
    fontSize: 12,
  },
  backupStatus: {
    color: '#8AC8F9',
    fontSize: 13,
    fontWeight: '600',
    backgroundColor: '#0F2C3D',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2F5C77',
    textAlign: 'center',
    width: '100%',
  },
  backupActions: {
    flexDirection: 'column',
    gap: 10,
    width: '100%',
  },
  actionBtn: {
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backupBtn: {
    backgroundColor: '#28C2FF',
  },
  restoreBtn: {
    backgroundColor: '#E67E22',
  },
  actionBtnText: {
    color: '#0F2C3D',
    fontWeight: 'bold',
    fontSize: 13,
    textAlign: 'center',
  },
  googleLogoutBtn: {
    borderWidth: 1,
    borderColor: '#FF6B6B',
    borderRadius: 10,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
    width: '100%',
  },
  googleLogoutBtnText: {
    color: '#FF6B6B',
    fontWeight: 'bold',
    fontSize: 13,
    textAlign: 'center',
  },
  googleEmpty: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    width: '100%',
  },
  googleEmptyText: {
    color: '#D1E6F3',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    width: '100%',
  },
  googleLoginBtn: {
    backgroundColor: '#28C2FF',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  googleLoginBtnText: {
    color: '#0F2C3D',
    fontWeight: 'bold',
    fontSize: 13,
    textAlign: 'center',
  },
});
