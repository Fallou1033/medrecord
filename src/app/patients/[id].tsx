import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter, Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getPatientById, updatePatient } from '../../services/api/patientsService';
import { getConsultations } from '../../services/api/consultationsService';
import { logAuditEvent } from '../../services/api/auditService';
import { Patient, Consultation } from '../../types';
import {
  getAntecedentsByPatient,
  addAntecedent,
  getVaccinationsByPatient,
  addVaccination,
  getExamensParacliniquesByPatient,
  addExamenParaclinique,
  deleteExamenParaclinique,
  Antecedent,
  Vaccination,
  ExamenParaclinique,
} from '../../database/SQLiteDatabaseManager';
import { calculateAge, formatDateFR } from '../../utils/helpers';
import { useSecurity } from '../../security/SecurityContext';
import DatePickerDOB from '../../components/DatePickerDOB';
import PhoneInputInternational from '../../components/PhoneInputInternational';

type SubTab = 'info' | 'consultations' | 'paraclinique' | 'antecedents' | 'documents' | 'vaccinations';

class LocalParacliniqueBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any) {
    console.error('Paraclinique Local Error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ padding: 20, backgroundColor: '#1E3E52', borderRadius: 12, borderWidth: 1, borderColor: '#2F5C77', alignItems: 'center', gap: 12 }}>
          <Ionicons name="flask-outline" size={36} color="#8AC8F9" />
          <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' }}>Examens Paracliniques</Text>
          <Text style={{ color: '#8AC8F9', fontSize: 13, textAlign: 'center' }}>
            Reconnexion et initialisation du module en cours...
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: '#28C2FF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}
            onPress={() => this.setState({ hasError: false })}
          >
            <Text style={{ color: '#0F2C3D', fontWeight: 'bold', fontSize: 12 }}>Réinitialiser l'affichage</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function PatientDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
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
  const [antecedents, setAntecedents] = useState<Antecedent[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [selectedConsultationDetail, setSelectedConsultationDetail] = useState<Consultation | null>(null);
  const [vaccinations, setVaccinations] = useState<Vaccination[]>([]);
  const [examensParacliniques, setExamensParacliniques] = useState<ExamenParaclinique[]>([]);
  const [paraFilterCategory, setParaFilterCategory] = useState<string>('TOUS');
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SubTab>('info');
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [aiSummary, setAiSummary] = useState<string>('');
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  // Modal State for Paraclinique
  const [modalParacliniqueVisible, setModalParacliniqueVisible] = useState(false);
  const [paraCategorie, setParaCategorie] = useState<'Radiographie' | 'Scanner' | 'NFS' | 'Ionogramme' | 'Autres'>('Radiographie');
  const [paraIntituleAutre, setParaIntituleAutre] = useState('');
  const [paraDate, setParaDate] = useState(new Date().toISOString().split('T')[0]);
  const [paraCompteRendu, setParaCompteRendu] = useState('');
  const [paraFichierUrl, setParaFichierUrl] = useState<string | null>(null);
  const [paraFichierNom, setParaFichierNom] = useState<string | null>(null);
  const [paraFichierType, setParaFichierType] = useState<'image' | 'pdf' | 'other' | null>(null);
  const [paraLoading, setParaLoading] = useState(false);

  // Modal State for adding Antecedent
  const [modalVisible, setModalVisible] = useState(false);
  const [antType, setAntType] = useState<Antecedent['type']>('MEDICAL');
  const [antDescription, setAntDescription] = useState('');
  const [modalLoading, setModalLoading] = useState(false);

  // Structured Terrain States
  const [neantMedical, setNeantMedical] = useState(false);
  const [neantChirurgical, setNeantChirurgical] = useState(false);
  const [neantGyneco, setNeantGyneco] = useState(false);
  const [neantFamilial, setNeantFamilial] = useState(false);
  const [neantToxique, setNeantToxique] = useState(false);
  const [neantAllergie, setNeantAllergie] = useState(false);

  const [familiauxText, setFamiliauxText] = useState('');
  const [tabagismeOui, setTabagismeOui] = useState(false);
  const [tabagismeDetail, setTabagismeDetail] = useState('');
  const [alcoolismeOui, setAlcoolismeOui] = useState(false);
  const [alcoolismeDetail, setAlcoolismeDetail] = useState('');

  // Form states for Medical
  const [medPathologie, setMedPathologie] = useState('');
  const [medAnnee, setMedAnnee] = useState('');

  // Form states for Surgical (6 fields)
  const [chirIntervention, setChirIntervention] = useState('');
  const [chirIndication, setChirIndication] = useState('');
  const [chirAnnee, setChirAnnee] = useState('');
  const [chirEtablissement, setChirEtablissement] = useState('');
  const [chirComplications, setChirComplications] = useState('');
  const [chirCommentaire, setChirCommentaire] = useState('');

  // Form states for Allergies (2 fields)
  const [allergieSubstance, setAllergieSubstance] = useState('');
  const [allergieReaction, setAllergieReaction] = useState('');

  // Form states for Gyneco-Obstetrique
  const [gynecoGestePari, setGynecoGestePari] = useState('');
  const [gynecoDDR, setGynecoDDR] = useState('');
  const [gynecoObs, setGynecoObs] = useState('');

  // Modal extra states
  const [modalNeant, setModalNeant] = useState(false);
  const [modalTabacOui, setModalTabacOui] = useState(false);
  const [modalTabacDetail, setModalTabacDetail] = useState('');
  const [modalAlcoolOui, setModalAlcoolOui] = useState(false);
  const [modalAlcoolDetail, setModalAlcoolDetail] = useState('');

  useEffect(() => {
    if (id) {
      loadStructuredTerrain(id);
    }
  }, [id]);

  const loadStructuredTerrain = async (patientId: string) => {
    try {
      let raw: string | null = null;
      if (Platform.OS === 'web') {
        raw = localStorage.getItem(`terrain_v2_${patientId}`);
      } else {
        const SecureStore = require('expo-secure-store');
        raw = await SecureStore.getItemAsync(`terrain_v2_${patientId}`);
      }
      if (raw) {
        const d = JSON.parse(raw);
        setNeantMedical(!!d.neantMedical);
        setNeantChirurgical(!!d.neantChirurgical);
        setNeantGyneco(!!d.neantGyneco);
        setNeantFamilial(!!d.neantFamilial);
        setNeantToxique(!!d.neantToxique);
        setNeantAllergie(!!d.neantAllergie);
        setFamiliauxText(d.familiauxText || '');
        setTabagismeOui(!!d.tabagismeOui);
        setTabagismeDetail(d.tabagismeDetail || '');
        setAlcoolismeOui(!!d.alcoolismeOui);
        setAlcoolismeDetail(d.alcoolismeDetail || '');
      }
    } catch (e) {
      console.error('Failed to load terrain:', e);
    }
  };

  const saveTerrainState = async (key: string, value: any) => {
    try {
      let raw: string | null = null;
      if (Platform.OS === 'web') {
        raw = localStorage.getItem(`terrain_v2_${id}`);
      } else {
        const SecureStore = require('expo-secure-store');
        raw = await SecureStore.getItemAsync(`terrain_v2_${id}`);
      }
      const existing = raw ? JSON.parse(raw) : {};
      existing[key] = value;
      const str = JSON.stringify(existing);
      if (Platform.OS === 'web') {
        localStorage.setItem(`terrain_v2_${id}`, str);
      } else {
        const SecureStore = require('expo-secure-store');
        await SecureStore.setItemAsync(`terrain_v2_${id}`, str);
      }
    } catch (e) {
      console.error('Failed to save terrain:', e);
    }
  };

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
  const [editGroupeSanguin, setEditGroupeSanguin] = useState<string | null>('Inconnu');
  const [editSourceGroupeSanguin, setEditSourceGroupeSanguin] = useState<'BIOLOGIQUE' | 'DECLARE'>('DECLARE');
  const [editLoading, setEditLoading] = useState(false);

  const openEditModal = () => {
    if (!patient) return;
    setEditNom(patient.nom);
    setEditPrenom(patient.prenom);
    setEditSexe(patient.sexe);
    setEditDateNaissance(patient.date_naissance || '');
    setEditTelephone(patient.telephone || '');
    setEditAdresse(patient.adresse || '');
    setEditProfession(patient.profession || '');
    setEditPersonnePrevenir(patient.personne_prevenir || '');
    setEditGroupeSanguin(patient.groupe_sanguin || 'Inconnu');
    setEditSourceGroupeSanguin(patient.source_groupe_sanguin || 'DECLARE');
    setEditModalVisible(true);
  };

  const handleSavePatientEdit = async () => {
    if (!user || !patient) return;
    if (!editNom.trim() || !editPrenom.trim()) {
      showAlert('Champs requis', 'Le nom et le prénom sont requis.');
      return;
    }

    if (editDateNaissance.trim()) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(editDateNaissance.trim())) {
        showAlert('Format invalide', 'La date de naissance doit être au format AAAA-MM-JJ.');
        return;
      }
    }

    setEditLoading(true);
    try {
      await updatePatient(patient.id, {
        nom: editNom.trim(),
        prenom: editPrenom.trim(),
        sexe: editSexe,
        date_naissance: editDateNaissance.trim() || null,
        telephone: editTelephone.trim() || null,
        adresse: editAdresse.trim() || null,
        profession: editProfession.trim() || null,
        personne_prevenir: editPersonnePrevenir.trim() || null,
        groupe_sanguin: editGroupeSanguin || 'Inconnu',
        source_groupe_sanguin: editSourceGroupeSanguin,
      });

      // Journal d'audit : Mise à jour du dossier patient
      logAuditEvent(
        'UPDATE',
        'patients',
        patient.id,
        `Mise à jour des informations administratives : ${editPrenom.trim()} ${editNom.trim()}`,
        'INFO'
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

      // Journal d'audit : Consultation du dossier médical
      try {
        const { logAuditEvent } = require('../../security/auditLogger');
        logAuditEvent(
          'PATIENT_VIEW',
          'patients',
          p.id,
          `Consultation du dossier médical : ${p.prenom || ''} ${p.nom || ''}`,
          'INFO',
          user?.id
        ).catch(() => {});
      } catch (e) {}

      // 1. Track recently viewed
      try {
        const userKeySuffix = user?.id ? `_${user.id}` : '';
        const recentsKey = `recents_patients${userKeySuffix}`;
        let list = [];
        if (Platform.OS === 'web') {
          list = JSON.parse(localStorage.getItem(recentsKey) || '[]');
        } else {
          const SecureStore = require('expo-secure-store');
          const data = await SecureStore.getItemAsync(recentsKey);
          list = JSON.parse(data || '[]');
        }
        list = list.filter((item: any) => item.id !== id);
        list.unshift({
          id: p.id,
          prenom: p.prenom,
          nom: p.nom,
          numero_dossier: p.numero_dossier,
          sexe: p.sexe,
          telephone: p.telephone,
          adresse: p.adresse,
        });
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
        const userKeySuffix = user?.id ? `_${user.id}` : '';
        const favsKey = `favorites_patients${userKeySuffix}`;
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

      const ant = await getAntecedentsByPatient(id).catch(() => []);
      setAntecedents(ant);

      const cons = await getConsultations(id).catch(() => []);
      setConsultations(cons);

      if (isMountedRef.current) {
        const vacs = await getVaccinationsByPatient(id).catch(() => []);
        setVaccinations(vacs);

        const para = await getExamensParacliniquesByPatient(id).catch(() => []);
        setExamensParacliniques(para);
      }

      // Audit read file
      logAuditEvent(
        'READ',
        'patients',
        id,
        `Consultation du dossier patient de ${p.prenom} ${p.nom} (${p.numero_dossier})`
      ).catch(() => {});
    } catch (error) {
      console.error('Failed to load patient data:', error);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const toggleFavorite = async () => {
    if (!patient) return;
    try {
      const userKeySuffix = user?.id ? `_${user.id}` : '';
      const favsKey = `favorites_patients${userKeySuffix}`;
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
          const sortedVisits = [...consultations].sort((a, b) => new Date(b.date || b.date_consultation || '').getTime() - new Date(a.date || a.date_consultation || '').getTime());
          const lastV = sortedVisits[0];
          
          let constText = 'non renseignées';
          const parts = [];
          if (lastV.pression_arterielle) parts.push(`TA ${lastV.pression_arterielle} mmHg`);
          if (lastV.temperature) parts.push(`Temp ${lastV.temperature}°C`);
          if (lastV.poids_kg) parts.push(`Poids ${lastV.poids_kg}kg`);
          if (parts.length > 0) constText = parts.join(', ');
          
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
    let description = '';

    if (modalNeant) {
      if (antType === 'MEDICAL') {
        setNeantMedical(true);
        saveTerrainState('neantMedical', true);
        description = '✓ Néant (Aucun antécédent médical connu)';
      } else if (antType === 'CHIRURGICAL') {
        setNeantChirurgical(true);
        saveTerrainState('neantChirurgical', true);
        description = '✓ Néant (Aucun antécédent chirurgical connu)';
      } else if (antType === 'ALLERGIE') {
        setNeantAllergie(true);
        saveTerrainState('neantAllergie', true);
        description = '✓ Néant (Aucune allergie connue)';
      } else if (antType === 'FAMILIAL') {
        setNeantFamilial(true);
        saveTerrainState('neantFamilial', true);
        description = '✓ Néant (Aucun antécédent familial connu)';
      } else if (antType === 'TABAGISME' || antType === 'ALCOOLISM') {
        setNeantToxique(true);
        saveTerrainState('neantToxique', true);
        description = '✓ Néant (Aucune addiction / exposition toxique)';
      } else if (antType === 'GYNECO_OBSTETRIQUE') {
        setNeantGyneco(true);
        saveTerrainState('neantGyneco', true);
        description = '✓ Néant (Aucun antécédent gynéco-obstétrique)';
      } else {
        description = '✓ Néant';
      }
    } else {
      if (antType === 'MEDICAL') {
        if (!medPathologie.trim()) {
          showAlert('Champ requis', 'Veuillez saisir l\'intitulé de la pathologie.');
          return;
        }
        description = `${medPathologie.trim()}${medAnnee.trim() ? ` (${medAnnee.trim()})` : ''}`;
        setNeantMedical(false);
        saveTerrainState('neantMedical', false);
      } else if (antType === 'CHIRURGICAL') {
        if (!chirIntervention.trim()) {
          showAlert('Champ requis', 'Veuillez saisir la nature de l\'intervention.');
          return;
        }
        description = `Intervention: ${chirIntervention.trim()} | Indication: ${chirIndication.trim() || 'N/A'} | Année: ${chirAnnee.trim() || 'N/A'} | Établissement: ${chirEtablissement.trim() || 'N/A'} | Complications: ${chirComplications.trim() || 'Aucune'} | Obs: ${chirCommentaire.trim() || 'RAS'}`;
        setNeantChirurgical(false);
        saveTerrainState('neantChirurgical', false);
      } else if (antType === 'ALLERGIE') {
        if (!allergieSubstance.trim() || !allergieReaction.trim()) {
          showAlert('Champs requis', 'Veuillez saisir la substance et le type de réaction.');
          return;
        }
        description = `Substance: ${allergieSubstance.trim()} | Réaction: ${allergieReaction.trim()}`;
        setNeantAllergie(false);
        saveTerrainState('neantAllergie', false);
      } else if (antType === 'FAMILIAL') {
        if (!antDescription.trim()) {
          showAlert('Champ requis', 'Veuillez saisir la description des antécédents familiaux.');
          return;
        }
        description = antDescription.trim();
        setFamiliauxText(description);
        saveTerrainState('familiauxText', description);
        setNeantFamilial(false);
        saveTerrainState('neantFamilial', false);
      } else if (antType === 'TABAGISME') {
        setNeantToxique(false);
        saveTerrainState('neantToxique', false);
        setTabagismeOui(modalTabacOui);
        saveTerrainState('tabagismeOui', modalTabacOui);
        setTabagismeDetail(modalTabacDetail);
        saveTerrainState('tabagismeDetail', modalTabacDetail);
        description = modalTabacOui ? `Tabagisme: Oui (${modalTabacDetail || 'Non précisé'})` : 'Tabagisme: Non';
      } else if (antType === 'ALCOOLISM') {
        setNeantToxique(false);
        saveTerrainState('neantToxique', false);
        setAlcoolismeOui(modalAlcoolOui);
        saveTerrainState('alcoolismeOui', modalAlcoolOui);
        setAlcoolismeDetail(modalAlcoolDetail);
        saveTerrainState('alcoolismeDetail', modalAlcoolDetail);
        description = modalAlcoolOui ? `Alcoolisme: Oui (${modalAlcoolDetail || 'Non précisé'})` : 'Alcoolisme: Non';
      } else if (antType === 'GYNECO_OBSTETRIQUE') {
        if (!gynecoGestePari.trim()) {
          showAlert('Champ requis', 'Veuillez renseigner le geste/parité.');
          return;
        }
        description = `Parité: ${gynecoGestePari.trim()} | DDR: ${gynecoDDR.trim() || 'N/A'} | Obs: ${gynecoObs.trim() || 'RAS'}`;
        setNeantGyneco(false);
        saveTerrainState('neantGyneco', false);
      } else {
        if (!antDescription.trim()) {
          showAlert('Champ requis', 'Veuillez remplir la description.');
          return;
        }
        description = antDescription.trim();
      }
    }

    if (!user) return;

    setModalLoading(true);
    try {
      await addAntecedent(
        {
          patient_id: id,
          type: antType,
          description,
        },
        user.id
      );

      const ant = await getAntecedentsByPatient(id);
      setAntecedents(ant);

      setMedPathologie('');
      setMedAnnee('');
      setChirIntervention('');
      setChirIndication('');
      setChirAnnee('');
      setChirEtablissement('');
      setChirComplications('');
      setChirCommentaire('');
      setAllergieSubstance('');
      setAllergieReaction('');
      setGynecoGestePari('');
      setGynecoDDR('');
      setGynecoObs('');
      setAntDescription('');
      setModalNeant(false);
      setModalVisible(false);
      showAlert('Succès', 'Antécédent enregistré avec succès.');
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

  const handleAddExamenParaclinique = async () => {
    if (paraCategorie === 'Autres' && !paraIntituleAutre.trim()) {
      showAlert('Champ requis', 'Veuillez préciser l\'intitulé de l\'examen.');
      return;
    }
    if (!paraCompteRendu.trim()) {
      showAlert('Champ requis', 'Veuillez saisir le compte-rendu ou les conclusions.');
      return;
    }

    if (!user) return;

    setParaLoading(true);
    try {
      await addExamenParaclinique(
        {
          patient_id: id,
          categorie: paraCategorie,
          intitule_autre: paraCategorie === 'Autres' ? paraIntituleAutre.trim() : null,
          date_examen: paraDate,
          compte_rendu: paraCompteRendu.trim(),
          fichier_url: paraFichierUrl,
          fichier_nom: paraFichierNom,
          fichier_type: paraFichierType,
        },
        user.id
      );

      const updated = await getExamensParacliniquesByPatient(id);
      setExamensParacliniques(updated);

      setParaIntituleAutre('');
      setParaCompteRendu('');
      setParaFichierUrl(null);
      setParaFichierNom(null);
      setParaFichierType(null);
      setModalParacliniqueVisible(false);
      showAlert('Succès', 'Examen paraclinique enregistré avec succès.');
    } catch (err) {
      console.error(err);
      showAlert('Erreur', "Impossible d'enregistrer l'examen paraclinique.");
    } finally {
      setParaLoading(false);
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

        {/* Custom Tab Bar (Vaccins shown ONLY if age < 15) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabBar}
          contentContainerStyle={styles.tabBarScroll}
        >
          {(
            (age !== null && age < 15)
              ? ['info', 'consultations', 'paraclinique', 'antecedents', 'documents', 'vaccinations']
              : ['info', 'consultations', 'paraclinique', 'antecedents', 'documents']
          ).map((tab) => {
            let label = 'Résumé';
            if (tab === 'consultations') label = 'Consultations';
            if (tab === 'paraclinique') label = 'Paraclinique';
            if (tab === 'antecedents') label = 'Antécédents & Terrain';
            if (tab === 'documents') label = 'Documents';
            if (tab === 'vaccinations') label = 'Vaccins';

            const isActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tabItem, isActive && styles.tabItemActive]}
                onPress={() => setActiveTab(tab as SubTab)}
              >
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* TAB 1: INFORMATION PROFILE */}
        {activeTab === 'info' && (
          <View style={styles.infoContainer}>
            {/* 1. Fiche Administrative */}
            <View style={styles.tabHeader}>
              <Text style={styles.sectionTitle} numberOfLines={1}>Fiche Administrative</Text>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => router.push(`/patients/certificat_create?patientId=${id}`)}
              >
                <Ionicons name="document-text" size={16} color="#0F2C3D" />
                <Text style={styles.actionButtonText}>+ Certificat</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.infoCard}>
              {/* Groupe Sanguin avec Traçabilité & Badge de Confiance */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#2F5C77' }}>
                <Text style={{ color: '#8AC8F9', fontSize: 14 }}>Groupe Sanguin :</Text>
                {(() => {
                  const gs = patient.groupe_sanguin || 'Inconnu';
                  const isSpecific = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].includes(gs);
                  const isBio = patient.source_groupe_sanguin === 'BIOLOGIQUE';

                  if (!isSpecific) {
                    return (
                      <View style={{ backgroundColor: '#1E3E52', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                        <Text style={{ color: '#8AC8F9', fontSize: 13, fontWeight: 'bold' }}>{gs}</Text>
                      </View>
                    );
                  }

                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ color: '#FF6B6B', fontSize: 16, fontWeight: 'bold' }}>{gs}</Text>
                      <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        backgroundColor: isBio ? 'rgba(46, 204, 113, 0.15)' : 'rgba(255, 107, 107, 0.15)',
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: isBio ? '#2ECC71' : '#FF6B6B'
                      }}>
                        <Ionicons name={isBio ? "checkmark-circle" : "alert-circle"} size={14} color={isBio ? "#2ECC71" : "#FF6B6B"} />
                        <Text style={{ color: isBio ? "#2ECC71" : "#FF6B6B", fontSize: 11, fontWeight: 'bold' }}>
                          {isBio ? 'Résultat biologique (Vert)' : 'Déclaré par le patient (Rouge)'}
                        </Text>
                      </View>
                    </View>
                  );
                })()}
              </View>
              <InfoRow label="Téléphone" value={patient.telephone || 'Aucun'} />
              <InfoRow label="Adresse" value={patient.adresse || 'Non renseignée'} />
              <InfoRow label="Profession" value={patient.profession || 'Non renseignée'} />
              <InfoRow label="Personne à prévenir" value={patient.personne_prevenir || 'Non renseignée'} />
              <InfoRow label="Date de création" value={formatDateFR(patient.created_at)} />
            </View>

            {/* 2. Synthèse Clinique de l'IA (Positionnée directement en-dessous de la Fiche administrative) */}
            <View style={[styles.aiSummaryCard, { marginTop: 16 }]}>
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
          </View>
        )}

        {/* TAB 2: ANTECEDENTS ET TERRAIN */}
        {activeTab === 'antecedents' && (
          <View style={styles.infoContainer}>
            <View style={styles.tabHeader}>
              <Text style={styles.sectionTitle}>Antécédents et Terrain</Text>
              <TouchableOpacity style={styles.actionButton} onPress={() => setModalVisible(true)}>
                <Ionicons name="add-circle" size={18} color="#0F2C3D" />
                <Text style={styles.actionButtonText}>+ Ajouter</Text>
              </TouchableOpacity>
            </View>

            {/* 1. Antécédents Médicaux */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardTitleGroup}>
                  <Ionicons name="medical-outline" size={20} color="#28C2FF" />
                  <Text style={styles.cardTitle} numberOfLines={1}>Antécédents Médicaux</Text>
                </View>
                <TouchableOpacity
                  style={styles.neantBtn}
                  onPress={() => {
                    const val = !neantMedical;
                    setNeantMedical(val);
                    saveTerrainState('neantMedical', val);
                  }}
                >
                  <Ionicons name={neantMedical ? "checkbox" : "square-outline"} size={20} color={neantMedical ? "#2ECC71" : "#8AC8F9"} />
                  <Text style={[styles.neantText, neantMedical && styles.neantTextActive]}>Néant</Text>
                </TouchableOpacity>
              </View>

              {neantMedical ? (
                <View style={styles.neantBadge}>
                  <Text style={styles.neantBadgeText}>✓ Néant (Aucun antécédent médical connu)</Text>
                </View>
              ) : (
                antecedents.filter(a => a.type === 'MEDICAL').length === 0 ? (
                  <Text style={styles.emptySubText}>Aucun antécédent médical renseigné. Cliquez sur "+ Ajouter" pour en ajouter un.</Text>
                ) : (
                  antecedents.filter(a => a.type === 'MEDICAL').map(a => (
                    <View key={a.id} style={styles.antListItem}>
                      <Ionicons name="fitness-outline" size={16} color="#28C2FF" />
                      <Text style={styles.antListText}>{a.description}</Text>
                    </View>
                  ))
                )
              )}
            </View>

            {/* 2. Antécédents Chirurgicaux (6 champs détaillés) */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardTitleGroup}>
                  <Ionicons name="cut-outline" size={20} color="#8AC8F9" />
                  <Text style={styles.cardTitle} numberOfLines={1}>Antécédents Chirurgicaux</Text>
                </View>
                <TouchableOpacity
                  style={styles.neantBtn}
                  onPress={() => {
                    const val = !neantChirurgical;
                    setNeantChirurgical(val);
                    saveTerrainState('neantChirurgical', val);
                  }}
                >
                  <Ionicons name={neantChirurgical ? "checkbox" : "square-outline"} size={20} color={neantChirurgical ? "#2ECC71" : "#8AC8F9"} />
                  <Text style={[styles.neantText, neantChirurgical && styles.neantTextActive]}>Néant</Text>
                </TouchableOpacity>
              </View>

              {neantChirurgical ? (
                <View style={styles.neantBadge}>
                  <Text style={styles.neantBadgeText}>✓ Néant (Aucun antécédent chirurgical connu)</Text>
                </View>
              ) : (
                antecedents.filter(a => a.type === 'CHIRURGICAL').length === 0 ? (
                  <Text style={styles.emptySubText}>Aucun antécédent chirurgical renseigné. Cliquez sur "+ Ajouter" pour saisir une intervention.</Text>
                ) : (
                  antecedents.filter(a => a.type === 'CHIRURGICAL').map(a => (
                    <View key={a.id} style={styles.antListItem}>
                      <Ionicons name="bandage-outline" size={16} color="#8AC8F9" />
                      <Text style={styles.antListText}>{a.description}</Text>
                    </View>
                  ))
                )
              )}
            </View>

            {/* 3. Antécédents Gynéco-Obstétricaux (Conditionnel: Sexe F ET Age > 15) */}
            {patient.sexe === 'F' && age !== null && age > 15 && (
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <View style={styles.cardTitleGroup}>
                    <Ionicons name="woman-outline" size={20} color="#FF6B6B" />
                    <Text style={styles.cardTitle} numberOfLines={1}>Gynéco-Obstétriques</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.neantBtn}
                    onPress={() => {
                      const val = !neantGyneco;
                      setNeantGyneco(val);
                      saveTerrainState('neantGyneco', val);
                    }}
                  >
                    <Ionicons name={neantGyneco ? "checkbox" : "square-outline"} size={20} color={neantGyneco ? "#2ECC71" : "#8AC8F9"} />
                    <Text style={[styles.neantText, neantGyneco && styles.neantTextActive]}>Néant</Text>
                  </TouchableOpacity>
                </View>

                {neantGyneco ? (
                  <View style={styles.neantBadge}>
                    <Text style={styles.neantBadgeText}>✓ Néant (Aucun antécédent gynéco-obstétrique)</Text>
                  </View>
                ) : (
                  antecedents.filter(a => a.type === 'GYNECO_OBSTETRIQUE').length === 0 ? (
                    <Text style={styles.emptySubText}>Aucun antécédent gynéco-obstétrique renseigné.</Text>
                  ) : (
                    antecedents.filter(a => a.type === 'GYNECO_OBSTETRIQUE').map(a => (
                      <View key={a.id} style={styles.antListItem}>
                        <Ionicons name="rose-outline" size={16} color="#FF6B6B" />
                        <Text style={styles.antListText}>{a.description}</Text>
                      </View>
                    ))
                  )
                )}
              </View>
            )}

            {/* 4. Antécédents Familiaux */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardTitleGroup}>
                  <Ionicons name="people-outline" size={20} color="#FFD700" />
                  <Text style={styles.cardTitle} numberOfLines={1}>Antécédents Familiaux</Text>
                </View>
                <TouchableOpacity
                  style={styles.neantBtn}
                  onPress={() => {
                    const val = !neantFamilial;
                    setNeantFamilial(val);
                    saveTerrainState('neantFamilial', val);
                  }}
                >
                  <Ionicons name={neantFamilial ? "checkbox" : "square-outline"} size={20} color={neantFamilial ? "#2ECC71" : "#8AC8F9"} />
                  <Text style={[styles.neantText, neantFamilial && styles.neantTextActive]}>Néant</Text>
                </TouchableOpacity>
              </View>

              {neantFamilial ? (
                <View style={styles.neantBadge}>
                  <Text style={styles.neantBadgeText}>✓ Néant (Aucun antécédent familial connu)</Text>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  <TextInput
                    style={styles.textArea}
                    placeholder="Saisissez les antécédents familiaux (ex: Père: HTA, Mère: Diabète...)"
                    placeholderTextColor="#94A3B8"
                    multiline
                    numberOfLines={3}
                    value={familiauxText}
                    onChangeText={(txt) => {
                      setFamiliauxText(txt);
                      saveTerrainState('familiauxText', txt);
                    }}
                  />
                  <Text style={{ color: '#8AC8F9', fontSize: 11 }}>Saisie libre • Sauvegarde automatique</Text>
                </View>
              )}
            </View>

            {/* 5. Terrain & Addictions (Toxiques) */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardTitleGroup}>
                  <Ionicons name="flame-outline" size={20} color="#E67E22" />
                  <Text style={styles.cardTitle} numberOfLines={1}>Terrain & Toxiques</Text>
                </View>
                <TouchableOpacity
                  style={styles.neantBtn}
                  onPress={() => {
                    const val = !neantToxique;
                    setNeantToxique(val);
                    saveTerrainState('neantToxique', val);
                  }}
                >
                  <Ionicons name={neantToxique ? "checkbox" : "square-outline"} size={20} color={neantToxique ? "#2ECC71" : "#8AC8F9"} />
                  <Text style={[styles.neantText, neantToxique && styles.neantTextActive]}>Néant</Text>
                </TouchableOpacity>
              </View>

              {neantToxique ? (
                <View style={styles.neantBadge}>
                  <Text style={styles.neantBadgeText}>✓ Néant (Aucune addiction / exposition toxique)</Text>
                </View>
              ) : (
                <View style={{ gap: 16 }}>
                  {/* Tabagisme */}
                  <View style={styles.toxicBlock}>
                    <View style={styles.toxicRow}>
                      <Text style={styles.toxicLabel}>Tabagisme :</Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          style={[styles.toggleBtn, !tabagismeOui && styles.toggleBtnActiveNo]}
                          onPress={() => {
                            setTabagismeOui(false);
                            saveTerrainState('tabagismeOui', false);
                          }}
                        >
                          <Text style={styles.toggleBtnText}>Non</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.toggleBtn, tabagismeOui && styles.toggleBtnActiveYes]}
                          onPress={() => {
                            setTabagismeOui(true);
                            saveTerrainState('tabagismeOui', true);
                          }}
                        >
                          <Text style={styles.toggleBtnText}>Oui</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {tabagismeOui && (
                      <TextInput
                        style={styles.toxicInput}
                        placeholder="Précisez le nombre d'années, mois ou paquets-années (ex: 15 paquets-années)..."
                        placeholderTextColor="#94A3B8"
                        value={tabagismeDetail}
                        onChangeText={(txt) => {
                          setTabagismeDetail(txt);
                          saveTerrainState('tabagismeDetail', txt);
                        }}
                      />
                    )}
                  </View>

                  {/* Alcoolisme */}
                  <View style={styles.toxicBlock}>
                    <View style={styles.toxicRow}>
                      <Text style={styles.toxicLabel}>Alcoolisme :</Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          style={[styles.toggleBtn, !alcoolismeOui && styles.toggleBtnActiveNo]}
                          onPress={() => {
                            setAlcoolismeOui(false);
                            saveTerrainState('alcoolismeOui', false);
                          }}
                        >
                          <Text style={styles.toggleBtnText}>Non</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.toggleBtn, alcoolismeOui && styles.toggleBtnActiveYes]}
                          onPress={() => {
                            setAlcoolismeOui(true);
                            saveTerrainState('alcoolismeOui', true);
                          }}
                        >
                          <Text style={styles.toggleBtnText}>Oui</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {alcoolismeOui && (
                      <TextInput
                        style={styles.toxicInput}
                        placeholder="Précisez la durée ou la fréquence (ex: Occasionnel, 3 verres/semaine)..."
                        placeholderTextColor="#94A3B8"
                        value={alcoolismeDetail}
                        onChangeText={(txt) => {
                          setAlcoolismeDetail(txt);
                          saveTerrainState('alcoolismeDetail', txt);
                        }}
                      />
                    )}
                  </View>
                </View>
              )}
            </View>

            {/* 6. Allergies Détaillées (Substance + Réaction) */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardTitleGroup}>
                  <Ionicons name="warning-outline" size={20} color="#FF6B6B" />
                  <Text style={styles.cardTitle} numberOfLines={1}>Allergies Détaillées</Text>
                </View>
                <TouchableOpacity
                  style={styles.neantBtn}
                  onPress={() => {
                    const val = !neantAllergie;
                    setNeantAllergie(val);
                    saveTerrainState('neantAllergie', val);
                  }}
                >
                  <Ionicons name={neantAllergie ? "checkbox" : "square-outline"} size={20} color={neantAllergie ? "#2ECC71" : "#8AC8F9"} />
                  <Text style={[styles.neantText, neantAllergie && styles.neantTextActive]}>Néant</Text>
                </TouchableOpacity>
              </View>

              {neantAllergie ? (
                <View style={styles.neantBadge}>
                  <Text style={styles.neantBadgeText}>✓ Néant (Aucune allergie connue)</Text>
                </View>
              ) : (
                antecedents.filter(a => a.type === 'ALLERGIE').length === 0 ? (
                  <Text style={styles.emptySubText}>Aucune allergie renseignée. Cliquez sur "+ Ajouter" (sélectionnez type Allergie).</Text>
                ) : (
                  antecedents.filter(a => a.type === 'ALLERGIE').map(a => (
                    <View key={a.id} style={styles.antListItem}>
                      <Ionicons name="alert-circle-outline" size={16} color="#FF6B6B" />
                      <Text style={styles.antListText}>{a.description}</Text>
                    </View>
                  ))
                )
              )}
            </View>
          </View>
        )}

        {/* TAB 3: CLINICAL CONSULTATIONS */}
        {activeTab === 'consultations' && (
          <View style={styles.infoContainer}>
            <View style={styles.tabHeader}>
              <Text style={styles.sectionTitle} numberOfLines={1}>Consultations</Text>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => router.push(`/patients/consultation_create?patientId=${id}`)}
              >
                <Ionicons name="add-circle" size={16} color="#0F2C3D" />
                <Text style={styles.actionButtonText}>+ Visite</Text>
              </TouchableOpacity>
            </View>

            {consultations.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="clipboard-outline" size={40} color="#2F5C77" />
                <Text style={styles.emptyCardText}>Aucune consultation enregistrée</Text>
              </View>
            ) : (
              <View style={styles.consList}>
                {consultations.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.consItem}
                    activeOpacity={0.8}
                    onPress={() => setSelectedConsultationDetail(item)}
                  >
                    <View style={{ width: '100%' }}>
                      <View style={styles.consHeader}>
                        <Text style={styles.consDate}>{formatDateFR(item.date || item.created_at)}</Text>
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
                ))}
              </View>
            )}
          </View>
        )}

        {/* TAB 4: EXAMENS PARACLINIQUES (Positionné juste après Consultation) */}
        {activeTab === 'paraclinique' && (
          <LocalParacliniqueBoundary>
            <View style={styles.infoContainer}>
              <View style={styles.tabHeader}>
                <Text style={styles.sectionTitle} numberOfLines={1}>Examens Paracliniques</Text>
                <TouchableOpacity style={styles.actionButton} onPress={() => setModalParacliniqueVisible(true)}>
                  <Ionicons name="flask" size={16} color="#0F2C3D" />
                  <Text style={styles.actionButtonText}>+ Examen</Text>
                </TouchableOpacity>
              </View>

              {/* Category Filter Pills */}
              <View style={{ marginBottom: 14 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {['TOUS', 'Radiographie', 'Scanner', 'NFS', 'Ionogramme', 'Autres'].map((cat) => {
                    const isSel = paraFilterCategory === cat;
                    return (
                      <TouchableOpacity
                        key={cat}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 20,
                          backgroundColor: isSel ? '#28C2FF' : '#1E3E52',
                          borderWidth: 1,
                          borderColor: isSel ? '#28C2FF' : '#2F5C77',
                        }}
                        onPress={() => setParaFilterCategory(cat)}
                      >
                        <Text style={{ color: isSel ? '#0F2C3D' : '#8AC8F9', fontSize: 12, fontWeight: isSel ? 'bold' : '500' }}>
                          {cat === 'TOUS' ? 'Tous les examens' : cat}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Paraclinical Exams Chronological List */}
              {(!examensParacliniques || examensParacliniques.length === 0) ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="flask-outline" size={44} color="#2F5C77" />
                  <Text style={styles.emptyCardText}>Aucun examen paraclinique enregistré pour ce patient.</Text>
                  <TouchableOpacity style={[styles.actionButton, { marginTop: 12 }]} onPress={() => setModalParacliniqueVisible(true)}>
                    <Ionicons name="add-circle-outline" size={16} color="#0F2C3D" />
                    <Text style={styles.actionButtonText}>Ajouter le 1er Examen</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ gap: 12 }}>
                  {(examensParacliniques || [])
                    .filter(item => item && (paraFilterCategory === 'TOUS' || item.categorie === paraFilterCategory))
                    .map((item) => {
                      let catIcon = 'flask-outline';
                      let catColor = '#28C2FF';
                      if (item?.categorie === 'Radiographie') { catIcon = 'camera-outline'; catColor = '#8AC8F9'; }
                      if (item?.categorie === 'Scanner') { catIcon = 'body-outline'; catColor = '#FFD700'; }
                      if (item?.categorie === 'NFS') { catIcon = 'fitness-outline'; catColor = '#FF6B6B'; }
                      if (item?.categorie === 'Ionogramme') { catIcon = 'flask-outline'; catColor = '#2ECC71'; }
                      if (item?.categorie === 'Autres') { catIcon = 'ellipsis-horizontal-circle-outline'; catColor = '#E67E22'; }

                      return (
                        <View key={item?.id || Math.random().toString()} style={styles.card}>
                          {/* Card Header */}
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <View style={{ backgroundColor: '#0F2C3D', padding: 6, borderRadius: 8, borderWidth: 1, borderColor: '#2F5C77' }}>
                                <Ionicons name={catIcon as any} size={18} color={catColor} />
                              </View>
                              <View>
                                <Text style={styles.cardTitle}>
                                  {item?.categorie || 'Examen'} {item?.intitule_autre ? `• ${item.intitule_autre}` : ''}
                                </Text>
                                <Text style={{ color: '#8AC8F9', fontSize: 12 }}>Examen du : {formatDateFR(item?.date_examen || '')}</Text>
                              </View>
                            </View>
                            <TouchableOpacity
                              onPress={() => {
                                if (!item?.id) return;
                                showAlert('Confirmation', 'Voulez-vous vraiment supprimer cet examen paraclinique ?', [
                                  {
                                    text: 'Supprimer',
                                    onPress: async () => {
                                      if (user) {
                                        await deleteExamenParaclinique(item.id, id, user.id);
                                        const updated = await getExamensParacliniquesByPatient(id);
                                        setExamensParacliniques(updated || []);
                                      }
                                    },
                                  },
                                  { text: 'Annuler' },
                                ]);
                              }}
                              style={{ padding: 4 }}
                            >
                              <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
                            </TouchableOpacity>
                          </View>

                          {/* Compte Rendu Text Box */}
                          <View style={{ backgroundColor: '#0F2C3D', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#2F5C77', marginTop: 4 }}>
                            <Text style={{ color: '#8AC8F9', fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 4 }}>
                              Compte-Rendu / Conclusion :
                            </Text>
                            <Text style={{ color: '#FFFFFF', fontSize: 14, lineHeight: 20 }}>
                              {item?.compte_rendu || 'Aucun compte-rendu renseigné.'}
                            </Text>
                          </View>

                          {/* Attachment Box */}
                          {item?.fichier_url && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0F2C3D', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#2F5C77', marginTop: 8 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                <Ionicons name={item.fichier_type === 'pdf' ? "document-text" : "image"} size={24} color="#28C2FF" />
                                <View style={{ flex: 1 }}>
                                  <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 'bold' }} numberOfLines={1}>
                                    {item.fichier_nom || 'Pièce jointe de l\'examen'}
                                  </Text>
                                  <Text style={{ color: '#8AC8F9', fontSize: 11 }}>
                                    {item.fichier_type === 'pdf' ? 'Document PDF' : 'Photo / Image'}
                                  </Text>
                                </View>
                              </View>

                              <TouchableOpacity
                                style={{ backgroundColor: '#28C2FF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}
                                onPress={() => {
                                  if (item.fichier_url) {
                                    if (item.fichier_type === 'image' || item.fichier_url.startsWith('data:image')) {
                                      setSelectedImagePreview(item.fichier_url);
                                    } else {
                                      if (Platform.OS === 'web') {
                                        window.open(item.fichier_url, '_blank');
                                      } else {
                                        showAlert('Document PDF', `Fichier : ${item.fichier_nom}`);
                                      }
                                    }
                                  }
                                }}
                              >
                                <Text style={{ color: '#0F2C3D', fontSize: 12, fontWeight: 'bold' }}>Visualiser</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      );
                    })}
                </View>
              )}
            </View>
          </LocalParacliniqueBoundary>
        )}

        {/* TAB 4: DOCUMENTS & PARACLINIQUE */}
        {activeTab === 'documents' && (
          <View style={styles.infoContainer}>
            {/* Paraclinique Module */}
            <View style={styles.card}>
              <View style={styles.tabHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="flask-outline" size={20} color="#28C2FF" />
                  <Text style={styles.sectionTitle}>Examens Paracliniques</Text>
                </View>
              </View>

              <View style={styles.paracliniqueGrid}>
                {['Radiographie', 'Scanner', 'NFS', 'Ionogramme', 'Autres'].map((category) => (
                  <View key={category} style={styles.paracliniqueCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={styles.paracliniqueCatTitle}>{category}</Text>
                      <TouchableOpacity
                        style={styles.uploadBtn}
                        onPress={() => {
                          if (Platform.OS === 'web') {
                            alert(`Ajout d'examen ${category} : Veuillez sélectionner le fichier (Photo/PDF).`);
                          } else {
                            Alert.alert('Upload Document', `Sélectionnez le fichier pour ${category}`);
                          }
                        }}
                      >
                        <Ionicons name="cloud-upload-outline" size={14} color="#0F2C3D" />
                        <Text style={styles.uploadBtnText}>Upload Photo/PDF</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.paracliniqueHint}>Champs obligatoires : Date & Compte-rendu</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Classified Document Manager */}
            <View style={styles.card}>
              <View style={styles.tabHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="folder-open-outline" size={20} color="#28C2FF" />
                  <Text style={styles.sectionTitle}>Gestionnaire de Documents Classés</Text>
                </View>
              </View>

              <View style={styles.docCategoriesGrid}>
                {[
                  { name: 'Biologie', icon: 'medical-outline', color: '#28C2FF' },
                  { name: 'Radiographies', icon: 'body-outline', color: '#8AC8F9' },
                  { name: 'Scanner', icon: 'hardware-chip-outline', color: '#E67E22' },
                  { name: 'ECG', icon: 'pulse-outline', color: '#FF6B6B' },
                  { name: 'Comptes rendus', icon: 'document-text-outline', color: '#2ECC71' },
                  { name: 'Photos cliniques', icon: 'camera-outline', color: '#FFD700' },
                  { name: 'Certificats', icon: 'ribbon-outline', color: '#9B59B6' },
                  { name: 'Ordonnances', icon: 'receipt-outline', color: '#1ABC9C' },
                ].map((docCat) => (
                  <TouchableOpacity
                    key={docCat.name}
                    style={styles.docFolderCard}
                    onPress={() => {
                      if (Platform.OS === 'web') {
                        alert(`Dossier ${docCat.name} : Aucun document archivé pour l'instant.`);
                      } else {
                        Alert.alert(docCat.name, 'Aucun document archivé.');
                      }
                    }}
                  >
                    <Ionicons name={docCat.icon as any} size={24} color={docCat.color} />
                    <Text style={styles.docFolderName}>{docCat.name}</Text>
                    <Text style={styles.docFolderCount}>0 fichier(s)</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* TAB 5: VACCINATIONS (Pédiatrie < 15 ans) */}
        {activeTab === 'vaccinations' && (
          <View style={styles.infoContainer}>
            <View style={styles.tabHeader}>
              <Text style={styles.sectionTitle}>Suivi Vaccinal</Text>
              <TouchableOpacity style={styles.actionButton} onPress={() => setModalVaccineVisible(true)}>
                <Ionicons name="add-circle" size={18} color="#0F2C3D" />
                <Text style={styles.actionButtonText}>+ Vaccin</Text>
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
              <Text style={styles.modalLabel}>Type d'antécédent *</Text>
              <View style={styles.typeSelector}>
                {(
                  [
                    { type: 'MEDICAL', label: 'Médicaux' },
                    { type: 'CHIRURGICAL', label: 'Chirurgicaux' },
                    { type: 'ALLERGIE', label: 'Allergies' },
                    { type: 'FAMILIAL', label: 'Familiaux' },
                    { type: 'TABAGISME', label: 'Tabagisme' },
                    { type: 'ALCOOLISM', label: 'Alcoolisme' },
                    ...(patient?.sexe === 'F' && age !== null && age > 15
                      ? [{ type: 'GYNECO_OBSTETRIQUE', label: 'Gynéco-Obstétricaux' }]
                      : []),
                  ] as { type: Antecedent['type']; label: string }[]
                ).map(({ type, label }) => {
                  const isSel = antType === type;
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[styles.typeBtn, isSel && styles.typeBtnActive]}
                      onPress={() => {
                        setAntType(type);
                        setModalNeant(false);
                      }}
                    >
                      <Text style={[styles.typeBtnText, isSel && styles.typeBtnTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Quick Neant Option in Modal */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: modalNeant ? '#0F2C3D' : '#1A3344',
                borderWidth: 1,
                borderColor: modalNeant ? '#2ECC71' : '#2F5C77',
                padding: 10,
                borderRadius: 8,
                marginVertical: 8,
              }}
              onPress={() => setModalNeant(!modalNeant)}
            >
              <Ionicons name={modalNeant ? "checkbox" : "square-outline"} size={20} color={modalNeant ? "#2ECC71" : "#8AC8F9"} />
              <Text style={{ color: modalNeant ? "#2ECC71" : "#FFFFFF", fontSize: 13, fontWeight: 'bold' }}>
                Déclarer Néant (Aucun antécédent pour cette catégorie)
              </Text>
            </TouchableOpacity>

            {/* Dynamic Form Fields per Type */}
            {!modalNeant && (
              <>
                {antType === 'MEDICAL' && (
                  <View style={{ gap: 10, marginTop: 4 }}>
                    <View style={styles.inputGroup}>
                      <Text style={styles.modalLabel}>Intitulé de la pathologie *</Text>
                      <TextInput
                        style={styles.modalInputText}
                        placeholder="Ex: Diabète de type 2, HTA, Asthme..."
                        placeholderTextColor="#9ca3af"
                        value={medPathologie}
                        onChangeText={setMedPathologie}
                      />
                    </View>
                    <View style={styles.inputGroup}>
                      <Text style={styles.modalLabel}>Année de diagnostic</Text>
                      <TextInput
                        style={styles.modalInputText}
                        placeholder="Ex: 2018"
                        placeholderTextColor="#9ca3af"
                        keyboardType="numeric"
                        value={medAnnee}
                        onChangeText={setMedAnnee}
                      />
                    </View>
                  </View>
                )}

                {antType === 'CHIRURGICAL' && (
                  <ScrollView style={{ maxHeight: 260, marginTop: 4 }}>
                    <View style={{ gap: 8 }}>
                      <View style={styles.inputGroup}>
                        <Text style={styles.modalLabel}>1. Nature de l'intervention *</Text>
                        <TextInput
                          style={styles.modalInputText}
                          placeholder="Ex: Appendicectomie, Cholécystectomie..."
                          placeholderTextColor="#9ca3af"
                          value={chirIntervention}
                          onChangeText={setChirIntervention}
                        />
                      </View>
                      <View style={styles.inputGroup}>
                        <Text style={styles.modalLabel}>2. Indication</Text>
                        <TextInput
                          style={styles.modalInputText}
                          placeholder="Ex: Appendicite aiguë..."
                          placeholderTextColor="#9ca3af"
                          value={chirIndication}
                          onChangeText={setChirIndication}
                        />
                      </View>
                      <View style={styles.inputGroup}>
                        <Text style={styles.modalLabel}>3. Année / Date</Text>
                        <TextInput
                          style={styles.modalInputText}
                          placeholder="Ex: 2019"
                          placeholderTextColor="#9ca3af"
                          value={chirAnnee}
                          onChangeText={setChirAnnee}
                        />
                      </View>
                      <View style={styles.inputGroup}>
                        <Text style={styles.modalLabel}>4. Établissement</Text>
                        <TextInput
                          style={styles.modalInputText}
                          placeholder="Ex: Hôpital Principal..."
                          placeholderTextColor="#9ca3af"
                          value={chirEtablissement}
                          onChangeText={setChirEtablissement}
                        />
                      </View>
                      <View style={styles.inputGroup}>
                        <Text style={styles.modalLabel}>5. Complications éventuelles</Text>
                        <TextInput
                          style={styles.modalInputText}
                          placeholder="Ex: Aucune, Hématome post-op..."
                          placeholderTextColor="#9ca3af"
                          value={chirComplications}
                          onChangeText={setChirComplications}
                        />
                      </View>
                      <View style={styles.inputGroup}>
                        <Text style={styles.modalLabel}>6. Commentaire / Observations</Text>
                        <TextInput
                          style={styles.modalInputText}
                          placeholder="Ex: Cœlioscopie sans incident..."
                          placeholderTextColor="#9ca3af"
                          value={chirCommentaire}
                          onChangeText={setChirCommentaire}
                        />
                      </View>
                    </View>
                  </ScrollView>
                )}

                {antType === 'ALLERGIE' && (
                  <View style={{ gap: 10, marginTop: 4 }}>
                    <View style={styles.inputGroup}>
                      <Text style={styles.modalLabel}>Substance / Médicament *</Text>
                      <TextInput
                        style={styles.modalInputText}
                        placeholder="Ex: Pénicilline, Aspirine, Arachides..."
                        placeholderTextColor="#9ca3af"
                        value={allergieSubstance}
                        onChangeText={setAllergieSubstance}
                      />
                    </View>
                    <View style={styles.inputGroup}>
                      <Text style={styles.modalLabel}>Type de réaction *</Text>
                      <TextInput
                        style={styles.modalInputText}
                        placeholder="Ex: Urticaire, Choc anaphylactique, Œdème de Quincke..."
                        placeholderTextColor="#9ca3af"
                        value={allergieReaction}
                        onChangeText={setAllergieReaction}
                      />
                    </View>
                  </View>
                )}

                {antType === 'FAMILIAL' && (
                  <View style={{ gap: 10, marginTop: 4 }}>
                    <View style={styles.inputGroup}>
                      <Text style={styles.modalLabel}>Description des Antécédents Familiaux *</Text>
                      <TextInput
                        style={styles.modalInput}
                        placeholder="Ex: Père : HTA, Mère : Diabète de type 2, Frère : Asthme..."
                        placeholderTextColor="#9ca3af"
                        multiline
                        numberOfLines={3}
                        value={antDescription}
                        onChangeText={setAntDescription}
                      />
                    </View>
                  </View>
                )}

                {antType === 'TABAGISME' && (
                  <View style={{ gap: 12, marginTop: 4 }}>
                    <View style={styles.inputGroup}>
                      <Text style={styles.modalLabel}>Le patient fume-t-il ? *</Text>
                      <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                        <TouchableOpacity
                          style={[
                            styles.toggleBtn,
                            !modalTabacOui && { backgroundColor: '#334155', borderColor: '#94A3B8' },
                            { flex: 1, alignItems: 'center', paddingVertical: 10 }
                          ]}
                          onPress={() => setModalTabacOui(false)}
                        >
                          <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>Non</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.toggleBtn,
                            modalTabacOui && { backgroundColor: '#E67E22', borderColor: '#E67E22' },
                            { flex: 1, alignItems: 'center', paddingVertical: 10 }
                          ]}
                          onPress={() => setModalTabacOui(true)}
                        >
                          <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>Oui</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {modalTabacOui && (
                      <View style={styles.inputGroup}>
                        <Text style={styles.modalLabel}>Durée / Quantité (Années/Mois ou Paquets-Années)</Text>
                        <TextInput
                          style={styles.modalInputText}
                          placeholder="Ex: 15 paquets-années, fumeur depuis 10 ans..."
                          placeholderTextColor="#9ca3af"
                          value={modalTabacDetail}
                          onChangeText={setModalTabacDetail}
                        />
                      </View>
                    )}
                  </View>
                )}

                {antType === 'ALCOOLISM' && (
                  <View style={{ gap: 12, marginTop: 4 }}>
                    <View style={styles.inputGroup}>
                      <Text style={styles.modalLabel}>Consommation d'alcool ? *</Text>
                      <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                        <TouchableOpacity
                          style={[
                            styles.toggleBtn,
                            !modalAlcoolOui && { backgroundColor: '#334155', borderColor: '#94A3B8' },
                            { flex: 1, alignItems: 'center', paddingVertical: 10 }
                          ]}
                          onPress={() => setModalAlcoolOui(false)}
                        >
                          <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>Non</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.toggleBtn,
                            modalAlcoolOui && { backgroundColor: '#E67E22', borderColor: '#E67E22' },
                            { flex: 1, alignItems: 'center', paddingVertical: 10 }
                          ]}
                          onPress={() => setModalAlcoolOui(true)}
                        >
                          <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>Oui</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {modalAlcoolOui && (
                      <View style={styles.inputGroup}>
                        <Text style={styles.modalLabel}>Durée ou Fréquence de consommation</Text>
                        <TextInput
                          style={styles.modalInputText}
                          placeholder="Ex: Occasionnel, 3 verres/semaine, depuis 5 ans..."
                          placeholderTextColor="#9ca3af"
                          value={modalAlcoolDetail}
                          onChangeText={setModalAlcoolDetail}
                        />
                      </View>
                    )}
                  </View>
                )}

                {antType === 'GYNECO_OBSTETRIQUE' && (
                  <View style={{ gap: 10, marginTop: 4 }}>
                    <View style={styles.inputGroup}>
                      <Text style={styles.modalLabel}>Geste / Parité *</Text>
                      <TextInput
                        style={styles.modalInputText}
                        placeholder="Ex: G3P2A1..."
                        placeholderTextColor="#9ca3af"
                        value={gynecoGestePari}
                        onChangeText={setGynecoGestePari}
                      />
                    </View>
                    <View style={styles.inputGroup}>
                      <Text style={styles.modalLabel}>Date des Dernières Règles (DDR)</Text>
                      <TextInput
                        style={styles.modalInputText}
                        placeholder="Ex: 12/05/2026..."
                        placeholderTextColor="#9ca3af"
                        value={gynecoDDR}
                        onChangeText={setGynecoDDR}
                      />
                    </View>
                    <View style={styles.inputGroup}>
                      <Text style={styles.modalLabel}>Observations</Text>
                      <TextInput
                        style={styles.modalInputText}
                        placeholder="Ex: Contraception orale..."
                        placeholderTextColor="#9ca3af"
                        value={gynecoObs}
                        onChangeText={setGynecoObs}
                      />
                    </View>
                  </View>
                )}
              </>
            )}

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
              <DatePickerDOB
                label="Date d'administration *"
                value={vaccineDate}
                onChange={setVaccineDate}
              />
            </View>

            <View style={styles.inputGroup}>
              <DatePickerDOB
                label="Date de rappel (optionnelle)"
                value={vaccineRecallDate}
                onChange={setVaccineRecallDate}
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

              <DatePickerDOB
                value={editDateNaissance}
                onChange={setEditDateNaissance}
                label="Date de Naissance (facultatif)"
              />

              <View style={styles.inputGroup}>
                <PhoneInputInternational
                  label="Numéro de Téléphone"
                  value={editTelephone}
                  onChange={setEditTelephone}
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

              {/* SÉLECTEUR GROUPE SANGUIN COMPACT */}
              <View style={{ gap: 6, width: '100%', marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, color: '#94A3B8' }}>
                  Groupe Sanguin
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  {['Inconnu', 'Non renseigné', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((grp) => {
                    const isSelected = editGroupeSanguin === grp;
                    return (
                      <TouchableOpacity
                        key={grp}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 8,
                          backgroundColor: isSelected ? '#06B6D4' : 'rgba(30, 41, 59, 0.8)',
                          borderWidth: 1,
                          borderColor: isSelected ? '#22D3EE' : '#334155',
                          alignSelf: 'flex-start',
                          height: 32,
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                        onPress={() => setEditGroupeSanguin(grp)}
                      >
                        <Text
                          style={{
                            color: isSelected ? '#FFFFFF' : '#CBD5E1',
                            fontSize: 12,
                            fontWeight: isSelected ? '700' : '500',
                          }}
                        >
                          {grp}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Traçabilité / Source si Groupe Sanguin sélectionné */}
                {editGroupeSanguin && ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].includes(editGroupeSanguin) && (
                  <View style={{ marginTop: 10, padding: 8, backgroundColor: '#0F2C3D', borderRadius: 8, borderWidth: 1, borderColor: '#2F5C77', gap: 6 }}>
                    <Text style={{ color: '#8AC8F9', fontSize: 11, fontWeight: 'bold' }}>Source (Badge de Confiance) :</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          padding: 6,
                          borderRadius: 6,
                          backgroundColor: editSourceGroupeSanguin === 'BIOLOGIQUE' ? 'rgba(46, 204, 113, 0.2)' : '#1E3E52',
                          borderWidth: 1,
                          borderColor: editSourceGroupeSanguin === 'BIOLOGIQUE' ? '#2ECC71' : '#2F5C77',
                        }}
                        onPress={() => setEditSourceGroupeSanguin('BIOLOGIQUE')}
                      >
                        <Ionicons name="checkmark-circle" size={14} color="#2ECC71" />
                        <Text style={{ color: '#2ECC71', fontSize: 10, fontWeight: 'bold' }}>
                          Résultat biologique (Vert)
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          padding: 6,
                          borderRadius: 6,
                          backgroundColor: editSourceGroupeSanguin === 'DECLARE' ? 'rgba(255, 107, 107, 0.2)' : '#1E3E52',
                          borderWidth: 1,
                          borderColor: editSourceGroupeSanguin === 'DECLARE' ? '#FF6B6B' : '#2F5C77',
                        }}
                        onPress={() => setEditSourceGroupeSanguin('DECLARE')}
                      >
                        <Ionicons name="alert-circle" size={14} color="#FF6B6B" />
                        <Text style={{ color: '#FF6B6B', fontSize: 10, fontWeight: 'bold' }}>
                          Déclaré patient (Rouge)
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
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

      {/* Consultation Detail Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={!!selectedConsultationDetail}
        onRequestClose={() => setSelectedConsultationDetail(null)}
      >
        <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center', padding: Platform.OS === 'web' ? 24 : 16 }]}>
          <View style={[styles.modalContent, {
            maxHeight: '92%',
            width: Platform.OS === 'web' ? '85%' : '96%',
            maxWidth: 880,
            alignSelf: 'center',
            borderRadius: 20,
            padding: Platform.OS === 'web' ? 28 : 18,
          }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <View>
                <Text style={[styles.modalTitle, { textAlign: 'left', marginBottom: 0 }]}>Détail de la Visite</Text>
                <Text style={{ color: '#8AC8F9', fontSize: 13, marginTop: 2 }}>
                  {formatDateFR(selectedConsultationDetail?.date || selectedConsultationDetail?.created_at)}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedConsultationDetail(null)} style={{ padding: 4 }}>
                <Ionicons name="close-circle" size={28} color="#FF6B6B" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 20, gap: 14 }}>
              {/* Patient Summary */}
              <View style={{ backgroundColor: '#0F2C3D', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#2F5C77' }}>
                <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 }}>
                  {patient.prenom} {patient.nom.toUpperCase()} ({patient.numero_dossier})
                </Text>
                <Text style={{ color: '#8AC8F9', fontSize: 13, marginTop: 4 }}>
                  {patient.sexe === 'M' ? 'Homme' : 'Femme'} • {age} ans • Tél : {patient.telephone || 'Non renseigné'}
                </Text>
              </View>

              {/* Constantes Physiologiques */}
              {(selectedConsultationDetail?.temperature || selectedConsultationDetail?.pression_arterielle || selectedConsultationDetail?.frequence_cardiaque || selectedConsultationDetail?.poids_kg || selectedConsultationDetail?.taille_cm) && (
                <View style={{ backgroundColor: '#0F2C3D', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#2F5C77' }}>
                  <Text style={{ color: '#28C2FF', fontWeight: 'bold', fontSize: 14, marginBottom: 10 }}>
                    Constantes Physiologiques
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {selectedConsultationDetail.temperature && (
                      <View style={{ backgroundColor: '#1E3E52', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
                        <Text style={{ color: '#8AC8F9', fontSize: 11 }}>Température</Text>
                        <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 }}>{selectedConsultationDetail.temperature} °C</Text>
                      </View>
                    )}
                    {selectedConsultationDetail.pression_arterielle && (
                      <View style={{ backgroundColor: '#1E3E52', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
                        <Text style={{ color: '#8AC8F9', fontSize: 11 }}>Tension</Text>
                        <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 }}>{selectedConsultationDetail.pression_arterielle}</Text>
                      </View>
                    )}
                    {selectedConsultationDetail.frequence_cardiaque && (
                      <View style={{ backgroundColor: '#1E3E52', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
                        <Text style={{ color: '#8AC8F9', fontSize: 11 }}>Pulsations</Text>
                        <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 }}>{selectedConsultationDetail.frequence_cardiaque} bpm</Text>
                      </View>
                    )}
                    {selectedConsultationDetail.poids_kg && (
                      <View style={{ backgroundColor: '#1E3E52', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
                        <Text style={{ color: '#8AC8F9', fontSize: 11 }}>Poids</Text>
                        <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 }}>{selectedConsultationDetail.poids_kg} kg</Text>
                      </View>
                    )}
                    {selectedConsultationDetail.taille_cm && (
                      <View style={{ backgroundColor: '#1E3E52', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
                        <Text style={{ color: '#8AC8F9', fontSize: 11 }}>Taille</Text>
                        <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 }}>{selectedConsultationDetail.taille_cm} cm</Text>
                      </View>
                    )}
                    {selectedConsultationDetail.poids_kg && selectedConsultationDetail.taille_cm && (
                      <View style={{ backgroundColor: '#1E3E52', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderColor: '#28C2FF', borderWidth: 1 }}>
                        <Text style={{ color: '#28C2FF', fontSize: 11, fontWeight: 'bold' }}>IMC</Text>
                        <Text style={{ color: '#28C2FF', fontWeight: 'bold', fontSize: 14 }}>
                          {(selectedConsultationDetail.poids_kg / ((selectedConsultationDetail.taille_cm / 100) ** 2)).toFixed(1)}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Observation Médicale */}
              <View style={{ backgroundColor: '#0F2C3D', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#2F5C77', gap: 12 }}>
                <Text style={{ color: '#28C2FF', fontWeight: 'bold', fontSize: 14 }}>
                  Observation Médicale
                </Text>

                <View>
                  <Text style={{ color: '#8AC8F9', fontSize: 12, fontWeight: 'bold' }}>Motif de consultation :</Text>
                  <Text style={{ color: '#FFFFFF', fontSize: 14, marginTop: 3 }}>{selectedConsultationDetail?.motif}</Text>
                </View>

                {selectedConsultationDetail?.histoire_maladie && (
                  <View>
                    <Text style={{ color: '#8AC8F9', fontSize: 12, fontWeight: 'bold' }}>Histoire de la maladie :</Text>
                    <Text style={{ color: '#FFFFFF', fontSize: 14, marginTop: 3 }}>{selectedConsultationDetail.histoire_maladie}</Text>
                  </View>
                )}

                {selectedConsultationDetail?.examen_clinique && (
                  <View>
                    <Text style={{ color: '#8AC8F9', fontSize: 12, fontWeight: 'bold' }}>Examen clinique :</Text>
                    <Text style={{ color: '#FFFFFF', fontSize: 14, marginTop: 3 }}>{selectedConsultationDetail.examen_clinique}</Text>
                  </View>
                )}

                {selectedConsultationDetail?.diagnostic && (
                  <View style={{ backgroundColor: '#1E3E52', padding: 12, borderRadius: 10, borderColor: '#28C2FF', borderWidth: 1 }}>
                    <Text style={{ color: '#28C2FF', fontSize: 12, fontWeight: 'bold' }}>Diagnostic Retenu :</Text>
                    <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 'bold', marginTop: 3 }}>{selectedConsultationDetail.diagnostic}</Text>
                  </View>
                )}

                {selectedConsultationDetail?.conseils && (
                  <View>
                    <Text style={{ color: '#8AC8F9', fontSize: 12, fontWeight: 'bold' }}>Conseils & Recommandations :</Text>
                    <Text style={{ color: '#FFFFFF', fontSize: 14, marginTop: 3 }}>{selectedConsultationDetail.conseils}</Text>
                  </View>
                )}

                {selectedConsultationDetail?.date_controle && (
                  <View>
                    <Text style={{ color: '#8AC8F9', fontSize: 12, fontWeight: 'bold' }}>Date de contrôle prévue :</Text>
                    <Text style={{ color: '#FFD700', fontSize: 14, fontWeight: 'bold', marginTop: 3 }}>{formatDateFR(selectedConsultationDetail.date_controle)}</Text>
                  </View>
                )}
              </View>

              {/* Traitement & Ordonnance */}
              <View style={{ backgroundColor: '#0F2C3D', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#2F5C77', gap: 12 }}>
                <Text style={{ color: '#28C2FF', fontWeight: 'bold', fontSize: 14 }}>
                  Traitement & Ordonnance
                </Text>
                <Text style={{ color: '#FFFFFF', fontSize: 14, lineHeight: 22, backgroundColor: '#1E3E52', padding: 12, borderRadius: 8 }}>
                  {selectedConsultationDetail?.traitement || 'Aucun traitement médicamenteux saisi.'}
                </Text>

                <TouchableOpacity
                  style={{
                    backgroundColor: '#28C2FF',
                    paddingVertical: 14,
                    paddingHorizontal: 20,
                    borderRadius: 10,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    marginTop: 6,
                  }}
                  activeOpacity={0.8}
                  onPress={() => {
                    const cId = selectedConsultationDetail?.id;
                    const treatmentText = selectedConsultationDetail?.traitement || '';
                    setSelectedConsultationDetail(null);
                    router.push({
                      pathname: '/patients/ordonnance_create',
                      params: {
                        consultationId: cId,
                        patientId: id,
                        treatment: encodeURIComponent(treatmentText),
                      },
                    });
                  }}
                >
                  <Ionicons name="document-text" size={20} color="#0F2C3D" />
                  <Text style={{ color: '#0F2C3D', fontWeight: 'bold', fontSize: 15 }}>Générer l'Ordonnance PDF</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add Paraclinique Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalParacliniqueVisible}
        onRequestClose={() => setModalParacliniqueVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <Text style={styles.modalTitle}>Nouvel Examen Paraclinique</Text>

            <ScrollView contentContainerStyle={{ gap: 12 }}>
              {/* Category */}
              <View style={styles.inputGroup}>
                <Text style={styles.modalLabel}>1. Catégorie d'examen *</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {['Radiographie', 'Scanner', 'NFS', 'Ionogramme', 'Autres'].map((cat) => {
                    const isSel = paraCategorie === cat;
                    return (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.typeBtn, isSel && styles.typeBtnActive]}
                        onPress={() => setParaCategorie(cat as any)}
                      >
                        <Text style={[styles.typeBtnText, isSel && styles.typeBtnTextActive]}>{cat}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {paraCategorie === 'Autres' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.modalLabel}>Intitulé de l'examen *</Text>
                  <TextInput
                    style={styles.modalInputText}
                    placeholder="Ex: Échographie, ECG, IRM..."
                    placeholderTextColor="#9ca3af"
                    value={paraIntituleAutre}
                    onChangeText={setParaIntituleAutre}
                  />
                </View>
              )}

              {/* Date */}
              <View style={styles.inputGroup}>
                <DatePickerDOB
                  label="2. Date de l'examen *"
                  value={paraDate}
                  onChange={setParaDate}
                />
              </View>

              {/* Compte Rendu */}
              <View style={styles.inputGroup}>
                <Text style={styles.modalLabel}>3. Compte-Rendu / Conclusion *</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Saisissez les résultats ou les conclusions..."
                  placeholderTextColor="#9ca3af"
                  multiline
                  numberOfLines={4}
                  value={paraCompteRendu}
                  onChangeText={setParaCompteRendu}
                />
              </View>

              {/* File Upload */}
              <View style={styles.inputGroup}>
                <Text style={styles.modalLabel}>4. Pièce jointe (Photo / PDF)</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.actionButton, { flex: 1, justifyContent: 'center' }]}
                    onPress={async () => {
                      if (Platform.OS === 'web') {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*,application/pdf';
                        input.onchange = (e: any) => {
                          const file = e.target.files[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (ev: any) => {
                              setParaFichierUrl(ev.target.result);
                              setParaFichierNom(file.name);
                              setParaFichierType(file.type.includes('pdf') ? 'pdf' : 'image');
                            };
                            reader.readAsDataURL(file);
                          }
                        };
                        input.click();
                      } else {
                        const DocumentPicker = require('expo-document-picker');
                        const res = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'] });
                        if (!res.canceled && res.assets && res.assets.length > 0) {
                          const asset = res.assets[0];
                          setParaFichierUrl(asset.uri);
                          setParaFichierNom(asset.name);
                          setParaFichierType(asset.mimeType?.includes('pdf') ? 'pdf' : 'image');
                        }
                      }
                    }}
                  >
                    <Ionicons name="document-attach-outline" size={16} color="#0F2C3D" />
                    <Text style={styles.actionButtonText}>Importer Fichier</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: '#8AC8F9', flex: 1, justifyContent: 'center' }]}
                    onPress={async () => {
                      const ImagePicker = require('expo-image-picker');
                      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
                      if (perm.granted) {
                        const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, base64: Platform.OS === 'web' });
                        if (!res.canceled && res.assets && res.assets.length > 0) {
                          const asset = res.assets[0];
                          const uri = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
                          setParaFichierUrl(uri);
                          setParaFichierNom(`Photo_${paraCategorie}_${Date.now()}.jpg`);
                          setParaFichierType('image');
                        }
                      }
                    }}
                  >
                    <Ionicons name="camera-outline" size={16} color="#0F2C3D" />
                    <Text style={styles.actionButtonText}>Photo</Text>
                  </TouchableOpacity>
                </View>

                {paraFichierUrl && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0F2C3D', padding: 8, borderRadius: 6, marginTop: 8 }}>
                    <Ionicons name={paraFichierType === 'pdf' ? "document-text" : "image"} size={20} color="#28C2FF" />
                    <Text style={{ color: '#FFFFFF', fontSize: 12, flex: 1 }} numberOfLines={1}>
                      {paraFichierNom || 'Fichier joint prêt'}
                    </Text>
                    <TouchableOpacity onPress={() => { setParaFichierUrl(null); setParaFichierNom(null); setParaFichierType(null); }}>
                      <Ionicons name="close-circle" size={18} color="#FF6B6B" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setModalParacliniqueVisible(false)}
                disabled={paraLoading}
              >
                <Text style={styles.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmit}
                onPress={handleAddExamenParaclinique}
                disabled={paraLoading}
              >
                <Text style={styles.modalSubmitText}>
                  {paraLoading ? 'Enregistrement...' : 'Enregistrer'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Image Preview Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={!!selectedImagePreview}
        onRequestClose={() => setSelectedImagePreview(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: 40, right: 20, zIndex: 10, padding: 10 }}
            onPress={() => setSelectedImagePreview(null)}
          >
            <Ionicons name="close-circle" size={36} color="#FFFFFF" />
          </TouchableOpacity>
          {selectedImagePreview && (
            <Image
              source={{ uri: selectedImagePreview }}
              style={{ width: '100%', height: '80%', resizeMode: 'contain', borderRadius: 12 }}
            />
          )}
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
  card: {
    backgroundColor: '#1E3E52',
    borderRadius: 15,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2F5C77',
    marginBottom: 16,
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
    borderTopWidth: 1,
    borderTopColor: '#2F5C77',
    backgroundColor: '#0F2C3D',
  },
  tabBarScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    minWidth: '100%',
  },
  tabItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
    flexShrink: 0,
  },
  tabItemActive: {
    borderBottomColor: '#28C2FF',
  },
  tabLabel: {
    color: '#8AC8F9',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    flexShrink: 0,
    ...Platform.select({
      web: {
        whiteSpace: 'nowrap',
        userSelect: 'none',
      },
    }),
  },
  tabLabelActive: {
    color: '#28C2FF',
    fontWeight: 'bold',
  },
  content: {
    paddingBottom: 40,
  },
  infoContainer: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#8AC8F9',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flexShrink: 1,
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
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    backgroundColor: '#28C2FF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 12,
    flexShrink: 0,
  },
  actionButtonText: {
    color: '#0F2C3D',
    fontWeight: 'bold',
    fontSize: 13,
    ...Platform.select({
      web: {
        whiteSpace: 'nowrap',
      },
    }),
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
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#1E3E52',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2F5C77',
    width: '100%',
    maxWidth: 700,
    alignSelf: 'center',
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
  paracliniqueGrid: {
    gap: 10,
    marginTop: 6,
  },
  paracliniqueCard: {
    backgroundColor: '#0F2C3D',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2F5C77',
    gap: 6,
  },
  paracliniqueCatTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#28C2FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 4,
  },
  uploadBtnText: {
    color: '#0F2C3D',
    fontSize: 11,
    fontWeight: 'bold',
  },
  paracliniqueHint: {
    color: '#8AC8F9',
    fontSize: 11,
  },
  docCategoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 6,
  },
  docFolderCard: {
    width: '48%',
    backgroundColor: '#0F2C3D',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2F5C77',
    alignItems: 'center',
    gap: 6,
  },
  docFolderName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  docFolderCount: {
    color: '#8AC8F9',
    fontSize: 11,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  cardTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    flexShrink: 1,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
    flexShrink: 1,
  },
  neantBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  neantText: {
    color: '#8AC8F9',
    fontSize: 13,
    fontWeight: 'bold',
    ...Platform.select({
      web: {
        whiteSpace: 'nowrap',
      },
    }),
  },
  neantTextActive: {
    color: '#2ECC71',
  },
  neantBadge: {
    backgroundColor: '#0F2C3D',
    borderWidth: 1,
    borderColor: '#2ECC71',
    borderRadius: 8,
    padding: 10,
  },
  neantBadgeText: {
    color: '#2ECC71',
    fontSize: 13,
    fontWeight: 'bold',
  },
  emptySubText: {
    color: '#94A3B8',
    fontSize: 13,
    fontStyle: 'italic',
  },
  antListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0F2C3D',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2F5C77',
    marginBottom: 6,
  },
  antListText: {
    color: '#FFFFFF',
    fontSize: 14,
    flex: 1,
  },
  textArea: {
    backgroundColor: '#0F2C3D',
    borderColor: '#2F5C77',
    borderWidth: 1,
    borderRadius: 8,
    color: '#FFFFFF',
    padding: 10,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  toxicBlock: {
    backgroundColor: '#0F2C3D',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2F5C77',
    gap: 8,
  },
  toxicRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toxicLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  toggleBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#1E3E52',
    borderWidth: 1,
    borderColor: '#2F5C77',
  },
  toggleBtnActiveNo: {
    backgroundColor: '#334155',
    borderColor: '#94A3B8',
  },
  toggleBtnActiveYes: {
    backgroundColor: '#E67E22',
    borderColor: '#E67E22',
  },
  toggleBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  toxicInput: {
    backgroundColor: '#1E3E52',
    borderColor: '#2F5C77',
    borderWidth: 1,
    borderRadius: 8,
    color: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    marginTop: 4,
  },
});
