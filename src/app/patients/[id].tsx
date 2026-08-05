import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  SafeAreaView,
  Platform,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter, Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getPatientById,
  updatePatient,
  getAntecedentsByPatient,
  addAntecedent,
  getConsultationsByPatient,
  getVaccinationsByPatient,
  addVaccination,
  Patient,
  Antecedent,
  Consultation,
  Vaccination,
} from '../../database/SQLiteDatabaseManager';
import { calculateAge, formatDateFR } from '../../utils/helpers';
import { useSecurity } from '../../security/SecurityContext';
import { writeAuditLog, getDatabase } from '../../database/db';

type SubTab = 'info' | 'antecedents' | 'consultations' | 'vaccinations';

export default function PatientDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
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
  const [antecedents, setAntecedents] = useState<Antecedent[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [vaccinations, setVaccinations] = useState<Vaccination[]>([]);
  const [activeTab, setActiveTab] = useState<SubTab>('info');
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [aiSummary, setAiSummary] = useState<string>('');
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);

  // Modal State for adding Antecedent
  const [modalVisible, setModalVisible] = useState(false);
  const [antType, setAntType] = useState<Antecedent['type']>('MEDICAL');
  const [antDescription, setAntDescription] = useState('');
  const [modalLoading, setModalLoading] = useState(false);

  // Modal State for adding Vaccination
  const [modalVaccineVisible, setModalVaccineVisible] = useState(false);
  const [vaccineName, setVaccineName] = useState('');
  const [vaccineDate, setVaccineDate] = useState(new Date().toISOString().split('T')[0]);
  const [vaccineRecallDate, setVaccineRecallDate] = useState('');
  const [vaccineLoading, setVaccineLoading] = useState(false);
  // Modal State for editing Patient Folder
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editNom, setEditNom] = useState('');
  const [editPrenom, setEditPrenom] = useState('');
  const [editSexe, setEditSexe] = useState<'M' | 'F'>('M');
  const [editDateNaissance, setEditDateNaissance] = useState('');
  const [editTelephone, setEditTelephone] = useState('');
  const [editAdresse, setEditAdresse] = useState('');
  const [editProfession, setEditProfession] = useState('');
  const [editPersonnePrevenir, setEditPersonnePrevenir] = useState('');
  const [editGroupeSanguin, setEditGroupeSanguin] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  const openEditModal = () => {
    if (!patient) return;
    setEditNom(patient.nom);
    setEditPrenom(patient.prenom);
    setEditSexe(patient.sexe);
    setEditDateNaissance(patient.date_naissance);
    setEditTelephone(patient.telephone || '');
    setEditAdresse(patient.adresse || '');
    setEditProfession(patient.profession || '');
    setEditPersonnePrevenir(patient.personne_prevenir || '');
    setEditGroupeSanguin(patient.groupe_sanguin || null);
    setEditModalVisible(true);
  };

  const handleSavePatientEdit = async () => {
    if (!user || !patient) return;
    if (!editNom.trim() || !editPrenom.trim() || !editDateNaissance.trim()) {
      showAlert('Champs requis', 'Nom, Prénom et Date de naissance sont requis.');
      return;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(editDateNaissance.trim())) {
      showAlert('Format invalide', 'La date de naissance doit être au format AAAA-MM-JJ.');
      return;
    }

    setEditLoading(true);
    try {
      await updatePatient(
        patient.id,
        {
          nom: editNom.trim(),
          prenom: editPrenom.trim(),
          sexe: editSexe,
          date_naissance: editDateNaissance.trim(),
          telephone: editTelephone.trim() || null,
          adresse: editAdresse.trim() || null,
          profession: editProfession.trim() || null,
          personne_prevenir: editPersonnePrevenir.trim() || null,
          groupe_sanguin: editGroupeSanguin,
        },
        user.id
      );
      setEditModalVisible(false);
      showAlert('Succès', 'Le dossier du patient a été mis à jour.');
      loadAllData();
    } catch (err) {
      console.error(err);
      showAlert('Erreur', 'Impossible de modifier le dossier du patient.');
    } finally {
      setEditLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      loadAllData();
    }
  }, [id]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const p = await getPatientById(id);
      if (!p) {
        showAlert('Erreur', 'Patient non trouvé');
        router.back();
        return;
      }
      setPatient(p);

      // 1. Track recently viewed
      try {
        const recentsKey = 'recents_patients';
        let list = [];
        if (Platform.OS === 'web') {
          list = JSON.parse(localStorage.getItem(recentsKey) || '[]');
        } else {
          const SecureStore = require('expo-secure-store');
          const data = await SecureStore.getItemAsync(recentsKey);
          list = JSON.parse(data || '[]');
        }
        list = list.filter((item: any) => item.id !== id);
        list.unshift({ id: p.id, prenom: p.prenom, nom: p.nom, numero_dossier: p.numero_dossier });
        list = list.slice(0, 5);
        if (Platform.OS === 'web') {
          localStorage.setItem(recentsKey, JSON.stringify(list));
        } else {
          const SecureStore = require('expo-secure-store');
          await SecureStore.setItemAsync(recentsKey, JSON.stringify(list));
        }
      } catch (e) {
        console.error('Failed to save recent patient:', e);
      }

      // 2. Check if is favorite
      try {
        const favsKey = 'favorites_patients';
        let favs = [];
        if (Platform.OS === 'web') {
          favs = JSON.parse(localStorage.getItem(favsKey) || '[]');
        } else {
          const SecureStore = require('expo-secure-store');
          const data = await SecureStore.getItemAsync(favsKey);
          favs = JSON.parse(data || '[]');
        }
        setIsFavorite(favs.some((item: any) => item.id === id));
      } catch (e) {
        console.error('Failed to load favorite state:', e);
      }

      // 3. Load saved AI summary
      try {
        const key = `ai_summary_${id}`;
        if (Platform.OS === 'web') {
          setAiSummary(localStorage.getItem(key) || '');
        } else {
          const SecureStore = require('expo-secure-store');
          const saved = await SecureStore.getItemAsync(key);
          setAiSummary(saved || '');
        }
      } catch (e) {
        console.error(e);
      }

      const ant = await getAntecedentsByPatient(id);
      setAntecedents(ant);

      const cons = await getConsultationsByPatient(id);
      setConsultations(cons);

      const vacs = await getVaccinationsByPatient(id);
      setVaccinations(vacs);

      // Audit read file
      if (user) {
        await writeAuditLog(
          user.id,
          'READ',
          'patients',
          id,
          `Consultation du dossier patient de ${p.prenom} ${p.nom} (${p.numero_dossier})`
        );
      }
    } catch (error) {
      console.error('Failed to load patient data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async () => {
    if (!patient) return;
    try {
      const favsKey = 'favorites_patients';
      let favs = [];
      if (Platform.OS === 'web') {
        favs = JSON.parse(localStorage.getItem(favsKey) || '[]');
      } else {
        const SecureStore = require('expo-secure-store');
        const data = await SecureStore.getItemAsync(favsKey);
        favs = JSON.parse(data || '[]');
      }

      const exists = favs.some((item: any) => item.id === patient.id);
      let newFavs = [];
      if (exists) {
        newFavs = favs.filter((item: any) => item.id !== patient.id);
        setIsFavorite(false);
      } else {
        newFavs = [...favs, { id: patient.id, prenom: patient.prenom, nom: patient.nom, numero_dossier: patient.numero_dossier }];
        setIsFavorite(true);
      }

      if (Platform.OS === 'web') {
        localStorage.setItem(favsKey, JSON.stringify(newFavs));
      } else {
        const SecureStore = require('expo-secure-store');
        await SecureStore.setItemAsync(favsKey, JSON.stringify(newFavs));
      }
    } catch (e) {
      console.error('Failed to toggle favorite:', e);
    }
  };

  const generateAISummary = () => {
    if (!patient) return;
    setAiSummaryLoading(true);
    
    // Simulate API call delay for high-end feel
    setTimeout(async () => {
      try {
        const age = calculateAge(patient.date_naissance);
        const sexeStr = patient.sexe === 'M' ? 'Masculin' : 'Féminin';
        
        // Compile Antécédents
        const antList = antecedents.map(a => `${a.type.toLowerCase()}: ${a.description}`).join(', ');
        const antText = antList ? antList : 'Aucun antécédent majeur enregistré.';
        
        // Compile Vaccinations
        const vacList = vaccinations.map(v => `${v.vaccin} (le ${formatDateFR(v.date_administration)})`).join(', ');
        const vacText = vacList ? vacList : 'Aucun vaccin enregistré.';
        
        // Compile Latest Visit
        let latestVisitText = 'Aucune consultation antérieure enregistrée.';
        if (consultations.length > 0) {
          // Sort consultations by date descending
          const sortedVisits = [...consultations].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          const lastV = sortedVisits[0];
          
          // Try to load constants for this last visit
          const db = await getDatabase();
          const constRow = (await db.getFirstAsync(
            'SELECT * FROM constantes WHERE consultation_id = ?;',
            [lastV.id]
          )) as any;
          
          let constText = 'non renseignées';
          if (constRow) {
            const parts = [];
            if (constRow.tension_arterielle) parts.push(`TA ${constRow.tension_arterielle} mmHg`);
            if (constRow.temperature) parts.push(`Temp ${constRow.temperature}°C`);
            if (constRow.poids) parts.push(`Poids ${constRow.poids}kg`);
            if (constRow.imc) parts.push(`IMC ${constRow.imc}`);
            if (parts.length > 0) constText = parts.join(', ');
          }
          
          const decMotif = lastV.motif || 'Consultation médicale';
          const decDiag = lastV.diagnostic || 'Non renseigné';
          const decTrait = lastV.traitement || 'Aucun';
          
          latestVisitText = `Visite du ${formatDateFR(lastV.date)} pour "${decMotif}". Constantes : ${constText}. Diagnostic : "${decDiag}". Traitement prescrit : "${decTrait}".`;
        }
        
        // Construct the summary
        const summary = `• Patient de sexe ${sexeStr} âgé de ${age} ans (Groupe Sanguin: ${patient.groupe_sanguin || 'Inconnu'}).\n\n` +
          `• Antécédents Cliniques : ${antText}.\n\n` +
          `• Dernier Suivi Clinique : ${latestVisitText}\n\n` +
          `• Calendrier Vaccinal : ${vacText}.\n\n` +
          `• Note de Vigilance : Surveiller l'évolution des constantes cliniques et la tolérance des traitements prescrits lors du prochain contrôle.`;
          
        setAiSummary(summary);
        
        if (Platform.OS === 'web') {
          localStorage.setItem(`ai_summary_${id}`, summary);
        } else {
          const SecureStore = require('expo-secure-store');
          await SecureStore.setItemAsync(`ai_summary_${id}`, summary);
        }
      } catch (err) {
        console.error(err);
        setAiSummary('Erreur lors de la génération de la synthèse clinique.');
      } finally {
        setAiSummaryLoading(false);
      }
    }, 1500); // 1.5 seconds loading feel
  };

  const handleAddAntecedent = async () => {
    if (!antDescription.trim()) {
      showAlert('Erreur', 'Veuillez saisir une description pour l\'antécédent.');
      return;
    }

    if (!user) return;

    setModalLoading(true);
    try {
      await addAntecedent(
        {
          patient_id: id,
          type: antType,
          description: antDescription.trim(),
        },
        user.id
      );

      // Reload antecedents
      const ant = await getAntecedentsByPatient(id);
      setAntecedents(ant);
      
      setAntDescription('');
      setModalVisible(false);
      showAlert('Succès', 'Antécédent ajouté avec succès.');
    } catch (error) {
      console.error('Failed to add antecedent:', error);
      showAlert('Erreur', "Impossible d'enregistrer l'antécédent.");
    } finally {
      setModalLoading(false);
    }
  };

  const handleAddVaccine = async () => {
    if (!vaccineName.trim() || !vaccineDate.trim()) {
      showAlert('Erreur', 'Veuillez renseigner le nom du vaccin et la date d\'administration.');
      return;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(vaccineDate) || (vaccineRecallDate.trim() && !dateRegex.test(vaccineRecallDate))) {
      showAlert('Date invalide', 'Le format de date doit être AAAA-MM-JJ.');
      return;
    }

    if (!user) return;

    setVaccineLoading(true);
    try {
      await addVaccination(
        {
          patient_id: id,
          vaccin: vaccineName.trim(),
          date_administration: vaccineDate,
          date_rappel: vaccineRecallDate.trim() || null,
        },
        user.id
      );

      // Reload vaccinations
      const vacs = await getVaccinationsByPatient(id);
      setVaccinations(vacs);

      setVaccineName('');
      setVaccineRecallDate('');
      setModalVaccineVisible(false);
      showAlert('Succès', 'Vaccin enregistré avec succès.');
    } catch (error) {
      console.error(error);
      showAlert('Erreur', "Impossible d'enregistrer le vaccin.");
    } finally {
      setVaccineLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#28C2FF" />
        <Text style={styles.loadingText}>Déchiffrement du dossier en cours...</Text>
      </View>
    );
  }

  if (!patient) return null;

  const age = calculateAge(patient.date_naissance);

  return (
    <SafeAreaView style={styles.container}>
      {/* Patient Header Summary */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Link href="/patients" asChild>
            <TouchableOpacity style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </Link>
          <Text style={styles.headerTitle}>{patient.numero_dossier}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={styles.syncIndicator}>
              <Ionicons
                name={patient.is_synced ? 'cloud-done-outline' : 'cloud-offline-outline'}
                size={20}
                color={patient.is_synced ? '#2ECC71' : '#E67E22'}
              />
            </View>
            <TouchableOpacity onPress={toggleFavorite} style={{ padding: 4 }}>
              <Ionicons
                name={isFavorite ? 'star' : 'star-outline'}
                size={22}
                color={isFavorite ? '#FFD700' : '#FFFFFF'}
              />
            </TouchableOpacity>
            <TouchableOpacity onPress={openEditModal} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1E3E52', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#2F5C77' }}>
              <Ionicons name="create-outline" size={16} color="#28C2FF" />
              <Text style={{ color: '#28C2FF', fontSize: 12, fontWeight: 'bold' }}>Modifier</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.headerProfile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {patient.prenom[0]}{patient.nom[0]}
            </Text>
          </View>
          <View style={styles.profileMeta}>
            <Text style={styles.patientName}>
              {patient.prenom} {patient.nom.toUpperCase()}
            </Text>
            <Text style={styles.patientSub}>
              {patient.sexe === 'M' ? 'Homme' : 'Femme'} • {age} ans ({formatDateFR(patient.date_naissance)})
            </Text>
          </View>
        </View>

        {/* Custom Tab Bar */}
        <View style={styles.tabBar}>
          {(['info', 'antecedents', 'consultations', 'vaccinations'] as SubTab[]).map((tab) => {
            let label = 'Infos';
            if (tab === 'antecedents') label = 'Antécédents';
            if (tab === 'consultations') label = 'Visites';
            if (tab === 'vaccinations') label = 'Vaccins';

            const isActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tabItem, isActive && styles.tabItemActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* TAB 1: INFORMATION PROFILE */}
        {activeTab === 'info' && (
          <View style={styles.infoContainer}>
            {/* AI Summary Section */}
            <View style={styles.aiSummaryCard}>
              <View style={styles.aiSummaryHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="sparkles-outline" size={18} color="#28C2FF" />
                  <Text style={styles.aiSummaryTitle}>Synthèse Clinique IA</Text>
                </View>
                {aiSummary !== '' && !aiSummaryLoading && (
                  <TouchableOpacity onPress={generateAISummary} style={styles.aiRegenBtn}>
                    <Ionicons name="refresh-outline" size={16} color="#8AC8F9" />
                  </TouchableOpacity>
                )}
              </View>
              
              {aiSummaryLoading ? (
                <View style={styles.aiSummaryLoading}>
                  <ActivityIndicator size="small" color="#28C2FF" />
                  <Text style={styles.aiSummaryTextMuted}>Génération du résumé par l'assistant...</Text>
                </View>
              ) : aiSummary ? (
                <View style={styles.aiSummaryContent}>
                  <Text style={styles.aiSummaryText}>{aiSummary}</Text>
                  <View style={styles.aiDisclaimerBox}>
                    <Ionicons name="alert-circle-outline" size={14} color="#FFD700" />
                    <Text style={styles.aiSummaryDisclaimer}>
                      Aide à la décision. Ce résumé automatique ne remplace pas le diagnostic du médecin.
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.aiSummaryEmpty}>
                  <Text style={styles.aiSummaryEmptyText}>
                    Générez une synthèse clinique intelligente résumant le dossier complet du patient (antécédents, constantes, dernières visites).
                  </Text>
                  <TouchableOpacity onPress={generateAISummary} style={styles.aiSummaryBtn}>
                    <Ionicons name="sparkles" size={14} color="#0F2C3D" />
                    <Text style={styles.aiSummaryBtnText}>Lancer la Synthèse IA</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={styles.tabHeader}>
              <Text style={[styles.sectionTitle, { flex: 1, marginRight: 8 }]} numberOfLines={1}>Fiche Administrative</Text>
              <Link href={`/patients/certificat_create?patientId=${id}`} asChild>
                <TouchableOpacity style={styles.actionButton}>
                  <Ionicons name="document-text" size={16} color="#0F2C3D" />
                  <Text style={styles.actionButtonText}>+ Certificat</Text>
                </TouchableOpacity>
              </Link>
            </View>
            <View style={styles.infoCard}>
              <InfoRow label="Groupe Sanguin" value={patient.groupe_sanguin || 'Non spécifié'} valueColor={patient.groupe_sanguin ? '#FF6B6B' : undefined} />
              <InfoRow label="Téléphone" value={patient.telephone || 'Aucun'} />
              <InfoRow label="Adresse" value={patient.adresse || 'Non renseignée'} />
              <InfoRow label="Profession" value={patient.profession || 'Non renseignée'} />
              <InfoRow label="Personne à prévenir" value={patient.personne_prevenir || 'Non renseignée'} />
              <InfoRow label="Date de création" value={formatDateFR(patient.created_at)} />
            </View>
          </View>
        )}

        {/* TAB 2: MEDICAL HISTORY (ANTECEDENTS) */}
        {activeTab === 'antecedents' && (
          <View style={styles.infoContainer}>
            <View style={styles.tabHeader}>
              <Text style={styles.sectionTitle}>Antécédents Médicaux</Text>
              <TouchableOpacity style={styles.actionButton} onPress={() => setModalVisible(true)}>
                <Ionicons name="add-circle" size={20} color="#0F2C3D" />
                <Text style={styles.actionButtonText}>Ajouter</Text>
              </TouchableOpacity>
            </View>

            {antecedents.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="medical-outline" size={40} color="#2F5C77" />
                <Text style={styles.emptyCardText}>Aucun antécédent médical enregistré</Text>
              </View>
            ) : (
              <View style={styles.historyList}>
                {antecedents.map((item) => (
                  <View key={item.id} style={styles.historyItem}>
                    <View style={styles.historyHeader}>
                      <View style={styles.typeBadge}>
                        <Text style={styles.typeBadgeText}>{item.type}</Text>
                      </View>
                      <Text style={styles.historyDate}>{formatDateFR(item.created_at)}</Text>
                    </View>
                    <Text style={styles.historyDesc}>{item.description}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* TAB 3: CLINICAL CONSULTATIONS */}
        {activeTab === 'consultations' && (
          <View style={styles.infoContainer}>
            <View style={styles.tabHeader}>
              <Text style={[styles.sectionTitle, { flex: 1, marginRight: 8 }]} numberOfLines={1}>Consultations</Text>
              <Link href={`/patients/consultation_create?patientId=${id}`} asChild>
                <TouchableOpacity style={styles.actionButton}>
                  <Ionicons name="add-circle" size={16} color="#0F2C3D" />
                  <Text style={styles.actionButtonText}>+ Visite</Text>
                </TouchableOpacity>
              </Link>
            </View>

            {consultations.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="clipboard-outline" size={40} color="#2F5C77" />
                <Text style={styles.emptyCardText}>Aucune consultation enregistrée</Text>
              </View>
            ) : (
              <View style={styles.consList}>
                {consultations.map((item) => (
                  <Link key={item.id} href={`/patients/consultation_details?id=${item.id}`} asChild>
                    <TouchableOpacity style={styles.consItem}>
                      <View style={{ width: '100%' }}>
                        <View style={styles.consHeader}>
                          <Text style={styles.consDate}>{formatDateFR(item.date)}</Text>
                          <Ionicons name="chevron-forward" size={16} color="#8AC8F9" />
                        </View>
                        <Text style={styles.consMotif} numberOfLines={1}>
                          Motif : {item.motif}
                        </Text>
                        {item.diagnostic && (
                          <Text style={styles.consDiag} numberOfLines={1}>
                            Diagnostic : {item.diagnostic}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  </Link>
                ))}
              </View>
            )}
          </View>
        )}

        {/* TAB 4: VACCINATIONS */}
        {activeTab === 'vaccinations' && (
          <View style={styles.infoContainer}>
            <View style={styles.tabHeader}>
              <Text style={styles.sectionTitle}>Suivi Vaccinal</Text>
              <TouchableOpacity style={styles.actionButton} onPress={() => setModalVaccineVisible(true)}>
                <Ionicons name="add-circle" size={20} color="#0F2C3D" />
                <Text style={styles.actionButtonText}>Ajouter</Text>
              </TouchableOpacity>
            </View>

            {vaccinations.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="shield-checkmark-outline" size={40} color="#2F5C77" />
                <Text style={styles.emptyCardText}>Aucun vaccin enregistré pour ce patient.</Text>
              </View>
            ) : (
              <View style={styles.historyList}>
                {vaccinations.map((item) => (
                  <View key={item.id} style={styles.historyItem}>
                    <View style={styles.historyHeader}>
                      <Text style={styles.vaccineName}>{item.vaccin}</Text>
                      <Text style={styles.historyDate}>Inoculé le : {formatDateFR(item.date_administration)}</Text>
                    </View>
                    {item.date_rappel && (
                      <View style={styles.recallBadge}>
                        <Ionicons name="alarm-outline" size={14} color="#E67E22" />
                        <Text style={styles.recallText}>Rappel : {formatDateFR(item.date_rappel)}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Add Antecedent Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nouvel Antécédent</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.modalLabel}>Type d'antécédent</Text>
              <View style={styles.typeSelector}>
                {(['MEDICAL', 'CHIRURGICAL', 'ALLERGIE', 'TRAITEMENT_CHRONIQUE'] as Antecedent['type'][]).map((type) => {
                  let label = 'Médical';
                  if (type === 'CHIRURGICAL') label = 'Chirurgie';
                  if (type === 'ALLERGIE') label = 'Allergie';
                  if (type === 'TRAITEMENT_CHRONIQUE') label = 'Chronique';

                  const isSel = antType === type;
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[styles.typeBtn, isSel && styles.typeBtnActive]}
                      onPress={() => setAntType(type)}
                    >
                      <Text style={[styles.typeBtnText, isSel && styles.typeBtnTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.modalLabel}>Description de l'antécédent *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Ex: Asthme depuis l'enfance, Allergie à la pénicilline..."
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={4}
                value={antDescription}
                onChangeText={setAntDescription}
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setModalVisible(false)}
                disabled={modalLoading}
              >
                <Text style={styles.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmit}
                onPress={handleAddAntecedent}
                disabled={modalLoading}
              >
                <Text style={styles.modalSubmitText}>
                  {modalLoading ? 'Enregistrement...' : 'Enregistrer'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Vaccine Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVaccineVisible}
        onRequestClose={() => setModalVaccineVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Enregistrer un Vaccin</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.modalLabel}>Nom du Vaccin / Maladie cible *</Text>
              <TextInput
                style={styles.modalInputText}
                placeholder="Ex: BCG, ROR, Hépatite B, Tétanos..."
                placeholderTextColor="#9ca3af"
                value={vaccineName}
                onChangeText={setVaccineName}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.modalLabel}>Date d'administration (AAAA-MM-JJ) *</Text>
              <TextInput
                style={styles.modalInputText}
                placeholder="AAAA-MM-JJ"
                placeholderTextColor="#9ca3af"
                value={vaccineDate}
                onChangeText={setVaccineDate}
                keyboardType="numeric"
                maxLength={10}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.modalLabel}>Date de rappel (AAAA-MM-JJ, optionnelle)</Text>
              <TextInput
                style={styles.modalInputText}
                placeholder="AAAA-MM-JJ"
                placeholderTextColor="#9ca3af"
                value={vaccineRecallDate}
                onChangeText={setVaccineRecallDate}
                keyboardType="numeric"
                maxLength={10}
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setModalVaccineVisible(false)}
                disabled={vaccineLoading}
              >
                <Text style={styles.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmit}
                onPress={handleAddVaccine}
                disabled={vaccineLoading}
              >
                <Text style={styles.modalSubmitText}>
                  {vaccineLoading ? 'Enregistrement...' : 'Enregistrer'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Patient Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={editModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <Text style={styles.modalTitle}>Modifier le Dossier Patient</Text>

            <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 16 }}>
              <View style={styles.inputGroup}>
                <Text style={styles.modalLabel}>Prénom *</Text>
                <TextInput
                  style={styles.modalInputText}
                  placeholder="Prénom"
                  placeholderTextColor="#9ca3af"
                  value={editPrenom}
                  onChangeText={setEditPrenom}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.modalLabel}>Nom de famille *</Text>
                <TextInput
                  style={styles.modalInputText}
                  placeholder="Nom"
                  placeholderTextColor="#9ca3af"
                  value={editNom}
                  onChangeText={setEditNom}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.modalLabel}>Sexe *</Text>
                <View style={styles.typeSelector}>
                  <TouchableOpacity
                    style={[styles.typeBtn, editSexe === 'M' && styles.typeBtnActive]}
                    onPress={() => setEditSexe('M')}
                  >
                    <Text style={[styles.typeBtnText, editSexe === 'M' && styles.typeBtnTextActive]}>Homme (M)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.typeBtn, editSexe === 'F' && styles.typeBtnActive]}
                    onPress={() => setEditSexe('F')}
                  >
                    <Text style={[styles.typeBtnText, editSexe === 'F' && styles.typeBtnTextActive]}>Femme (F)</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.modalLabel}>Date de Naissance (AAAA-MM-JJ) *</Text>
                <TextInput
                  style={styles.modalInputText}
                  placeholder="ex: 1990-05-15"
                  placeholderTextColor="#9ca3af"
                  value={editDateNaissance}
                  onChangeText={setEditDateNaissance}
                  keyboardType="numeric"
                  maxLength={10}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.modalLabel}>Numéro de Téléphone</Text>
                <TextInput
                  style={styles.modalInputText}
                  placeholder="ex: +221 77 123 45 67"
                  placeholderTextColor="#9ca3af"
                  value={editTelephone}
                  onChangeText={setEditTelephone}
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.modalLabel}>Adresse de Résidence</Text>
                <TextInput
                  style={styles.modalInputText}
                  placeholder="ex: Dakar, Sacré-Cœur"
                  placeholderTextColor="#9ca3af"
                  value={editAdresse}
                  onChangeText={setEditAdresse}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.modalLabel}>Profession</Text>
                <TextInput
                  style={styles.modalInputText}
                  placeholder="ex: Enseignant, Commerçant..."
                  placeholderTextColor="#9ca3af"
                  value={editProfession}
                  onChangeText={setEditProfession}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.modalLabel}>Personne à Prévenir</Text>
                <TextInput
                  style={styles.modalInputText}
                  placeholder="ex: Épouse - 77 000 00 00"
                  placeholderTextColor="#9ca3af"
                  value={editPersonnePrevenir}
                  onChangeText={setEditPersonnePrevenir}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.modalLabel}>Groupe Sanguin</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((grp) => (
                    <TouchableOpacity
                      key={grp}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 6,
                        backgroundColor: editGroupeSanguin === grp ? '#FF6B6B' : '#0F2C3D',
                        borderWidth: 1,
                        borderColor: editGroupeSanguin === grp ? '#FF6B6B' : '#2F5C77',
                      }}
                      onPress={() => setEditGroupeSanguin(editGroupeSanguin === grp ? null : grp)}
                    >
                      <Text style={{ color: editGroupeSanguin === grp ? '#FFFFFF' : '#8AC8F9', fontWeight: 'bold', fontSize: 12 }}>
                        {grp}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setEditModalVisible(false)}
                disabled={editLoading}
              >
                <Text style={styles.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmit, { backgroundColor: '#28C2FF' }]}
                onPress={handleSavePatientEdit}
                disabled={editLoading}
              >
                <Text style={[styles.modalSubmitText, { color: '#0F2C3D' }]}>
                  {editLoading ? 'Enregistrement...' : 'Sauvegarder les modifications'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
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
  loadingText: {
    color: '#8AC8F9',
    marginTop: 12,
    fontSize: 14,
  },
  header: {
    backgroundColor: '#1E3E52',
    paddingTop: Platform.OS === 'web' ? 80 : (Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 16),
    borderBottomWidth: 1,
    borderBottomColor: '#2F5C77',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
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
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#28C2FF',
  },
  syncIndicator: {
    padding: 4,
  },
  headerProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
    gap: 16,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#28C2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#0F2C3D',
    fontSize: 22,
    fontWeight: 'bold',
  },
  profileMeta: {
    flex: 1,
  },
  patientName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  patientSub: {
    fontSize: 14,
    color: '#D1E6F3',
    marginTop: 4,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#2F5C77',
  },
  tabItem: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: '#28C2FF',
  },
  tabLabel: {
    color: '#8AC8F9',
    fontSize: 14,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: '#28C2FF',
    fontWeight: 'bold',
  },
  content: {
    paddingBottom: 40,
  },
  infoContainer: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#8AC8F9',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoCard: {
    backgroundColor: '#1E3E52',
    borderRadius: 15,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2F5C77',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2F5C77',
  },
  infoLabel: {
    color: '#8AC8F9',
    fontSize: 14,
  },
  infoValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
    marginLeft: 16,
  },
  tabHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  actionButton: {
    backgroundColor: '#28C2FF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
  },
  actionButtonText: {
    color: '#0F2C3D',
    fontWeight: 'bold',
    fontSize: 13,
  },
  emptyCard: {
    backgroundColor: '#1E3E52',
    borderWidth: 1,
    borderColor: '#2F5C77',
    borderStyle: 'dashed',
    borderRadius: 15,
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCardText: {
    color: '#8AC8F9',
    marginTop: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  historyList: {
    gap: 12,
  },
  historyItem: {
    backgroundColor: '#1E3E52',
    borderWidth: 1,
    borderColor: '#2F5C77',
    borderRadius: 12,
    padding: 16,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeBadge: {
    backgroundColor: '#2F5C77',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  typeBadgeText: {
    color: '#28C2FF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  historyDate: {
    color: '#8AC8F9',
    fontSize: 12,
  },
  historyDesc: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 22,
  },
  vaccineName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
  },
  recallBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2F5C77',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginTop: 8,
    alignSelf: 'flex-start',
    gap: 4,
  },
  recallText: {
    color: '#E67E22',
    fontSize: 12,
    fontWeight: '600',
  },
  consList: {
    gap: 12,
  },
  consItem: {
    backgroundColor: '#1E3E52',
    borderWidth: 1,
    borderColor: '#2F5C77',
    borderRadius: 12,
    padding: 16,
  },
  consHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  consDate: {
    color: '#28C2FF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  consMotif: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  consDiag: {
    color: '#D1E6F3',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#1E3E52',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2F5C77',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8AC8F9',
    marginBottom: 8,
  },
  typeSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
  modalInput: {
    backgroundColor: '#0F2C3D',
    color: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2F5C77',
    textAlignVertical: 'top',
  },
  modalInputText: {
    backgroundColor: '#0F2C3D',
    color: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2F5C77',
    height: 48,
  },
  inputGroup: {
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalCancel: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#2F5C77',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  modalSubmit: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#28C2FF',
    alignItems: 'center',
  },
  modalSubmitText: {
    color: '#0F2C3D',
    fontWeight: 'bold',
  },
  aiSummaryCard: {
    backgroundColor: '#1A3344',
    borderWidth: 1,
    borderColor: '#2F5C77',
    borderRadius: 15,
    padding: 16,
    marginBottom: 20,
    gap: 12,
  },
  aiSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#2F5C77',
    paddingBottom: 8,
  },
  aiSummaryTitle: {
    color: '#28C2FF',
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  aiRegenBtn: {
    padding: 4,
  },
  aiSummaryLoading: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  aiSummaryTextMuted: {
    color: '#8AC8F9',
    fontSize: 13,
    textAlign: 'center',
  },
  aiSummaryContent: {
    gap: 10,
  },
  aiSummaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
  },
  aiDisclaimerBox: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    backgroundColor: '#0F2C3D',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2F5C77',
  },
  aiSummaryDisclaimer: {
    color: '#D1E6F3',
    fontSize: 11,
    flex: 1,
  },
  aiSummaryEmpty: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 12,
  },
  aiSummaryEmptyText: {
    color: '#D1E6F3',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  aiSummaryBtn: {
    backgroundColor: '#28C2FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  aiSummaryBtnText: {
    color: '#0F2C3D',
    fontSize: 13,
    fontWeight: 'bold',
  },
});
