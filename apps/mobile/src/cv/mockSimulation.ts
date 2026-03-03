/**
 * mockSimulation.ts
 *
 * Drives a RepCounter with a synthetic pose-landmark stream so the session
 * screen can be exercised without a live camera.  No MediaPipe dependency.
 *
 * Usage:
 *   const sim = new MockSimulation("squat", counter, onRep);
 *   sim.start();   // begins emitting ~30 fps synthetic frames
 *   sim.stop();    // clears the timer
 */

import { RepCounter, type RepEvent, type PoseFrame } from "./repCounter";

// ---------------------------------------------------------------------------
// Internal frame helpers (duplicates frameBuilders geometry without test deps)
// ---------------------------------------------------------------------------

function blank(visibility = 0.99): PoseFrame {
  return Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility }));
}

function proximal(
  vx: number, vy: number,   // vertex (knee / elbow)
  angleDeg: number,
  segLen: number,
  sign: 1 | -1,
): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: vx + sign * Math.sin(rad) * segLen, y: vy + Math.cos(rad) * segLen };
}

function squatFrame(kneeAngleDeg: number): PoseFrame {
  const f = blank();
  const shin = 0.25;
  const thigh = 0.25;

  const rK = { x: 0.62, y: 0.65 };
  const rA = { x: rK.x, y: rK.y + shin };
  const rH = proximal(rK.x, rK.y, kneeAngleDeg, thigh, 1);
  f[24] = { x: rH.x, y: rH.y, z: 0, visibility: 0.99 };
  f[26] = { x: rK.x, y: rK.y, z: 0, visibility: 0.99 };
  f[28] = { x: rA.x, y: rA.y, z: 0, visibility: 0.99 };

  const lK = { x: 0.38, y: 0.65 };
  const lA = { x: lK.x, y: lK.y + shin };
  const lH = proximal(lK.x, lK.y, kneeAngleDeg, thigh, -1);
  f[23] = { x: lH.x, y: lH.y, z: 0, visibility: 0.99 };
  f[25] = { x: lK.x, y: lK.y, z: 0, visibility: 0.99 };
  f[27] = { x: lA.x, y: lA.y, z: 0, visibility: 0.99 };
  return f;
}

function pushupFrame(elbowAngleDeg: number): PoseFrame {
  const f = blank();
  const fore = 0.22;
  const upper = 0.22;

  const rE = { x: 0.62, y: 0.65 };
  const rW = { x: rE.x, y: rE.y + fore };
  const rS = proximal(rE.x, rE.y, elbowAngleDeg, upper, 1);
  f[12] = { x: rS.x, y: rS.y, z: 0, visibility: 0.99 };
  f[14] = { x: rE.x, y: rE.y, z: 0, visibility: 0.99 };
  f[16] = { x: rW.x, y: rW.y, z: 0, visibility: 0.99 };

  const lE = { x: 0.38, y: 0.65 };
  const lW = { x: lE.x, y: lE.y + fore };
  const lS = proximal(lE.x, lE.y, elbowAngleDeg, upper, -1);
  f[11] = { x: lS.x, y: lS.y, z: 0, visibility: 0.99 };
  f[13] = { x: lE.x, y: lE.y, z: 0, visibility: 0.99 };
  f[15] = { x: lW.x, y: lW.y, z: 0, visibility: 0.99 };

  // Hips — neutral alignment
  f[23] = { x: 0.47, y: 0.92, z: 0, visibility: 0.99 };
  f[24] = { x: 0.53, y: 0.92, z: 0, visibility: 0.99 };
  return f;
}

// ---------------------------------------------------------------------------
// Phase sequencer — cycles UP → DOWN → UP at a configurable cadence
// ---------------------------------------------------------------------------

interface SimConfig {
  upAngle: number;
  downAngle: number;
  repDurationMs: number; // full rep: descent + ascent
  fps: number;
  makeFrame: (angle: number) => PoseFrame;
}

const SIM_CONFIGS: Record<string, SimConfig> = {
  squat: {
    upAngle: 170,
    downAngle: 80,
    repDurationMs: 1500,
    fps: 30,
    makeFrame: squatFrame,
  },
  pushup: {
    upAngle: 165,
    downAngle: 80,
    repDurationMs: 1200,
    fps: 30,
    makeFrame: pushupFrame,
  },
};

// ---------------------------------------------------------------------------
// MockSimulation
// ---------------------------------------------------------------------------

export class MockSimulation {
  private config: SimConfig;
  private counter: RepCounter;
  private onRep: (event: RepEvent) => void;

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private sessionMs = 0;          // synthetic session clock
  private frameIndex = 0;         // global frame count (incl. warmup)
  private phaseProgress = 0;      // 0 → 1 within current half-rep
  private descending = true;

  static readonly WARMUP_EXTRA = 11; // emit 11 warmup frames at start

  constructor(
    exerciseId: keyof typeof SIM_CONFIGS | string,
    counter: RepCounter,
    onRep: (event: RepEvent) => void,
  ) {
    this.config = SIM_CONFIGS[exerciseId] ?? SIM_CONFIGS.squat;
    this.counter = counter;
    this.onRep = onRep;
  }

  start(): void {
    if (this.intervalId !== null) return; // already running

    const { fps, makeFrame, upAngle, downAngle, repDurationMs } = this.config;
    const frameDurMs = 1000 / fps;
    const halfFrames = Math.round(repDurationMs / 2 / frameDurMs);

    this.intervalId = setInterval(() => {
      // Synthetic session timestamp
      this.sessionMs += frameDurMs;
      this.frameIndex++;

      // During warmup, emit UP frames but don't advance phase
      if (this.frameIndex <= MockSimulation.WARMUP_EXTRA) {
        this.counter.processFrame(makeFrame(upAngle), this.sessionMs);
        return;
      }

      // Compute current angle based on phase progress
      const alpha = this.phaseProgress / halfFrames;
      const angle = this.descending
        ? upAngle + alpha * (downAngle - upAngle)
        : downAngle + alpha * (upAngle - downAngle);

      const frame = makeFrame(Math.max(downAngle, Math.min(upAngle, angle)));
      const event = this.counter.processFrame(frame, this.sessionMs);
      if (event) this.onRep(event);

      // Advance phase
      this.phaseProgress++;
      if (this.phaseProgress >= halfFrames) {
        this.phaseProgress = 0;
        this.descending = !this.descending;
      }
    }, frameDurMs);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  get isRunning(): boolean {
    return this.intervalId !== null;
  }
}
