import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { api, Session } from '../../src/api/client';

type Phase = 'idle' | 'active' | 'done';

export default function SessionScreen() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);

  const startSession = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api.createSession({});
      setSession(s);
      setPhase('active');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to start session');
    } finally {
      setLoading(false);
    }
  }, []);

  const completeSession = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const s = await api.completeSession(session.id);
      setSession(s);
      setPhase('done');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to complete session');
    } finally {
      setLoading(false);
    }
  }, [session]);

  const reset = () => {
    setPhase('idle');
    setSession(null);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Exercise Session</Text>

      {phase === 'idle' && (
        <>
          <Text style={styles.subtitle}>Ready to start your PT session?</Text>
          <TouchableOpacity style={styles.startBtn} onPress={startSession} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Start Session</Text>
            )}
          </TouchableOpacity>
        </>
      )}

      {phase === 'active' && session && (
        <>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>In Progress</Text>
          </View>
          <Text style={styles.sessionId}>ID: {session.id.slice(0, 8)}…</Text>
          <Text style={styles.subtitle}>
            Do your exercises, then tap Complete when finished.
          </Text>
          <TouchableOpacity style={styles.completeBtn} onPress={completeSession} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Complete Session</Text>
            )}
          </TouchableOpacity>
        </>
      )}

      {phase === 'done' && (
        <>
          <Text style={styles.doneText}>Session complete!</Text>
          <Text style={styles.subtitle}>Great work. Keep up the streak.</Text>
          <TouchableOpacity style={styles.startBtn} onPress={reset}>
            <Text style={styles.btnText}>Start Another</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F9FAFB',
  },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 8, color: '#111827' },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
    maxWidth: 280,
  },
  badge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 8,
  },
  badgeText: { color: '#D97706', fontWeight: '600', fontSize: 13 },
  sessionId: { fontSize: 12, color: '#9CA3AF', marginBottom: 20, fontFamily: 'monospace' },
  doneText: { fontSize: 24, fontWeight: '700', color: '#059669', marginBottom: 8 },
  startBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
  },
  completeBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
