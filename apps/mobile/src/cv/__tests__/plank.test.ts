/**
 * plank.test.ts — PlankAnalyzer unit tests (synthetic landmark sequences).
 */

import { RepCounter } from "../repCounter";
import { PlankAnalyzer } from "../exercises/plank";
import { plankRepSequence, plankFrame, driveCounter } from "./fixtures/frameBuilders";

// ---------------------------------------------------------------------------
// Good-form hold counting
// ---------------------------------------------------------------------------

describe("PlankAnalyzer — good form", () => {
  it("counts 3 clean holds (175° alignment, 1500 ms each), no flags", () => {
    const events = driveCounter(
      new RepCounter(new PlankAnalyzer(), 3),
      plankRepSequence(3, 1500),
    );
    expect(events).toHaveLength(3);
    events.forEach((ev) => {
      expect(ev.flags).toHaveLength(0);
      expect(ev.formScore).toBe(100);
    });
  });

  it("each rep event has a 12-value auditSnapshot (6 joints × x,y)", () => {
    const events = driveCounter(
      new RepCounter(new PlankAnalyzer(), 1),
      plankRepSequence(1, 1500),
    );
    expect(events[0].auditSnapshot).toHaveLength(12);
  });

  it("durationMs approximates the hold duration", () => {
    const holdDurationMs = 2000;
    const events = driveCounter(
      new RepCounter(new PlankAnalyzer(), 1),
      plankRepSequence(1, holdDurationMs),
    );
    // durationMs should be within one frame (~34ms) of the target
    expect(events[0].durationMs).toBeGreaterThanOrEqual(holdDurationMs - 34);
    expect(events[0].durationMs).toBeLessThan(holdDurationMs + 100);
  });
});

// ---------------------------------------------------------------------------
// LOWER_BACK_ROUNDING — alignment deviation > 15° from 180°
// ---------------------------------------------------------------------------

describe("PlankAnalyzer — LOWER_BACK_ROUNDING", () => {
  it("flags holds at 162° alignment (18° deviation > 15° threshold)", () => {
    const events = driveCounter(
      new RepCounter(new PlankAnalyzer(), 2),
      plankRepSequence(2, 1500, 30, 162),
    );
    expect(events).toHaveLength(2);
    events.forEach((ev) => {
      expect(ev.flags).toContain("LOWER_BACK_ROUNDING");
      expect(ev.formScore).toBe(80); // 100 - 1*20
    });
  });

  it("does NOT flag holds at 175° alignment (5° deviation < 15°)", () => {
    const events = driveCounter(
      new RepCounter(new PlankAnalyzer(), 2),
      plankRepSequence(2, 1500, 30, 175),
    );
    events.forEach((ev) => expect(ev.flags).not.toContain("LOWER_BACK_ROUNDING"));
  });
});

// ---------------------------------------------------------------------------
// ASYMMETRIC_HIPS — L/R hip Y-delta > 0.05
// ---------------------------------------------------------------------------

describe("PlankAnalyzer — ASYMMETRIC_HIPS", () => {
  it("flags holds with asymmetryY = 0.06 (> 0.05 threshold)", () => {
    const events = driveCounter(
      new RepCounter(new PlankAnalyzer(), 2),
      plankRepSequence(2, 1500, 30, 175, 120, { asymmetryY: 0.06 }),
    );
    expect(events).toHaveLength(2);
    events.forEach((ev) => expect(ev.flags).toContain("ASYMMETRIC_HIPS"));
  });

  it("does NOT flag holds with asymmetryY = 0.02 (< 0.05 threshold)", () => {
    const events = driveCounter(
      new RepCounter(new PlankAnalyzer(), 2),
      plankRepSequence(2, 1500, 30, 175, 120, { asymmetryY: 0.02 }),
    );
    events.forEach((ev) => expect(ev.flags).not.toContain("ASYMMETRIC_HIPS"));
  });
});

// ---------------------------------------------------------------------------
// Hold too brief — not counted
// ---------------------------------------------------------------------------

describe("PlankAnalyzer — brief hold (< MIN_HOLD_MS = 1000 ms)", () => {
  it("does not count a 500 ms hold (below MIN_HOLD_MS)", () => {
    const counter = new RepCounter(new PlankAnalyzer(), 5);
    const events = driveCounter(counter, plankRepSequence(1, 500));
    expect(events).toHaveLength(0);
    expect(counter.getSession().completedReps).toBe(0);
  });

  it("counts a 1100 ms hold (above MIN_HOLD_MS)", () => {
    const events = driveCounter(
      new RepCounter(new PlankAnalyzer(), 1),
      plankRepSequence(1, 1100),
    );
    expect(events).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Resting below HOLD_ENTER_DEG — never enters HOLDING
// ---------------------------------------------------------------------------

describe("PlankAnalyzer — position below entry threshold", () => {
  it("does not count reps when alignment stays at 120° (below 160° HOLD_ENTER_DEG)", () => {
    const frames: Array<{ frame: ReturnType<typeof plankFrame>; ms: number }> = [];
    const frameDurMs = 33;
    for (let i = 0; i < 60; i++) {
      frames.push({ frame: plankFrame(120), ms: i * frameDurMs });
    }
    const events = driveCounter(new RepCounter(new PlankAnalyzer(), 5), frames);
    expect(events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Multiple flags — formScore deducts 20 per flag
// ---------------------------------------------------------------------------

describe("PlankAnalyzer — multiple form flags", () => {
  it("deducts 20 per flag: LOWER_BACK_ROUNDING + ASYMMETRIC_HIPS → formScore 60", () => {
    const events = driveCounter(
      new RepCounter(new PlankAnalyzer(), 1),
      plankRepSequence(1, 1500, 30, 162, 120, { asymmetryY: 0.06 }),
    );
    expect(events).toHaveLength(1);
    expect(events[0].flags).toContain("LOWER_BACK_ROUNDING");
    expect(events[0].flags).toContain("ASYMMETRIC_HIPS");
    expect(events[0].formScore).toBe(60); // 100 - 2*20
  });
});

// ---------------------------------------------------------------------------
// reset() — clears state between sets
// ---------------------------------------------------------------------------

describe("PlankAnalyzer — reset()", () => {
  it("starts fresh after reset: counts reps correctly in a second set", () => {
    const analyzer = new PlankAnalyzer();
    const counter1 = new RepCounter(analyzer, 2);
    driveCounter(counter1, plankRepSequence(2, 1500));

    analyzer.reset();

    const counter2 = new RepCounter(analyzer, 2);
    const events = driveCounter(counter2, plankRepSequence(2, 1500));
    expect(events).toHaveLength(2);
  });
});
