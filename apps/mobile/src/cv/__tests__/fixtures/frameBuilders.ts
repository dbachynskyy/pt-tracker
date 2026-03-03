/**
 * fixtures/frameBuilders.ts
 *
 * Synthetic PoseFrame generators for unit tests.
 * No camera or model dependency — pure geometry.
 *
 * Geometry convention:
 *   For a joint angle θ at vertex B between B→A (proximal) and B→C (distal),
 *   with C directly below B (distal direction = (0, +shinLen)):
 *     A.y = B.y + segLen * cos(θ)   (y increases downward in image coords)
 *     A.x = B.x ± segLen * sin(θ)  (sign: +1 right side, -1 left side)
 */

import type { Landmark, PoseFrame } from "../../repCounter";

// ---------------------------------------------------------------------------
// MediaPipe landmark indices
// ---------------------------------------------------------------------------
const LM_SQUAT = {
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
} as const;

const LM_PUSH = {
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function blank(visibility = 0.99): PoseFrame {
  return Array.from({ length: 33 }, (): Landmark => ({
    x: 0.5, y: 0.5, z: 0, visibility,
  }));
}

/**
 * Compute the proximal joint (e.g., hip, shoulder) position for a desired
 * angle at the vertex joint (e.g., knee, elbow), assuming the distal joint
 * (e.g., ankle, wrist) is directly below the vertex.
 *
 * sign: +1 for right side (proximal swings right as angle decreases from 180°)
 *       -1 for left side (proximal swings left)
 */
function proximalJoint(
  vx: number, vy: number, // vertex (knee or elbow)
  angleDeg: number,
  segLen: number,
  sign: 1 | -1,
): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: vx + sign * Math.sin(rad) * segLen, y: vy + Math.cos(rad) * segLen };
}

/** Linearly interpolate, with inclusive endpoint when i === n-1 */
function lerp(from: number, to: number, i: number, n: number): number {
  if (n <= 1) return to;
  return from + (i / (n - 1)) * (to - from);
}

// ---------------------------------------------------------------------------
// Squat frame builder
// ---------------------------------------------------------------------------

export interface SquatFrameOpts {
  /** Override bottom angle for the left knee only (right uses kneeAngleDeg). */
  leftKneeAngleDeg?: number;
  visibility?: number;
}

export function squatFrame(
  kneeAngleDeg: number,
  opts: SquatFrameOpts = {},
): PoseFrame {
  const { leftKneeAngleDeg = kneeAngleDeg, visibility = 0.99 } = opts;
  const frame = blank(visibility);
  const shin = 0.25, thigh = 0.25;

  const rK = { x: 0.62, y: 0.65 };
  const rH = proximalJoint(rK.x, rK.y, kneeAngleDeg, thigh, 1);
  frame[LM_SQUAT.RIGHT_HIP]   = { x: rH.x, y: rH.y,          z: 0, visibility };
  frame[LM_SQUAT.RIGHT_KNEE]  = { x: rK.x, y: rK.y,          z: 0, visibility };
  frame[LM_SQUAT.RIGHT_ANKLE] = { x: rK.x, y: rK.y + shin,   z: 0, visibility };

  const lK = { x: 0.38, y: 0.65 };
  const lH = proximalJoint(lK.x, lK.y, leftKneeAngleDeg, thigh, -1);
  frame[LM_SQUAT.LEFT_HIP]    = { x: lH.x, y: lH.y,          z: 0, visibility };
  frame[LM_SQUAT.LEFT_KNEE]   = { x: lK.x, y: lK.y,          z: 0, visibility };
  frame[LM_SQUAT.LEFT_ANKLE]  = { x: lK.x, y: lK.y + shin,   z: 0, visibility };

  return frame;
}

// ---------------------------------------------------------------------------
// Pushup frame builder
// ---------------------------------------------------------------------------

export interface PushupFrameOpts {
  /** Override bottom angle for the left elbow only. */
  leftElbowAngleDeg?: number;
  /** Hip-alignment deviation from 180° in degrees (triggers LOWER_BACK_ROUNDING if > 15). */
  hipDeviationDeg?: number;
  visibility?: number;
}

export function pushupFrame(
  elbowAngleDeg: number,
  opts: PushupFrameOpts = {},
): PoseFrame {
  const { leftElbowAngleDeg = elbowAngleDeg, hipDeviationDeg = 0, visibility = 0.99 } = opts;
  const frame = blank(visibility);
  const fore = 0.22, upper = 0.22;

  const rE = { x: 0.62, y: 0.65 };
  const rS = proximalJoint(rE.x, rE.y, elbowAngleDeg, upper, 1);
  frame[LM_PUSH.RIGHT_SHOULDER] = { x: rS.x, y: rS.y,          z: 0, visibility };
  frame[LM_PUSH.RIGHT_ELBOW]    = { x: rE.x, y: rE.y,          z: 0, visibility };
  frame[LM_PUSH.RIGHT_WRIST]    = { x: rE.x, y: rE.y + fore,   z: 0, visibility };

  const lE = { x: 0.38, y: 0.65 };
  const lS = proximalJoint(lE.x, lE.y, leftElbowAngleDeg, upper, -1);
  frame[LM_PUSH.LEFT_SHOULDER]  = { x: lS.x, y: lS.y,          z: 0, visibility };
  frame[LM_PUSH.LEFT_ELBOW]     = { x: lE.x, y: lE.y,          z: 0, visibility };
  frame[LM_PUSH.LEFT_WRIST]     = { x: lE.x, y: lE.y + fore,   z: 0, visibility };

  // Hip midpoint offset produces the desired hipAlignmentAngle deviation
  const shoulderMidY = (rS.y + lS.y) / 2;
  const hipBaseY = shoulderMidY + 0.25;
  const hipOffsetX = hipDeviationDeg !== 0
    ? Math.sin((hipDeviationDeg * Math.PI) / 180) * 0.1
    : 0;
  const ankleY = hipBaseY + 0.25;

  frame[LM_PUSH.RIGHT_HIP]    = { x: 0.5 + hipOffsetX + 0.03, y: hipBaseY, z: 0, visibility };
  frame[LM_PUSH.LEFT_HIP]     = { x: 0.5 + hipOffsetX - 0.03, y: hipBaseY, z: 0, visibility };
  frame[LM_PUSH.RIGHT_ANKLE]  = { x: 0.53, y: ankleY, z: 0, visibility };
  frame[LM_PUSH.LEFT_ANKLE]   = { x: 0.47, y: ankleY, z: 0, visibility };

  return frame;
}

