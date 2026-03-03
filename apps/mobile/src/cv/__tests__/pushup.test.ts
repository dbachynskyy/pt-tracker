/**
 * pushup.test.ts — PushupAnalyzer unit tests (synthetic landmark sequences).
 */

import { RepCounter } from "../repCounter";
import { PushupAnalyzer } from "../exercises/pushup";
import { pushupRepSequence, driveCounter, pushupFrame } from "./fixtures/frameBuilders";

// ---------------------------------------------------------------------------
// Good-form rep counting
// ---------------------------------------------------------------------------

describe("PushupAnalyzer — good form", () => {
  it("counts 5 clean reps with full ROM (165°→80°), no flags", () => {
    const events = driveCounter(
      new RepCounter(new PushupAnalyzer(), 5),
      pushupRepSequence(5, 1200),
    );
    expect(events).toHaveLength(5);
    events.forEach((ev) => {
      expect(ev.flags).toHaveLength(0);
      expect(ev.formScore).toBe(100);
    });
  });

  it("each rep event has a 12-value auditSnapshot (6 joints × x,y)", () => {
    const events = driveCounter(
      new RepCounter(new PushupAnalyzer(), 1),
      pushupRepSequence(1, 1200),
    );
    expect(events[0].auditSnapshot).toHaveLength(12);
  });
});

// ---------------------------------------------------------------------------
// PARTIAL_ROM — never crosses 90° DOWN threshold
// ---------------------------------------------------------------------------

describe("PushupAnalyzer — PARTIAL_ROM", () => {
  it("counts partial-ROM reps (120° bottom) and flags PARTIAL_ROM", () => {
    // downAngle = 120° stays above the 90° DOWN gate → SEEKING_DOWN→UP path
    const events = driveCounter(
      new RepCounter(new PushupAnalyzer(), 3),
      pushupRepSequence(3, 1200, 30, 165, 120),
    );
    expect(events).toHaveLength(3);
    events.forEach((ev) => expect(ev.flags).toContain("PARTIAL_ROM"));
  });

  it("does NOT flag full-ROM reps (80° bottom)", () => {
    const events = driveCounter(
      new RepCounter(new PushupAnalyzer(), 2),
      pushupRepSequence(2, 1200),
    );
    events.forEach((ev) => expect(ev.flags).not.toContain("PARTIAL_ROM"));
  });
});

// ---------------------------------------------------------------------------
// LOWER_BACK_ROUNDING — hip deviation > 15°
// ---------------------------------------------------------------------------

describe("PushupAnalyzer — LOWER_BACK_ROUNDING", () => {
  it("flags reps with hipDeviationDeg > 15", () => {
    const events = driveCounter(
      new RepCounter(new PushupAnalyzer(), 3),
      pushupRepSequence(3, 1200, 30, 165, 80, { hipDeviationDeg: 20 }),
    );
    expect(events).toHaveLength(3);
    events.forEach((ev) => expect(ev.flags).toContain("LOWER_BACK_ROUNDING"));
  });

  it("does NOT flag neutral hips", () => {
    const events = driveCounter(
      new RepCounter(new PushupAnalyzer(), 2),
      pushupRepSequence(2, 1200, 30, 165, 80, { hipDeviationDeg: 0 }),
    );
    events.forEach((ev) => expect(ev.flags).not.toContain("LOWER_BACK_ROUNDING"));
  });
});

// ---------------------------------------------------------------------------
// ELBOW_FLARE — L/R elbow asymmetry > 45°
// ---------------------------------------------------------------------------

describe("PushupAnalyzer — ELBOW_FLARE", () => {
  it("flags reps when L/R elbow angle delta exceeds 45°", () => {
    // Right: 165→60°, Left: 165→107°. Delta at bottom = 47° > 45°.
    // Average at bottom = (60+107)/2 = 83.5° < 90° → enters DOWN.
    const events = driveCounter(
      new RepCounter(new PushupAnalyzer(), 2),
      pushupRepSequence(2, 1200, 30, 165, 60, { leftDownAngle: 107 }),
    );
    expect(events).toHaveLength(2);
    events.forEach((ev) => expect(ev.flags).toContain("ELBOW_FLARE"));
  });

  it("does NOT flag symmetric elbows", () => {
    const events = driveCounter(
      new RepCounter(new PushupAnalyzer(), 2),
      pushupRepSequence(2, 1200),
    );
    events.forEach((ev) => expect(ev.flags).not.toContain("ELBOW_FLARE"));
  });
});

// ---------------------------------------------------------------------------
// TOO_FAST — exercise minimum 600 ms
// ---------------------------------------------------------------------------

describe("PushupAnalyzer — TOO_FAST (exercise minimum 600 ms)", () => {
  it("flags reps between 400–600 ms with TOO_FAST", () => {
    // 550 ms: > 400 ms (passes RepCounter), < 600 ms (flagged by PushupAnalyzer), > 500 ms (debounce safe)
    const events = driveCounter(
      new RepCounter(new PushupAnalyzer(), 3),
      pushupRepSequence(3, 550),
    );
    expect(events).toHaveLength(3);
    events.forEach((ev) => expect(ev.flags).toContain("TOO_FAST"));
  });

  it("does NOT flag reps at 800 ms", () => {
    const events = driveCounter(
      new RepCounter(new PushupAnalyzer(), 2),
      pushupRepSequence(2, 800),
    );
    events.forEach((ev) => expect(ev.flags).not.toContain("TOO_FAST"));
  });
});

// ---------------------------------------------------------------------------
// Phase-lock — partial descent without reaching DOWN
// ---------------------------------------------------------------------------

describe("PushupAnalyzer — phase-lock (SEEKING_DOWN→UP partial rep)", () => {
  it("counts a partial-ROM rep with PARTIAL_ROM flag from SEEKING_DOWN→UP path", () => {
    const frames: Array<{ frame: ReturnType<typeof pushupFrame>; ms: number }> = [];
    const frameDurMs = 33;
    for (let i = 0; i < 11; i++) frames.push({ frame: pushupFrame(165), ms: i * frameDurMs });
    let t = 11 * frameDurMs;
    // Partial descent to 120° and back (> 90° gate → never enters DOWN)
    const n = 27;
    for (let i = 0; i < n; i++) {
      const alpha = i / (n - 1);
      const angle = i < n / 2
        ? 165 - alpha * 2 * (165 - 120)
        : 120 + (alpha * 2 - 1) * (165 - 120);
      frames.push({ frame: pushupFrame(angle), ms: t });
      t += frameDurMs;
    }
    const events = driveCounter(new RepCounter(new PushupAnalyzer(), 5), frames);
    expect(events).toHaveLength(1);
    expect(events[0].flags).toContain("PARTIAL_ROM");
  });
});

// ---------------------------------------------------------------------------
// Global velocity ceiling < 400 ms — dropped by RepCounter
// ---------------------------------------------------------------------------

describe("PushupAnalyzer + RepCounter — global velocity ceiling (< 400 ms)", () => {
  it("drops reps under 400 ms and does not increment completedReps", () => {
    const counter = new RepCounter(new PushupAnalyzer(), 5);
    const events = driveCounter(counter, pushupRepSequence(5, 300));
    expect(events).toHaveLength(0);
    expect(counter.getSession().completedReps).toBe(0);
  });
});
