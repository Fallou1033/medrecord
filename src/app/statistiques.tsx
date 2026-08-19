import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Platform,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { getPatients, getConsultations } from '../database/SQLiteDatabaseManager';
import { useSecurity } from '../security/SecurityContext';

interface Stats {
  totalPatients: number;
  visitesAujourdhui: number;
  nouveauxMois: number;
  patientsM: number;
  patientsF: number;
  topPathologies: { name: string; count: number }[];
}

export default function StatistiquesScreen() {
  const router = useRouter();
  const { user } = useSecurity();
  const [stats, setStats] = useState<Stats>({
    totalPatients: 0,
    visitesAujourdhui: 0,
    nouveauxMois: 0,
    patientsM: 0,
    patientsF: 0,
    topPathologies: [],
  });
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    React.useCallback(() => {
      loadStats();
    }, [user?.id])
  );

  const loadStats = async () => {
    setLoading(true);
    try {
      const allPatients = await getPatients(user?.id);
      const allVisites = await getConsultations(user?.id);

      const todayStr = new Date().toISOString().split('T')[0];
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      let mCount = 0;
      let fCount = 0;
      let newMois = 0;

      allPatients.forEach((p) => {
        if (p.sexe === 'M') mCount++;
        if (p.sexe === 'F') fCount++;

        if (p.created_at) {
          const cDate = new Date(p.created_at);
          if (cDate.getMonth() === currentMonth && cDate.getFullYear() === currentYear) {
            newMois++;
          }
        }
      });

      let visitsToday = 0;
      const pathMap: { [key: string]: number } = {};

      allVisites.forEach((v: any) => {
        if (v.date && v.date.startsWith(todayStr)) {
          visitsToday++;
        }

        if (v.diagnostic && typeof v.diagnostic === 'string' && v.diagnostic.trim().length > 0) {
          const cleanDiag = v.diagnostic.trim();
          pathMap[cleanDiag] = (pathMap[cleanDiag] || 0) + 1;
        }
      });

      const topPathologies = Object.keys(pathMap)
        .map((key) => ({ name: key, count: pathMap[key] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      setStats({
        totalPatients: allPatients.length,
        visitesAujourdhui: visitsToday,
        nouveauxMois: newMois,
        patientsM: mCount,
        patientsF: fCount,
        topPathologies,
      });
    } catch (e) {
      console.error('Failed to load stats:', e);
    } finally {
      setLoading(false);
    }
  };

  const mPercentage = stats.totalPatients > 0 ? Math.round((stats.patientsM / stats.totalPatients) * 100) : 0;
  const fPercentage = stats.totalPatients > 0 ? Math.round((stats.patientsF / stats.totalPatients) * 100) : 0;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Statistiques & Activité</Text>
          <Text style={styles.headerSubtitle}>Analyse clinique et activité du cabinet médical</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadStats}>
          <Ionicons name="refresh-outline" size={20} color="#28C2FF" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#28C2FF" />
          <Text style={styles.loadingText}>Chargement des statistiques...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* KPI Cards */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Ionicons name="people" size={26} color="#28C2FF" style={styles.statIcon} />
              <Text style={styles.statNumber}>{stats.totalPatients}</Text>
              <Text style={styles.statLabel}>Total Patients</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="clipboard" size={26} color="#2ECC71" style={styles.statIcon} />
              <Text style={styles.statNumber}>{stats.visitesAujourdhui}</Text>
              <Text style={styles.statLabel}>Visites Aujourd'hui</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="person-add" size={26} color="#E67E22" style={styles.statIcon} />
              <Text style={styles.statNumber}>{stats.nouveauxMois}</Text>
              <Text style={styles.statLabel}>Nouveaux ce Mois</Text>
            </View>
          </View>

          {/* Démographie Patients */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="pie-chart-outline" size={20} color="#28C2FF" />
              <Text style={styles.cardTitle}>Démographie Patients</Text>
            </View>
            
            <View style={styles.genderRow}>
              <Text style={styles.genderLabel}>Hommes ({stats.patientsM})</Text>
              <Text style={styles.genderLabel}>Femmes ({stats.patientsF})</Text>
            </View>
            
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarM, { width: `${mPercentage}%` }]} />
              <View style={[styles.progressBarF, { width: `${fPercentage}%` }]} />
            </View>

            <View style={styles.genderRow}>
              <Text style={[styles.genderPct, { color: '#8AC8F9' }]}>{mPercentage}% Hommes</Text>
              <Text style={[styles.genderPct, { color: '#FFB2C9' }]}>{fPercentage}% Femmes</Text>
            </View>
          </View>

          {/* Pathologies Fréquentes */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="pulse-outline" size={20} color="#E67E22" />
              <Text style={styles.cardTitle}>Pathologies les plus Fréquentes</Text>
            </View>

            {stats.topPathologies.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="medical-outline" size={32} color="#2F5C77" />
                <Text style={styles.emptyCardText}>Aucun diagnostic enregistré pour le moment.</Text>
              </View>
            ) : (
              stats.topPathologies.map((item, index) => (
                <View key={item.name} style={styles.pathologyRow}>
                  <View style={styles.pathologyLeft}>
                    <View style={styles.rankBadge}>
                      <Text style={styles.rankText}>#{index + 1}</Text>
                    </View>
                    <Text style={styles.pathologyName} numberOfLines={1}>{item.name}</Text>
                  </View>
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>{item.count} cas</Text>
                  </View>
                </View>
              ))
            )}
          </View>
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
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E3E52',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2F5C77',
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
    gap: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1E3E52',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2F5C77',
  },
  statIcon: {
    marginBottom: 8,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: '#8AC8F9',
    textAlign: 'center',
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#1E3E52',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2F5C77',
    gap: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2F5C77',
    paddingBottom: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  genderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  genderLabel: {
    fontSize: 13,
    color: '#E0F2FE',
    fontWeight: '500',
  },
  genderPct: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  progressBarBg: {
    height: 12,
    backgroundColor: '#0F2C3D',
    borderRadius: 6,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  progressBarM: {
    backgroundColor: '#28C2FF',
    height: '100%',
  },
  progressBarF: {
    backgroundColor: '#FF6B8B',
    height: '100%',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  emptyCardText: {
    color: '#8AC8F9',
    fontSize: 13,
    textAlign: 'center',
  },
  pathologyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2F5C77',
  },
  pathologyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0F2C3D',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankText: {
    color: '#28C2FF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  pathologyName: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
    flex: 1,
  },
  countBadge: {
    backgroundColor: '#0F2C3D',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countText: {
    color: '#28C2FF',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
