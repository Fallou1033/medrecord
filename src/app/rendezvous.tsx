import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  SafeAreaView,
  ScrollView,
  Platform,
  Linking,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getRendezVous,
  addRendezVous,
  updateRendezVousStatut,
  updateRendezVous,
  getPatients,
  Patient,
  RendezVous,
} from '../database/SQLiteDatabaseManager';
import { useSecurity } from '../security/SecurityContext';
import { formatDateFR } from '../utils/helpers';
import DatePickerDOB from '../components/DatePickerDOB';

const TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30'
];

const ALL_HOURS = [
  '07:00', '07:15', '07:30', '07:45',
  '08:00', '08:15', '08:30', '08:45',
  '09:00', '09:15', '09:30', '09:45',
  '10:00', '10:15', '10:30', '10:45',
  '11:00', '11:15', '11:30', '11:45',
  '12:00', '12:15', '12:30', '12:45',
  '13:00', '13:15', '13:30', '13:45',
  '14:00', '14:15', '14:30', '14:45',
  '15:00', '15:15', '15:30', '15:45',
  '16:00', '16:15', '16:30', '16:45',
  '17:00', '17:15', '17:30', '17:45',
  '18:00', '18:15', '18:30', '18:45',
  '19:00', '19:30', '20:00'
];

