import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Switch, TouchableOpacity, StyleSheet } from 'react-native';

import type { RepEvent, RepSession, PoseFrame } from '../cv/repCounter';
import { MockSimulation } from '../cv/mockSimulation';
import { StabilizedRepCounter } from '../cv/calibrationStabilization';
import { EXERCISE_IDS, EXERCISE_LABELS, type ExerciseId, createAnalyzer } from '../cv/exerciseRegistry';
import { SessionTelemetryTracker } from '../cv/sessionTelemetry';
import { ReadinessArtifactPipeline } from '../cv/sessionArtifactPipeline';

export function SessionScreen() {
  const [exerciseId, setExerciseId] = useState<ExerciseId>('squat');
  const [mockMode, setMockMode] = useState(false);
  const [repCount, setRepCount] = useState(0);
  const [lastEvent, setLastEvent] = useState<RepEvent | null>(null);
  const [paused, setPaused] = useState(false);
  const [session, setSession] = useState<RepSession | null>(null);
  const [calStatus, setCalStatus] = useState('UNCALIBRATED');
  const [calFrames, setCalFrames] = useState(0);
  const [calRange, setCalRange] = useState(0);

  const counterRef = useRef<StabilizedRepCounter | null>(null);
  const simRef = useRef<MockSimulation | null>(null);
  const telemetryRef = useRef(new SessionTelemetryTracker());
  const artifactPipelineRef = useRef(new ReadinessArtifactPipeline());

  const handleRep = useCallback((event: RepEvent) => {
    setRepCount(event.repIndex);
    setLastEvent(event);
    telemetryRef.current.onRep(exerciseId, event.repIndex);
  }, [exerciseId]);

  const handleFrame = useCallback((frame: PoseFrame, sessionMs: number) => {
    const c = counterRef.current;
    if (!c) return;
    const st = c.getCalibrationState();
    setCalStatus(st.status);
    setCalFrames(st.framesSeen);
    setCalRange(st.range);
    telemetryRef.current.onFrame(exerciseId, st.status, sessionMs, frame.source === 'disconnected', st.reason);
  }, [exerciseId]);

  useEffect(() => {
    simRef.current?.stop();
    simRef.current = null;
    counterRef.current = null;
    setRepCount(0);
    setLastEvent(null);
    setPaused(false);
    setSession(null);
    setCalStatus('UNCALIBRATED');
    setCalFrames(0);
    setCalRange(0);

    if (!mockMode) return;

    telemetryRef.current.startExercise(exerciseId, 0);
    const analyzer = createAnalyzer(exerciseId);
    const counter = new StabilizedRepCounter(analyzer, 10);
    counterRef.current = counter;

    const sim = new MockSimulation(exerciseId, counter, handleRep, handleFrame);
    simRef.current = sim;
    sim.start();

    return () => sim.stop();
  }, [mockMode, exerciseId, handleRep, handleFrame]);

  const togglePause = () => {
    if (!counterRef.current) return;
    if (paused) {
      counterRef.current.resume();
      simRef.current?.start();
    } else {
      simRef.current?.stop();
    }
    setPaused((p) => !p);
  };

  const endSession = () => {
    simRef.current?.stop();
    setSession(counterRef.current?.endSession() ?? null);
    const sessionId = `session-${exerciseId}-${Date.now()}`;
    artifactPipelineRef.current.endSession({
      sessionId,
      tracker: telemetryRef.current,
      outputPath: process?.env?.ORION_READINESS_ARTIFACT_PATH,
    });
    setMockMode(false);
  };

  const scoreColor = (score: number) => (score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626');
  const t = telemetryRef.current.getExercise(exerciseId);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>PT Session</Text>
      <View style={styles.exerciseRowWrap}>
        {EXERCISE_IDS.map((id) => (
          <TouchableOpacity key={id} style={[styles.exerciseBtn, exerciseId === id && styles.exerciseBtnActive]} onPress={() => setExerciseId(id)}>
            <Text style={[styles.exerciseBtnText, exerciseId === id && styles.exerciseBtnTextActive]}>{EXERCISE_LABELS[id]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.toggleRow}><Text style={styles.toggleLabel}>Mock data</Text><Switch value={mockMode} onValueChange={setMockMode} /></View>
      {mockMode && <Text style={styles.mockBadge}>SIMULATED STREAM</Text>}

      <Text style={styles.repCount}>{repCount}</Text>
      <Text style={styles.repLabel}>REPS</Text>

      <View style={styles.calCard}>
        <Text style={styles.calText}>Calibration: {calStatus}</Text>
        <Text style={styles.calText}>Frames: {calFrames}</Text>
        <Text style={styles.calText}>Range: {calRange.toFixed(2)}</Text>
        <Text style={styles.calText}>Disconnected frames: {t?.disconnectedFrames ?? 0}</Text>
        <Text style={styles.calText}>Readiness reason: {t?.readinessReason ?? 'n/a'}</Text>
      </View>

      {lastEvent && (
        <View style={styles.formCard}>
          <Text style={[styles.formScore, { color: scoreColor(lastEvent.formScore) }]}>Form {lastEvent.formScore}/100</Text>
          {lastEvent.flags.length > 0 && <Text style={styles.flags}>{lastEvent.flags.join('  ·  ')}</Text>}
          <Text style={styles.duration}>{(lastEvent.durationMs / 1000).toFixed(1)} s/rep</Text>
        </View>
      )}

      {mockMode && (
        <View style={styles.controlRow}>
          <TouchableOpacity style={styles.ctrlBtn} onPress={togglePause}><Text style={styles.ctrlBtnText}>{paused ? 'Resume' : 'Pause'}</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.ctrlBtn, styles.endBtn]} onPress={endSession}><Text style={styles.ctrlBtnText}>End Session</Text></TouchableOpacity>
        </View>
      )}

      {session && (
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>Session Summary</Text>
          <Text style={styles.summaryLine}>Exercise: {session.exerciseId}</Text>
          <Text style={styles.summaryLine}>Completed: {session.completedReps} / {session.targetReps} reps</Text>
          <Text style={styles.summaryLine}>Cal status: {t?.calibrationStatus ?? 'n/a'}</Text>
          <Text style={styles.summaryLine}>Ready at: {t?.readyAtMs ?? 'n/a'}</Text>
          <Text style={styles.summaryLine}>Readiness reason: {t?.readinessReason ?? 'n/a'}</Text>
          <Text style={styles.summaryLine}>Disconnected frames: {t?.disconnectedFrames ?? 0}</Text>
          <Text style={styles.summaryLine}>Readiness reason: {t?.readinessReason ?? 'n/a'}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: '700', color: '#111827', marginBottom: 20 },
  exerciseRowWrap: { flexDirection: 'row', gap: 8, marginBottom: 20, flexWrap: 'wrap', justifyContent: 'center' },
  exerciseBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#d1d5db', backgroundColor: '#fff' },
  exerciseBtnActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  exerciseBtnText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  exerciseBtnTextActive: { color: '#fff' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  toggleLabel: { fontSize: 15, color: '#6b7280' },
  mockBadge: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: '#7c3aed', marginBottom: 16 },
  repCount: { fontSize: 100, fontWeight: '900', color: '#2563eb', lineHeight: 110, marginTop: 10 },
  repLabel: { fontSize: 14, fontWeight: '600', letterSpacing: 4, color: '#9ca3af', marginBottom: 16 },
  calCard: { backgroundColor: '#eef2ff', borderRadius: 10, padding: 10, marginBottom: 10, minWidth: 220 },
  calText: { fontSize: 12, color: '#374151' },
  formCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, minWidth: 240, alignItems: 'center', marginBottom: 24 },
  formScore: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  flags: { fontSize: 12, color: '#ef4444', marginBottom: 4, textAlign: 'center' },
  duration: { fontSize: 12, color: '#9ca3af' },
  controlRow: { flexDirection: 'row', gap: 12 },
  ctrlBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, backgroundColor: '#2563eb' },
  endBtn: { backgroundColor: '#6b7280' },
  ctrlBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  summary: { marginTop: 28, backgroundColor: '#f3f4f6', borderRadius: 12, padding: 16, minWidth: 240 },
  summaryTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 8 },
  summaryLine: { fontSize: 14, color: '#374151', marginBottom: 4 },
});
