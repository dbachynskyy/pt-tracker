/**
 * repCounter.test.ts — RepCounter anti-cheat layer unit tests.
 */

import { RepCounter, type PoseFrame } from "../repCounter";
import { SquatAnalyzer } from "../exercises/squat";
import { squatRepSequence, driveCounter, squatFrame } from "./fixtures/frameBuilders";

function blankFrame(visibility = 1.0): PoseFrame {
  return Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility }));
}

// ---------------------------------------------------------------------------
// Warmup gate
// ---------------------------------------------------------------------------

describe("RepCounter — warmup gate", () => {
  it("discards any rep candidate that arrives within the first 10 frames", () => {
    const analyzer = new SquatAnalyzer();
    jest.spyOn(analyzer, "processFrame").mockReturnValue({
      durationMs: 1200, formScore: 90, flags: [], auditSnapshot: [],
    });
    const counter = new RepCounter(analyzer, 10);
    const frame = blankFrame();
    for (let i = 1; i <= 10; i++) {
      expect(counter.processFrame(frame, i * 33)).toBeNull();
    }
    expect(counter.getSession().completedReps).toBe(0);
  });

  it("accepts a rep immediately after warmup (frame 11)", () => {
    const analyzer = new SquatAnalyzer();
    jest.spyOn(analyzer, "processFrame").mockReturnValue({
      durationMs: 1200, formScore: 90, flags: [], auditSnapshot: [],
    });
    const counter = new RepCounter(analyzer, 10);
    const frame = blankFrame();
    for (let i = 1; i <= 10; i++) counter.processFrame(frame, i * 33);
    const result = counter.processFrame(frame, 11 * 33);
    expect(result).not.toBeNull();
    expect(counter.getSession().completedReps).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Velocity ceiling
// ---------------------------------------------------------------------------

describe("RepCounter — velocity ceiling (TOO_FAST)", () => {
  it("discards a rep with durationMs < 400", () => {
    const analyzer = new SquatAnalyzer();
    jest.spyOn(analyzer, "processFrame").mockReturnValue({
      durationMs: 200, formScore: 80, flags: [], auditSnapshot: [],
    });
    const counter = new RepCounter(analyzer, 5);
    const frame = blankFrame();
    for (let i = 1; i <= 10; i++) counter.processFrame(frame, i * 33);
    expect(counter.processFrame(frame, 11 * 33)).toBeNull();
    expect(counter.getSession().completedReps).toBe(0);
  });

  it("accepts a rep with durationMs >= 400", () => {
    const analyzer = new SquatAnalyzer();
    jest.spyOn(analyzer, "processFrame").mockReturnValue({
      durationMs: 400, formScore: 80, flags: [], auditSnapshot: [],
    });
    const counter = new RepCounter(analyzer, 5);
    const frame = blankFrame();
    for (let i = 1; i <= 10; i++) counter.processFrame(frame, i * 33);
    expect(counter.processFrame(frame, 11 * 33)).not.toBeNull();
    expect(counter.getSession().completedReps).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Debounce window
// ---------------------------------------------------------------------------

describe("RepCounter — debounce window", () => {
  it("discards a second rep within 500 ms of the first", () => {
    const analyzer = new SquatAnalyzer();
    jest.spyOn(analyzer, "processFrame").mockReturnValue({
      durationMs: 1000, formScore: 90, flags: [], auditSnapshot: [],
    });
    const counter = new RepCounter(analyzer, 10);
    const frame = blankFrame();
    for (let i = 1; i <= 10; i++) counter.processFrame(frame, i * 33);
    const t1 = 11 * 33;
    expect(counter.processFrame(frame, t1)).not.toBeNull();
    expect(counter.processFrame(frame, t1 + 300)).toBeNull(); // 300 ms < 500 ms
    expect(counter.getSession().completedReps).toBe(1);
  });

  it("accepts a second rep after 501 ms", () => {
    const analyzer = new SquatAnalyzer();
    jest.spyOn(analyzer, "processFrame").mockReturnValue({
      durationMs: 1000, formScore: 90, flags: [], auditSnapshot: [],
    });
    const counter = new RepCounter(analyzer, 10);
    const frame = blankFrame();
    for (let i = 1; i <= 10; i++) counter.processFrame(frame, i * 33);
    const t1 = 11 * 33;
    expect(counter.processFrame(frame, t1)).not.toBeNull();
    expect(counter.processFrame(frame, t1 + 501)).not.toBeNull(); // > 500 ms
    expect(counter.getSession().completedReps).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Occlusion gating
// ---------------------------------------------------------------------------

describe("RepCounter — occlusion gating", () => {
  it("returns null once occlusionStreak exceeds MAX_OCCLUSION_FRAMES (3)", () => {
    const analyzer = new SquatAnalyzer();
    jest.spyOn(analyzer, "processFrame").mockReturnValue({
      durationMs: 1200, formScore: 90, flags: [], auditSnapshot: [],
    });
    const counter = new RepCounter(analyzer, 10);
    for (let i = 1; i <= 10; i++) counter.processFrame(blankFrame(1.0), i * 33);

    // Build streak to 3
    const occluded = squatFrame(170, { visibility: 0.2 });
    for (let i = 0; i < 3; i++) counter.processFrame(occluded, (11 + i) * 33);

    // 4th consecutive occluded frame: streak (4) > 3 → null regardless of candidate
    expect(counter.processFrame(occluded, 14 * 33)).toBeNull();
  });

  it("resets streak and counts on the next clear frame (with sufficient debounce gap)", () => {
    const analyzer = new SquatAnalyzer();
    jest.spyOn(analyzer, "processFrame").mockReturnValue({
      durationMs: 1200, formScore: 90, flags: [], auditSnapshot: [],
    });
    const counter = new RepCounter(analyzer, 10);
    for (let i = 1; i <= 10; i++) counter.processFrame(blankFrame(1.0), i * 33);

    // 4 occluded frames — counting suspended after frame 4
    const occluded = squatFrame(170, { visibility: 0.2 });
    for (let i = 0; i < 4; i++) counter.processFrame(occluded, (11 + i) * 33);

    // Clear frame, 600 ms after last occluded → past debounce from any earlier rep
    const clearT = 15 * 33 + 600;
    expect(counter.processFrame(blankFrame(1.0), clearT)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Session continuity
// ---------------------------------------------------------------------------

describe("RepCounter — session continuity", () => {
  it("auto-pauses after a > 10 s gap with no valid frames", () => {
    const analyzer = new SquatAnalyzer();
    jest.spyOn(analyzer, "processFrame").mockReturnValue({
      durationMs: 1000, formScore: 90, flags: [], auditSnapshot: [],
    });
    const counter = new RepCounter(analyzer, 10);
    for (let i = 1; i <= 11; i++) counter.processFrame(blankFrame(), i * 33);
    const result = counter.processFrame(blankFrame(), 11 * 33 + 11_000);
    expect(result).toBeNull();
  });

  it("resumes counting after resume()", () => {
    const analyzer = new SquatAnalyzer();
    jest.spyOn(analyzer, "processFrame").mockReturnValue({
      durationMs: 1000, formScore: 90, flags: [], auditSnapshot: [],
    });
    const counter = new RepCounter(analyzer, 10);
    for (let i = 1; i <= 11; i++) counter.processFrame(blankFrame(), i * 33);
    const bigGapT = 11 * 33 + 11_000;
    counter.processFrame(blankFrame(), bigGapT);
    counter.resume();
    expect(counter.processFrame(blankFrame(), bigGapT + 100)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// End-to-end happy path
// ---------------------------------------------------------------------------

describe("RepCounter — end-to-end squat (happy path)", () => {
  it("counts exactly 5 clean reps from a 1.5 s/rep synthetic sequence", () => {
    const counter = new RepCounter(new SquatAnalyzer(), 5);
    const events = driveCounter(counter, squatRepSequence(5, 1500));
    expect(events).toHaveLength(5);
    expect(counter.getSession().completedReps).toBe(5);
    events.forEach((ev, i) => {
      expect(ev.repIndex).toBe(i + 1);
      expect(ev.flags).toHaveLength(0);
      expect(ev.formScore).toBe(100);
      expect(ev.auditSnapshot).toHaveLength(12);
    });
  });

  it("produces monotonically increasing repIndex", () => {
    const counter = new RepCounter(new SquatAnalyzer(), 3);
    const events = driveCounter(counter, squatRepSequence(3, 1500));
    expect(events.map((e) => e.repIndex)).toEqual([1, 2, 3]);
  });

  it("endSession() sets endedAt", () => {
    const counter = new RepCounter(new SquatAnalyzer(), 2);
    driveCounter(counter, squatRepSequence(2, 1500));
    const session = counter.endSession();
    expect(session.completedReps).toBe(2);
    expect(session.events).toHaveLength(2);
    expect(typeof session.endedAt).toBe("number");
    expect(session.endedAt).toBeGreaterThanOrEqual(session.startedAt);
  });
});
