import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getPatients, getConsultationsByPatient } from '../database/SQLiteDatabaseManager';
import { getDatabase } from '../database/db';
import { triggerSynchronization, isOnline } from '../database/SyncManager';
import { useSecurity } from '../security/SecurityContext';

interface Stats {
  totalPatients: number;
  visitesAujourdhui: number;
  nouveauxMois: number;
  patientsM: number;
  patientsF: number;
  topPathologies: { name: string; count: number }[];
}

export default function DashboardScreen() {
  const router = useRouter();
  const { user, lock } = useSecurity();

  const [stats, setStats] = useState<Stats>({
    totalPatients: 0,
    visitesAujourdhui: 0,
    nouveauxMois: 0,
    patientsM: 0,
    patientsF: 0,
    topPathologies: [],
  });
  const [todayRdvs, setTodayRdvs] = useState<any[]>([]);
  const [tomorrowRdvs, setTomorrowRdvs] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [recents, setRecents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [])
  );

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const db = await getDatabase();
      const allPatients = await getPatients();
      const patientCount = allPatients.length;

      // 1. Calculate Gender stats
      let mCount = 0;
      let fCount = 0;
      allPatients.forEach((p) => {
        if (p.sexe === 'M') mCount++;
        else if (p.sexe === 'F') fCount++;
      });

      // 2. Daily visits count (consultations from today)
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayStartStr = todayStart.toISOString();

      const todayVisitsRow = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM consultations WHERE date >= ?;',
        [todayStartStr]
      );
      const visitsToday = todayVisitsRow?.count || 0;

      // 3. New patients this month
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthStartStr = monthStart.toISOString();

      const newPatientsRow = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM patients WHERE created_at >= ?;',
        [monthStartStr]
      );
      const newMois = newPatientsRow?.count || 0;

      // 4. Compute Top Pathologies from all consultations
      // We need to fetch and decrypt diagnostics
      const consRows = await db.getAllAsync<any>('SELECT diagnostic FROM consultations WHERE diagnostic IS NOT NULL;');
      const pathCounts: Record<string, number> = {};

      const { decryptData } = require('../security/encryption');
      for (const row of consRows) {
        if (row.diagnostic) {
          const decDiag = await decryptData(row.diagnostic);
          if (decDiag && decDiag.trim()) {
            const cleanDiag = decDiag.trim().charAt(0).toUpperCase() + decDiag.trim().slice(1).toLowerCase();
            pathCounts[cleanDiag] = (pathCounts[cleanDiag] || 0) + 1;
          }
        }
      }

      const topPathologies = Object.keys(pathCounts)
        .map((name) => ({ name, count: pathCounts[name] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3); // top 3 pathologies

      setStats({
        totalPatients: patientCount,
        visitesAujourdhui: visitsToday,
        nouveauxMois: newMois,
        patientsM: mCount,
        patientsF: fCount,
        topPathologies,
      });

      // 5. Load Today's Appointments (Rendez-vous)
      const rdvRows = await db.getAllAsync<any>(
        `SELECT rv.*, p.nom as p_nom, p.prenom as p_prenom 
         FROM rendez_vous rv
         JOIN patients p ON rv.patient_id = p.id
         WHERE rv.date_heure >= ? AND rv.date_heure <= ?
         ORDER BY rv.date_heure ASC;`,
        [
          todayStartStr,
          new Date(todayStart.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        ]
      );

      const decryptedRdvs = [];
      for (const row of rdvRows) {
        const patientNom = (await decryptData(row.p_nom)) || '';
        const patientPrenom = (await decryptData(row.p_prenom)) || '';
        decryptedRdvs.push({
          id: row.id,
          date_heure: row.date_heure,
          statut: row.statut,
          patient_name: `${patientPrenom} ${patientNom.toUpperCase()}`,
        });
      }
      setTodayRdvs(decryptedRdvs);

      // 6. Load Tomorrow's Appointments (Rendez-vous)
      const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowStartStr = tomorrowStart.toISOString();
      const tomorrowEndStr = new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000).toISOString();

      const rdvTomorrowRows = await db.getAllAsync<any>(
        `SELECT rv.*, p.nom as p_nom, p.prenom as p_prenom 
         FROM rendez_vous rv
         JOIN patients p ON rv.patient_id = p.id
         WHERE rv.date_heure >= ? AND rv.date_heure <= ?
         ORDER BY rv.date_heure ASC;`,
        [
          tomorrowStartStr,
          tomorrowEndStr,
        ]
      );

      const decryptedTomorrowRdvs = [];
      for (const row of rdvTomorrowRows) {
        const patientNom = (await decryptData(row.p_nom)) || '';
        const patientPrenom = (await decryptData(row.p_prenom)) || '';
        decryptedTomorrowRdvs.push({
          id: row.id,
          date_heure: row.date_heure,
          statut: row.statut,
          patient_name: `${patientPrenom} ${patientNom.toUpperCase()}`,
        });
      }
      setTomorrowRdvs(decryptedTomorrowRdvs);

      // 7. Load favorites and recents from storage
      try {
        const favsKey = 'favorites_patients';
        const recentsKey = 'recents_patients';
        if (Platform.OS === 'web') {
          setFavorites(JSON.parse(localStorage.getItem(favsKey) || '[]'));
          setRecents(JSON.parse(localStorage.getItem(recentsKey) || '[]'));
        } else {
          const SecureStore = require('expo-secure-store');
          const favsData = await SecureStore.getItemAsync(favsKey);
          const recentsData = await SecureStore.getItemAsync(recentsKey);
          setFavorites(JSON.parse(favsData || '[]'));
          setRecents(JSON.parse(recentsData || '[]'));
        }
      } catch (e) {
        console.error('Failed to load favorites/recents on dashboard:', e);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    const online = await isOnline();
    if (!online) {
      Alert.alert('Hors-ligne', "Aucune connexion Internet détectée. Les données restent sauvegardées en sécurité sur l'appareil.");
      return;
    }

    setSyncing(true);
    try {
      const res = await triggerSynchronization();
      if (res.success) {
        Alert.alert('Synchronisation terminée', `${res.syncedCount} dossiers synchronisés vers Supabase Cloud.`);
        await loadDashboardData();
      } else {
        Alert.alert('Information', "Toutes vos données locales sont déjà synchronisées.");
      }
    } catch (error) {
      Alert.alert('Erreur', 'La synchronisation cloud a échoué.');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#28C2FF" />
      </View>
    );
  }

  const mPercentage = stats.totalPatients > 0 ? Math.round((stats.patientsM / stats.totalPatients) * 100) : 0;
  const fPercentage = stats.totalPatients > 0 ? Math.round((stats.patientsF / stats.totalPatients) * 100) : 0;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Dashboard Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>
            {(() => {
              const hour = new Date().getHours();
              return hour >= 5 && hour < 18 ? 'Bonjour, Dr' : 'Bonsoir, Dr';
            })()}
          </Text>
          <Text style={styles.doctorName}>{user ? user.prenom : 'Mohamadou Bamba Diop'}</Text>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.syncBtn} onPress={handleSync} disabled={syncing}>
            {syncing ? (
              <ActivityIndicator size="small" color="#28C2FF" />
            ) : (
              <Ionicons name="sync-outline" size={22} color="#28C2FF" />
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.lockBtn} onPress={lock}>
            <Ionicons name="lock-closed-outline" size={22} color="#FF6B6B" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Recents Patients */}
        {recents.length > 0 && (
          <View style={styles.recentsContainer}>
            <Text style={styles.recentsTitle}>Dossiers Récents</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentsScroll}>
              {recents.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.recentItem}
                  onPress={() => router.push(`/patients/${item.id}`)}
                >
                  <View style={styles.recentAvatar}>
                    <Text style={styles.recentAvatarText}>
                      {item.prenom[0] || ''}{item.nom[0] || ''}
                    </Text>
                  </View>
                  <Text style={styles.recentName} numberOfLines={1}>
                    {item.prenom} {item.nom.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Favorites Patients */}
        {favorites.length > 0 && (
          <View style={styles.recentsContainer}>
            <Text style={styles.recentsTitle}>Dossiers Épinglés (Favoris)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentsScroll}>
              {favorites.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.recentItem, styles.favItem]}
                  onPress={() => router.push(`/patients/${item.id}`)}
                >
                  <View style={[styles.recentAvatar, styles.favAvatar]}>
                    <Ionicons name="star" size={10} color="#FFD700" style={styles.favStar} />
                    <Text style={styles.recentAvatarText}>
                      {item.prenom[0] || ''}{item.nom[0] || ''}
                    </Text>
                  </View>
                  <Text style={styles.recentName} numberOfLines={1}>
                    {item.prenom} {item.nom.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Statistics Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Ionicons name="people" size={24} color="#28C2FF" style={styles.statIcon} />
            <Text style={styles.statNumber}>{stats.totalPatients}</Text>
            <Text style={styles.statLabel}>Total Patients</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="clipboard" size={24} color="#2ECC71" style={styles.statIcon} />
            <Text style={styles.statNumber}>{stats.visitesAujourdhui}</Text>
            <Text style={styles.statLabel}>Consultations du jour</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="person-add" size={24} color="#E67E22" style={styles.statIcon} />
            <Text style={styles.statNumber}>{stats.nouveauxMois}</Text>
            <Text style={styles.statLabel}>Nouveaux ce mois</Text>
          </View>
        </View>

        {/* Gender Distribution Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Démographie Patients</Text>
          <View style={styles.genderRow}>
            <Text style={styles.genderLabel}>Hommes ({stats.patientsM})</Text>
            <Text style={styles.genderLabel}>Femmes ({stats.patientsF})</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarM, { width: `${mPercentage}%` }]} />
            <View style={[styles.progressBarF, { width: `${fPercentage}%` }]} />
          </View>
          <View style={styles.genderRow}>
            <Text style={[styles.genderPct, { color: '#8AC8F9' }]}>{mPercentage}%</Text>
            <Text style={[styles.genderPct, { color: '#FFB2C9' }]}>{fPercentage}%</Text>
          </View>
        </View>

        {/* Top Diagnostics Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pathologies Fréquentes</Text>
          {stats.topPathologies.length === 0 ? (
            <Text style={styles.emptyCardText}>Aucun diagnostic enregistré pour le moment.</Text>
          ) : (
            stats.topPathologies.map((item, index) => (
              <View key={item.name} style={styles.pathologyRow}>
                <View style={styles.pathologyLeft}>
                  <Text style={styles.pathologyRank}>#{index + 1}</Text>
                  <Text style={styles.pathologyName} numberOfLines={1}>{item.name}</Text>
                </View>
                <Text style={styles.pathologyCount}>{item.count} cas</Text>
              </View>
            ))
          )}
        </View>

        {/* Today's Agenda */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Rendez-vous du Jour</Text>
          {todayRdvs.length === 0 ? (
            <View style={styles.emptyAgendaContainer}>
              <Ionicons name="calendar-clear-outline" size={32} color="#2F5C77" />
              <Text style={styles.emptyCardText}>Aucun rendez-vous pour aujourd'hui.</Text>
            </View>
          ) : (
            todayRdvs.map((item) => {
              const timeStr = new Date(item.date_heure).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const statusColor = item.statut === 'CONFIRME' ? '#28C2FF' : item.statut === 'REALISE' ? '#2ECC71' : item.statut === 'ANNULE' ? '#FF6B6B' : '#8AC8F9';
              return (
                <View key={item.id} style={styles.agendaRow}>
                  <View style={styles.agendaTimeBg}>
                    <Text style={styles.agendaTime}>{timeStr}</Text>
                  </View>
                  <View style={styles.agendaMeta}>
                    <Text style={styles.agendaPatient}>{item.patient_name}</Text>
                    <Text style={[styles.agendaStatus, { color: statusColor }]}>{item.statut}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Tomorrow's Agenda */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Rendez-vous de Demain</Text>
          {tomorrowRdvs.length === 0 ? (
            <View style={styles.emptyAgendaContainer}>
              <Ionicons name="calendar-clear-outline" size={32} color="#2F5C77" />
              <Text style={styles.emptyCardText}>Aucun rendez-vous pour demain.</Text>
            </View>
          ) : (
            tomorrowRdvs.map((item) => {
              const timeStr = new Date(item.date_heure).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const statusColor = item.statut === 'CONFIRME' ? '#28C2FF' : item.statut === 'REALISE' ? '#2ECC71' : item.statut === 'ANNULE' ? '#FF6B6B' : '#8AC8F9';
              return (
                <View key={item.id} style={styles.agendaRow}>
                  <View style={styles.agendaTimeBg}>
                    <Text style={styles.agendaTime}>{timeStr}</Text>
                  </View>
                  <View style={styles.agendaMeta}>
                    <Text style={styles.agendaPatient}>{item.patient_name}</Text>
                    <Text style={[styles.agendaStatus, { color: statusColor }]}>{item.statut}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
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
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2F5C77',
  },
  welcomeText: {
    color: '#8AC8F9',
    fontSize: 14,
  },
  doctorName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 2,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  syncBtn: {
    backgroundColor: '#1E3E52',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2F5C77',
  },
  lockBtn: {
    backgroundColor: '#1E3E52',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2F5C77',
  },
  scrollContent: {
    padding: 20,
    gap: 16,
    paddingBottom: 40,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1E3E52',
    borderWidth: 1,
    borderColor: '#2F5C77',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  statIcon: {
    marginBottom: 8,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 10,
    color: '#8AC8F9',
    textAlign: 'center',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#1E3E52',
    borderWidth: 1,
    borderColor: '#2F5C77',
    borderRadius: 15,
    padding: 16,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#8AC8F9',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  genderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  genderLabel: {
    color: '#D1E6F3',
    fontSize: 13,
  },
  genderPct: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 4,
  },
  progressBarBg: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#0F2C3D',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  progressBarM: {
    height: '100%',
    backgroundColor: '#28C2FF',
  },
  progressBarF: {
    height: '100%',
    backgroundColor: '#FFB2C9',
  },
  emptyCardText: {
    color: '#8AC8F9',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 10,
  },
  pathologyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0F2C3D',
    borderWidth: 1,
    borderColor: '#2F5C77',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  pathologyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  pathologyRank: {
    color: '#28C2FF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  pathologyName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  pathologyCount: {
    color: '#D1E6F3',
    fontSize: 13,
  },
  emptyAgendaContainer: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  agendaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F2C3D',
    borderWidth: 1,
    borderColor: '#2F5C77',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  agendaTimeBg: {
    backgroundColor: '#2F5C77',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  agendaTime: {
    color: '#28C2FF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  agendaMeta: {
    flex: 1,
  },
  agendaPatient: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  agendaStatus: {
    color: '#8AC8F9',
    fontSize: 11,
    marginTop: 2,
  },
  recentsContainer: {
    backgroundColor: '#1E3E52',
    borderRadius: 15,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2F5C77',
  },
  recentsTitle: {
    color: '#8AC8F9',
    fontSize: 13,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  recentsScroll: {
    flexDirection: 'row',
    gap: 16,
  },
  recentItem: {
    alignItems: 'center',
    width: 70,
  },
  recentAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2F5C77',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    position: 'relative',
  },
  recentAvatarText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  recentName: {
    color: '#FFFFFF',
    fontSize: 10,
    textAlign: 'center',
    fontWeight: '500',
  },
  favItem: {
    // optional fav styling
  },
  favAvatar: {
    borderColor: '#FFD700',
    borderWidth: 1,
  },
  favStar: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#1E3E52',
    borderRadius: 6,
    padding: 1,
  },
});
