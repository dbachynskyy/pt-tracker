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

import type { Landmark, PoseFrame, FrameSource } from "../../repCounter";

function withSource(frame: Landmark[], source: FrameSource = "real"): PoseFrame {
  return Object.assign(frame, { source }) as PoseFrame;
}

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

function blank(visibility = 0.99, source: FrameSource = "real"): PoseFrame {
  return withSource(Array.from({ length: 33 }, (): Landmark => ({
    x: 0.5, y: 0.5, z: 0, visibility,
  })), source);
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
// Sit-to-stand sequence builder (reuses squatFrame — same joints, reversed start)
// ---------------------------------------------------------------------------

export interface SitToStandSeqOpts {
  /** Override peak standing angle for the left knee only (tests asymmetry). */
  leftStandingAngle?: number;
  visibility?: number;
}

/**
 * Generate a sequence of PoseFrames + timestamps for N sit-to-stand reps.
 * Each rep: seated (low knee angle) → standing (high knee angle) → seated.
 * Warmup frames are at seatedAngle.
 */
export function sitToStandRepSequence(
  reps: number,
  repDurationMs: number,
  fps = 30,
  seatedAngle = 90,
  standingAngle = 170,
  opts: SitToStandSeqOpts = {},
): Array<{ frame: PoseFrame; ms: number }> {
  const { leftStandingAngle = standingAngle, visibility } = opts;
  const frameDurMs = 1000 / fps;
  const framesPerRep = Math.max(2, Math.round(repDurationMs / frameDurMs));
  const ascentFrames = Math.max(1, Math.floor(framesPerRep / 2));
  const descentFrames = framesPerRep - ascentFrames;

  const result: Array<{ frame: PoseFrame; ms: number }> = [];

  // 11 warmup frames at seated position
  for (let i = 0; i < 11; i++) {
    result.push({ frame: squatFrame(seatedAngle, { leftKneeAngleDeg: seatedAngle, visibility }), ms: i * frameDurMs });
  }

  let t = 11 * frameDurMs;

  for (let rep = 0; rep < reps; rep++) {
    // Ascent: seatedAngle → standingAngle (inclusive endpoint at i = ascentFrames-1)
    for (let i = 0; i < ascentFrames; i++) {
      const rightAngle = lerp(seatedAngle, standingAngle, i, ascentFrames);
      const leftAngle  = lerp(seatedAngle, leftStandingAngle, i, ascentFrames);
      result.push({ frame: squatFrame(rightAngle, { leftKneeAngleDeg: leftAngle, visibility }), ms: t });
      t += frameDurMs;
    }
    // Descent: standingAngle → seatedAngle (inclusive endpoint at i = descentFrames-1)
    for (let i = 0; i < descentFrames; i++) {
      const rightAngle = lerp(standingAngle, seatedAngle, i, descentFrames);
      const leftAngle  = lerp(leftStandingAngle, seatedAngle, i, descentFrames);
      result.push({ frame: squatFrame(rightAngle, { leftKneeAngleDeg: leftAngle, visibility }), ms: t });
      t += frameDurMs;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Plank frame builder
// ---------------------------------------------------------------------------

const LM_PLANK = {
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
} as const;

/**
 * Compute the hip Y that produces the given shoulder-hip-ankle alignment angle.
 * Shoulder midpoint: (0.2, 0.5), Ankle midpoint: (0.8, 0.5), Hip x: 0.5.
 * A perfect 180° gives hipY = 0.5; any sag pushes hipY > 0.5.
 */
function hipYFromAlignmentAngle(alignmentAngleDeg: number): number {
  const halfWidth = 0.3; // (0.8 - 0.2) / 2
  const cosA = Math.cos((alignmentAngleDeg * Math.PI) / 180);
  if (1 - cosA < 1e-9) return 0.5; // ~180° → no sag
  const deltaSquared = (halfWidth * halfWidth * (1 + cosA)) / (1 - cosA);
  return 0.5 + Math.sqrt(Math.max(0, deltaSquared));
}

export interface PlankFrameOpts {
  /** L/R hip Y-delta (triggers ASYMMETRIC_HIPS when > 0.05). */
  asymmetryY?: number;
  visibility?: number;
}

/**
 * Build a PoseFrame for a plank at a given shoulder-hip-ankle alignment angle.
 *   alignmentAngleDeg = 180° → perfect straight body
 *   alignmentAngleDeg < 175° → hip sag (deviation > 5°)
 *   alignmentAngleDeg < 165° → triggers LOWER_BACK_ROUNDING flag (deviation > 15°)
 *   alignmentAngleDeg < 160° → below HOLD_ENTER threshold (resting position)
 */
export function plankFrame(
  alignmentAngleDeg: number,
  opts: PlankFrameOpts = {},
): PoseFrame {
  const { asymmetryY = 0, visibility = 0.99 } = opts;
  const frame = blank(visibility);
  const hipY = hipYFromAlignmentAngle(alignmentAngleDeg);

  // Shoulder midpoint at (0.2, 0.5)
  frame[LM_PLANK.LEFT_SHOULDER]  = { x: 0.2, y: 0.45, z: 0, visibility };
  frame[LM_PLANK.RIGHT_SHOULDER] = { x: 0.2, y: 0.55, z: 0, visibility };

  // Hip midpoint at (0.5, hipY), with optional L/R vertical asymmetry
  frame[LM_PLANK.LEFT_HIP]  = { x: 0.47, y: hipY - asymmetryY / 2, z: 0, visibility };
  frame[LM_PLANK.RIGHT_HIP] = { x: 0.53, y: hipY + asymmetryY / 2, z: 0, visibility };

  // Ankle midpoint at (0.8, 0.5)
  frame[LM_PLANK.LEFT_ANKLE]  = { x: 0.8, y: 0.45, z: 0, visibility };
  frame[LM_PLANK.RIGHT_ANKLE] = { x: 0.8, y: 0.55, z: 0, visibility };

  return frame;
}

export interface PlankSeqOpts {
  asymmetryY?: number;
  visibility?: number;
}

/**
 * Generate a sequence of PoseFrames + timestamps for N plank holds.
 * Each "rep" = hold at holdAngle for holdDurationMs, then return to restAngle.
 * Enough rest frames are added between holds to clear RepCounter's 500ms debounce.
 */
export function plankRepSequence(
  reps: number,
  holdDurationMs: number,
  fps = 30,
  holdAngle = 175,
  restAngle = 120,
  opts: PlankSeqOpts = {},
): Array<{ frame: PoseFrame; ms: number }> {
  const { asymmetryY = 0, visibility } = opts;
  const frameDurMs = 1000 / fps;
  const holdFrames = Math.max(2, Math.ceil(holdDurationMs / frameDurMs));
  // 20 rest frames ≈ 667 ms @ 30 fps — clears the 500 ms debounce window
  const restFrames = 20;

  const result: Array<{ frame: PoseFrame; ms: number }> = [];

  // 11 warmup frames at rest (below HOLD_ENTER_DEG threshold)
  for (let i = 0; i < 11; i++) {
    result.push({ frame: plankFrame(restAngle, { visibility }), ms: i * frameDurMs });
  }

  let t = 11 * frameDurMs;

  for (let rep = 0; rep < reps; rep++) {
    // Hold phase
    for (let i = 0; i < holdFrames; i++) {
      result.push({ frame: plankFrame(holdAngle, { asymmetryY, visibility }), ms: t });
      t += frameDurMs;
    }
    // Exit frame — triggers rep emit in PlankAnalyzer
    result.push({ frame: plankFrame(restAngle, { visibility }), ms: t });
    t += frameDurMs;
    // Rest frames (inter-rep gap)
    for (let i = 0; i < restFrames; i++) {
      result.push({ frame: plankFrame(restAngle, { visibility }), ms: t });
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
