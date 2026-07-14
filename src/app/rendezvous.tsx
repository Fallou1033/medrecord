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
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getRendezVous,
  addRendezVous,
  updateRendezVousStatut,
  getPatients,
  Patient,
  RendezVous,
} from '../database/SQLiteDatabaseManager';
import { useSecurity } from '../security/SecurityContext';
import { formatDateFR } from '../utils/helpers';

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
          <Text style={styles.timeText}>{timeFormatted} • {dateFormatted}</Text>
          <View style={[styles.statusBadge, { borderColor: statusColor }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{item.statut}</Text>
          </View>
        </View>

        <Text style={styles.patientName}>
          {item.patient_prenom} {item.patient_nom?.toUpperCase()}
        </Text>

        <View style={styles.cardActions}>
          {item.statut !== 'REALISE' && item.statut !== 'ANNULE' && (
            <>
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
            </>
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

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#28C2FF" />
        </View>
      ) : rdvs.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="calendar-outline" size={64} color="#2F5C77" />
          <Text style={styles.emptyText}>Aucun rendez-vous planifié</Text>
        </View>
      ) : (
        <FlatList
          data={rdvs}
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
            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.modalLabel}>Date (AAAA-MM-JJ)</Text>
                <TextInput
                  style={styles.modalInputText}
                  placeholder="AAAA-MM-JJ"
                  placeholderTextColor="#9ca3af"
                  value={dateStr}
                  onChangeText={setDateStr}
                  keyboardType="numeric"
                  maxLength={10}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.modalLabel}>Heure (HH:MM)</Text>
                <TextInput
                  style={styles.modalInputText}
                  placeholder="HH:MM"
                  placeholderTextColor="#9ca3af"
                  value={timeStr}
                  onChangeText={setTimeStr}
                  keyboardType="numeric"
                  maxLength={5}
                />
              </View>
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
  cardActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
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
