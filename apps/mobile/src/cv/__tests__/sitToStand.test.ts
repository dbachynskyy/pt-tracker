/**
 * sitToStand.test.ts — SitToStandAnalyzer unit tests (synthetic landmark sequences).
 */

import { RepCounter } from "../repCounter";
import { SitToStandAnalyzer } from "../exercises/sitToStand";
import {
  sitToStandRepSequence,
  squatFrame,
  driveCounter,
} from "./fixtures/frameBuilders";

// ---------------------------------------------------------------------------
// Good-form rep counting
// ---------------------------------------------------------------------------

describe("SitToStandAnalyzer — good form", () => {
  it("counts 5 clean reps (90°→170°), no flags", () => {
    const events = driveCounter(
      new RepCounter(new SitToStandAnalyzer(), 5),
      sitToStandRepSequence(5, 1500),
    );
    expect(events).toHaveLength(5);
    events.forEach((ev) => {
      expect(ev.flags).toHaveLength(0);
      expect(ev.formScore).toBe(100);
    });
  });

  it("each rep event has a 12-value auditSnapshot (6 joints × x,y)", () => {
    const events = driveCounter(
      new RepCounter(new SitToStandAnalyzer(), 1),
      sitToStandRepSequence(1, 1500),
    );
    expect(events[0].auditSnapshot).toHaveLength(12);
  });

  it("rep indices are 1-based and sequential", () => {
    const events = driveCounter(
      new RepCounter(new SitToStandAnalyzer(), 3),
      sitToStandRepSequence(3, 1500),
    );
    expect(events.map((e) => e.repIndex)).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// INSUFFICIENT_DEPTH — partial rise (never crosses STANDING threshold)
// ---------------------------------------------------------------------------

describe("SitToStandAnalyzer — INSUFFICIENT_DEPTH", () => {
  it("flags reps where peak extension stays at 130° (below 160° STANDING threshold)", () => {
    // standingAngle = 130° stays below KNEE_ANGLE_STANDING_DEG (160°)
    // → SEEKING_STAND → SEATED path → INSUFFICIENT_DEPTH
    const events = driveCounter(
      new RepCounter(new SitToStandAnalyzer(), 3),
      sitToStandRepSequence(3, 1500, 30, 90, 130),
    );
    expect(events).toHaveLength(3);
    events.forEach((ev) => expect(ev.flags).toContain("INSUFFICIENT_DEPTH"));
  });

  it("does NOT flag full-extension reps (170° standing)", () => {
    const events = driveCounter(
      new RepCounter(new SitToStandAnalyzer(), 2),
      sitToStandRepSequence(2, 1500),
    );
    events.forEach((ev) => expect(ev.flags).not.toContain("INSUFFICIENT_DEPTH"));
  });
});

// ---------------------------------------------------------------------------
// ASYMMETRIC_HIPS — L/R bilateral knee delta > 15°
// ---------------------------------------------------------------------------

describe("SitToStandAnalyzer — ASYMMETRIC_HIPS", () => {
  it("flags reps when left knee lags right by > 15° at peak standing", () => {
    // Right: 90→170°, Left: 90→154°. Delta at peak = 16° > 15°.
    // Average at peak = (170+154)/2 = 162° ≥ 160° → enters STANDING.
    const events = driveCounter(
      new RepCounter(new SitToStandAnalyzer(), 3),
      sitToStandRepSequence(3, 1500, 30, 90, 170, { leftStandingAngle: 154 }),
    );
    expect(events).toHaveLength(3);
    events.forEach((ev) => expect(ev.flags).toContain("ASYMMETRIC_HIPS"));
  });

  it("does NOT flag symmetric reps", () => {
    const events = driveCounter(
      new RepCounter(new SitToStandAnalyzer(), 2),
      sitToStandRepSequence(2, 1500),
    );
    events.forEach((ev) => expect(ev.flags).not.toContain("ASYMMETRIC_HIPS"));
  });
});

// ---------------------------------------------------------------------------
// SEEKING_STAND → SEATED partial rise (never reaches full standing)
// ---------------------------------------------------------------------------

describe("SitToStandAnalyzer — partial rise (SEEKING_STAND→SEATED)", () => {
  it("counts a partial rise and flags INSUFFICIENT_DEPTH without STANDING entry", () => {
    const frames: Array<{ frame: ReturnType<typeof squatFrame>; ms: number }> = [];
    const frameDurMs = 33;
    // Warmup: 11 frames at seated (90°)
    for (let i = 0; i < 11; i++) {
      frames.push({ frame: squatFrame(90), ms: i * frameDurMs });
    }
    let t = 11 * frameDurMs;
    // Partial rise: 90° → 130° → 90° (never crosses 160° STANDING)
    const n = 27;
    for (let i = 0; i < n; i++) {
      const alpha = i / (n - 1);
      const angle = i < n / 2
        ? 90 + alpha * 2 * (130 - 90)   // ascent half
        : 130 - (alpha * 2 - 1) * (130 - 90); // descent half
      frames.push({ frame: squatFrame(angle), ms: t });
      t += frameDurMs;
    }
    const events = driveCounter(new RepCounter(new SitToStandAnalyzer(), 5), frames);
    expect(events).toHaveLength(1);
    expect(events[0].flags).toContain("INSUFFICIENT_DEPTH");
    expect(events[0].flags).not.toContain("ASYMMETRIC_HIPS");
  });
});

// ---------------------------------------------------------------------------
// TOO_FAST — exercise-specific minimum (800 ms)
// ---------------------------------------------------------------------------

describe("SitToStandAnalyzer — TOO_FAST (exercise minimum 800 ms)", () => {
  it("flags reps between 400–800 ms with TOO_FAST", () => {
    // 650 ms: > 400 ms (passes RepCounter), < 800 ms (flagged by SitToStandAnalyzer)
    const events = driveCounter(
      new RepCounter(new SitToStandAnalyzer(), 3),
      sitToStandRepSequence(3, 650),
    );
    expect(events).toHaveLength(3);
    events.forEach((ev) => expect(ev.flags).toContain("TOO_FAST"));
  });

  it("does NOT flag reps at 1000 ms", () => {
    const events = driveCounter(
      new RepCounter(new SitToStandAnalyzer(), 2),
      sitToStandRepSequence(2, 1000),
    );
    events.forEach((ev) => expect(ev.flags).not.toContain("TOO_FAST"));
  });
});

// ---------------------------------------------------------------------------
// Global velocity ceiling (< 400 ms) — dropped by RepCounter
// ---------------------------------------------------------------------------

describe("SitToStandAnalyzer + RepCounter — global velocity ceiling", () => {
  it("drops reps under 400 ms and does not increment completedReps", () => {
    const counter = new RepCounter(new SitToStandAnalyzer(), 5);
    const events = driveCounter(counter, sitToStandRepSequence(5, 300));
    expect(events).toHaveLength(0);
    expect(counter.getSession().completedReps).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// reset() — clears state between sets
// ---------------------------------------------------------------------------

describe("SitToStandAnalyzer — reset()", () => {
  it("counts correctly after reset", () => {
    const analyzer = new SitToStandAnalyzer();
    const counter1 = new RepCounter(analyzer, 2);
    driveCounter(counter1, sitToStandRepSequence(2, 1500));

    analyzer.reset();

    const counter2 = new RepCounter(analyzer, 3);
    const events = driveCounter(counter2, sitToStandRepSequence(3, 1500));
    expect(events).toHaveLength(3);
  });
});
