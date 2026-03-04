import type { RepEvent, PoseFrame, Landmark } from './repCounter';
import type { ExerciseId } from './exerciseRegistry';

interface CounterLike {
  processFrame(frame: PoseFrame, sessionMs: number): RepEvent | null;
}

function withSource(frame: Landmark[], source: 'real' | 'mock' | 'disconnected' = 'real'): PoseFrame {
  return Object.assign(frame, { source }) as PoseFrame;
}

function blank(visibility = 0.99): PoseFrame {
  return withSource(Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility })), 'real');
}

function proximal(vx: number, vy: number, angleDeg: number, segLen: number, sign: 1 | -1): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: vx + sign * Math.sin(rad) * segLen, y: vy + Math.cos(rad) * segLen };
}

function kneeFrame(kneeAngleDeg: number): PoseFrame {
  const f = blank();
  const shin = 0.25, thigh = 0.25;
  const rK = { x: 0.62, y: 0.65 }, lK = { x: 0.38, y: 0.65 };
  const rH = proximal(rK.x, rK.y, kneeAngleDeg, thigh, 1), lH = proximal(lK.x, lK.y, kneeAngleDeg, thigh, -1);
  f[24] = { x: rH.x, y: rH.y, z: 0, visibility: 0.99 }; f[26] = { x: rK.x, y: rK.y, z: 0, visibility: 0.99 }; f[28] = { x: rK.x, y: rK.y + shin, z: 0, visibility: 0.99 };
  f[23] = { x: lH.x, y: lH.y, z: 0, visibility: 0.99 }; f[25] = { x: lK.x, y: lK.y, z: 0, visibility: 0.99 }; f[27] = { x: lK.x, y: lK.y + shin, z: 0, visibility: 0.99 };
  return f;
}

function elbowFrame(elbowAngleDeg: number): PoseFrame {
  const f = blank();
  const fore = 0.22, upper = 0.22;
  const rE = { x: 0.62, y: 0.65 }, lE = { x: 0.38, y: 0.65 };
  const rS = proximal(rE.x, rE.y, elbowAngleDeg, upper, 1), lS = proximal(lE.x, lE.y, elbowAngleDeg, upper, -1);
  f[12] = { x: rS.x, y: rS.y, z: 0, visibility: 0.99 }; f[14] = { x: rE.x, y: rE.y, z: 0, visibility: 0.99 }; f[16] = { x: rE.x, y: rE.y + fore, z: 0, visibility: 0.99 };
  f[11] = { x: lS.x, y: lS.y, z: 0, visibility: 0.99 }; f[13] = { x: lE.x, y: lE.y, z: 0, visibility: 0.99 }; f[15] = { x: lE.x, y: lE.y + fore, z: 0, visibility: 0.99 };
  f[23] = { x: 0.47, y: 0.92, z: 0, visibility: 0.99 }; f[24] = { x: 0.53, y: 0.92, z: 0, visibility: 0.99 };
  return f;
}

function ankleFrame(delta: number): PoseFrame {
  const f = blank();
  f[27] = { x: 0.45, y: 0.7, z: 0, visibility: 0.99 }; f[28] = { x: 0.55, y: 0.7, z: 0, visibility: 0.99 };
  f[31] = { x: 0.45, y: 0.7 - delta, z: 0, visibility: 0.99 }; f[32] = { x: 0.55, y: 0.7 - delta, z: 0, visibility: 0.99 };
  return f;
}

function shoulderAbductionFrame(angleDeg: number): PoseFrame {
  const f = blank();
  const r = (angleDeg * Math.PI) / 180;
  f[23] = { x: 0.4, y: 0.75, z: 0, visibility: 0.99 }; f[11] = { x: 0.4, y: 0.55, z: 0, visibility: 0.99 };
  f[24] = { x: 0.6, y: 0.75, z: 0, visibility: 0.99 }; f[12] = { x: 0.6, y: 0.55, z: 0, visibility: 0.99 };
  f[13] = { x: 0.4 - Math.sin(r) * 0.2, y: 0.55 + Math.cos(r) * 0.2, z: 0, visibility: 0.99 };
  f[14] = { x: 0.6 + Math.sin(r) * 0.2, y: 0.55 + Math.cos(r) * 0.2, z: 0, visibility: 0.99 };
  return f;
}

