/**
 * exercises/squat.ts
 *
 * ExerciseAnalyzer plugin for the bodyweight / rehab squat.
 *
 * Key joints tracked (MediaPipe Pose indices):
 *   23 – left hip,  24 – right hip
 *   25 – left knee, 26 – right knee
 *   27 – left ankle, 28 – right ankle
 *
 * Phase logic (sagittal view, right side primary):
 *   UP   → knee angle > KNEE_ANGLE_UP_THRESHOLD   (e.g., 160°)
 *   DOWN → knee angle < KNEE_ANGLE_DOWN_THRESHOLD  (e.g., 90°)
 *
 * A complete rep = UP → DOWN → UP
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
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
} as const;

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------
const SQUAT_CONFIG = {
  KNEE_ANGLE_UP_DEG: 160,     // "standing" — knee nearly straight
  KNEE_ANGLE_DOWN_DEG: 90,    // "bottom" — at or below parallel
  MIN_DEPTH_DEG: 110,          // knee angle ceiling for INSUFFICIENT_DEPTH flag
  ASYMMETRY_DEG: 15,           // bilateral knee-angle delta that triggers flag
  MIN_REP_MS: 800,             // squat-specific minimum rep duration
} as const;

type SquatPhase = "UP" | "DOWN" | "SEEKING_DOWN";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the angle (degrees) at vertex B formed by segments BA and BC.
 * All inputs are {x, y} in image or world coordinates.
 */
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

/** Extract compact 10-value audit snapshot for squat. */
function buildAuditSnapshot(frame: PoseFrame): number[] {
  // Store x,y for 5 key joints: L/R hip, L/R knee, L/R ankle (→ 10 values)
  return [
    LM.LEFT_HIP, LM.RIGHT_HIP,
    LM.LEFT_KNEE, LM.RIGHT_KNEE,
    LM.LEFT_ANKLE, LM.RIGHT_ANKLE,
  ].flatMap((i) => [
    Math.round((frame[i]?.x ?? 0) * 1000) / 1000,
    Math.round((frame[i]?.y ?? 0) * 1000) / 1000,
  ]);
}

// ---------------------------------------------------------------------------
// SquatAnalyzer
// ---------------------------------------------------------------------------

export class SquatAnalyzer implements ExerciseAnalyzer {
  readonly exerciseId = "squat";
  readonly requiredLandmarks = [
    LM.LEFT_HIP, LM.RIGHT_HIP,
    LM.LEFT_KNEE, LM.RIGHT_KNEE,
    LM.LEFT_ANKLE, LM.RIGHT_ANKLE,
  ];

  private phase: SquatPhase = "UP";
  private phaseStartMs = 0;
  private repStartMs = 0;
  private minKneeAngle = 180;
  private repFlags: FormFlag[] = []; // flags accumulated across the whole rep

  processFrame(frame: PoseFrame, sessionMs: number): RepCandidate | null {
    const rightKneeAngle = angleDeg(
      frame[LM.RIGHT_HIP],
      frame[LM.RIGHT_KNEE],
      frame[LM.RIGHT_ANKLE],
    );
    const leftKneeAngle = angleDeg(
      frame[LM.LEFT_HIP],
      frame[LM.LEFT_KNEE],
      frame[LM.LEFT_ANKLE],
    );
    const kneeAngle = (rightKneeAngle + leftKneeAngle) / 2;

    // Bilateral asymmetry — accumulate into repFlags (deduplicated)
    if (Math.abs(rightKneeAngle - leftKneeAngle) > SQUAT_CONFIG.ASYMMETRY_DEG) {
      if (!this.repFlags.includes("ASYMMETRIC_HIPS")) this.repFlags.push("ASYMMETRIC_HIPS");
    }

    // Phase state machine
    switch (this.phase) {
      case "UP": {
        if (kneeAngle < SQUAT_CONFIG.KNEE_ANGLE_DOWN_DEG) {
          this.phase = "DOWN";
          this.phaseStartMs = sessionMs;
          this.repStartMs = sessionMs;
          this.minKneeAngle = kneeAngle;
        } else if (kneeAngle < SQUAT_CONFIG.KNEE_ANGLE_UP_DEG) {
          this.phase = "SEEKING_DOWN";
          this.phaseStartMs = sessionMs;
          this.repStartMs = sessionMs;
          this.minKneeAngle = kneeAngle;
        }
        break;
      }

      case "SEEKING_DOWN": {
        this.minKneeAngle = Math.min(this.minKneeAngle, kneeAngle);
        if (kneeAngle < SQUAT_CONFIG.KNEE_ANGLE_DOWN_DEG) {
          this.phase = "DOWN";
        } else if (kneeAngle >= SQUAT_CONFIG.KNEE_ANGLE_UP_DEG) {
          // Partial rep — returned to UP without reaching full depth; count with flag
          const durationMs = sessionMs - this.repStartMs;
          const flags: FormFlag[] = [...this.repFlags, "INSUFFICIENT_DEPTH"];
          if (durationMs < SQUAT_CONFIG.MIN_REP_MS) flags.push("TOO_FAST");
          const formScore = Math.max(0, 100 - flags.length * 20);
          const snapshot = buildAuditSnapshot(frame);
          this.phase = "UP";
          this.minKneeAngle = 180;
          this.repFlags = [];
          return { durationMs, formScore, flags, auditSnapshot: snapshot };
        }
        break;
      }

      case "DOWN": {
        this.minKneeAngle = Math.min(this.minKneeAngle, kneeAngle);
        if (kneeAngle >= SQUAT_CONFIG.KNEE_ANGLE_UP_DEG) {
          // Full cycle complete — emit rep candidate
          const durationMs = sessionMs - this.repStartMs;
          const flags: FormFlag[] = [...this.repFlags];
          if (this.minKneeAngle > SQUAT_CONFIG.KNEE_ANGLE_DOWN_DEG) flags.push("INSUFFICIENT_DEPTH");
          if (durationMs < SQUAT_CONFIG.MIN_REP_MS) flags.push("TOO_FAST");
          const formScore = Math.max(0, 100 - flags.length * 20);
          const snapshot = buildAuditSnapshot(frame);
          this.phase = "UP";
          this.repStartMs = sessionMs;
          this.minKneeAngle = 180;
          this.repFlags = [];
          return { durationMs, formScore, flags, auditSnapshot: snapshot };
        }
        break;
      }
    }

    return null;
  }

  reset(): void {
    this.phase = "UP";
    this.phaseStartMs = 0;
    this.repStartMs = 0;
    this.minKneeAngle = 180;
    this.repFlags = [];
  }
}
