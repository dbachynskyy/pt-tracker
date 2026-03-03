/**
 * squat.test.ts — SquatAnalyzer unit tests (synthetic landmark sequences).
 */

import { RepCounter } from "../repCounter";
import { SquatAnalyzer } from "../exercises/squat";
import { squatRepSequence, driveCounter, squatFrame } from "./fixtures/frameBuilders";

// ---------------------------------------------------------------------------
// Good-form rep counting
// ---------------------------------------------------------------------------

describe("SquatAnalyzer — good form", () => {
  it("counts 5 clean reps with full ROM (170°→80°), no flags", () => {
    const events = driveCounter(new RepCounter(new SquatAnalyzer(), 5), squatRepSequence(5, 1500));
    expect(events).toHaveLength(5);
    events.forEach((ev) => {
      expect(ev.flags).toHaveLength(0);
      expect(ev.formScore).toBe(100);
    });
  });

  it("each rep event has a 12-value auditSnapshot (6 joints × x,y)", () => {
    const events = driveCounter(new RepCounter(new SquatAnalyzer(), 1), squatRepSequence(1, 1500));
    expect(events[0].auditSnapshot).toHaveLength(12);
  });
});

// ---------------------------------------------------------------------------
// INSUFFICIENT_DEPTH — partial ROM (never crosses 90° DOWN threshold)
// ---------------------------------------------------------------------------

describe("SquatAnalyzer — INSUFFICIENT_DEPTH", () => {
  it("counts partial-depth reps (110° bottom) and flags INSUFFICIENT_DEPTH", () => {
    // downAngle = 110° stays above the 90° DOWN gate → SEEKING_DOWN→UP path
    const events = driveCounter(
      new RepCounter(new SquatAnalyzer(), 3),
      squatRepSequence(3, 1500, 30, 170, 110),
    );
    expect(events).toHaveLength(3);
    events.forEach((ev) => expect(ev.flags).toContain("INSUFFICIENT_DEPTH"));
  });

  it("does NOT flag full-depth reps (80° bottom)", () => {
    const events = driveCounter(new RepCounter(new SquatAnalyzer(), 2), squatRepSequence(2, 1500));
    events.forEach((ev) => expect(ev.flags).not.toContain("INSUFFICIENT_DEPTH"));
  });
});

// ---------------------------------------------------------------------------
// ASYMMETRIC_HIPS — L/R delta > 15°
// ---------------------------------------------------------------------------

describe("SquatAnalyzer — ASYMMETRIC_HIPS", () => {
  it("flags reps when left knee angle lags right by > 15°", () => {
    // Right side: 170→80°, Left side: 170→96°. Delta at bottom = 16° > 15°.
    // Average at bottom = (80+96)/2 = 88° < 90° → enters DOWN.
    const events = driveCounter(
      new RepCounter(new SquatAnalyzer(), 3),
      squatRepSequence(3, 1500, 30, 170, 80, { leftDownAngle: 96 }),
    );
    expect(events).toHaveLength(3);
    events.forEach((ev) => expect(ev.flags).toContain("ASYMMETRIC_HIPS"));
  });

  it("does NOT flag symmetric reps", () => {
    const events = driveCounter(new RepCounter(new SquatAnalyzer(), 2), squatRepSequence(2, 1500));
    events.forEach((ev) => expect(ev.flags).not.toContain("ASYMMETRIC_HIPS"));
  });
});

// ---------------------------------------------------------------------------
// Phase-lock — partial descent without reaching DOWN never triggers a counted rep
// (it does emit with INSUFFICIENT_DEPTH via SEEKING_DOWN→UP, but not via DOWN→UP)
// ---------------------------------------------------------------------------

describe("SquatAnalyzer — phase-lock (SEEKING_DOWN→UP partial rep)", () => {
  it("counts a rep from SEEKING_DOWN→UP with INSUFFICIENT_DEPTH and never without the flag", () => {
    // Angle oscillates 170°→130°→170° — SEEKING_DOWN→UP path (no DOWN)
    const frames: Array<{ frame: ReturnType<typeof squatFrame>; ms: number }> = [];
    const frameDurMs = 33;
    // Warmup
    for (let i = 0; i < 11; i++) frames.push({ frame: squatFrame(170), ms: i * frameDurMs });
    let t = 11 * frameDurMs;
    // Single partial descent: 170→130→170 (1 800 ms rep)
    const n = 27;
    for (let i = 0; i < n; i++) {
      const alpha = i / (n - 1);
      const angle = i < n / 2
        ? 170 - alpha * 2 * (170 - 130)    // descent half
        : 130 + (alpha * 2 - 1) * (170 - 130); // ascent half
      frames.push({ frame: squatFrame(angle), ms: t });
      t += frameDurMs;
    }
    const events = driveCounter(new RepCounter(new SquatAnalyzer(), 5), frames);
    // The partial rep is counted (SEEKING_DOWN→UP) but flagged
    expect(events).toHaveLength(1);
    expect(events[0].flags).toContain("INSUFFICIENT_DEPTH");
  });
});

// ---------------------------------------------------------------------------
// TOO_FAST — exercise-specific minimum (800 ms)
// ---------------------------------------------------------------------------

describe("SquatAnalyzer — TOO_FAST (exercise minimum 800 ms)", () => {
  it("flags reps between 400–800 ms with TOO_FAST (passes RepCounter, flagged by analyzer)", () => {
    // 650 ms: > 400 ms (passes RepCounter), < 800 ms (flagged by SquatAnalyzer), > 500 ms (debounce safe)
    const events = driveCounter(
      new RepCounter(new SquatAnalyzer(), 3),
      squatRepSequence(3, 650),
    );
    expect(events).toHaveLength(3);
    events.forEach((ev) => expect(ev.flags).toContain("TOO_FAST"));
  });

  it("does NOT flag reps at 1000 ms", () => {
    const events = driveCounter(new RepCounter(new SquatAnalyzer(), 2), squatRepSequence(2, 1000));
    events.forEach((ev) => expect(ev.flags).not.toContain("TOO_FAST"));
  });
});

// ---------------------------------------------------------------------------
// Global velocity ceiling (< 400 ms) — dropped entirely by RepCounter
// ---------------------------------------------------------------------------

describe("SquatAnalyzer + RepCounter — global velocity ceiling (< 400 ms)", () => {
  it("drops reps under 400 ms and does not increment completedReps", () => {
    const counter = new RepCounter(new SquatAnalyzer(), 5);
    const events = driveCounter(counter, squatRepSequence(5, 300));
    expect(events).toHaveLength(0);
    expect(counter.getSession().completedReps).toBe(0);
  });
});
