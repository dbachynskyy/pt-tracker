/**
 * exercises/pushup.ts
 *
 * ExerciseAnalyzer plugin for the standard / rehab push-up.
 *
 * Key joints tracked (MediaPipe Pose indices):
 *   11 – left shoulder,  12 – right shoulder
 *   13 – left elbow,     14 – right elbow
 *   15 – left wrist,     16 – right wrist
 *   23 – left hip,       24 – right hip
 *
 * Phase logic (lateral view, right side primary):
 *   UP   → elbow angle > ELBOW_ANGLE_UP_THRESHOLD   (e.g., 160°)
 *   DOWN → elbow angle < ELBOW_ANGLE_DOWN_THRESHOLD  (e.g., 90°)
 *
 * A complete rep = UP → DOWN → UP
 *
 * Additional checks:
 *   - Hip sag / pike: hip-shoulder-ankle collinearity (sagittal plane)
 *   - Elbow flare: elbow abduction angle from torso midline > 45°
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
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const;

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------
const PUSHUP_CONFIG = {
  ELBOW_ANGLE_UP_DEG: 160,    // "top" — arms extended
  ELBOW_ANGLE_DOWN_DEG: 90,   // "bottom" — chest near floor
  HIP_DEVIATION_DEG: 15,      // hip sag/pike tolerance from neutral line
  ELBOW_FLARE_DEG: 45,        // elbow-out-from-torso angle that triggers flag
  MIN_REP_MS: 600,             // pushup-specific minimum rep duration
} as const;

type PushupPhase = "UP" | "DOWN" | "SEEKING_DOWN";

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

/**
 * Estimate whether hips are sagging or piking.
 * Uses shoulder → hip → ankle angle; neutral ≈ 180°.
 */
function hipAlignmentAngle(frame: PoseFrame): number {
  const shoulder = {
    x: (frame[LM.LEFT_SHOULDER].x + frame[LM.RIGHT_SHOULDER].x) / 2,
    y: (frame[LM.LEFT_SHOULDER].y + frame[LM.RIGHT_SHOULDER].y) / 2,
  };
  const hip = {
    x: (frame[LM.LEFT_HIP].x + frame[LM.RIGHT_HIP].x) / 2,
    y: (frame[LM.LEFT_HIP].y + frame[LM.RIGHT_HIP].y) / 2,
  };
  const ankle = {
    x: (frame[LM.LEFT_ANKLE].x + frame[LM.RIGHT_ANKLE].x) / 2,
    y: (frame[LM.LEFT_ANKLE].y + frame[LM.RIGHT_ANKLE].y) / 2,
  };
  return angleDeg(shoulder, hip, ankle);
}

function buildAuditSnapshot(frame: PoseFrame): number[] {
  return [
    LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER,
    LM.LEFT_ELBOW, LM.RIGHT_ELBOW,
    LM.LEFT_WRIST, LM.RIGHT_WRIST,
  ].flatMap((i) => [
    Math.round((frame[i]?.x ?? 0) * 1000) / 1000,
    Math.round((frame[i]?.y ?? 0) * 1000) / 1000,
  ]);
}

// ---------------------------------------------------------------------------
// PushupAnalyzer
// ---------------------------------------------------------------------------

export class PushupAnalyzer implements ExerciseAnalyzer {
  readonly exerciseId = "pushup";
  readonly requiredLandmarks = [
    LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER,
    LM.LEFT_ELBOW, LM.RIGHT_ELBOW,
    LM.LEFT_WRIST, LM.RIGHT_WRIST,
    LM.LEFT_HIP, LM.RIGHT_HIP,
  ];

  private phase: PushupPhase = "UP";
  private repStartMs = 0;
  private minElbowAngle = 180; // track lowest angle reached this rep
  // Flags accumulated during the descent/bottom phase for the whole rep
  private repFlags: FormFlag[] = [];

