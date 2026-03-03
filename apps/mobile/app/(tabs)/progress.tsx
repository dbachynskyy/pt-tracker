import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api, Session, SessionStatus } from '../../src/api/client';

const STATUS_COLOR: Record<SessionStatus, string> = {
  completed: '#059669',
  in_progress: '#D97706',
  skipped: '#6B7280',
};

export default function ProgressScreen() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.listSessions();
      setSessions([...data].reverse());
    } catch {
      // silently ignore for MVP
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Progress</Text>
      <Text style={styles.summary}>
        {sessions.filter((s) => s.status === 'completed').length} sessions completed
      </Text>

      {sessions.length === 0 ? (
        <Text style={styles.empty}>No sessions yet — start one!</Text>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.date}>
                  {new Date(item.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </Text>
                <Text style={[styles.status, { color: STATUS_COLOR[item.status] }]}>
                  {item.status.replace('_', ' ')}
                </Text>
              </View>
              <Text style={styles.exercises}>
                {item.exercises_completed.length} exercises logged
                {item.pain_level != null ? ` · pain ${item.pain_level}/10` : ''}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#F9FAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '700', marginTop: 16, marginBottom: 4, color: '#111827' },
  summary: { fontSize: 14, color: '#6B7280', marginBottom: 20 },
  empty: { color: '#6B7280', fontSize: 16, textAlign: 'center', marginTop: 40 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  date: { fontSize: 15, fontWeight: '600', color: '#111827' },
  status: { fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  exercises: { fontSize: 13, color: '#6B7280' },
});
