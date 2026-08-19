import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect, Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getPatients } from '../../services/api/patientsService';
import { logAuditEvent } from '../../services/api/auditService';
import { Patient } from '../../types';
import { calculateAge, formatDateFR } from '../../utils/helpers';
import { useSecurity } from '../../security/SecurityContext';

export default function PatientsListScreen() {
  const router = useRouter();
  const { user } = useSecurity();
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Load patients whenever screen is focused
  useFocusEffect(
    useCallback(() => {
      loadPatients();
    }, [])
  );

  const loadPatients = async () => {
    try {
      const list = await getPatients();
      if (isMountedRef.current) {
        setPatients(Array.isArray(list) ? list : []);
      }

      // Audit read list
      logAuditEvent('READ', 'patients', null, 'Lecture de la liste des patients').catch(() => {});
    } catch (error) {
      console.error('Failed to load patients:', error);
      if (isMountedRef.current) {
        setPatients([]);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadPatients();
  };

  // Perform search in memory with useMemo for 60 FPS typing
  const filteredPatients = useMemo(() => {
    if (!Array.isArray(patients)) return [];
    const query = search.toLowerCase().trim();
    if (!query) return patients;

    return patients.filter((p) => {
      if (!p) return false;
      const fullName = `${p.prenom || ''} ${p.nom || ''}`.toLowerCase();
      const folderNum = (p.numero_dossier || '').toLowerCase();
      const phone = (p.telephone || '').toLowerCase();
      const dobRaw = (p.date_naissance || '').toLowerCase();
      const dobFormatted = formatDateFR(p.date_naissance || '').toLowerCase();

      return (
        fullName.includes(query) ||
        folderNum.includes(query) ||
        phone.includes(query) ||
        dobRaw.includes(query) ||
        dobFormatted.includes(query)
      );
    });
  }, [search, patients]);

  const renderPatientItem = useCallback(({ item }: { item: Patient }) => {
    if (!item) return null;
    return <MemoizedPatientCard item={item} />;
  }, []);

  const keyExtractor = useCallback((item: Patient, index: number) => {
    return item?.id || `patient_${index}`;
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.title}>Dossiers Patients</Text>
        <Link href="/patients/create" asChild>
          <TouchableOpacity style={styles.addButton} activeOpacity={0.8}>
            <Ionicons name="person-add" size={18} color="#0F2C3D" />
            <Text style={styles.addButtonText}>Nouveau</Text>
          </TouchableOpacity>
        </Link>
      </View>

      <View style={styles.searchBarContainer}>
        <Ionicons name="search" size={18} color="#9ca3af" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher par nom, dossier, téléphone..."
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close-circle" size={18} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>

      {loading && patients.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#28C2FF" />
          <Text style={styles.loadingText}>Synchronisation sécurisée des dossiers...</Text>
        </View>
      ) : filteredPatients.length === 0 ? (
        <View style={styles.centerContainer}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="people-outline" size={48} color="#28C2FF" />
          </View>
          <Text style={styles.emptyTitle}>
            {search.trim() ? 'Aucun résultat trouvé' : 'Aucun dossier patient'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {search.trim()
              ? `Aucun patient ne correspond à "${search}".`
              : 'Commencez par créer le premier dossier médical de votre patientèle.'}
          </Text>
          {!search.trim() && (
            <Link href="/patients/create" asChild>
              <TouchableOpacity style={styles.emptyActionButton} activeOpacity={0.8}>
                <Ionicons name="add-circle" size={20} color="#0F2C3D" />
                <Text style={styles.emptyActionButtonText}>Créer un dossier patient</Text>
              </TouchableOpacity>
            </Link>
          )}
        </View>
      ) : (
        <FlatList
          data={filteredPatients}
          keyExtractor={keyExtractor}
          renderItem={renderPatientItem}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={5}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#28C2FF"
              colors={['#28C2FF']}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const MemoizedPatientCard = React.memo(({ item }: { item: Patient }) => {
  const age = calculateAge(item.date_naissance);
  const genderIcon = item.sexe === 'F' ? 'female' : 'male';
  const genderColor = item.sexe === 'F' ? '#FFB2C9' : '#8AC8F9';
  const prenom = (item.prenom || '').trim();
  const nom = (item.nom || '').trim().toUpperCase();
  const folderNum = item.numero_dossier || 'MED-0000';

  return (
    <Link href={`/patients/${item.id}`} asChild>
      <TouchableOpacity style={styles.card} activeOpacity={0.75}>
        <View style={styles.cardHeader}>
          <View style={styles.folderBadge}>
            <Ionicons name="folder-outline" size={14} color="#28C2FF" />
            <Text style={styles.folderNumber}>{folderNum}</Text>
          </View>
          <View style={styles.syncStatus}>
            <Ionicons
              name={item.is_synced ? 'cloud-done-outline' : 'cloud-offline-outline'}
              size={16}
              color={item.is_synced ? '#2ECC71' : '#E67E22'}
            />
          </View>
        </View>

        <Text style={styles.name}>
          {prenom} {nom}
        </Text>

        <View style={styles.cardFooter}>
          <View style={styles.metaInfo}>
            <Ionicons name={genderIcon} size={14} color={genderColor} />
            <Text style={styles.metaText}>
              {item.sexe === 'F' ? 'Femme' : 'Homme'} {age !== null ? `• ${age} ans` : ''}
            </Text>
          </View>

          {item.telephone ? (
            <View style={styles.metaInfo}>
              <Ionicons name="call-outline" size={14} color="#8AC8F9" />
              <Text style={styles.metaText}>{item.telephone}</Text>
            </View>
          ) : null}

          {item.groupe_sanguin && item.groupe_sanguin !== 'Inconnu' ? (
            <View style={styles.bloodBadge}>
              <Text style={styles.bloodBadgeText}>{item.groupe_sanguin}</Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    </Link>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1E2D', // Deep modern dark blue
    ...Platform.select({
      web: {
        paddingTop: 80,
      },
      default: {},
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  addButton: {
    backgroundColor: '#28C2FF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#0F2C3D',
    fontWeight: 'bold',
    fontSize: 14,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#163347',
    marginHorizontal: 20,
    marginBottom: 16,
    paddingHorizontal: 14,
    borderRadius: 10,
    height: 46,
    borderWidth: 1,
    borderColor: '#1E4760',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    marginTop: -40,
  },
  loadingText: {
    color: '#8AC8F9',
    marginTop: 14,
    fontSize: 14,
  },
  emptyIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(40, 194, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(40, 194, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: '#8AC8F9',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyActionButton: {
    backgroundColor: '#28C2FF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  emptyActionButtonText: {
    color: '#0F2C3D',
    fontWeight: 'bold',
    fontSize: 15,
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 12,
  },
  card: {
    backgroundColor: '#163347',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E4760',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  folderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(40, 194, 255, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  folderNumber: {
    color: '#28C2FF',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  syncStatus: {
    padding: 2,
  },
  name: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  metaInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  bloodBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  bloodBadgeText: {
    color: '#F87171',
    fontSize: 11,
    fontWeight: 'bold',
  },
});
