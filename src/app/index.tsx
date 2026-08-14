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
  useWindowDimensions,
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
  patientsEnAttente: number;
  topPathologies: { name: string; count: number }[];
}

let dashboardCache: {
  stats: Stats;
  todayRdvs: any[];
  tomorrowRdvs: any[];
  weekRdvs: any[];
  favorites: any[];
  recents: any[];
} | null = null;

export default function DashboardScreen() {
  const router = useRouter();
  const { user, lock } = useSecurity();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const [activeAgendaTab, setActiveAgendaTab] = useState<'today' | 'tomorrow' | 'week'>('today');

  const [stats, setStats] = useState<Stats>(() => dashboardCache?.stats || {
    totalPatients: 0,
    visitesAujourdhui: 0,
    nouveauxMois: 0,
    patientsEnAttente: 0,
    topPathologies: [],
  });
  const [todayRdvs, setTodayRdvs] = useState<any[]>(() => dashboardCache?.todayRdvs || []);
  const [tomorrowRdvs, setTomorrowRdvs] = useState<any[]>(() => dashboardCache?.tomorrowRdvs || []);
  const [weekRdvs, setWeekRdvs] = useState<any[]>(() => dashboardCache?.weekRdvs || []);
  const [favorites, setFavorites] = useState<any[]>(() => dashboardCache?.favorites || []);
  const [recents, setRecents] = useState<any[]>(() => dashboardCache?.recents || []);
  const [loading, setLoading] = useState<boolean>(!dashboardCache);
  const [syncing, setSyncing] = useState(false);

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
      const db = await getDatabase();
      const allPatients = await getPatients();
      const patientCount = allPatients.length;

      // 1. Daily visits count (consultations from today)
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayStartStr = todayStart.toISOString();

      const todayVisitsRow = (await db.getFirstAsync(
        'SELECT COUNT(*) as count FROM consultations WHERE date >= ?;',
        [todayStartStr]
      )) as { count: number } | null;
      const visitsToday = todayVisitsRow?.count || 0;

      // 2. New patients this month
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthStartStr = monthStart.toISOString();

      const newPatientsRow = (await db.getFirstAsync(
        'SELECT COUNT(*) as count FROM patients WHERE created_at >= ?;',
        [monthStartStr]
      )) as { count: number } | null;
      const newMois = newPatientsRow?.count || 0;

      // 3. Compute Top Pathologies from consultations
      const consRows = (await db.getAllAsync('SELECT diagnostic FROM consultations WHERE diagnostic IS NOT NULL;')) as any[];
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
        .slice(0, 4);

      // 4. Load Today's Appointments
      const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
      const rdvRows = (await db.getAllAsync(
        `SELECT rv.*, p.nom as p_nom, p.prenom as p_prenom 
         FROM rendez_vous rv
         JOIN patients p ON rv.patient_id = p.id
         WHERE rv.date_heure >= ? AND rv.date_heure <= ?
         ORDER BY rv.date_heure ASC;`,
        [todayStartStr, todayEnd.toISOString()]
      )) as any[];

      const decryptedRdvs = [];
      for (const row of rdvRows) {
        const patientNom = (await decryptData(row.p_nom)) || '';
        const patientPrenom = (await decryptData(row.p_prenom)) || '';
        const decMotif = row.motif ? (await decryptData(row.motif)) : 'Consultation';
        decryptedRdvs.push({
          id: row.id,
          patient_id: row.patient_id,
          date_heure: row.date_heure,
          statut: row.statut || 'EN_ATTENTE',
          motif: decMotif || 'Consultation générale',
          patient_name: `${patientPrenom} ${patientNom.toUpperCase()}`,
        });
      }
      setTodayRdvs(decryptedRdvs);

      // Count patients waiting today
      const enAttenteCount = decryptedRdvs.filter(
        (r) => r.statut === 'EN_ATTENTE' || r.statut === 'CONFIRME'
      ).length;

      // 5. Load Tomorrow's Appointments
      const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowEnd = new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000);

      const rdvTomorrowRows = (await db.getAllAsync(
        `SELECT rv.*, p.nom as p_nom, p.prenom as p_prenom 
         FROM rendez_vous rv
         JOIN patients p ON rv.patient_id = p.id
         WHERE rv.date_heure >= ? AND rv.date_heure <= ?
         ORDER BY rv.date_heure ASC;`,
        [tomorrowStart.toISOString(), tomorrowEnd.toISOString()]
      )) as any[];

      const decryptedTomorrowRdvs = [];
      for (const row of rdvTomorrowRows) {
        const patientNom = (await decryptData(row.p_nom)) || '';
        const patientPrenom = (await decryptData(row.p_prenom)) || '';
        const decMotif = row.motif ? (await decryptData(row.motif)) : 'Consultation';
        decryptedTomorrowRdvs.push({
          id: row.id,
          patient_id: row.patient_id,
          date_heure: row.date_heure,
          statut: row.statut || 'EN_ATTENTE',
          motif: decMotif || 'Consultation',
          patient_name: `${patientPrenom} ${patientNom.toUpperCase()}`,
        });
      }
      setTomorrowRdvs(decryptedTomorrowRdvs);

      // 6. Load Week's Appointments (Next 7 days)
      const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      const rdvWeekRows = (await db.getAllAsync(
        `SELECT rv.*, p.nom as p_nom, p.prenom as p_prenom 
         FROM rendez_vous rv
         JOIN patients p ON rv.patient_id = p.id
         WHERE rv.date_heure >= ? AND rv.date_heure <= ?
         ORDER BY rv.date_heure ASC;`,
        [todayStartStr, weekEnd.toISOString()]
      )) as any[];

      const decryptedWeekRdvs = [];
      for (const row of rdvWeekRows) {
        const patientNom = (await decryptData(row.p_nom)) || '';
        const patientPrenom = (await decryptData(row.p_prenom)) || '';
        const decMotif = row.motif ? (await decryptData(row.motif)) : 'Consultation';
        decryptedWeekRdvs.push({
          id: row.id,
          patient_id: row.patient_id,
          date_heure: row.date_heure,
          statut: row.statut || 'EN_ATTENTE',
          motif: decMotif || 'Consultation',
          patient_name: `${patientPrenom} ${patientNom.toUpperCase()}`,
        });
      }
      setWeekRdvs(decryptedWeekRdvs);

      // 7. Load favorites and recents
      const favsKey = 'favorites_patients';
      const recentsKey = 'recents_patients';
      let loadedFavs: any[] = [];
      let loadedRecents: any[] = [];
      try {
        if (Platform.OS === 'web') {
          loadedFavs = JSON.parse(localStorage.getItem(favsKey) || '[]');
          loadedRecents = JSON.parse(localStorage.getItem(recentsKey) || '[]');
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
      setFavorites(loadedFavs);
      setRecents(loadedRecents);

      const computedStats: Stats = {
        totalPatients: patientCount,
        visitesAujourdhui: visitsToday,
        nouveauxMois: newMois,
        patientsEnAttente: enAttenteCount,
        topPathologies,
      };

      setStats(computedStats);

      dashboardCache = {
        stats: computedStats,
        todayRdvs: decryptedRdvs,
        tomorrowRdvs: decryptedTomorrowRdvs,
        weekRdvs: decryptedWeekRdvs,
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

  // Format date in French
  const getFormattedDate = () => {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    };
    const str = now.toLocaleDateString('fr-FR', options);
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#28C2FF" />
      </View>
    );
  }

  // Active agenda list based on selected tab
  const activeRdvs =
    activeAgendaTab === 'today'
      ? todayRdvs
      : activeAgendaTab === 'tomorrow'
      ? tomorrowRdvs
      : weekRdvs;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ================= HEADER & QUICK ACTIONS ================= */}
        <View style={styles.headerCard}>
          <View style={styles.headerLeft}>
            <Text style={styles.dateSubtext}>{getFormattedDate()}</Text>
            <Text style={styles.welcomeTitle}>
              Bonjour, Dr {user?.prenom || ''} {user?.nom || 'Fallou Diop'}
            </Text>
          </View>

          <View style={styles.headerRightGroup}>
            {/* Quick Action Buttons */}
            <View style={styles.quickActionGroup}>
              <TouchableOpacity
                style={styles.btnQuickPrimary}
                activeOpacity={0.8}
                onPress={() => router.push('/patients')}
              >
                <Ionicons name="person-add" size={16} color="#0F2C3D" />
                <Text style={styles.btnQuickPrimaryText}>+ Nouveau Patient</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.btnQuickSecondary}
                activeOpacity={0.8}
                onPress={() => router.push('/consultations')}
              >
                <Ionicons name="medical" size={16} color="#28C2FF" />
                <Text style={styles.btnQuickSecondaryText}>+ Nouvelle Consultation</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.btnQuickSecondary}
                activeOpacity={0.8}
                onPress={() => router.push('/ordonnances')}
              >
                <Ionicons name="document-text" size={16} color="#28C2FF" />
                <Text style={styles.btnQuickSecondaryText}>+ Rédiger Ordonnance</Text>
              </TouchableOpacity>
            </View>

            {/* Utility Control Buttons (Sync & Lock) */}
            <View style={styles.controlBtnRow}>
              <TouchableOpacity style={styles.controlIconBtn} onPress={handleSync} disabled={syncing}>
                {syncing ? (
                  <ActivityIndicator size="small" color="#28C2FF" />
                ) : (
                  <Ionicons name="sync-outline" size={20} color="#28C2FF" />
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.controlIconBtn} onPress={lock}>
                <Ionicons name="lock-closed-outline" size={20} color="#FF6B6B" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ================= KEY METRICS CARDS (KPIs) ================= */}
        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <View style={[styles.kpiIconBadge, { backgroundColor: 'rgba(40, 194, 255, 0.15)' }]}>
              <Ionicons name="pulse" size={22} color="#28C2FF" />
            </View>
            <View style={styles.kpiTextStack}>
              <Text style={styles.kpiNumber}>{stats.visitesAujourdhui}</Text>
              <Text style={styles.kpiLabel}>Consultations du jour</Text>
            </View>
          </View>

          <View style={styles.kpiCard}>
            <View style={[styles.kpiIconBadge, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
              <Ionicons name="time" size={22} color="#F59E0B" />
            </View>
            <View style={styles.kpiTextStack}>
              <Text style={styles.kpiNumber}>{stats.patientsEnAttente}</Text>
              <Text style={styles.kpiLabel}>Patients en attente</Text>
            </View>
          </View>

          <View style={styles.kpiCard}>
            <View style={[styles.kpiIconBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
              <Ionicons name="people" size={22} color="#10B981" />
            </View>
            <View style={styles.kpiTextStack}>
              <Text style={styles.kpiNumber}>{stats.totalPatients}</Text>
              <Text style={styles.kpiLabel}>Total Patients</Text>
            </View>
          </View>

          <View style={styles.kpiCard}>
            <View style={[styles.kpiIconBadge, { backgroundColor: 'rgba(168, 85, 247, 0.15)' }]}>
              <Ionicons name="person-add" size={22} color="#A855F7" />
            </View>
            <View style={styles.kpiTextStack}>
              <Text style={styles.kpiNumber}>{stats.nouveauxMois}</Text>
              <Text style={styles.kpiLabel}>Nouveaux ce mois</Text>
            </View>
          </View>
        </View>

        {/* ================= 2-COLUMN MAIN CONTENT GRID ================= */}
        <View style={isDesktop ? styles.desktopGrid : styles.mobileGrid}>
          {/* LEFT COLUMN (70%): CLINICAL ACTIVITY */}
          <View style={isDesktop ? styles.leftColumn : styles.fullWidthColumn}>
            {/* Merged Programme & Agenda Widget */}
            <View style={styles.cardSection}>
              <View style={styles.cardHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="calendar" size={20} color="#28C2FF" />
                  <Text style={styles.cardTitleText}>Programme & Rendez-vous</Text>
                </View>

                {/* Quick Agenda Filter Tabs */}
                <View style={styles.tabPillContainer}>
                  <TouchableOpacity
                    style={[styles.tabPill, activeAgendaTab === 'today' && styles.tabPillActive]}
                    onPress={() => setActiveAgendaTab('today')}
                  >
                    <Text style={[styles.tabPillText, activeAgendaTab === 'today' && styles.tabPillTextActive]}>
                      Aujourd'hui ({todayRdvs.length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.tabPill, activeAgendaTab === 'tomorrow' && styles.tabPillActive]}
                    onPress={() => setActiveAgendaTab('tomorrow')}
                  >
                    <Text style={[styles.tabPillText, activeAgendaTab === 'tomorrow' && styles.tabPillTextActive]}>
                      Demain ({tomorrowRdvs.length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.tabPill, activeAgendaTab === 'week' && styles.tabPillActive]}
                    onPress={() => setActiveAgendaTab('week')}
                  >
                    <Text style={[styles.tabPillText, activeAgendaTab === 'week' && styles.tabPillTextActive]}>
                      Cette semaine ({weekRdvs.length})
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Agenda Clean Table Header */}
              <View style={styles.tableHeader}>
                <Text style={[styles.thCell, { flex: 1.2 }]}>Heure</Text>
                <Text style={[styles.thCell, { flex: 3.5 }]}>Nom du patient</Text>
                <Text style={[styles.thCell, { flex: 3.5 }]}>Motif de consultation</Text>
                <Text style={[styles.thCell, { flex: 2, textAlign: 'right' }]}>Statut</Text>
              </View>

              {/* Agenda Rows */}
              {activeRdvs.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="calendar-clear-outline" size={36} color="#475569" />
                  <Text style={styles.emptyText}>Aucun rendez-vous programmé pour cette période.</Text>
                </View>
              ) : (
                activeRdvs.map((item, idx) => {
                  const dateObj = new Date(item.date_heure);
                  const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const dateShort = activeAgendaTab === 'week' ? ` (${dateObj.getDate()}/${dateObj.getMonth() + 1})` : '';

                  let badgeBg = '#334155';
                  let badgeText = '#94A3B8';
                  let label = item.statut;

                  if (item.statut === 'CONFIRME' || item.statut === 'EN_ATTENTE') {
                    badgeBg = 'rgba(245, 158, 11, 0.2)';
                    badgeText = '#F59E0B';
                    label = 'En attente';
                  } else if (item.statut === 'EN_COURS') {
                    badgeBg = 'rgba(168, 85, 247, 0.2)';
                    badgeText = '#A855F7';
                    label = 'En cours';
                  } else if (item.statut === 'REALISE' || item.statut === 'TERMINE') {
                    badgeBg = 'rgba(16, 185, 129, 0.2)';
                    badgeText = '#10B981';
                    label = 'Terminé';
                  } else if (item.statut === 'ANNULE') {
                    badgeBg = 'rgba(239, 68, 68, 0.2)';
                    badgeText = '#EF4444';
                    label = 'Annulé';
                  }

                  return (
                    <TouchableOpacity
                      key={item.id || idx}
                      style={styles.tableRow}
                      activeOpacity={0.7}
                      onPress={() => item.patient_id && router.push(`/patients/${item.patient_id}`)}
                    >
                      <View style={styles.timeBadgeBox}>
                        <Ionicons name="time-outline" size={13} color="#28C2FF" />
                        <Text style={styles.timeBadgeText}>
                          {timeStr}{dateShort}
                        </Text>
                      </View>

                      <Text style={[styles.tdCell, { flex: 3.5, fontWeight: 'bold', color: '#FFFFFF' }]} numberOfLines={1}>
                        {item.patient_name}
                      </Text>

                      <Text style={[styles.tdCell, { flex: 3.5, color: '#94A3B8' }]} numberOfLines={1}>
                        {item.motif}
                      </Text>

                      <View style={{ flex: 2, alignItems: 'flex-end' }}>
                        <View style={[styles.statusBadge, { backgroundColor: badgeBg }]}>
                          <Text style={[styles.statusBadgeText, { color: badgeText }]}>{label}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          </View>

          {/* RIGHT COLUMN (30%): QUICK ACCESS & STATS */}
          <View style={isDesktop ? styles.rightColumn : styles.fullWidthColumn}>
            {/* Dossiers Récents & Favoris */}
            <View style={styles.cardSection}>
              <View style={styles.cardHeaderSimple}>
                <Ionicons name="time" size={18} color="#28C2FF" />
                <Text style={styles.cardTitleText}>Dossiers Récents</Text>
              </View>

              {recents.length === 0 && favorites.length === 0 ? (
                <Text style={styles.emptyText}>Aucun dossier consulté récemment.</Text>
              ) : (
                <View style={{ gap: 10 }}>
                  {recents.slice(0, 5).map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.patientRecentRow}
                      activeOpacity={0.7}
                      onPress={() => router.push(`/patients/${p.id}`)}
                    >
                      <View style={styles.patientAvatarBox}>
                        <Text style={styles.avatarInitials}>
                          {(p.prenom?.[0] || '') + (p.nom?.[0] || '')}
                        </Text>
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={styles.patientNameText} numberOfLines={1}>
                          {p.prenom} {p.nom?.toUpperCase()}
                        </Text>
                        <Text style={styles.patientSubtext}>Dernier accès récent</Text>
                      </View>

                      <Ionicons name="chevron-forward" size={16} color="#64748B" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Pathologies Fréquentes */}
            <View style={styles.cardSection}>
              <View style={styles.cardHeaderSimple}>
                <Ionicons name="analytics" size={18} color="#28C2FF" />
                <Text style={styles.cardTitleText}>Pathologies Fréquentes</Text>
              </View>

              {stats.topPathologies.length === 0 ? (
                <Text style={styles.emptyText}>Aucune statistique médicale pour le moment.</Text>
              ) : (
                <View style={{ gap: 8 }}>
                  {stats.topPathologies.map((item, index) => (
                    <View key={item.name} style={styles.pathologyCardRow}>
                      <View style={styles.rankBadge}>
                        <Text style={styles.rankBadgeText}>#{index + 1}</Text>
                      </View>
                      <Text style={styles.pathologyTitle} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <View style={styles.countPill}>
                        <Text style={styles.countPillText}>{item.count} cas</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A', // Slate 900 dark theme
    ...Platform.select({
      web: {
        paddingTop: 72,
      },
      default: {},
    }),
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 20,
    paddingBottom: 40,
  },
  // Header Card
  headerCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  headerLeft: {
    flexDirection: 'column',
  },
  dateSubtext: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
    marginBottom: 4,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  btnQuickPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#28C2FF',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  btnQuickPrimaryText: {
    color: '#0F2C3D',
    fontWeight: 'bold',
    fontSize: 13,
  },
  btnQuickSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  btnQuickSecondaryText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  controlBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controlIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // KPI Grid
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  kpiCard: {
    flex: 1,
    minWidth: 160,
    backgroundColor: '#1E293B',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  kpiIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kpiTextStack: {
    flexDirection: 'column',
  },
  kpiNumber: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  kpiLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '500',
  },

  // 2-Column Responsive Layout
  desktopGrid: {
    flexDirection: 'row',
    gap: 20,
    alignItems: 'flex-start',
  },
  mobileGrid: {
    flexDirection: 'column',
    gap: 20,
  },
  leftColumn: {
    flex: 7,
    gap: 20,
  },
  rightColumn: {
    flex: 3,
    gap: 20,
  },
  fullWidthColumn: {
    width: '100%',
    gap: 20,
  },

  // Card Sections
  cardSection: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 18,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  cardHeaderSimple: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  cardTitleText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },

  // Agenda Filter Tabs
  tabPillContainer: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  tabPill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  tabPillActive: {
    backgroundColor: '#28C2FF',
  },
  tabPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  tabPillTextActive: {
    color: '#0F2C3D',
    fontWeight: 'bold',
  },

  // Table Agenda Styles
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  thCell: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#8AC8F9',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  tdCell: {
    fontSize: 13,
  },
  timeBadgeBox: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeBadgeText: {
    color: '#28C2FF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },

  // Patient Recents List (Right Column)
  patientRecentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 10,
  },
  patientAvatarBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    color: '#28C2FF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  patientNameText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  patientSubtext: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },

  // Pathologies Card List (Right Column)
  pathologyCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 10,
  },
  rankBadge: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  rankBadgeText: {
    color: '#28C2FF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  pathologyTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  countPill: {
    backgroundColor: '#334155',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  countPillText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
  },

  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
    gap: 8,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
  },
});
