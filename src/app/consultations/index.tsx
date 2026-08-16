import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Platform,
  StatusBar,
  TextInput,
} from 'react-native';
import { useRouter, useFocusEffect, Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getConsultations, getPatients, Patient, Consultation } from '../../database/SQLiteDatabaseManager';
import { formatDateFR } from '../../utils/helpers';

export default function ConsultationsIndexScreen() {
  const router = useRouter();
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [patientsMap, setPatientsMap] = useState<{ [id: string]: Patient }>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const allCons = await getConsultations();
      const allPatients = await getPatients();

      const pMap: { [id: string]: Patient } = {};
      allPatients.forEach((p) => {
        pMap[p.id] = p;
      });

      setPatientsMap(pMap);
      setConsultations(allCons);
    } catch (e) {
      console.error('Failed to load consultations list:', e);
    } finally {
      setLoading(false);
    }
  };

  const filteredConsultations = consultations.filter((c) => {
    const p = patientsMap[c.patient_id];
    const query = search.toLowerCase().trim();
    if (!query) return true;
    const motif = (c.motif || '').toLowerCase();
    const diag = (c.diagnostic || '').toLowerCase();
    const pName = p ? `${p.prenom} ${p.nom}`.toLowerCase() : '';
    return motif.includes(query) || diag.includes(query) || pName.includes(query);
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Consultations Médicales</Text>
          <Text style={styles.headerSubtitle}>Historique des visites et examens du cabinet</Text>
        </View>
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => router.push('/patients/consultation_create')}
        >
          <Ionicons name="add-circle" size={18} color="#0F2C3D" />
          <Text style={styles.newBtnText}>+ Nouvelle consultation</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color="#8AC8F9" />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher par patient, motif, diagnostic..."
          placeholderTextColor="#94A3B8"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#28C2FF" />
          <Text style={styles.loadingText}>Chargement des consultations...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {filteredConsultations.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="clipboard-outline" size={48} color="#2F5C77" />
              <Text style={styles.emptyTitle}>Aucune consultation trouvée</Text>
              <Text style={styles.emptyText}>Commencez par démarrer une nouvelle consultation médicale.</Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => router.push('/patients/consultation_create')}
              >
                <Ionicons name="add" size={18} color="#0F2C3D" />
                <Text style={styles.emptyBtnText}>Démarrer une consultation</Text>
              </TouchableOpacity>
            </View>
          ) : (
            filteredConsultations.map((item) => {
              const patient = patientsMap[item.patient_id];
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.consCard}
                  onPress={() => router.push(`/patients/consultation_details?id=${item.id}`)}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.patientInfo}>
                      <Ionicons name="person-circle" size={24} color="#28C2FF" />
                      <Text style={styles.patientName}>
                        {patient ? `${patient.prenom} ${patient.nom.toUpperCase()}` : 'Patient non spécifié'}
                      </Text>
                    </View>
                    <Text style={styles.consDate}>{formatDateFR(item.date)}</Text>
                  </View>

                  <View style={styles.cardBody}>
                    <Text style={styles.motifText} numberOfLines={1}>
                      <Text style={{ fontWeight: 'bold', color: '#8AC8F9' }}>Motif : </Text>
                      {item.motif}
                    </Text>
                    {item.diagnostic ? (
                      <Text style={styles.diagText} numberOfLines={1}>
                        <Text style={{ fontWeight: 'bold', color: '#2ECC71' }}>Diagnostic : </Text>
                        {item.diagnostic}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
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
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E3E52',
    backgroundColor: '#0F2C3D',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#8AC8F9',
    marginTop: 2,
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#28C2FF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  newBtnText: {
    color: '#0F2C3D',
    fontSize: 13,
    fontWeight: 'bold',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E3E52',
    marginHorizontal: 20,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2F5C77',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#8AC8F9',
    fontSize: 14,
  },
  scrollContent: {
    padding: 20,
    gap: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    gap: 12,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  emptyText: {
    color: '#8AC8F9',
    fontSize: 13,
    textAlign: 'center',
  },
  emptyBtn: {
    backgroundColor: '#28C2FF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
    marginTop: 8,
  },
  emptyBtnText: {
    color: '#0F2C3D',
    fontWeight: 'bold',
    fontSize: 14,
  },
  consCard: {
    backgroundColor: '#1E3E52',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2F5C77',
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  patientInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  patientName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  consDate: {
    color: '#8AC8F9',
    fontSize: 12,
  },
  cardBody: {
    gap: 4,
  },
  motifText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  diagText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
});