function bridgeFrame(height: number): PoseFrame {
  const f = blank();
  f[11] = { x: 0.4, y: 0.45, z: 0, visibility: 0.99 }; f[12] = { x: 0.6, y: 0.45, z: 0, visibility: 0.99 };
  f[23] = { x: 0.47, y: 0.6 - height, z: 0, visibility: 0.99 }; f[24] = { x: 0.53, y: 0.6 - height, z: 0, visibility: 0.99 };
  f[25] = { x: 0.47, y: 0.75, z: 0, visibility: 0.99 }; f[26] = { x: 0.53, y: 0.75, z: 0, visibility: 0.99 };
  return f;
}

interface SimConfig { up: number; down: number; repMs: number; fps: number; makeFrame: (v: number) => PoseFrame }

const SIM_CONFIGS: Record<ExerciseId, SimConfig> = {
  squat: { up: 170, down: 80, repMs: 1500, fps: 30, makeFrame: kneeFrame },
  pushup: { up: 165, down: 80, repMs: 1200, fps: 30, makeFrame: elbowFrame },
  sit_to_stand: { up: 170, down: 90, repMs: 1500, fps: 30, makeFrame: kneeFrame },
  lunge: { up: 170, down: 85, repMs: 1400, fps: 30, makeFrame: kneeFrame },
  calf_raise: { up: 0.09, down: 0.01, repMs: 900, fps: 30, makeFrame: ankleFrame },
  glute_bridge: { up: 0.09, down: 0.01, repMs: 1200, fps: 30, makeFrame: bridgeFrame },
  shoulder_abduction: { up: 140, down: 20, repMs: 1000, fps: 30, makeFrame: shoulderAbductionFrame },
  heel_raise: { up: 0.09, down: 0.01, repMs: 900, fps: 30, makeFrame: ankleFrame },
  knee_extension: { up: 170, down: 95, repMs: 1000, fps: 30, makeFrame: kneeFrame },
  plank_hold: { up: 175, down: 120, repMs: 1800, fps: 30, makeFrame: (a) => {
    // simple midpoint plank proxy
    const f = blank();
    const sag = (180 - a) / 180 * 0.2;
    f[11] = { x: 0.2, y: 0.45, z: 0, visibility: 0.99 }; f[12] = { x: 0.2, y: 0.55, z: 0, visibility: 0.99 };
    f[23] = { x: 0.47, y: 0.5 + sag, z: 0, visibility: 0.99 }; f[24] = { x: 0.53, y: 0.5 + sag, z: 0, visibility: 0.99 };
    f[27] = { x: 0.8, y: 0.45, z: 0, visibility: 0.99 }; f[28] = { x: 0.8, y: 0.55, z: 0, visibility: 0.99 };
    return f;
  } },
};

export class MockSimulation {
  private config: SimConfig;
  private counter: CounterLike;
  private onRep: (event: RepEvent) => void;
  private onFrame?: (frame: PoseFrame, sessionMs: number) => void;

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private sessionMs = 0;
  private frameIndex = 0;
  private phaseProgress = 0;
  private descending = true;

  static readonly WARMUP_EXTRA = 11;

  constructor(exerciseId: ExerciseId, counter: CounterLike, onRep: (event: RepEvent) => void, onFrame?: (frame: PoseFrame, sessionMs: number) => void) {
    this.config = SIM_CONFIGS[exerciseId] ?? SIM_CONFIGS.squat;
    this.counter = counter;
    this.onRep = onRep;
    this.onFrame = onFrame;
  }

  start(): void {
    if (this.intervalId !== null) return;
    const { fps, makeFrame, up, down, repMs } = this.config;
    const frameDurMs = 1000 / fps;
    const halfFrames = Math.round(repMs / 2 / frameDurMs);

    this.intervalId = setInterval(() => {
      this.sessionMs += frameDurMs;
      this.frameIndex++;

      if (this.frameIndex <= MockSimulation.WARMUP_EXTRA) {
        const wf = makeFrame(up);
        this.onFrame?.(wf, this.sessionMs);
        this.counter.processFrame(wf, this.sessionMs);
        return;
      }

      const alpha = this.phaseProgress / halfFrames;
      const v = this.descending ? up + alpha * (down - up) : down + alpha * (up - down);
      const frame = makeFrame(Math.max(Math.min(up, down), Math.min(Math.max(up, down), v)));
      this.onFrame?.(frame, this.sessionMs);
      const event = this.counter.processFrame(frame, this.sessionMs);
      if (event) this.onRep(event);

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
