/**
 * repCounter.test.ts
 *
 * Unit tests for the RepCounter anti-cheat layer.
 * Uses synthetic PoseFrame arrays (no real camera).
 *
 * NOTE: These tests are stubs — the frame-builder helpers and exercise
 * fixtures described in fixtures/README.md must be implemented before
 * this suite can be run.
 *
 * Test runner: Jest (or Vitest — swap import if needed).
 */

import { RepCounter, type PoseFrame } from "../repCounter";
import { SquatAnalyzer } from "../exercises/squat";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal 33-landmark frame with all visibility = 1.0. */
function blankFrame(): PoseFrame {
  return Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1.0 }));
}

// TODO: replace with fixture-loader once fixtures/squat_good_form_5reps.json exists
function loadFixture(_name: string): PoseFrame[] {
  throw new Error("Fixture loader not yet implemented — see fixtures/README.md");
}

// ---------------------------------------------------------------------------
// Warmup gate
// ---------------------------------------------------------------------------

describe("RepCounter — warmup gate", () => {
  it("should NOT count a rep that occurs in the first 10 frames", () => {
    const analyzer = new SquatAnalyzer();
    // Spy: make analyzer return a candidate immediately on first processFrame call
    jest.spyOn(analyzer, "processFrame").mockReturnValue({
      durationMs: 1200,
      formScore: 90,
      flags: [],
      auditSnapshot: [],
    });

    const counter = new RepCounter(analyzer, 10);
    const frame = blankFrame();

    // Feed 10 warmup frames — all should return null
    for (let i = 1; i <= 10; i++) {
      const result = counter.processFrame(frame, i * 33);
      expect(result).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Debounce window
// ---------------------------------------------------------------------------

describe("RepCounter — debounce window", () => {
  it("should discard a second rep accepted within 500 ms of the first", () => {
    // TODO: implement with fixture data once available
    expect(true).toBe(true); // placeholder
  });
});

// ---------------------------------------------------------------------------
// Velocity ceiling (TOO_FAST)
// ---------------------------------------------------------------------------

describe("RepCounter — velocity ceiling", () => {
  it("should discard reps with durationMs < 400", () => {
    const analyzer = new SquatAnalyzer();
    jest.spyOn(analyzer, "processFrame").mockReturnValue({
      durationMs: 200, // too fast
      formScore: 80,
      flags: [],
      auditSnapshot: [],
    });

    const counter = new RepCounter(analyzer, 5);
    const frame = blankFrame();

    // Skip warmup frames
    for (let i = 1; i <= 10; i++) counter.processFrame(frame, i * 33);

    // This rep is too fast — should be null
    const result = counter.processFrame(frame, 11 * 33);
    expect(result).toBeNull();
    expect(counter.getSession().completedReps).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Occlusion gating
// ---------------------------------------------------------------------------

describe("RepCounter — occlusion gating", () => {
  it("should pause counting after 3 consecutive low-visibility frames", () => {
    // TODO: implement with occlusion fixture
    expect(true).toBe(true); // placeholder
  });
});

// ---------------------------------------------------------------------------
// Session continuity
// ---------------------------------------------------------------------------

describe("RepCounter — session continuity", () => {
  it("should auto-pause after a 10 s gap with no valid frames", () => {
    // TODO: implement with session-gap fixture
    expect(true).toBe(true); // placeholder
  });
});

// ---------------------------------------------------------------------------
// Full rep acceptance (happy path)
// ---------------------------------------------------------------------------

describe("RepCounter — happy path", () => {
  it("should count 5 clean reps and populate session events", () => {
    // TODO: load fixtures/squat_good_form_5reps.json and drive the counter
    // expect(counter.getSession().completedReps).toBe(5);
    // expect(counter.getSession().events).toHaveLength(5);
    expect(true).toBe(true); // placeholder
  });
});
