import { RepCounter, type ExerciseAnalyzer, type PoseFrame, type RepEvent, type Landmark } from './repCounter';

export type CalibrationStatus = 'UNCALIBRATED' | 'CALIBRATING' | 'READY' | 'REJECTED';
export type CalibrationReason = 'READY_THRESHOLD_MET' | 'INSUFFICIENT_ROM' | 'NO_SIGNAL' | 'INSUFFICIENT_SIGNAL_TIMEOUT';

export interface CalibrationState {
  status: CalibrationStatus;
  exerciseId: string;
  framesSeen: number;
  range: number;
  baseline: number;
  reason?: CalibrationReason;
}

export interface ExerciseReadinessCriteria {
  requiredFrames: number;
  maxFrames: number;
  minRange: number;
  readyWindowMs: number;
  timeoutMs: number;
}

export interface CalibrationConfig {
  /** Legacy global override, retained for tests/backward compatibility. */
  requiredFrames: number;
  /** Legacy global override, retained for tests/backward compatibility. */
  maxFrames: number;
  /** Legacy per-exercise override, retained for tests/backward compatibility. */
  minRangeByExercise: Record<string, number>;
  occlusionRecoveryFrames: number;
  criteriaByExercise: Partial<Record<string, Partial<ExerciseReadinessCriteria>>>;
}

export const DEFAULT_READINESS_CRITERIA_PACK: Record<string, ExerciseReadinessCriteria> = {
  squat: { requiredFrames: 24, maxFrames: 90, minRange: 35, readyWindowMs: 500, timeoutMs: 3_000 },
  pushup: { requiredFrames: 24, maxFrames: 90, minRange: 30, readyWindowMs: 500, timeoutMs: 3_000 },
  sit_to_stand: { requiredFrames: 24, maxFrames: 90, minRange: 35, readyWindowMs: 500, timeoutMs: 3_000 },
  lunge: { requiredFrames: 24, maxFrames: 90, minRange: 30, readyWindowMs: 500, timeoutMs: 3_000 },
  calf_raise: { requiredFrames: 24, maxFrames: 100, minRange: 0.03, readyWindowMs: 500, timeoutMs: 3_300 },
  glute_bridge: { requiredFrames: 24, maxFrames: 100, minRange: 0.03, readyWindowMs: 500, timeoutMs: 3_300 },
  shoulder_abduction: { requiredFrames: 24, maxFrames: 90, minRange: 25, readyWindowMs: 500, timeoutMs: 3_000 },
  heel_raise: { requiredFrames: 24, maxFrames: 100, minRange: 0.03, readyWindowMs: 500, timeoutMs: 3_300 },
  knee_extension: { requiredFrames: 24, maxFrames: 90, minRange: 35, readyWindowMs: 500, timeoutMs: 3_000 },
  plank_hold: { requiredFrames: 24, maxFrames: 90, minRange: 8, readyWindowMs: 500, timeoutMs: 3_000 },
};

const DEFAULT_CFG: CalibrationConfig = {
  requiredFrames: 24,
  maxFrames: 90,
  minRangeByExercise: Object.fromEntries(
    Object.entries(DEFAULT_READINESS_CRITERIA_PACK).map(([id, c]) => [id, c.minRange]),
  ),
  occlusionRecoveryFrames: 5,
  criteriaByExercise: {},
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

function readinessCriteriaFor(exerciseId: string, cfg: CalibrationConfig): ExerciseReadinessCriteria {
  const base = DEFAULT_READINESS_CRITERIA_PACK[exerciseId] ?? { requiredFrames: 24, maxFrames: 90, minRange: 20, readyWindowMs: 500, timeoutMs: 3_000 };
  const perExercise = cfg.criteriaByExercise[exerciseId] ?? {};
  return {
    requiredFrames: perExercise.requiredFrames ?? cfg.requiredFrames ?? base.requiredFrames,
    maxFrames: perExercise.maxFrames ?? cfg.maxFrames ?? base.maxFrames,
    minRange: perExercise.minRange ?? cfg.minRangeByExercise[exerciseId] ?? base.minRange,
    readyWindowMs: perExercise.readyWindowMs ?? base.readyWindowMs,
    timeoutMs: perExercise.timeoutMs ?? base.timeoutMs,
  };
}

export class StabilizedRepCounter {
  private readonly repCounter: RepCounter;
  private readonly cfg: CalibrationConfig;
  private readonly criteria: ExerciseReadinessCriteria;
  private samples: number[] = [];
  private occluded = false;
  private recoverySeen = 0;
  private calibrationStartMs?: number;
  private state: CalibrationState;

  constructor(analyzer: ExerciseAnalyzer, targetReps: number, cfg: Partial<CalibrationConfig> = {}) {
    this.repCounter = new RepCounter(analyzer, targetReps);
    this.cfg = {
      ...DEFAULT_CFG,
      ...cfg,
      minRangeByExercise: { ...DEFAULT_CFG.minRangeByExercise, ...(cfg.minRangeByExercise ?? {}) },
      criteriaByExercise: { ...DEFAULT_CFG.criteriaByExercise, ...(cfg.criteriaByExercise ?? {}) },
    };
    this.criteria = readinessCriteriaFor(analyzer.exerciseId, this.cfg);
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
      return this.calibrate(frame, sessionMs);
    }

    return this.repCounter.processFrame(frame, sessionMs);
  }

  getCalibrationState(): CalibrationState {
    return { ...this.state };
  }

  endSession() { return this.repCounter.endSession(); }
  getSession() { return this.repCounter.getSession(); }
  resume() { return this.repCounter.resume(); }

  private calibrate(frame: PoseFrame, sessionMs: number): null {
    this.state.status = this.state.status === 'UNCALIBRATED' ? 'CALIBRATING' : this.state.status;
    if (this.calibrationStartMs === undefined) this.calibrationStartMs = sessionMs;

    const m = metricForExercise(this.state.exerciseId, frame);
    this.samples.push(m);
    this.state.framesSeen = this.samples.length;

    const min = Math.min(...this.samples);
    const max = Math.max(...this.samples);
    this.state.range = max - min;
    this.state.baseline = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;

    const elapsedMs = sessionMs - this.calibrationStartMs;
    if (
      this.samples.length >= this.criteria.requiredFrames &&
      this.state.range >= this.criteria.minRange &&
      elapsedMs >= this.criteria.readyWindowMs
    ) {
      this.state.status = 'READY';
      this.state.reason = 'READY_THRESHOLD_MET';
      this.samples = [];
      return null;
    }

    if (elapsedMs >= this.criteria.timeoutMs) {
      this.state.status = 'REJECTED';
      this.state.reason = this.state.range > 0 ? 'INSUFFICIENT_ROM' : 'NO_SIGNAL';
      this.samples = [];
      return null;
    }

    if (this.samples.length >= this.criteria.maxFrames) {
      this.state.status = 'REJECTED';
      this.state.reason = this.state.range > 0 ? 'INSUFFICIENT_ROM' : 'NO_SIGNAL';
      this.samples = [];
      return null;
    }

    return null;
  }
}
