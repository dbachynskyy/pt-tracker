/**
 * sessionQuality.ts
 *
 * Post-session analysis: aggregate quality metrics and anomaly detection.
 *
 * Anomalies detected:
 *   SUSPICIOUSLY_UNIFORM_SCORES – all reps share an identical formScore of 100
 *                                 (≥ 3 reps required; possible bypass / dummy data)
 *   SCORE_CLIFF                 – any consecutive rep pair drops > 40 formScore points
 *   DURATION_SPIKE              – any single rep's durationMs > 3× the session median
 *   RAPID_DEGRADATION           – first 3 reps had no flags, last 3 all have flags
 *                                 (fatigue or cheating pattern; ≥ 6 reps required)
 */

import type { RepSession } from "./repCounter";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SessionAnomaly =
  | "SUSPICIOUSLY_UNIFORM_SCORES"
  | "SCORE_CLIFF"
  | "DURATION_SPIKE"
  | "RAPID_DEGRADATION";

export interface SessionQualityReport {
  /** Mean formScore across all reps (NaN for empty sessions). */
  averageFormScore: number;
  /** Number of reps that carry at least one FormFlag. */
  flaggedRepCount: number;
  /** flaggedRepCount / total reps × 100 (0 for empty sessions). */
  flaggedRepPct: number;
  /** Detected session-level anomalies. */
  anomalies: SessionAnomaly[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function evaluateSession(session: RepSession): SessionQualityReport {
  const events = session.events;
  const n = events.length;

  // --- Basic metrics -------------------------------------------------------
  const averageFormScore =
    n === 0
      ? NaN
      : events.reduce((sum, e) => sum + e.formScore, 0) / n;

  const flaggedRepCount = events.filter((e) => e.flags.length > 0).length;
  const flaggedRepPct = n === 0 ? 0 : (flaggedRepCount / n) * 100;

  // --- Anomaly detection ---------------------------------------------------
  const anomalies: SessionAnomaly[] = [];

  // SUSPICIOUSLY_UNIFORM_SCORES: all reps score exactly 100 (≥3 reps)
  if (n >= 3 && events.every((e) => e.formScore === 100)) {
    anomalies.push("SUSPICIOUSLY_UNIFORM_SCORES");
  }

  // SCORE_CLIFF: any consecutive pair drops > 40 points
  for (let i = 1; i < n; i++) {
    if (events[i - 1].formScore - events[i].formScore > 40) {
      anomalies.push("SCORE_CLIFF");
      break;
    }
  }

  // DURATION_SPIKE: any rep > 3× median duration
  if (n > 0) {
    const med = median(events.map((e) => e.durationMs));
    if (events.some((e) => e.durationMs > 3 * med)) {
      anomalies.push("DURATION_SPIKE");
    }
  }

  // RAPID_DEGRADATION: first 3 reps clean, last 3 all flagged (≥6 reps)
  if (n >= 6) {
    const firstThreeClean = events.slice(0, 3).every((e) => e.flags.length === 0);
    const lastThreeAllFlagged = events.slice(-3).every((e) => e.flags.length > 0);
    if (firstThreeClean && lastThreeAllFlagged) {
      anomalies.push("RAPID_DEGRADATION");
    }
  }

  return { averageFormScore, flaggedRepCount, flaggedRepPct, anomalies };
}
