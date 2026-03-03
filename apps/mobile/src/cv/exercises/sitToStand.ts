/**
 * exercises/sitToStand.ts
 *
 * ExerciseAnalyzer plugin for the sit-to-stand transfer (chair rise).
 *
 * Key joints tracked (MediaPipe Pose indices):
 *   23 – left hip,   24 – right hip
 *   25 – left knee,  26 – right knee
 *   27 – left ankle, 28 – right ankle
 *
 * Phase logic (sagittal view, bilateral average knee angle):
 *   SEATED   → knee angle ≤ KNEE_ANGLE_SEATED_DEG  (e.g., 100°)
 *   STANDING → knee angle ≥ KNEE_ANGLE_STANDING_DEG (e.g., 160°)
 *
 * A complete rep = SEATED → STANDING → SEATED.
 *
 * Form checks:
 *   INSUFFICIENT_DEPTH – started rising but returned to seated without
 *                        reaching full standing extension (SEEKING_STAND→SEATED path)
 *   ASYMMETRIC_HIPS    – L/R bilateral knee-angle delta > ASYMMETRY_DEG
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
} as const;

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------
const STS_CONFIG = {
  KNEE_ANGLE_SEATED_DEG: 100,   // knee angle at/below which = fully seated
  KNEE_ANGLE_STANDING_DEG: 160, // knee angle at/above which = fully standing
  ASYMMETRY_DEG: 15,            // bilateral knee-angle delta triggering ASYMMETRIC_HIPS
  MIN_REP_MS: 800,              // exercise-specific minimum rep duration
} as const;

type SitToStandPhase = "SEATED" | "STANDING" | "SEEKING_STAND";

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
    LM.LEFT_HIP, LM.RIGHT_HIP,
    LM.LEFT_KNEE, LM.RIGHT_KNEE,
    LM.LEFT_ANKLE, LM.RIGHT_ANKLE,
  ].flatMap((i) => [
    Math.round((frame[i]?.x ?? 0) * 1000) / 1000,
    Math.round((frame[i]?.y ?? 0) * 1000) / 1000,
  ]);
}

// ---------------------------------------------------------------------------
// SitToStandAnalyzer
// ---------------------------------------------------------------------------

export class SitToStandAnalyzer implements ExerciseAnalyzer {
  readonly exerciseId = "sit_to_stand";
  readonly requiredLandmarks = [
    LM.LEFT_HIP, LM.RIGHT_HIP,
    LM.LEFT_KNEE, LM.RIGHT_KNEE,
    LM.LEFT_ANKLE, LM.RIGHT_ANKLE,
  ];

  private phase: SitToStandPhase = "SEATED";
  private repStartMs = 0;
  private maxKneeAngle = 0; // track highest extension reached this ascent
  private repFlags: FormFlag[] = [];

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
    if (Math.abs(rightKneeAngle - leftKneeAngle) > STS_CONFIG.ASYMMETRY_DEG) {
      if (!this.repFlags.includes("ASYMMETRIC_HIPS")) this.repFlags.push("ASYMMETRIC_HIPS");
    }

    switch (this.phase) {
      case "SEATED": {
        if (kneeAngle >= STS_CONFIG.KNEE_ANGLE_STANDING_DEG) {
          // Fast ascent — skipped SEEKING_STAND
          this.phase = "STANDING";
          this.repStartMs = sessionMs;
          this.maxKneeAngle = kneeAngle;
        } else if (kneeAngle > STS_CONFIG.KNEE_ANGLE_SEATED_DEG) {
          this.phase = "SEEKING_STAND";
          this.repStartMs = sessionMs;
          this.maxKneeAngle = kneeAngle;
        }
        break;
      }

      case "SEEKING_STAND": {
        this.maxKneeAngle = Math.max(this.maxKneeAngle, kneeAngle);
        if (kneeAngle >= STS_CONFIG.KNEE_ANGLE_STANDING_DEG) {
          this.phase = "STANDING";
        } else if (kneeAngle <= STS_CONFIG.KNEE_ANGLE_SEATED_DEG) {
          // Partial rise — returned to seated without reaching full standing
          const durationMs = sessionMs - this.repStartMs;
          const flags: FormFlag[] = [...this.repFlags, "INSUFFICIENT_DEPTH"];
          if (durationMs < STS_CONFIG.MIN_REP_MS) flags.push("TOO_FAST");
          const formScore = Math.max(0, 100 - flags.length * 20);
          const snapshot = buildAuditSnapshot(frame);
          this.phase = "SEATED";
          this.maxKneeAngle = 0;
          this.repFlags = [];
          return { durationMs, formScore, flags, auditSnapshot: snapshot };
        }
        break;
      }

      case "STANDING": {
        this.maxKneeAngle = Math.max(this.maxKneeAngle, kneeAngle);
        if (kneeAngle <= STS_CONFIG.KNEE_ANGLE_SEATED_DEG) {
          // Full cycle complete — emit rep candidate
          const durationMs = sessionMs - this.repStartMs;
          const flags: FormFlag[] = [...this.repFlags];
          if (this.maxKneeAngle < STS_CONFIG.KNEE_ANGLE_STANDING_DEG) {
            flags.push("INSUFFICIENT_DEPTH");
          }
          if (durationMs < STS_CONFIG.MIN_REP_MS) flags.push("TOO_FAST");
          const formScore = Math.max(0, 100 - flags.length * 20);
          const snapshot = buildAuditSnapshot(frame);
          this.phase = "SEATED";
          this.maxKneeAngle = 0;
          this.repFlags = [];
          return { durationMs, formScore, flags, auditSnapshot: snapshot };
        }
        break;
      }
    }

    return null;
  }

  reset(): void {
    this.phase = "SEATED";
    this.repStartMs = 0;
    this.maxKneeAngle = 0;
    this.repFlags = [];
  }
}
