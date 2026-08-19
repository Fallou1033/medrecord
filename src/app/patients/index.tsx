import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { useRouter, useFocusEffect, Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getPatients, Patient } from '../../database/SQLiteDatabaseManager';
import { calculateAge, formatDateFR } from '../../utils/helpers';
import { writeAuditLog } from '../../database/db';
import { useSecurity } from '../../security/SecurityContext';

export default function PatientsListScreen() {
  const router = useRouter();
  const { user } = useSecurity();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Load patients whenever screen is focused
  useFocusEffect(
    useCallback(() => {
      loadPatients();
    }, [])
  );

  const loadPatients = async () => {
    setLoading(true);
    try {
      const list = await getPatients(user?.id);
      setPatients(list);

      // Audit read list
      if (user) {
        await writeAuditLog(user.id, 'READ', 'patients', null, 'Lecture de la liste des patients');
      }
    } catch (error) {
      console.error('Failed to load patients:', error);
    } finally {
      setLoading(false);
    }
  };

  // Perform search in memory with useMemo for 60 FPS typing
  const filteredPatients = React.useMemo(() => {
    if (!search.trim()) return patients;
    const query = search.toLowerCase().trim();
    return patients.filter((p) => {
      const fullName = `${p.prenom} ${p.nom}`.toLowerCase();
      const folderNum = p.numero_dossier.toLowerCase();
      const phone = (p.telephone || '').toLowerCase();
      const dobRaw = (p.date_naissance || '').toLowerCase();
      const dobFormatted = formatDateFR(p.date_naissance).toLowerCase();
      
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
    return <MemoizedPatientCard item={item} />;
  }, []);

  const keyExtractor = useCallback((item: Patient) => item.id, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.title}>Dossiers Patients</Text>
        <Link href="/patients/create" asChild>
          <TouchableOpacity style={styles.addButton}>
            <Ionicons name="person-add" size={20} color="#0F2C3D" />
            <Text style={styles.addButtonText}>Nouveau</Text>
          </TouchableOpacity>
        </Link>
      </View>

      <View style={styles.searchBarContainer}>
        <Ionicons name="search" size={20} color="#9ca3af" style={styles.searchIcon} />
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

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#28C2FF" />
          <Text style={styles.loadingText}>Déchiffrement sécurisé en cours...</Text>
        </View>
      ) : filteredPatients.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="people-outline" size={64} color="#2F5C77" />
          <Text style={styles.emptyText}>Aucun patient trouvé</Text>
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
        />
      )}
    </SafeAreaView>
  );
}

const MemoizedPatientCard = React.memo(({ item }: { item: Patient }) => {
  const age = calculateAge(item.date_naissance);
  const genderIcon = item.sexe === 'M' ? 'male' : 'female';
  const genderColor = item.sexe === 'M' ? '#8AC8F9' : '#FFB2C9';

  return (
    <Link href={`/patients/${item.id}`} asChild>
      <TouchableOpacity style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.folderNumber}>{item.numero_dossier}</Text>
          <View style={styles.syncStatus}>
            <Ionicons
              name={item.is_synced ? 'cloud-done-outline' : 'cloud-offline-outline'}
              size={18}
              color={item.is_synced ? '#2ECC71' : '#E67E22'}
            />
          </View>
        </View>

        <Text style={styles.name}>
          {item.prenom} {item.nom.toUpperCase()}
        </Text>

        <View style={styles.cardFooter}>
          <View style={styles.metaInfo}>
            <Ionicons name={genderIcon} size={14} color={genderColor} />
            <Text style={styles.metaText}>
              {item.sexe} • {age} ans
            </Text>
          </View>

          {item.telephone && (
            <View style={styles.metaInfo}>
              <Ionicons name="call-outline" size={14} color="#8AC8F9" />
              <Text style={styles.metaText}>{item.telephone}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Link>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F2C3D', // Deep medical dark blue
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
    paddingVertical: 12,
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
    backgroundColor: '#1E3E52',
    marginHorizontal: 20,
    marginBottom: 16,
    paddingHorizontal: 12,
    borderRadius: 10,
    height: 44,
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
    paddingHorizontal: 40,
  },
  loadingText: {
    color: '#8AC8F9',
    marginTop: 12,
    fontSize: 14,
  },
  emptyText: {
    color: '#8AC8F9',
    marginTop: 12,
    fontSize: 16,
    fontWeight: '500',
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 12,
  },
  card: {
    backgroundColor: '#1E3E52',
    borderRadius: 15,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2F5C77',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  folderNumber: {
    color: '#28C2FF',
    fontWeight: '600',
    fontSize: 13,
  },
  syncStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#2F5C77',
    paddingTop: 10,
  },
  metaInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    color: '#D1E6F3',
    fontSize: 13,
  },
});