// ---------------------------------------------------------------------------
// Rep-sequence builders
// ---------------------------------------------------------------------------

export interface SquatSeqOpts {
  /** Separate bottom angle for the left knee to test asymmetry. */
  leftDownAngle?: number;
  visibility?: number;
}

/**
 * Generate a sequence of PoseFrames + timestamps for N squat reps.
 * Uses inclusive endpoint interpolation: the last descent frame is exactly
 * `downAngle`, the last ascent frame is exactly `upAngle`.
 */
export function squatRepSequence(
  reps: number,
  repDurationMs: number,
  fps = 30,
  upAngle = 170,
  downAngle = 80,
  opts: SquatSeqOpts = {},
): Array<{ frame: PoseFrame; ms: number }> {
  const { leftDownAngle = downAngle, visibility } = opts;
  const frameDurMs = 1000 / fps;
  const framesPerRep = Math.max(2, Math.round(repDurationMs / frameDurMs));
  const halfFrames = Math.max(1, Math.floor(framesPerRep / 2));
  const ascentFrames = framesPerRep - halfFrames;

  const result: Array<{ frame: PoseFrame; ms: number }> = [];

  // 11 warmup frames at the UP position
  for (let i = 0; i < 11; i++) {
    result.push({ frame: squatFrame(upAngle, { leftKneeAngleDeg: upAngle, visibility }), ms: i * frameDurMs });
  }

  let t = 11 * frameDurMs;

  for (let rep = 0; rep < reps; rep++) {
    // Descent: upAngle → downAngle (inclusive endpoint at i = halfFrames-1)
    for (let i = 0; i < halfFrames; i++) {
      const rightAngle = lerp(upAngle, downAngle, i, halfFrames);
      const leftAngle  = lerp(upAngle, leftDownAngle, i, halfFrames);
      result.push({ frame: squatFrame(rightAngle, { leftKneeAngleDeg: leftAngle, visibility }), ms: t });
      t += frameDurMs;
    }
    // Ascent: downAngle → upAngle (inclusive endpoint at i = ascentFrames-1)
    for (let i = 0; i < ascentFrames; i++) {
      const rightAngle = lerp(downAngle, upAngle, i, ascentFrames);
      const leftAngle  = lerp(leftDownAngle, upAngle, i, ascentFrames);
      result.push({ frame: squatFrame(rightAngle, { leftKneeAngleDeg: leftAngle, visibility }), ms: t });
      t += frameDurMs;
    }
  }

  return result;
}

export interface PushupSeqOpts {
  /** Separate bottom angle for the left elbow to test asymmetry/flare. */
  leftDownAngle?: number;
  hipDeviationDeg?: number;
  visibility?: number;
}

export function pushupRepSequence(
  reps: number,
  repDurationMs: number,
  fps = 30,
  upAngle = 165,
  downAngle = 80,
  opts: PushupSeqOpts = {},
): Array<{ frame: PoseFrame; ms: number }> {
  const { leftDownAngle = downAngle, hipDeviationDeg = 0, visibility } = opts;
  const frameDurMs = 1000 / fps;
  const framesPerRep = Math.max(2, Math.round(repDurationMs / frameDurMs));
  const halfFrames = Math.max(1, Math.floor(framesPerRep / 2));
  const ascentFrames = framesPerRep - halfFrames;

  const result: Array<{ frame: PoseFrame; ms: number }> = [];

  for (let i = 0; i < 11; i++) {
    result.push({ frame: pushupFrame(upAngle, { leftElbowAngleDeg: upAngle, hipDeviationDeg, visibility }), ms: i * frameDurMs });
  }

  let t = 11 * frameDurMs;

  for (let rep = 0; rep < reps; rep++) {
    for (let i = 0; i < halfFrames; i++) {
      const rightAngle = lerp(upAngle, downAngle, i, halfFrames);
      const leftAngle  = lerp(upAngle, leftDownAngle, i, halfFrames);
      result.push({ frame: pushupFrame(rightAngle, { leftElbowAngleDeg: leftAngle, hipDeviationDeg, visibility }), ms: t });
      t += frameDurMs;
    }
    for (let i = 0; i < ascentFrames; i++) {
      const rightAngle = lerp(downAngle, upAngle, i, ascentFrames);
      const leftAngle  = lerp(leftDownAngle, upAngle, i, ascentFrames);
      result.push({ frame: pushupFrame(rightAngle, { leftElbowAngleDeg: leftAngle, hipDeviationDeg, visibility }), ms: t });
      t += frameDurMs;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Test-driving helper
// ---------------------------------------------------------------------------

import { RepCounter, type RepEvent } from "../../repCounter";

export function driveCounter(
  counter: RepCounter,
  sequence: Array<{ frame: PoseFrame; ms: number }>,
): RepEvent[] {
  const events: RepEvent[] = [];
  for (const { frame, ms } of sequence) {
    const ev = counter.processFrame(frame, ms);
    if (ev) events.push(ev);
  }
  return events;
}
