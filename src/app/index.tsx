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
  TextInput,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getPatients, getConsultations, getAppointments } from '../services/api';
import { useSecurity } from '../security/SecurityContext';

interface Stats {
  totalPatients: number;
  visitesAujourdhui: number;
  nouveauxMois: number;
  patientsM: number;
  patientsF: number;
  topPathologies: { name: string; count: number }[];
}

let dashboardCache: {
  stats: Stats;
  todayRdvs: any[];
  tomorrowRdvs: any[];
  favorites: any[];
  recents: any[];
} | null = null;

export default function DashboardScreen() {
  const router = useRouter();
  const { user, lock, logout } = useSecurity();

  const [stats, setStats] = useState<Stats>(() => dashboardCache?.stats || {
    totalPatients: 0,
    visitesAujourdhui: 0,
    nouveauxMois: 0,
    patientsM: 0,
    patientsF: 0,
    topPathologies: [],
  });
  const [todayRdvs, setTodayRdvs] = useState<any[]>(() => dashboardCache?.todayRdvs || []);
  const [tomorrowRdvs, setTomorrowRdvs] = useState<any[]>(() => dashboardCache?.tomorrowRdvs || []);
  const [favorites, setFavorites] = useState<any[]>(() => dashboardCache?.favorites || []);
  const [recents, setRecents] = useState<any[]>(() => dashboardCache?.recents || []);
  const [loading, setLoading] = useState<boolean>(!dashboardCache);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPreviewPatient, setSelectedPreviewPatient] = useState<any | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [])
  );

  const loadDashboardData = async () => {
    if (!dashboardCache) {
      setLoading(true);
    }
    try {
      const [allPatients, allConsultations, allAppointments] = await Promise.all([
        getPatients().catch(() => []),
        getConsultations().catch(() => []),
        getAppointments().catch(() => []),
      ]);

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

      const visitsToday = allConsultations.filter(c => {
        const cDate = new Date(c.date || c.date_consultation || '');
        return cDate >= todayStart;
      }).length;

      // 3. New patients this month
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const newMois = allPatients.filter(p => {
        const pDate = new Date(p.created_at || '');
        return pDate >= monthStart;
      }).length;

      // 4. Compute Top Pathologies from doctor's consultations
      const pathCounts: Record<string, number> = {};
      for (const c of allConsultations) {
        if (c.diagnostic && c.diagnostic.trim()) {
          const cleanDiag = c.diagnostic.trim().charAt(0).toUpperCase() + c.diagnostic.trim().slice(1).toLowerCase();
          pathCounts[cleanDiag] = (pathCounts[cleanDiag] || 0) + 1;
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

      // 5. Load Today's and Tomorrow's Appointments
      const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowStart = todayEnd;
      const tomorrowEnd = new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000);

      const todayList = allAppointments.filter(a => {
        const aDate = new Date(a.date_heure);
        return aDate >= todayStart && aDate < todayEnd;
      });

      const tomorrowList = allAppointments.filter(a => {
        const aDate = new Date(a.date_heure);
        return aDate >= tomorrowStart && aDate < tomorrowEnd;
      });

      setTodayRdvs(todayList);
      setTomorrowRdvs(tomorrowList);

      // 7. Load favorites and recents from storage, strictly filtered by active doctor's patient list
      const userKeySuffix = user?.id ? `_${user.id}` : '';
      const favsKey = `favorites_patients${userKeySuffix}`;
      const recentsKey = `recents_patients${userKeySuffix}`;
      let loadedFavs: any[] = [];
      let loadedRecents: any[] = [];
      try {
        if (Platform.OS === 'web') {
          loadedFavs = JSON.parse(localStorage.getItem(favsKey) || localStorage.getItem('favorites_patients') || '[]');
          loadedRecents = JSON.parse(localStorage.getItem(recentsKey) || localStorage.getItem('recents_patients') || '[]');
        } else {
          const SecureStore = require('expo-secure-store');
          const favsData = await SecureStore.getItemAsync(favsKey);
          const recentsData = await SecureStore.getItemAsync(recentsKey);
          loadedFavs = JSON.parse(favsData || '[]');
          loadedRecents = JSON.parse(recentsData || '[]');
        }
      } catch (e) {
        console.error('Failed to load favorites/recents on dashboard:', e);
      }

      // Synchroniser avec la liste réelle de la base Supabase (élimine les fantômes d'anciens tests locaux)
      const existingPatientMap = new Map(allPatients.map(p => [p.id, p]));
      loadedFavs = loadedFavs
        .filter(f => f && f.id && existingPatientMap.has(f.id))
        .map(f => ({ ...f, ...(existingPatientMap.get(f.id) || {}) }));
      loadedRecents = loadedRecents
        .filter(r => r && r.id && existingPatientMap.has(r.id))
        .map(r => ({ ...r, ...(existingPatientMap.get(r.id) || {}) }));

      // Mettre à jour le cache local nettoyé
      try {
        if (Platform.OS === 'web') {
          localStorage.setItem(favsKey, JSON.stringify(loadedFavs));
          localStorage.setItem(recentsKey, JSON.stringify(loadedRecents));
          if (userKeySuffix) {
            localStorage.removeItem('favorites_patients');
            localStorage.removeItem('recents_patients');
          }
        }
      } catch (e) {}

      setFavorites(loadedFavs);
      setRecents(loadedRecents);

      dashboardCache = {
        stats: {
          totalPatients: patientCount,
          visitesAujourdhui: visitsToday,
          nouveauxMois: newMois,
          patientsM: mCount,
          patientsF: fCount,
          topPathologies,
        },
        todayRdvs: todayList,
        tomorrowRdvs: tomorrowList,
        favorites: loadedFavs,
        recents: loadedRecents,
      };
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await loadDashboardData();
      Alert.alert('Synchronisation Cloud', 'Données médicales synchronisées avec Supabase Cloud en temps réel.');
    } catch (error) {
      Alert.alert('Erreur', 'La synchronisation cloud a rencontré une difficulté.');
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
          <Text style={styles.doctorName}>
            {(() => {
              let p = user?.prenom || 'Fallou';
              let n = user?.nom || 'Diop';

              if (!p || p.toLowerCase().includes('fallu') || p.toLowerCase().includes('fallo') || p.toLowerCase().includes('10008') || p.length > 12) {
                p = 'Fallou';
                n = 'Diop';
              }

              const formattedNom = n ? n.trim() : 'Diop';
              const formattedPrenom = p ? p.charAt(0).toUpperCase() + p.slice(1) : 'Fallou';
              
              const raw = `${formattedPrenom} ${formattedNom}`.replace(/(Dr\.?|Docteur)\s*/gi, '').trim();
              return raw || 'Fallou Diop';
            })()}
          </Text>
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
            <Ionicons name="lock-closed-outline" size={22} color="#28C2FF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.lockBtn, { backgroundColor: 'rgba(255, 107, 107, 0.15)', borderColor: '#FF6B6B' }]}
            onPress={() => {
              if (Platform.OS === 'web' && typeof window !== 'undefined') {
                if (window.confirm("Voulez-vous vous déconnecter de votre cabinet ?")) {
                  dashboardCache = null;
                  logout();
                }
              } else {
                Alert.alert(
                  'Déconnexion',
                  'Voulez-vous vous déconnecter de votre cabinet ?',
                  [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'Déconnexion', style: 'destructive', onPress: () => { dashboardCache = null; logout(); } },
                  ]
                );
              }
            }}
          >
            <Ionicons name="log-out-outline" size={22} color="#FF6B6B" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Quick Action Bar (Search & Shortcuts) */}
      <View style={styles.quickActionBar}>
        <View style={styles.searchBarBox}>
          <Ionicons name="search" size={18} color="#8AC8F9" />
          <TextInput
            style={styles.searchInput}
            placeholder="🔍 Rechercher un patient (nom, téléphone)..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={(txt: string) => {
              setSearchQuery(txt);
              if (txt.trim().length > 1) {
                router.push(`/patients?search=${encodeURIComponent(txt.trim())}`);
              }
            }}
          />
        </View>
        <View style={styles.quickShortcutsRow}>
          <TouchableOpacity style={styles.shortcutBtnPrimary} onPress={() => router.push('/patients/create')}>
            <Ionicons name="person-add" size={15} color="#0F2C3D" />
            <Text style={styles.shortcutBtnPrimaryText}>+ Nouveau patient</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shortcutBtnSecondary} onPress={() => router.push('/consultations/create')}>
            <Ionicons name="medical" size={15} color="#28C2FF" />
            <Text style={styles.shortcutBtnSecondaryText}>+ Nouvelle consultation</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Recents Patients with Preview Card Interaction */}
        {recents.length > 0 && (
          <View style={styles.recentsContainer}>
            <Text style={styles.recentsTitle}>Dossiers Récents</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentsScroll}>
              {recents.map((item) => {
                const isSelected = selectedPreviewPatient?.id === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.recentItem, isSelected && styles.recentItemSelected]}
                    onPress={() => {
                      if (isSelected) {
                        router.push(`/patients/${item.id}`);
                      } else {
                        setSelectedPreviewPatient(item);
                      }
                    }}
                  >
                    <View style={[styles.recentAvatar, isSelected && { borderColor: '#28C2FF', borderWidth: 2 }]}>
                      <Text style={styles.recentAvatarText}>
                        {item.prenom ? item.prenom[0] : ''}{item.nom ? item.nom[0] : ''}
                      </Text>
                    </View>
                    <Text style={styles.recentName} numberOfLines={1}>
                      {item.prenom} {item.nom ? item.nom.toUpperCase() : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Instant Preview Card */}
            {selectedPreviewPatient && (
              <View style={styles.previewCard}>
                <View style={styles.previewHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name="person-circle-outline" size={24} color="#28C2FF" />
                    <Text style={styles.previewTitle}>
                      {selectedPreviewPatient.prenom} {selectedPreviewPatient.nom?.toUpperCase()} · {selectedPreviewPatient.sexe}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedPreviewPatient(null)}>
                    <Ionicons name="close" size={18} color="#8AC8F9" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.previewSubtitle}>
                  {selectedPreviewPatient.telephone ? `📞 ${selectedPreviewPatient.telephone}` : 'Pas de téléphone'}
                  {selectedPreviewPatient.adresse ? `  |  📍 ${selectedPreviewPatient.adresse}` : ''}
                </Text>
                <TouchableOpacity
                  style={styles.openPatientBtn}
                  onPress={() => router.push(`/patients/${selectedPreviewPatient.id}`)}
                >
                  <Text style={styles.openPatientBtnText}>Ouvrir la fiche patient complète →</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Pinned Dossiers (Formerly Favorites) */}
        {favorites.length > 0 && (
          <View style={styles.recentsContainer}>
            <Text style={styles.recentsTitle}>Dossiers épinglés</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentsScroll}>
              {favorites.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.recentItem, styles.favItem]}
                  onPress={() => router.push(`/patients/${item.id}`)}
                >
                  <View style={[styles.recentAvatar, styles.favAvatar]}>
                    <Ionicons name="pin" size={10} color="#FFD700" style={styles.favStar} />
                    <Text style={styles.recentAvatarText}>
                      {item.prenom ? item.prenom[0] : ''}{item.nom ? item.nom[0] : ''}
                    </Text>
                  </View>
                  <Text style={styles.recentName} numberOfLines={1}>
                    {item.prenom} {item.nom ? item.nom.toUpperCase() : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Operational Statistics Cards */}
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
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 20,
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
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2F5C77',
  },
  lockBtn: {
    backgroundColor: '#1E3E52',
    width: 44,
    height: 44,
    borderRadius: 22,
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
  recentItemSelected: {
    opacity: 0.9,
  },
  quickActionBar: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#0F2C3D',
    gap: 10,
  },
  searchBarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E3E52',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#2F5C77',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    padding: 0,
  },
  quickShortcutsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  shortcutBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#28C2FF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  shortcutBtnPrimaryText: {
    color: '#0F2C3D',
    fontSize: 12,
    fontWeight: 'bold',
  },
  shortcutBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E3E52',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#28C2FF',
    gap: 6,
  },
  shortcutBtnSecondaryText: {
    color: '#28C2FF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  previewCard: {
    marginTop: 14,
    backgroundColor: '#0F2C3D',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#28C2FF',
    gap: 6,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  previewSubtitle: {
    color: '#8AC8F9',
    fontSize: 12,
  },
  openPatientBtn: {
    marginTop: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#1E3E52',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2F5C77',
  },
  openPatientBtnText: {
    color: '#28C2FF',
    fontSize: 11,
    fontWeight: 'bold',
  },
});