  processFrame(frame: PoseFrame, sessionMs: number): RepCandidate | null {
    const rightElbowAngle = angleDeg(
      frame[LM.RIGHT_SHOULDER],
      frame[LM.RIGHT_ELBOW],
      frame[LM.RIGHT_WRIST],
    );
    const leftElbowAngle = angleDeg(
      frame[LM.LEFT_SHOULDER],
      frame[LM.LEFT_ELBOW],
      frame[LM.LEFT_WRIST],
    );
    const elbowAngle = (rightElbowAngle + leftElbowAngle) / 2;

    const hipAngle = hipAlignmentAngle(frame);

    const frameFlags: FormFlag[] = [];

    // Hip deviation check — accumulate across rep
    if (Math.abs(hipAngle - 180) > PUSHUP_CONFIG.HIP_DEVIATION_DEG) {
      frameFlags.push("LOWER_BACK_ROUNDING");
    }

    // Elbow flare check (2-D proxy — full impl would use z depth)
    if (Math.abs(rightElbowAngle - leftElbowAngle) > PUSHUP_CONFIG.ELBOW_FLARE_DEG) {
      frameFlags.push("ELBOW_FLARE");
    }

    // Accumulate flags across the rep (deduplicated on emit)
    for (const f of frameFlags) {
      if (!this.repFlags.includes(f)) this.repFlags.push(f);
    }

    // Phase state machine
    switch (this.phase) {
      case "UP": {
        if (elbowAngle < PUSHUP_CONFIG.ELBOW_ANGLE_DOWN_DEG) {
          this.phase = "DOWN";
          this.repStartMs = sessionMs;
          this.minElbowAngle = elbowAngle;
        } else if (elbowAngle < PUSHUP_CONFIG.ELBOW_ANGLE_UP_DEG) {
          this.phase = "SEEKING_DOWN";
          this.repStartMs = sessionMs;
          this.minElbowAngle = elbowAngle;
        }
        break;
      }

      case "SEEKING_DOWN": {
        this.minElbowAngle = Math.min(this.minElbowAngle, elbowAngle);
        if (elbowAngle < PUSHUP_CONFIG.ELBOW_ANGLE_DOWN_DEG) {
          this.phase = "DOWN";
        } else if (elbowAngle >= PUSHUP_CONFIG.ELBOW_ANGLE_UP_DEG) {
          // Partial rep — returned to UP without reaching full depth; count with flag
          const durationMs = sessionMs - this.repStartMs;
          const flags: FormFlag[] = [...this.repFlags, "PARTIAL_ROM"];
          if (durationMs < PUSHUP_CONFIG.MIN_REP_MS) flags.push("TOO_FAST");
          const formScore = Math.max(0, 100 - flags.length * 20);
          const snapshot = buildAuditSnapshot(frame);
          this.phase = "UP";
          this.minElbowAngle = 180;
          this.repFlags = [];
          return { durationMs, formScore, flags, auditSnapshot: snapshot };
        }
        break;
      }

      case "DOWN": {
        this.minElbowAngle = Math.min(this.minElbowAngle, elbowAngle);
        if (elbowAngle >= PUSHUP_CONFIG.ELBOW_ANGLE_UP_DEG) {
          const durationMs = sessionMs - this.repStartMs;
          const flags = [...this.repFlags];

          // PARTIAL_ROM: never crossed the DOWN threshold
          if (this.minElbowAngle > PUSHUP_CONFIG.ELBOW_ANGLE_DOWN_DEG) {
            flags.push("PARTIAL_ROM");
          }
          if (durationMs < PUSHUP_CONFIG.MIN_REP_MS) {
            flags.push("TOO_FAST");
          }

          const formScore = Math.max(0, 100 - flags.length * 20);
          const snapshot = buildAuditSnapshot(frame);

          this.phase = "UP";
          this.repStartMs = sessionMs;
          this.minElbowAngle = 180;
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
    this.repStartMs = 0;
    this.minElbowAngle = 180;
    this.repFlags = [];
  }
}