export default function RendezVousScreen() {
  const { user } = useSecurity();
  const router = useRouter();

  const [rdvs, setRdvs] = useState<RendezVous[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal for new appointment
  const [modalVisible, setModalVisible] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([]);
  const [searchPatient, setSearchPatient] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  
  // New Appointment Fields
  const [dateStr, setDateStr] = useState(new Date().toISOString().split('T')[0]); // YYYY-MM-DD
  const [timeStr, setTimeStr] = useState('09:00'); // HH:MM
  const [status, setStatus] = useState<RendezVous['statut']>('PROGRAMME');
  const [saving, setSaving] = useState(false);

  // Search query state for appointments
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State for editing Appointment
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedRdv, setSelectedRdv] = useState<RendezVous | null>(null);
  const [editDateStr, setEditDateStr] = useState('');
  const [editTimeStr, setEditTimeStr] = useState('');
  const [editStatus, setEditStatus] = useState<RendezVous['statut']>('PROGRAMME');
  const [editSaving, setEditSaving] = useState(false);

  const openEditModal = (rdv: RendezVous) => {
    setSelectedRdv(rdv);
    const dateObj = new Date(rdv.date_heure);
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const hh = String(dateObj.getHours()).padStart(2, '0');
    const min = String(dateObj.getMinutes()).padStart(2, '0');

    setEditDateStr(`${yyyy}-${mm}-${dd}`);
    setEditTimeStr(`${hh}:${min}`);
    setEditStatus(rdv.statut);
    setEditModalVisible(true);
  };

  const handleSaveEditRdv = async () => {
    if (!user || !selectedRdv) return;
    if (!editDateStr.trim() || !editTimeStr.trim()) {
      Alert.alert('Erreur', 'Veuillez renseigner la date et l\'heure du rendez-vous.');
      return;
    }

    const fullDateTime = `${editDateStr.trim()}T${editTimeStr.trim()}:00`;
    setEditSaving(true);
    try {
      await updateRendezVous(
        selectedRdv.id,
        {
          date_heure: fullDateTime,
          statut: editStatus,
        },
        user.id
      );
      setEditModalVisible(false);
      Alert.alert('Succès', 'Le rendez-vous a été modifié avec succès.');
      loadData();
    } catch (err) {
      console.error(err);
      Alert.alert('Erreur', 'Impossible de modifier le rendez-vous.');
    } finally {
      setEditSaving(false);
    }
  };

  // Load appointments
  useFocusEffect(
    useCallback(() => {
      if (user) {
        loadData();
      }
    }, [user])
  );

  const loadData = async () => {
    setLoading(true);
    try {
      if (!user) return;
      const list = await getRendezVous(user.id);
      setRdvs(list);
      
      const pList = await getPatients();
      setPatients(pList);
      setFilteredPatients(pList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Filter patients in memory
  useEffect(() => {
    if (!searchPatient.trim()) {
      setFilteredPatients(patients);
      return;
    }
    const query = searchPatient.toLowerCase();
    const filtered = patients.filter(
      (p) => `${p.prenom} ${p.nom}`.toLowerCase().includes(query) || p.numero_dossier.toLowerCase().includes(query)
    );
    setFilteredPatients(filtered);
  }, [searchPatient, patients]);

  const handleCreateAppointment = async () => {
    if (!selectedPatient) {
      Alert.alert('Erreur', 'Veuillez sélectionner un patient.');
      return;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const timeRegex = /^\d{2}:\d{2}$/;
    if (!dateRegex.test(dateStr) || !timeRegex.test(timeStr)) {
      Alert.alert('Format invalide', 'Date (AAAA-MM-JJ) et Heure (HH:MM) requises.');
      return;
    }

    if (!user) return;

    setSaving(true);
    try {
      const combinedDateTime = `${dateStr}T${timeStr}:00.000Z`;
      await addRendezVous(
        {
          patient_id: selectedPatient.id,
          medecin_id: user.id,
          date_heure: combinedDateTime,
          statut: status,
        },
        user.id
      );

      // Reload appointments
      const list = await getRendezVous(user.id);
      setRdvs(list);

      // Reset form
      setSelectedPatient(null);
      setSearchPatient('');
      setModalVisible(false);
      Alert.alert('Succès', 'Le rendez-vous a été enregistré.');
    } catch (err) {
      console.error(err);
      Alert.alert('Erreur', 'Impossible de planifier le rendez-vous.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (rdvId: string, nextStatus: RendezVous['statut']) => {
    if (!user) return;
    try {
      await updateRendezVousStatut(rdvId, nextStatus, user.id);
      const list = await getRendezVous(user.id);
      setRdvs(list);
    } catch (err) {
      console.error(err);
      Alert.alert('Erreur', 'Impossible de modifier le statut.');
    }
  };

  const formatPhoneForAction = (rawPhone: string | null | undefined): string => {
    if (!rawPhone) return '';
    let cleaned = rawPhone.replace(/[^0-9+]/g, '');
    if (!cleaned) return '';
    if (!cleaned.startsWith('+')) {
      if (cleaned.startsWith('221')) {
        cleaned = '+' + cleaned;
      } else {
        cleaned = '+221' + cleaned;
      }
    }
    return cleaned;
  };

  const handleSendWhatsApp = (item: RendezVous) => {
    const patientName = `${item.patient_prenom || ''} ${item.patient_nom || ''}`.trim() || 'Patient';
    const docName = user ? `Dr ${user.prenom} ${user.nom}` : 'Dr Mohamadou Bamba Diop';
    const dateObj = new Date(item.date_heure);
    const dateFormatted = formatDateFR(dateObj);
    const timeFormatted = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const message = `Bonjour ${patientName}, votre rendez-vous médical avec le ${docName} est confirmé pour le ${dateFormatted} à ${timeFormatted}. Merci de vous présenter à l'heure au cabinet.`;
    const cleanPhone = formatPhoneForAction(item.patient_telephone);
    const encodedMsg = encodeURIComponent(message);

    let url = `whatsapp://send?text=${encodedMsg}`;
    if (cleanPhone) {
      url = `whatsapp://send?phone=${cleanPhone}&text=${encodedMsg}`;
    }

    Linking.canOpenURL(url).then((supported) => {
      if (supported || Platform.OS === 'web') {
        Linking.openURL(url);
      } else {
        Linking.openURL(`https://wa.me/${cleanPhone}?text=${encodedMsg}`);
      }
    }).catch(() => {
      Linking.openURL(`https://wa.me/${cleanPhone}?text=${encodedMsg}`);
    });
  };

  const handleSendSMS = (item: RendezVous) => {
    const patientName = `${item.patient_prenom || ''} ${item.patient_nom || ''}`.trim() || 'Patient';
    const docName = user ? `Dr ${user.prenom} ${user.nom}` : 'Dr Mohamadou Bamba Diop';
    const dateObj = new Date(item.date_heure);
    const dateFormatted = formatDateFR(dateObj);
    const timeFormatted = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const message = `Bonjour ${patientName}, votre rendez-vous médical avec le ${docName} est confirmé pour le ${dateFormatted} à ${timeFormatted}.`;
    const cleanPhone = formatPhoneForAction(item.patient_telephone);
    const encodedMsg = encodeURIComponent(message);
    const smsUrl = Platform.OS === 'ios' ? `sms:${cleanPhone}&body=${encodedMsg}` : `sms:${cleanPhone}?body=${encodedMsg}`;

    Linking.openURL(smsUrl).catch(() => {
      Alert.alert('Erreur', 'Impossible d\'ouvrir l\'application SMS.');
    });
  };

  const filteredRdvs = rdvs.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const patientName = `${r.patient_prenom || ''} ${r.patient_nom || ''}`.toLowerCase();
    const dossierNum = (r.patient_numero_dossier || '').toLowerCase();
    const statutStr = r.statut.toLowerCase();
    const dateStr = formatDateFR(r.date_heure).toLowerCase();
    return (
      patientName.includes(q) ||
      dossierNum.includes(q) ||
      statutStr.includes(q) ||
      dateStr.includes(q)
    );
  });

  const renderRdvItem = ({ item }: { item: RendezVous }) => {
    const dateObj = new Date(item.date_heure);
    const dateFormatted = formatDateFR(dateObj);
    const timeFormatted = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let statusColor = '#8AC8F9'; // PROGRAMME
    if (item.statut === 'CONFIRME') statusColor = '#28C2FF';
    if (item.statut === 'REALISE') statusColor = '#2ECC71';
    if (item.statut === 'ANNULE') statusColor = '#FF6B6B';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.timeText}>{`${timeFormatted} • ${dateFormatted}`}</Text>
          <View style={[styles.statusBadge, { borderColor: statusColor }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{item.statut}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.patientName}>
              {`${item.patient_prenom || ''} ${(item.patient_nom || '').toUpperCase()}`}
            </Text>
            {!!item.patient_numero_dossier && (
              <Text style={{ color: '#28C2FF', fontSize: 12, fontWeight: 'bold', marginTop: 2, marginBottom: 4 }}>
                {`ID : ${item.patient_numero_dossier}`}
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: '#1E3E52',
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: '#2F5C77',
            }}
            onPress={() => openEditModal(item)}
          >
            <Ionicons name="create-outline" size={16} color="#28C2FF" />
            <Text style={{ color: '#28C2FF', fontSize: 12, fontWeight: 'bold' }}>Modifier</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.cardActionsContainer}>
          <View style={styles.cardActionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.whatsappBtn]}
              onPress={() => handleSendWhatsApp(item)}
            >
              <Ionicons name="logo-whatsapp" size={16} color="#FFFFFF" />
              <Text style={styles.whatsappText}>WhatsApp</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.smsBtn]}
              onPress={() => handleSendSMS(item)}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={16} color="#28C2FF" />
              <Text style={styles.smsText}>SMS</Text>
            </TouchableOpacity>
          </View>

          {item.statut !== 'REALISE' && item.statut !== 'ANNULE' && (
            <View style={styles.cardActionsRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.realiseBtn]}
                onPress={() => handleUpdateStatus(item.id, 'REALISE')}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color="#0F2C3D" />
                <Text style={styles.realiseText}>Réalisé</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.annuleBtn]}
                onPress={() => handleUpdateStatus(item.id, 'ANNULE')}
              >
                <Ionicons name="close-circle-outline" size={16} color="#FF6B6B" />
                <Text style={styles.annuleText}>Annuler</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Agenda & RDV</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Ionicons name="calendar-outline" size={18} color="#0F2C3D" />
          <Text style={styles.addButtonText}>Nouveau RDV</Text>
        </TouchableOpacity>
      </View>

      {/* Appointment Search Bar */}
      <View style={styles.searchBarContainer}>
        <Ionicons name="search" size={18} color="#8AC8F9" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchBarInput}
          placeholder="Rechercher par nom, ID dossier (PAT-...), date, statut..."
          placeholderTextColor="#6B8A9E"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery !== '' && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color="#8AC8F9" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#28C2FF" />
        </View>
      ) : filteredRdvs.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="calendar-outline" size={64} color="#2F5C77" />
          <Text style={styles.emptyText}>
            {searchQuery.trim() ? 'Aucun rendez-vous ne correspond à la recherche' : 'Aucun rendez-vous planifié'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredRdvs}
          keyExtractor={(item) => item.id}
          renderItem={renderRdvItem}
          contentContainerStyle={styles.listContainer}
        />
      )}

      {/* New Appointment Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nouveau Rendez-vous</Text>

            {/* Step 1: Select Patient */}
            {!selectedPatient ? (
              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>Rechercher le Patient</Text>
                <TextInput
                  style={styles.modalInputText}
                  placeholder="Rechercher par nom..."
                  placeholderTextColor="#9ca3af"
                  value={searchPatient}
                  onChangeText={setSearchPatient}
                />
                <ScrollView style={styles.patientDropdown} nestedScrollEnabled>
                  {filteredPatients.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.patientDropdownItem}
                      onPress={() => setSelectedPatient(p)}
                    >
                      <Text style={styles.dropdownText}>
                        {p.prenom} {p.nom.toUpperCase()} ({p.numero_dossier})
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : (
              <View style={styles.selectedPatientBanner}>
                <View style={styles.selectedMeta}>
                  <Text style={styles.selectedLabel}>Patient sélectionné</Text>
                  <Text style={styles.selectedName}>
                    {selectedPatient.prenom} {selectedPatient.nom.toUpperCase()}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedPatient(null)}>
                  <Ionicons name="close-circle" size={24} color="#FF6B6B" />
                </TouchableOpacity>
              </View>
            )}

            {/* Step 2: Date & Time */}
            <View style={styles.inputGroup}>
              <DatePickerDOB
                label="Date du rendez-vous *"
                value={dateStr}
                onChange={setDateStr}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.modalLabel}>Heure du rendez-vous *</Text>
              
              {/* Quick Time Slots */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeSlotsContainer}>
                {TIME_SLOTS.map((slot) => (
                  <TouchableOpacity
                    key={slot}
                    style={[styles.timeChip, timeStr === slot && styles.timeChipActive]}
                    onPress={() => setTimeStr(slot)}
                  >
                    <Text style={[styles.timeChipText, timeStr === slot && styles.timeChipTextActive]}>
                      {slot}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {Platform.OS === 'web' ? (
                <select
                  value={timeStr}
                  onChange={(e) => setTimeStr(e.target.value)}
                  style={{
                    backgroundColor: '#1E3E52',
                    color: '#FFFFFF',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    fontSize: '16px',
                    border: '1px solid #2F5C77',
                    width: '100%',
                    boxSizing: 'border-box',
                    colorScheme: 'dark',
                    outline: 'none',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  <option value="">Sélectionner une heure</option>
                  {ALL_HOURS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E3E52', borderRadius: 10, borderWidth: 1, borderColor: '#2F5C77', paddingRight: 12 }}>
                  <TextInput
                    style={[styles.modalInputText, { flex: 1, borderWidth: 0 }]}
                    placeholder="ex: 09:00"
                    placeholderTextColor="#9ca3af"
                    value={timeStr}
                    onChangeText={setTimeStr}
                    keyboardType="numeric"
                    maxLength={5}
                  />
                  <Ionicons name="time-outline" size={22} color="#28C2FF" />
                </View>
              )}
            </View>

            {/* Step 3: Status */}
            <View style={styles.inputGroup}>
              <Text style={styles.modalLabel}>Statut</Text>
              <View style={styles.statusContainer}>
                {(['PROGRAMME', 'CONFIRME'] as RendezVous['statut'][]).map((st) => (
                  <TouchableOpacity
                    key={st}
                    style={[styles.statusBtn, status === st && styles.statusBtnActive]}
                    onPress={() => setStatus(st)}
                  >
                    <Text style={[styles.statusBtnText, status === st && styles.statusBtnTextActive]}>
                      {st}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => {
                  setSelectedPatient(null);
                  setSearchPatient('');
                  setModalVisible(false);
                }}
                disabled={saving}
              >
                <Text style={styles.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmit}
                onPress={handleCreateAppointment}
                disabled={saving || !selectedPatient}
              >
                <Text style={styles.modalSubmitText}>
                  {saving ? 'Planification...' : 'Planifier'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Edit Appointment Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={editModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Modifier le Rendez-vous</Text>

            {selectedRdv && (
              <View style={{ backgroundColor: '#0F2C3D', padding: 12, borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: '#2F5C77' }}>
                <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 }}>
                  Patient : {selectedRdv.patient_prenom} {selectedRdv.patient_nom?.toUpperCase()}
                </Text>
                {selectedRdv.patient_numero_dossier && (
                  <Text style={{ color: '#28C2FF', fontSize: 13, fontWeight: 'bold', marginTop: 4 }}>
                    ID Dossier : {selectedRdv.patient_numero_dossier}
                  </Text>
                )}
              </View>
            )}

            <View style={styles.inputGroup}>
              <DatePickerDOB
                label="Date du rendez-vous *"
                value={editDateStr}
                onChange={setEditDateStr}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.modalLabel}>Heure du rendez-vous *</Text>
              
              {/* Quick Time Slots */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeSlotsContainer}>
                {TIME_SLOTS.map((slot) => (
                  <TouchableOpacity
                    key={slot}
                    style={[styles.timeChip, editTimeStr === slot && styles.timeChipActive]}
                    onPress={() => setEditTimeStr(slot)}
                  >
                    <Text style={[styles.timeChipText, editTimeStr === slot && styles.timeChipTextActive]}>
                      {slot}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {Platform.OS === 'web' ? (
                <select
                  value={editTimeStr}
                  onChange={(e) => setEditTimeStr(e.target.value)}
                  style={{
                    backgroundColor: '#1E3E52',
                    color: '#FFFFFF',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    fontSize: '16px',
                    border: '1px solid #2F5C77',
                    width: '100%',
                    boxSizing: 'border-box',
                    colorScheme: 'dark',
                    outline: 'none',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                  }}
                >
                  <option value="">Sélectionner une heure</option>
                  {ALL_HOURS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E3E52', borderRadius: 10, borderWidth: 1, borderColor: '#2F5C77', paddingRight: 12 }}>
                  <TextInput
                    style={[styles.modalInputText, { flex: 1, borderWidth: 0 }]}
                    placeholder="ex: 09:00"
                    placeholderTextColor="#9ca3af"
                    value={editTimeStr}
                    onChangeText={setEditTimeStr}
                    keyboardType="numeric"
                    maxLength={5}
                  />
                  <Ionicons name="time-outline" size={22} color="#28C2FF" />
                </View>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.modalLabel}>Statut du rendez-vous *</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {(['PROGRAMME', 'CONFIRME', 'REALISE', 'ANNULE'] as RendezVous['statut'][]).map((st) => (
                  <TouchableOpacity
                    key={st}
                    style={[
                      styles.statusBtn,
                      editStatus === st && styles.statusBtnActive,
                    ]}
                    onPress={() => setEditStatus(st)}
                  >
                    <Text style={[styles.statusBtnText, editStatus === st && styles.statusBtnTextActive]}>
                      {st}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setEditModalVisible(false)}
                disabled={editSaving}
              >
                <Text style={styles.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmit, { backgroundColor: '#28C2FF' }]}
                onPress={handleSaveEditRdv}
                disabled={editSaving}
              >
                <Text style={[styles.modalSubmitText, { color: '#0F2C3D' }]}>
                  {editSaving ? 'Enregistrement...' : 'Sauvegarder'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F2C3D',
    ...Platform.select({
      web: {
        paddingTop: 80,
      },
      default: {},
    }),
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E3E52',
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2F5C77',
  },
  searchBarInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
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
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  addButton: {
    backgroundColor: '#28C2FF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  addButtonText: {
    color: '#0F2C3D',
    fontWeight: 'bold',
    fontSize: 14,
  },
  emptyText: {
    color: '#8AC8F9',
    marginTop: 12,
    fontSize: 16,
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 12,
  },
  card: {
    backgroundColor: '#1E3E52',
    borderWidth: 1,
    borderColor: '#2F5C77',
    borderRadius: 15,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  timeText: {
    color: '#28C2FF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  statusBadge: {
    borderWidth: 1.5,
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  patientName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  cardActionsContainer: {
    gap: 8,
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  realiseBtn: {
    backgroundColor: '#2ECC71',
  },
  realiseText: {
    color: '#0F2C3D',
    fontWeight: 'bold',
    fontSize: 12,
  },
  whatsappBtn: {
    backgroundColor: '#25D366',
  },
  whatsappText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  smsBtn: {
    backgroundColor: '#1E3E52',
    borderWidth: 1,
    borderColor: '#28C2FF',
  },
  smsText: {
    color: '#28C2FF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  annuleBtn: {
    backgroundColor: '#1E3E52',
    borderWidth: 1,
    borderColor: '#FF6B6B',
  },
  annuleText: {
    color: '#FF6B6B',
    fontWeight: 'bold',
    fontSize: 12,
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
  modalSection: {
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8AC8F9',
    marginBottom: 8,
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
  patientDropdown: {
    maxHeight: 120,
    backgroundColor: '#0F2C3D',
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2F5C77',
  },
  patientDropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2F5C77',
  },
  dropdownText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  selectedPatientBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2F5C77',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  selectedMeta: {
    flex: 1,
  },
  selectedLabel: {
    color: '#8AC8F9',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  selectedName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  inputGroup: {
    marginBottom: 16,
  },
  timeSlotsContainer: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  timeChip: {
    backgroundColor: '#0F2C3D',
    borderWidth: 1,
    borderColor: '#2F5C77',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginRight: 8,
  },
  timeChipActive: {
    backgroundColor: '#28C2FF',
    borderColor: '#28C2FF',
  },
  timeChipText: {
    color: '#8AC8F9',
    fontSize: 13,
    fontWeight: '600',
  },
  timeChipTextActive: {
    color: '#0F2C3D',
    fontWeight: 'bold',
  },
  statusContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  statusBtn: {
    flex: 1,
    backgroundColor: '#0F2C3D',
    borderWidth: 1,
    borderColor: '#2F5C77',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  statusBtnActive: {
    backgroundColor: '#28C2FF',
    borderColor: '#28C2FF',
  },
  statusBtnText: {
    color: '#8AC8F9',
    fontWeight: '600',
    fontSize: 13,
  },
  statusBtnTextActive: {
    color: '#0F2C3D',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 16,
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
});
