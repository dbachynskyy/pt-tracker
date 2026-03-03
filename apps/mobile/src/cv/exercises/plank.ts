/**
 * exercises/plank.ts
 *
 * ExerciseAnalyzer plugin for the isometric plank hold.
 *
 * Key joints tracked (MediaPipe Pose indices):
 *   11 – left shoulder,  12 – right shoulder
 *   23 – left hip,       24 – right hip
 *   27 – left ankle,     28 – right ankle
 *
 * Phase logic (lateral / side view):
 *   RESTING → HOLDING when shoulder-hip-ankle alignment angle ≥ HOLD_ENTER_DEG
 *   HOLDING → RESTING when alignment angle < HOLD_EXIT_DEG (hysteresis)
 *
 * A "rep" = one complete hold-and-release cycle.
 *
 * Form checks (accumulated across the hold):
 *   LOWER_BACK_ROUNDING – alignment angle deviates > FORM_FLAG_DEG from 180°
 *   ASYMMETRIC_HIPS     – L/R hip Y-coordinate delta > ASYMMETRY_Y_THRESHOLD
 */

import type {
  ExerciseAnalyzer,
  FormFlag,
  PoseFrame,
  RepCandidate,
} from "../repCounter";

// ---------------------------------------------------------------------------
// MediaPipe landmark indices
// ---------------------------------------------------------------------------
const LM = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const;

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------
const PLANK_CONFIG = {
  HOLD_ENTER_DEG: 160,       // alignment angle to enter HOLDING
  HOLD_EXIT_DEG: 150,        // alignment angle to exit HOLDING (hysteresis)
  FORM_FLAG_DEG: 15,         // max deviation from 180° before flagging LOWER_BACK_ROUNDING
  ASYMMETRY_Y_THRESHOLD: 0.05, // L/R hip Y-delta (normalized) for ASYMMETRIC_HIPS
  MIN_HOLD_MS: 1000,         // minimum hold duration to count as a rep
} as const;

type PlankPhase = "RESTING" | "HOLDING";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function angleDeg(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const mag = Math.sqrt(ab.x ** 2 + ab.y ** 2) * Math.sqrt(cb.x ** 2 + cb.y ** 2);
  if (mag === 0) return 0;
  return (Math.acos(Math.min(1, Math.max(-1, dot / mag))) * 180) / Math.PI;
}

function buildAuditSnapshot(frame: PoseFrame): number[] {
  return [
    LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER,
    LM.LEFT_HIP, LM.RIGHT_HIP,
    LM.LEFT_ANKLE, LM.RIGHT_ANKLE,
  ].flatMap((i) => [
    Math.round((frame[i]?.x ?? 0) * 1000) / 1000,
    Math.round((frame[i]?.y ?? 0) * 1000) / 1000,
  ]);
}

// ---------------------------------------------------------------------------
// PlankAnalyzer
// ---------------------------------------------------------------------------

export class PlankAnalyzer implements ExerciseAnalyzer {
  readonly exerciseId = "plank";
  readonly requiredLandmarks = [
    LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER,
    LM.LEFT_HIP, LM.RIGHT_HIP,
    LM.LEFT_ANKLE, LM.RIGHT_ANKLE,
  ];

  private phase: PlankPhase = "RESTING";
  private holdStartMs = 0;
  private repFlags: FormFlag[] = [];

  processFrame(frame: PoseFrame, sessionMs: number): RepCandidate | null {
    // Compute midpoints for each segment
    const shoulderMid = {
      x: (frame[LM.LEFT_SHOULDER].x + frame[LM.RIGHT_SHOULDER].x) / 2,
      y: (frame[LM.LEFT_SHOULDER].y + frame[LM.RIGHT_SHOULDER].y) / 2,
    };
    const hipMid = {
      x: (frame[LM.LEFT_HIP].x + frame[LM.RIGHT_HIP].x) / 2,
      y: (frame[LM.LEFT_HIP].y + frame[LM.RIGHT_HIP].y) / 2,
    };
    const ankleMid = {
      x: (frame[LM.LEFT_ANKLE].x + frame[LM.RIGHT_ANKLE].x) / 2,
      y: (frame[LM.LEFT_ANKLE].y + frame[LM.RIGHT_ANKLE].y) / 2,
    };

    const alignmentAngle = angleDeg(shoulderMid, hipMid, ankleMid);
    const lhY = frame[LM.LEFT_HIP].y;
    const rhY = frame[LM.RIGHT_HIP].y;

    switch (this.phase) {
      case "RESTING": {
        if (alignmentAngle >= PLANK_CONFIG.HOLD_ENTER_DEG) {
          this.phase = "HOLDING";
          this.holdStartMs = sessionMs;
          this.repFlags = [];
          // Seed flags from entry frame
          if (Math.abs(lhY - rhY) > PLANK_CONFIG.ASYMMETRY_Y_THRESHOLD) {
            this.repFlags.push("ASYMMETRIC_HIPS");
          }
          if (180 - alignmentAngle > PLANK_CONFIG.FORM_FLAG_DEG) {
            this.repFlags.push("LOWER_BACK_ROUNDING");
          }
        }
        return null;
      }

      case "HOLDING": {
        // Check exit first — do not accumulate flags for the break-out frame
        if (alignmentAngle < PLANK_CONFIG.HOLD_EXIT_DEG) {
          const durationMs = sessionMs - this.holdStartMs;
          this.phase = "RESTING";

          if (durationMs < PLANK_CONFIG.MIN_HOLD_MS) {
            // Hold too brief — discard silently
            this.repFlags = [];
            return null;
          }

          const flags = [...this.repFlags];
          const formScore = Math.max(0, 100 - flags.length * 20);
          const snapshot = buildAuditSnapshot(frame);
          this.repFlags = [];

          return { durationMs, formScore, flags, auditSnapshot: snapshot };
        }

        // Accumulate form flags across the hold (deduplicated)
        if (Math.abs(lhY - rhY) > PLANK_CONFIG.ASYMMETRY_Y_THRESHOLD) {
          if (!this.repFlags.includes("ASYMMETRIC_HIPS")) this.repFlags.push("ASYMMETRIC_HIPS");
        }
        if (180 - alignmentAngle > PLANK_CONFIG.FORM_FLAG_DEG) {
          if (!this.repFlags.includes("LOWER_BACK_ROUNDING")) this.repFlags.push("LOWER_BACK_ROUNDING");
        }

        return null;
      }
    }
  }

  reset(): void {
    this.phase = "RESTING";
    this.holdStartMs = 0;
    this.repFlags = [];
  }
}
