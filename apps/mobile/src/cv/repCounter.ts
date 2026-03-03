/**
 * repCounter.ts
 *
 * Core rep-counting engine. Owns the phase-state machine and anti-cheat
 * heuristics that are common to all exercises. Exercise-specific analyzers
 * (see ./exercises/) produce RepCandidate objects; this module decides
 * whether each candidate is accepted or rejected.
 */

// ---------------------------------------------------------------------------
// Shared types (re-exported so callers need only import from this file)
// ---------------------------------------------------------------------------

export interface Landmark {
  x: number;         // normalized [0, 1]
  y: number;         // normalized [0, 1]
  z: number;         // depth, relative to hip midpoint
  visibility?: number; // model confidence [0, 1]
}

/** 33-element array — indices follow MediaPipe Pose convention. */
export type PoseFrame = Landmark[];

export type ExercisePhase = "IDLE" | "UP" | "DOWN" | "TRANSITION";

export type FormFlag =
  | "KNEES_CAVING"
  | "INSUFFICIENT_DEPTH"
  | "ASYMMETRIC_HIPS"
  | "ELBOW_FLARE"
  | "LOWER_BACK_ROUNDING"
  | "PARTIAL_ROM"
  | "TOO_FAST"
  | "TOO_SLOW"
  | "OCCLUSION"
  | "LOW_CONFIDENCE";

export interface RepEvent {
  repIndex: number;     // 1-based, scoped to the current session
  durationMs: number;   // wall-clock time for this rep
  phase: ExercisePhase;
  formScore: number;    // 0–100; < 40 flagged for therapist review
  flags: FormFlag[];
  /** Compact landmark snapshot for async audit (10 key joints). */
  auditSnapshot: number[];
}

export interface RepSession {
  exerciseId: string;
  targetReps: number;
  completedReps: number;
  events: RepEvent[];
  startedAt: number;    // epoch ms
  endedAt?: number;
}

/** Emitted by an ExerciseAnalyzer before anti-cheat validation. */
export interface RepCandidate {
  durationMs: number;
  formScore: number;
  flags: FormFlag[];
  auditSnapshot: number[];
}

/** Interface every exercise plugin must satisfy. */
export interface ExerciseAnalyzer {
  readonly exerciseId: string;
  /** MediaPipe landmark indices that must be visible for counting to proceed. */
  readonly requiredLandmarks: number[];

  /**
   * Process one camera frame. Returns a RepCandidate when the analyzer
   * detects a completed rep cycle; returns null otherwise.
   */
  processFrame(frame: PoseFrame, sessionMs: number): RepCandidate | null;

  /** Reset all internal state (call between sets). */
  reset(): void;
}

// ---------------------------------------------------------------------------
// Anti-cheat constants
// ---------------------------------------------------------------------------

const ANTI_CHEAT = {
  MIN_REP_DURATION_MS: 400,       // physically implausible below this
  DEBOUNCE_WINDOW_MS: 500,        // minimum gap between accepted reps
  WARMUP_FRAMES: 10,              // frames discarded at session start
  VISIBILITY_THRESHOLD: 0.5,      // landmark visibility gate
  MAX_OCCLUSION_FRAMES: 3,        // consecutive low-visibility frames before pause
  CONFIDENCE_THRESHOLD: 0.6,      // pose-model confidence gate
  MAX_LOW_CONFIDENCE_FRAMES: 5,   // consecutive low-confidence frames before suspend
  SESSION_PAUSE_GAP_MS: 10_000,   // gap with no valid frames → auto-pause
  FORM_SCORE_REVIEW_FLOOR: 40,    // reps below this score flagged for review
} as const;

// ---------------------------------------------------------------------------
// RepCounter
// ---------------------------------------------------------------------------

export class RepCounter {
  private session: RepSession;
  private analyzer: ExerciseAnalyzer;

  private frameCount = 0;
  private lastRepTimestampMs = 0;
  private lastValidFrameMs = 0;
  private occlusionStreak = 0;
  private lowConfidenceStreak = 0;
  private paused = false;

  constructor(analyzer: ExerciseAnalyzer, targetReps: number) {
    this.analyzer = analyzer;
    this.session = {
      exerciseId: analyzer.exerciseId,
      targetReps,
      completedReps: 0,
      events: [],
      startedAt: Date.now(),
    };
  }

  /**
   * Feed one camera frame into the counter.
   * Returns the accepted RepEvent if a rep was just counted, otherwise null.
   */
  processFrame(frame: PoseFrame, sessionMs: number): RepEvent | null {
    this.frameCount++;

    // -- Warmup gate ----------------------------------------------------------
    if (this.frameCount <= ANTI_CHEAT.WARMUP_FRAMES) return null;

    // -- Session continuity check --------------------------------------------
    if (
      this.lastValidFrameMs > 0 &&
      sessionMs - this.lastValidFrameMs > ANTI_CHEAT.SESSION_PAUSE_GAP_MS
    ) {
      this.paused = true;
    }
    if (this.paused) return null;

    // -- Visibility gate ------------------------------------------------------
    const occluded = this.analyzer.requiredLandmarks.some(
      (i) => (frame[i]?.visibility ?? 0) < ANTI_CHEAT.VISIBILITY_THRESHOLD,
    );
    if (occluded) {
      this.occlusionStreak++;
      if (this.occlusionStreak > ANTI_CHEAT.MAX_OCCLUSION_FRAMES) return null;
    } else {
      this.occlusionStreak = 0;
    }

    this.lastValidFrameMs = sessionMs;

    // -- Delegate to exercise analyzer ----------------------------------------
    const candidate = this.analyzer.processFrame(frame, sessionMs);
    if (!candidate) return null;

    // -- Anti-cheat: velocity ceiling -----------------------------------------
    if (candidate.durationMs < ANTI_CHEAT.MIN_REP_DURATION_MS) {
      candidate.flags.push("TOO_FAST");
      // Do not count; return null (rep is silently discarded)
      return null;
    }

    // -- Anti-cheat: debounce window ------------------------------------------
    if (
      this.lastRepTimestampMs > 0 &&
      sessionMs - this.lastRepTimestampMs < ANTI_CHEAT.DEBOUNCE_WINDOW_MS
    ) {
      return null;
    }

    // -- Accept the rep -------------------------------------------------------
    this.lastRepTimestampMs = sessionMs;
    this.session.completedReps++;

    const event: RepEvent = {
      repIndex: this.session.completedReps,
      durationMs: candidate.durationMs,
      phase: "UP",
      formScore: candidate.formScore,
      flags: candidate.flags,
      auditSnapshot: candidate.auditSnapshot,
    };

    this.session.events.push(event);
    return event;
  }

  /** Resume after a detected pause (e.g., user taps "continue"). */
  resume(): void {
    this.paused = false;
    this.lastValidFrameMs = 0;
  }

  endSession(): RepSession {
    this.session.endedAt = Date.now();
    return { ...this.session, events: [...this.session.events] };
  }

  getSession(): Readonly<RepSession> {
    return this.session;
  }
}
