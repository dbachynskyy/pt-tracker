import { RepCounter, type ExerciseAnalyzer, type PoseFrame, type RepEvent, type Landmark } from './repCounter';

export type CalibrationStatus = 'UNCALIBRATED' | 'CALIBRATING' | 'READY' | 'REJECTED';

export interface CalibrationState {
  status: CalibrationStatus;
  exerciseId: string;
  framesSeen: number;
  range: number;
  baseline: number;
  reason?: 'INSUFFICIENT_ROM' | 'NO_SIGNAL';
}

export interface CalibrationConfig {
  requiredFrames: number;
  maxFrames: number;
  minRangeByExercise: Record<string, number>;
  occlusionRecoveryFrames: number;
}

const DEFAULT_MIN_RANGE: Record<string, number> = {
  squat: 35,
  pushup: 30,
  sit_to_stand: 35,
  lunge: 30,
  calf_raise: 0.03,
  glute_bridge: 0.03,
  shoulder_abduction: 25,
  heel_raise: 0.03,
  knee_extension: 35,
  plank_hold: 8,
};

const DEFAULT_CFG: CalibrationConfig = {
  requiredFrames: 24,
  maxFrames: 90,
  minRangeByExercise: DEFAULT_MIN_RANGE,
  occlusionRecoveryFrames: 5,
};

function angleDeg(a: Landmark, b: Landmark, c: Landmark): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const mag = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y);
  if (!mag) return 0;
  return (Math.acos(Math.min(1, Math.max(-1, dot / mag))) * 180) / Math.PI;
}

function metricForExercise(exerciseId: string, frame: PoseFrame): number {
  const avg = (a: number, b: number) => (a + b) / 2;
  switch (exerciseId) {
    case 'squat':
    case 'sit_to_stand':
    case 'lunge':
    case 'knee_extension': {
      const rk = angleDeg(frame[24], frame[26], frame[28]);
      const lk = angleDeg(frame[23], frame[25], frame[27]);
      return avg(lk, rk);
    }
    case 'pushup': {
      const re = angleDeg(frame[12], frame[14], frame[16]);
      const le = angleDeg(frame[11], frame[13], frame[15]);
      return avg(le, re);
    }
    case 'calf_raise':
    case 'heel_raise': {
      const l = frame[27].y - frame[31].y;
      const r = frame[28].y - frame[32].y;
      return avg(l, r);
    }
    case 'glute_bridge': {
      return -avg(frame[23].y, frame[24].y); // higher bridge => larger metric
    }
    case 'shoulder_abduction': {
      const l = angleDeg(frame[23], frame[11], frame[13]);
      const r = angleDeg(frame[24], frame[12], frame[14]);
      return avg(l, r);
    }
    case 'plank_hold': {
      const sh = { x: avg(frame[11].x, frame[12].x), y: avg(frame[11].y, frame[12].y), z: 0 } as Landmark;
      const hp = { x: avg(frame[23].x, frame[24].x), y: avg(frame[23].y, frame[24].y), z: 0 } as Landmark;
      const an = { x: avg(frame[27].x, frame[28].x), y: avg(frame[27].y, frame[28].y), z: 0 } as Landmark;
      return angleDeg(sh, hp, an);
    }
    default:
      return 0;
  }
}

export class StabilizedRepCounter {
  private readonly repCounter: RepCounter;
  private readonly cfg: CalibrationConfig;
  private samples: number[] = [];
  private occluded = false;
  private recoverySeen = 0;
  private state: CalibrationState;

  constructor(analyzer: ExerciseAnalyzer, targetReps: number, cfg: Partial<CalibrationConfig> = {}) {
    this.repCounter = new RepCounter(analyzer, targetReps);
    this.cfg = {
      ...DEFAULT_CFG,
      ...cfg,
      minRangeByExercise: { ...DEFAULT_CFG.minRangeByExercise, ...(cfg.minRangeByExercise ?? {}) },
    };
    this.state = {
      status: 'UNCALIBRATED',
      exerciseId: analyzer.exerciseId,
      framesSeen: 0,
      range: 0,
      baseline: 0,
    };
  }

  processFrame(frame: PoseFrame, sessionMs: number): RepEvent | null {
    if (frame.source !== 'real') {
      this.occluded = true;
      this.recoverySeen = 0;
      return null;
    }

    if (this.occluded) {
      this.recoverySeen += 1;
      if (this.recoverySeen < this.cfg.occlusionRecoveryFrames) return null;
      this.occluded = false;
      this.recoverySeen = 0;
      this.repCounter.resume();
    }

    if (this.state.status !== 'READY') {
      return this.calibrate(frame);
    }

    return this.repCounter.processFrame(frame, sessionMs);
  }

  getCalibrationState(): CalibrationState {
    return { ...this.state };
  }

  endSession() { return this.repCounter.endSession(); }
  getSession() { return this.repCounter.getSession(); }
  resume() { return this.repCounter.resume(); }

  private calibrate(frame: PoseFrame): null {
    this.state.status = this.state.status === 'UNCALIBRATED' ? 'CALIBRATING' : this.state.status;
    const m = metricForExercise(this.state.exerciseId, frame);
    this.samples.push(m);
    this.state.framesSeen = this.samples.length;

    const min = Math.min(...this.samples);
    const max = Math.max(...this.samples);
    this.state.range = max - min;
    this.state.baseline = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;

    const minRange = this.cfg.minRangeByExercise[this.state.exerciseId] ?? 20;
    if (this.samples.length >= this.cfg.requiredFrames && this.state.range >= minRange) {
      this.state.status = 'READY';
      this.samples = [];
      return null;
    }

    if (this.samples.length >= this.cfg.maxFrames) {
      this.state.status = 'REJECTED';
      this.state.reason = this.state.range > 0 ? 'INSUFFICIENT_ROM' : 'NO_SIGNAL';
      this.samples = [];
      return null;
    }

    return null;
  }
}
