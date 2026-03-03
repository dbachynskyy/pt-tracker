import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api, AdherenceSummary, Plan } from '../../src/api/client';
import { useAuth } from '../../src/hooks/useAuth';
import { DashboardSkeleton } from '../../src/components/Skeleton';

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [summary, setSummary] = useState<AdherenceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [plansData, summaryData] = await Promise.all([
        api.listPlans(),
        api.getAdherenceSummary(),
      ]);
      setPlans(plansData);
      setSummary(summaryData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
      setRetrying(false);
    }
  }, []);

  const retry = useCallback(() => {
    setRetrying(true);
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  const activePlan = plans[0] ?? null;

  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>
        Hello{user?.full_name ? `, ${user.full_name}` : ''}!
      </Text>
      <Text style={styles.title}>Today's Plan</Text>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={retry} disabled={retrying}>
            <Text style={styles.retryText}>{retrying ? 'Loading…' : 'Retry'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          {summary && (
            <View style={styles.statsRow}>
              <StatCard label="Streak" value={`${summary.streak_days}d`} accent="#2563EB" />
              <StatCard label="7-day" value={String(summary.completed_7d)} accent="#059669" />
              <StatCard label="30-day" value={String(summary.completed_30d)} accent="#D97706" />
            </View>
          )}

          {activePlan ? (
            <>
              <Text style={styles.planName}>{activePlan.name}</Text>
              <FlatList
                data={activePlan.exercises}
                keyExtractor={(_, i) => String(i)}
                style={styles.list}
                renderItem={({ item }) => (
                  <View style={styles.exerciseRow}>
                    <Text style={styles.exerciseName}>{item.name}</Text>
                    <Text style={styles.exerciseMeta}>
                      {item.sets} × {item.reps}
                      {item.hold_seconds > 0 ? ` · ${item.hold_seconds}s hold` : ''}
                    </Text>
                  </View>
                )}
              />
            </>
          ) : (
            !error && <Text style={styles.empty}>No plan assigned yet.</Text>
          )}
        </>
      )}

      <TouchableOpacity
        style={styles.button}
        onPress={() => router.push('/(tabs)/session')}
      >
        <Text style={styles.buttonText}>Start Session</Text>
      </TouchableOpacity>
    </View>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#F9FAFB' },
  greeting: { fontSize: 15, color: '#6B7280', marginTop: 16, marginBottom: 4 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 16, color: '#111827' },

  errorBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: { color: '#DC2626', fontSize: 13, flex: 1 },
  retryText: { color: '#2563EB', fontSize: 13, fontWeight: '600', marginLeft: 8 },

  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statValue: { fontSize: 22, fontWeight: '800', marginBottom: 2 },
  statLabel: { fontSize: 11, color: '#6B7280', fontWeight: '500', textTransform: 'uppercase' },

  planName: { fontSize: 18, fontWeight: '600', color: '#2563EB', marginBottom: 12 },
  list: { flex: 1, marginBottom: 16 },
  exerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  exerciseName: { fontSize: 16, fontWeight: '500', color: '#111827' },
  exerciseMeta: { fontSize: 14, color: '#6B7280' },
  empty: { color: '#6B7280', fontSize: 16, textAlign: 'center', marginTop: 40, flex: 1 },
  button: {
    backgroundColor: '#2563EB',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
