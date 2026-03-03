/**
 * sessionQuality.test.ts — evaluateSession() unit tests.
 */

import { evaluateSession } from "../sessionQuality";
import type { RepSession, RepEvent, FormFlag, ExercisePhase } from "../repCounter";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<RepEvent> = {}, index = 1): RepEvent {
  return {
    repIndex: index,
    durationMs: 1500,
    phase: "UP" as ExercisePhase,
    formScore: 100,
    flags: [] as FormFlag[],
    auditSnapshot: Array(12).fill(0),
    ...overrides,
  };
}

function makeSession(events: RepEvent[]): RepSession {
  return {
    exerciseId: "squat",
    targetReps: events.length,
    completedReps: events.length,
    events,
    startedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Basic metrics
// ---------------------------------------------------------------------------

describe("evaluateSession — basic metrics", () => {
  it("returns NaN averageFormScore and 0 flaggedRepPct for an empty session", () => {
    const report = evaluateSession(makeSession([]));
    expect(report.averageFormScore).toBeNaN();
    expect(report.flaggedRepPct).toBe(0);
    expect(report.flaggedRepCount).toBe(0);
  });

  it("computes average formScore correctly", () => {
    const session = makeSession([
      makeEvent({ formScore: 100 }, 1),
      makeEvent({ formScore: 80 }, 2),
      makeEvent({ formScore: 60 }, 3),
    ]);
    const report = evaluateSession(session);
    expect(report.averageFormScore).toBeCloseTo(80);
  });

  it("counts flagged reps and computes flaggedRepPct", () => {
    const session = makeSession([
      makeEvent({ flags: [] }, 1),
      makeEvent({ flags: ["KNEES_CAVING"], formScore: 80 }, 2),
      makeEvent({ flags: ["INSUFFICIENT_DEPTH"], formScore: 80 }, 3),
      makeEvent({ flags: [] }, 4),
    ]);
    const report = evaluateSession(session);
    expect(report.flaggedRepCount).toBe(2);
    expect(report.flaggedRepPct).toBeCloseTo(50);
  });

  it("reports 0% flaggedRepPct when all reps are clean", () => {
    const session = makeSession([makeEvent({}, 1), makeEvent({}, 2)]);
    const report = evaluateSession(session);
    expect(report.flaggedRepPct).toBe(0);
    expect(report.flaggedRepCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// SUSPICIOUSLY_UNIFORM_SCORES
// ---------------------------------------------------------------------------

describe("evaluateSession — SUSPICIOUSLY_UNIFORM_SCORES", () => {
  it("detects when all 3+ reps score exactly 100", () => {
    const session = makeSession([makeEvent({}, 1), makeEvent({}, 2), makeEvent({}, 3)]);
    const report = evaluateSession(session);
    expect(report.anomalies).toContain("SUSPICIOUSLY_UNIFORM_SCORES");
  });

  it("does NOT detect with fewer than 3 reps", () => {
    const session = makeSession([makeEvent({}, 1), makeEvent({}, 2)]);
    expect(evaluateSession(session).anomalies).not.toContain("SUSPICIOUSLY_UNIFORM_SCORES");
  });

  it("does NOT detect when at least one rep has formScore < 100", () => {
    const session = makeSession([
      makeEvent({ formScore: 100 }, 1),
      makeEvent({ formScore: 100 }, 2),
      makeEvent({ formScore: 80 }, 3),
    ]);
    expect(evaluateSession(session).anomalies).not.toContain("SUSPICIOUSLY_UNIFORM_SCORES");
  });

  it("does NOT detect when scores are all equal but below 100", () => {
    const session = makeSession([
      makeEvent({ formScore: 80 }, 1),
      makeEvent({ formScore: 80 }, 2),
      makeEvent({ formScore: 80 }, 3),
    ]);
    expect(evaluateSession(session).anomalies).not.toContain("SUSPICIOUSLY_UNIFORM_SCORES");
  });
});

// ---------------------------------------------------------------------------
// SCORE_CLIFF
// ---------------------------------------------------------------------------

describe("evaluateSession — SCORE_CLIFF", () => {
  it("detects a drop > 40 points between consecutive reps", () => {
    const session = makeSession([
      makeEvent({ formScore: 100 }, 1),
      makeEvent({ formScore: 100 }, 2),
      makeEvent({ formScore: 40 }, 3), // 60-point drop
    ]);
    expect(evaluateSession(session).anomalies).toContain("SCORE_CLIFF");
  });

  it("detects a drop of exactly 41 points", () => {
    const session = makeSession([
      makeEvent({ formScore: 100 }, 1),
      makeEvent({ formScore: 59 }, 2), // 41-point drop
    ]);
    expect(evaluateSession(session).anomalies).toContain("SCORE_CLIFF");
  });

  it("does NOT detect a drop of exactly 40 points (boundary — not strictly > 40)", () => {
    const session = makeSession([
      makeEvent({ formScore: 100 }, 1),
      makeEvent({ formScore: 60 }, 2), // exactly 40 drop
    ]);
    expect(evaluateSession(session).anomalies).not.toContain("SCORE_CLIFF");
  });

  it("does NOT detect gradual decline", () => {
    const session = makeSession([
      makeEvent({ formScore: 100 }, 1),
      makeEvent({ formScore: 80 }, 2),
      makeEvent({ formScore: 60 }, 3),
    ]);
    expect(evaluateSession(session).anomalies).not.toContain("SCORE_CLIFF");
  });
});

// ---------------------------------------------------------------------------
// DURATION_SPIKE
// ---------------------------------------------------------------------------

describe("evaluateSession — DURATION_SPIKE", () => {
  it("detects a rep > 3× median duration", () => {
    const session = makeSession([
      makeEvent({ durationMs: 1000 }, 1),
      makeEvent({ durationMs: 1000 }, 2),
      makeEvent({ durationMs: 4500 }, 3), // 4.5× median (1000)
    ]);
    expect(evaluateSession(session).anomalies).toContain("DURATION_SPIKE");
  });

  it("detects spike with odd-length array (median is middle element)", () => {
    const session = makeSession([
      makeEvent({ durationMs: 1000 }, 1),
      makeEvent({ durationMs: 1200 }, 2),
      makeEvent({ durationMs: 1100 }, 3), // median = 1100
      makeEvent({ durationMs: 900 }, 4),
      makeEvent({ durationMs: 5000 }, 5), // 5000 > 3*1100 = 3300 → spike
    ]);
    expect(evaluateSession(session).anomalies).toContain("DURATION_SPIKE");
  });

  it("does NOT detect when all durations are similar", () => {
    const session = makeSession([
      makeEvent({ durationMs: 1000 }, 1),
      makeEvent({ durationMs: 1100 }, 2),
      makeEvent({ durationMs: 1050 }, 3),
    ]);
    expect(evaluateSession(session).anomalies).not.toContain("DURATION_SPIKE");
  });

  it("does NOT detect a rep at exactly 3× median", () => {
    const session = makeSession([
      makeEvent({ durationMs: 1000 }, 1),
      makeEvent({ durationMs: 1000 }, 2),
      makeEvent({ durationMs: 3000 }, 3), // exactly 3× — not strictly >
    ]);
    expect(evaluateSession(session).anomalies).not.toContain("DURATION_SPIKE");
  });
});

// ---------------------------------------------------------------------------
// RAPID_DEGRADATION
// ---------------------------------------------------------------------------

describe("evaluateSession — RAPID_DEGRADATION", () => {
  it("detects when first 3 reps are clean and last 3 all have flags (6+ reps)", () => {
    const session = makeSession([
      makeEvent({ flags: [] }, 1),
      makeEvent({ flags: [] }, 2),
      makeEvent({ flags: [] }, 3),
      makeEvent({ flags: ["KNEES_CAVING"], formScore: 80 }, 4),
      makeEvent({ flags: ["TOO_SLOW"], formScore: 80 }, 5),
      makeEvent({ flags: ["INSUFFICIENT_DEPTH"], formScore: 80 }, 6),
    ]);
    expect(evaluateSession(session).anomalies).toContain("RAPID_DEGRADATION");
  });

  it("does NOT detect with fewer than 6 reps", () => {
    const session = makeSession([
      makeEvent({ flags: [] }, 1),
      makeEvent({ flags: [] }, 2),
      makeEvent({ flags: ["KNEES_CAVING"], formScore: 80 }, 3),
    ]);
    expect(evaluateSession(session).anomalies).not.toContain("RAPID_DEGRADATION");
  });

  it("does NOT detect when first 3 reps already have flags", () => {
    const session = makeSession([
      makeEvent({ flags: ["ASYMMETRIC_HIPS"], formScore: 80 }, 1),
      makeEvent({ flags: [] }, 2),
      makeEvent({ flags: [] }, 3),
      makeEvent({ flags: ["KNEES_CAVING"], formScore: 80 }, 4),
      makeEvent({ flags: ["TOO_SLOW"], formScore: 80 }, 5),
      makeEvent({ flags: ["INSUFFICIENT_DEPTH"], formScore: 80 }, 6),
    ]);
    expect(evaluateSession(session).anomalies).not.toContain("RAPID_DEGRADATION");
  });

  it("does NOT detect when last 3 reps include a clean rep", () => {
    const session = makeSession([
      makeEvent({ flags: [] }, 1),
      makeEvent({ flags: [] }, 2),
      makeEvent({ flags: [] }, 3),
      makeEvent({ flags: ["KNEES_CAVING"], formScore: 80 }, 4),
      makeEvent({ flags: [] }, 5), // clean — breaks pattern
      makeEvent({ flags: ["INSUFFICIENT_DEPTH"], formScore: 80 }, 6),
    ]);
    expect(evaluateSession(session).anomalies).not.toContain("RAPID_DEGRADATION");
  });
});

// ---------------------------------------------------------------------------
// Multiple anomalies in one session
// ---------------------------------------------------------------------------

describe("evaluateSession — multiple anomalies", () => {
  it("can detect SCORE_CLIFF and DURATION_SPIKE simultaneously", () => {
    const session = makeSession([
      makeEvent({ formScore: 100, durationMs: 1000 }, 1),
      makeEvent({ formScore: 40, durationMs: 1000 }, 2),  // 60-pt cliff
      makeEvent({ formScore: 40, durationMs: 5000 }, 3),  // 5× median (1000) → spike
    ]);
    const report = evaluateSession(session);
    expect(report.anomalies).toContain("SCORE_CLIFF");
    expect(report.anomalies).toContain("DURATION_SPIKE");
  });
});

// ---------------------------------------------------------------------------
// No anomalies — clean session
// ---------------------------------------------------------------------------

describe("evaluateSession — clean session", () => {
  it("reports no anomalies for a well-formed session", () => {
    const session = makeSession([
      makeEvent({ formScore: 100, durationMs: 1500 }, 1),
      makeEvent({ formScore: 80, durationMs: 1600, flags: ["KNEES_CAVING"] }, 2),
      makeEvent({ formScore: 100, durationMs: 1400 }, 3),
    ]);
    const report = evaluateSession(session);
    expect(report.anomalies).toHaveLength(0);
  });
});
