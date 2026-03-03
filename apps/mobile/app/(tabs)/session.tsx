import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { api, Session } from '../../src/api/client';
import { CVStatsCard } from '../../src/components/CVStatsCard';
import { ExerciseSelector } from '../../src/components/ExerciseSelector';
import { createDetector } from '../../src/cv/mockDetector';
import { Detector, DetectorOutput, ExerciseType, EXERCISE_LABELS } from '../../src/cv/types';

type Phase = 'idle' | 'active' | 'done';

export default function SessionScreen() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<ExerciseType>('squat');
  const [detectorOutput, setDetectorOutput] = useState<DetectorOutput | null>(null);
  const [finalOutput, setFinalOutput] = useState<DetectorOutput | null>(null);

  const detectorRef = useRef<Detector | null>(null);

  const startDetector = useCallback((type: ExerciseType) => {
    const det = createDetector(type);
    detectorRef.current = det;
    det.start((output) => setDetectorOutput(output));
  }, []);

  const stopDetector = useCallback(() => {
    detectorRef.current?.stop();
    detectorRef.current = null;
  }, []);

  const startSession = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api.createSession({});
      setSession(s);
      setDetectorOutput(null);
      setFinalOutput(null);
      setPhase('active');
      startDetector(selectedExercise);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to start session');
    } finally {
      setLoading(false);
    }
  }, [selectedExercise, startDetector]);

  const completeSession = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    stopDetector();
    const lastOutput = detectorOutput;
    setFinalOutput(lastOutput);
    try {
      const s = await api.completeSession(session.id);
      setSession(s);
      setPhase('done');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to complete session');
      // Restart detector so the user can retry.
      startDetector(selectedExercise);
    } finally {
      setLoading(false);
    }
  }, [session, detectorOutput, selectedExercise, stopDetector, startDetector]);

  const reset = useCallback(() => {
    stopDetector();
    setPhase('idle');
    setSession(null);
    setDetectorOutput(null);
    setFinalOutput(null);
  }, [stopDetector]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Exercise Session</Text>

      {phase === 'idle' && (
        <>
          <ExerciseSelector
            selected={selectedExercise}
            onSelect={setSelectedExercise}
          />
          <Text style={styles.subtitle}>Ready to start your PT session?</Text>
          <TouchableOpacity
            style={styles.startBtn}
            onPress={startSession}
            disabled={loading}
            testID="start-session-btn"
          >
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

          <View style={styles.exerciseBadgeRow}>
            <View style={styles.exerciseBadge}>
              <Text style={styles.exerciseBadgeText}>
                {EXERCISE_LABELS[selectedExercise]}
              </Text>
            </View>
          </View>

          {detectorOutput ? (
            <CVStatsCard output={detectorOutput} />
          ) : (
            <View style={styles.detectorWaiting} testID="detector-waiting">
              <ActivityIndicator color="#2563EB" />
              <Text style={styles.detectorWaitingText}>Detecting…</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.completeBtn, loading && styles.btnDisabled]}
            onPress={completeSession}
            disabled={loading}
            testID="complete-session-btn"
          >
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
          {finalOutput && <CVStatsCard output={finalOutput} />}
          <TouchableOpacity
            style={styles.startBtn}
            onPress={reset}
            testID="start-another-btn"
          >
            <Text style={styles.btnText}>Start Another</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 32,
    backgroundColor: '#F9FAFB',
  },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 24, color: '#111827' },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 24,
    alignSelf: 'center',
    maxWidth: 280,
  },
  badge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  badgeText: { color: '#D97706', fontWeight: '600', fontSize: 13 },
  sessionId: { fontSize: 12, color: '#9CA3AF', marginBottom: 16, fontFamily: 'monospace' },
  exerciseBadgeRow: { flexDirection: 'row', marginBottom: 4 },
  exerciseBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  exerciseBadgeText: { color: '#2563EB', fontWeight: '600', fontSize: 13 },
  detectorWaiting: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginVertical: 20,
  },
  detectorWaitingText: { color: '#6B7280', fontSize: 14 },
  doneText: { fontSize: 24, fontWeight: '700', color: '#059669', marginBottom: 8 },
  startBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  completeBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
