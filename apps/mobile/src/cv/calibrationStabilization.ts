import { RepCounter, type ExerciseAnalyzer, type PoseFrame, type RepEvent, type Landmark } from './repCounter';
import { normalizeExerciseId, type ExerciseId } from './exerciseRegistry';
import { READINESS_CRITERIA, type ExerciseReadinessCriteria } from './readinessCriteria';

export type CalibrationStatus = 'UNCALIBRATED' | 'CALIBRATING' | 'READY' | 'REJECTED';
export type CalibrationReason = 'INSUFFICIENT_ROM' | 'NO_SIGNAL' | 'INSUFFICIENT_SIGNAL';

export interface CalibrationState {
  status: CalibrationStatus;
  exerciseId: string;
  framesSeen: number;
  range: number;
  baseline: number;
  reason?: CalibrationReason;
}

export interface CalibrationConfig {
  // Legacy knobs (kept for API compatibility in tests/callers)
  requiredFrames?: number;
  maxFrames?: number;
  minRangeByExercise?: Record<string, number>;
  // New criteria overrides per exercise
  readinessOverrides?: Partial<Record<ExerciseId, Partial<ExerciseReadinessCriteria>>>;
  occlusionRecoveryFrames: number;
}

const DEFAULT_CFG: CalibrationConfig = {
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
      return avg(frame[27].y - frame[31].y, frame[28].y - frame[32].y);
    }
    case 'glute_bridge': {
      return -avg(frame[23].y, frame[24].y);
    }
    case 'shoulder_abduction': {
      return avg(angleDeg(frame[23], frame[11], frame[13]), angleDeg(frame[24], frame[12], frame[14]));
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
  private readonly analyzer: ExerciseAnalyzer;
  private readonly cfg: CalibrationConfig;
  private readonly criteria: ExerciseReadinessCriteria;

  private samples: number[] = [];
  private observedCalibrationFrames = 0;
  private occluded = false;
  private recoverySeen = 0;
  private state: CalibrationState;

  constructor(analyzer: ExerciseAnalyzer, targetReps: number, cfg: Partial<CalibrationConfig> = {}) {
    this.analyzer = analyzer;
    this.repCounter = new RepCounter(analyzer, targetReps);
    this.cfg = { ...DEFAULT_CFG, ...cfg };

    const ex = normalizeExerciseId(analyzer.exerciseId);
    const base = READINESS_CRITERIA[ex];
    const legacyMinRange = cfg.minRangeByExercise?.[analyzer.exerciseId];
    const legacyFrames = cfg.requiredFrames;
    const legacyMax = cfg.maxFrames;
    const ov = cfg.readinessOverrides?.[ex] ?? {};

    this.criteria = {
      ...base,
      ...(legacyMinRange !== undefined ? { minRange: legacyMinRange } : {}),
      ...(legacyFrames !== undefined ? { calibrationFrames: legacyFrames } : {}),
      ...(legacyMax !== undefined ? { maxCalibrationFrames: legacyMax } : {}),
      ...ov,
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

    if (this.state.status !== 'READY') return this.calibrate(frame);
    return this.repCounter.processFrame(frame, sessionMs);
  }

  getCalibrationState(): CalibrationState { return { ...this.state }; }
  getReadinessCriteria(): ExerciseReadinessCriteria { return { ...this.criteria }; }
  endSession() { return this.repCounter.endSession(); }
  getSession() { return this.repCounter.getSession(); }
  resume() { return this.repCounter.resume(); }

  private calibrate(frame: PoseFrame): null {
    this.state.status = this.state.status === 'UNCALIBRATED' ? 'CALIBRATING' : this.state.status;
    this.observedCalibrationFrames += 1;

    const signal = this.hasSufficientSignal(frame);
    if (!signal) {
      this.state.reason = 'INSUFFICIENT_SIGNAL';
      if (this.observedCalibrationFrames >= this.criteria.maxCalibrationFrames) {
        this.state.status = 'REJECTED';
      }
      return null;
    }

    const m = metricForExercise(this.state.exerciseId, frame);
    this.samples.push(m);
    this.state.framesSeen = this.samples.length;

    const min = Math.min(...this.samples);
    const max = Math.max(...this.samples);
    this.state.range = max - min;
    this.state.baseline = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;

    if (this.samples.length >= this.criteria.calibrationFrames && this.state.range >= this.criteria.minRange) {
      this.state.status = 'READY';
      this.state.reason = undefined;
      this.samples = [];
      return null;
    }

    if (this.observedCalibrationFrames >= this.criteria.maxCalibrationFrames) {
      this.state.status = 'REJECTED';
      this.state.reason = this.state.range > 0 ? 'INSUFFICIENT_ROM' : 'NO_SIGNAL';
      this.samples = [];
    }

    return null;
  }

  private hasSufficientSignal(frame: PoseFrame): boolean {
    const required = this.analyzer.requiredLandmarks;
    let visible = 0;
    let confSum = 0;
    for (const i of required) {
      const v = frame[i]?.visibility ?? 0;
      confSum += v;
      if (v >= this.criteria.minLandmarkConfidence) visible += 1;
    }
    const avg = required.length ? confSum / required.length : 0;
    return visible >= this.criteria.minVisibleLandmarks && avg >= this.criteria.minFrameConfidence;
  }
}
