import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api, Plan } from '../../src/api/client';
import { useAuth } from '../../src/hooks/useAuth';

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setPlans(await api.listPlans());
    } catch {
      // silently ignore for MVP
    } finally {
      setLoading(false);
    }
  }, []);

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

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : activePlan ? (
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
        <Text style={styles.empty}>No plan assigned yet.</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#F9FAFB' },
  greeting: { fontSize: 15, color: '#6B7280', marginTop: 16, marginBottom: 4 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 16, color: '#111827' },
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
