/**
 * SessionScreen.tsx
 *
 * PT session UI with a mock-data simulation toggle.
 *
 * When mock mode is OFF  — the RepCounter is wired to receive live PoseFrames
 *   from the device camera / MediaPipe pipeline (not yet implemented).
 * When mock mode is ON   — a MockSimulation drives the RepCounter with a
 *   synthetic landmark stream so the counting logic can be exercised without
 *   a camera or model present.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  StyleSheet,
} from "react-native";

import { RepCounter, type RepEvent, type RepSession } from "../cv/repCounter";
import { SquatAnalyzer } from "../cv/exercises/squat";
import { PushupAnalyzer } from "../cv/exercises/pushup";
import { MockSimulation } from "../cv/mockSimulation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ExerciseId = "squat" | "pushup";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SessionScreen() {
  const [exerciseId, setExerciseId] = useState<ExerciseId>("squat");
  const [mockMode, setMockMode] = useState(false);
  const [repCount, setRepCount] = useState(0);
  const [lastEvent, setLastEvent] = useState<RepEvent | null>(null);
  const [paused, setPaused] = useState(false);
  const [session, setSession] = useState<RepSession | null>(null);

  const counterRef = useRef<RepCounter | null>(null);
  const simRef = useRef<MockSimulation | null>(null);

  // ------------------------------------------------------------------
  // Rep callback — updates UI on every accepted rep
  // ------------------------------------------------------------------
  const handleRep = useCallback((event: RepEvent) => {
    setRepCount(event.repIndex);
    setLastEvent(event);
  }, []);

  // ------------------------------------------------------------------
  // Start / stop the mock simulation whenever toggle or exercise changes
  // ------------------------------------------------------------------
  useEffect(() => {
    // Tear down any running simulation
    simRef.current?.stop();
    simRef.current = null;
    counterRef.current = null;
    setRepCount(0);
    setLastEvent(null);
    setPaused(false);
    setSession(null);

    if (!mockMode) return;

    const analyzer =
      exerciseId === "squat" ? new SquatAnalyzer() : new PushupAnalyzer();
    const counter = new RepCounter(analyzer, 10);
    counterRef.current = counter;

    const sim = new MockSimulation(exerciseId, counter, handleRep);
    simRef.current = sim;
    sim.start();

    return () => {
      sim.stop();
    };
  }, [mockMode, exerciseId, handleRep]);

  // ------------------------------------------------------------------
  // Pause / resume
  // ------------------------------------------------------------------
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

  // ------------------------------------------------------------------
  // End session
  // ------------------------------------------------------------------
  const endSession = () => {
    simRef.current?.stop();
    const s = counterRef.current?.endSession() ?? null;
    setSession(s);
    setMockMode(false);
  };

  // ------------------------------------------------------------------
  // Form score colour
  // ------------------------------------------------------------------
  const scoreColor = (score: number) => {
    if (score >= 80) return "#16a34a"; // green
    if (score >= 60) return "#d97706"; // amber
    return "#dc2626";                  // red
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <View style={styles.root}>
      {/* Header */}
      <Text style={styles.title}>PT Session</Text>

      {/* Exercise selector */}
      <View style={styles.exerciseRow}>
        {(["squat", "pushup"] as ExerciseId[]).map((id) => (
          <TouchableOpacity
            key={id}
            style={[
              styles.exerciseBtn,
              exerciseId === id && styles.exerciseBtnActive,
            ]}
            onPress={() => setExerciseId(id)}
          >
            <Text
              style={[
                styles.exerciseBtnText,
                exerciseId === id && styles.exerciseBtnTextActive,
              ]}
            >
              {id.charAt(0).toUpperCase() + id.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Mock-mode toggle */}
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Mock data</Text>
        <Switch value={mockMode} onValueChange={setMockMode} />
      </View>
      {mockMode && (
        <Text style={styles.mockBadge}>SIMULATED STREAM</Text>
      )}

      {/* Rep counter */}
      <Text style={styles.repCount}>{repCount}</Text>
      <Text style={styles.repLabel}>REPS</Text>

      {/* Last form event */}
      {lastEvent && (
        <View style={styles.formCard}>
          <Text
            style={[styles.formScore, { color: scoreColor(lastEvent.formScore) }]}
          >
            Form {lastEvent.formScore}/100
          </Text>
          {lastEvent.flags.length > 0 && (
            <Text style={styles.flags}>{lastEvent.flags.join("  ·  ")}</Text>
          )}
          <Text style={styles.duration}>
            {(lastEvent.durationMs / 1000).toFixed(1)} s/rep
          </Text>
        </View>
      )}

      {/* Controls */}
      {mockMode && (
        <View style={styles.controlRow}>
          <TouchableOpacity style={styles.ctrlBtn} onPress={togglePause}>
            <Text style={styles.ctrlBtnText}>{paused ? "Resume" : "Pause"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.ctrlBtn, styles.endBtn]}
            onPress={endSession}
          >
            <Text style={styles.ctrlBtnText}>End Session</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Session summary (shown after endSession) */}
      {session && (
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>Session Summary</Text>
          <Text style={styles.summaryLine}>
            Exercise: {session.exerciseId}
          </Text>
          <Text style={styles.summaryLine}>
            Completed: {session.completedReps} / {session.targetReps} reps
          </Text>
          {session.events.length > 0 && (
            <Text style={styles.summaryLine}>
              Avg form:{" "}
              {Math.round(
                session.events.reduce((s, e) => s + e.formScore, 0) /
                  session.events.length,
              )}
              /100
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f9fafb",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 20,
  },
  exerciseRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  exerciseBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#d1d5db",
    backgroundColor: "#ffffff",
  },
  exerciseBtnActive: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  exerciseBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  exerciseBtnTextActive: {
    color: "#ffffff",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  toggleLabel: {
    fontSize: 15,
    color: "#6b7280",
  },
  mockBadge: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "#7c3aed",
    marginBottom: 16,
  },
  repCount: {
    fontSize: 100,
    fontWeight: "900",
    color: "#2563eb",
    lineHeight: 110,
    marginTop: 10,
  },
  repLabel: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 4,
    color: "#9ca3af",
    marginBottom: 24,
  },
  formCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16,
    minWidth: 240,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 24,
  },
  formScore: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  flags: {
    fontSize: 12,
    color: "#ef4444",
    marginBottom: 4,
    textAlign: "center",
  },
  duration: {
    fontSize: 12,
    color: "#9ca3af",
  },
  controlRow: {
    flexDirection: "row",
    gap: 12,
  },
  ctrlBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#2563eb",
  },
  endBtn: {
    backgroundColor: "#6b7280",
  },
  ctrlBtnText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 15,
  },
  summary: {
    marginTop: 28,
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    padding: 16,
    minWidth: 240,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  summaryLine: {
    fontSize: 14,
    color: "#374151",
    marginBottom: 4,
  },
});
