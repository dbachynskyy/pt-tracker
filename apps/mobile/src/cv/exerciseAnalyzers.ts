import { ConfidenceFlag, Landmark, PoseLandmarks, ExerciseType } from './types';

type Phase = 'up' | 'down';

export interface AnalyzerState {
  phase: Phase;
  repStartMs: number;
}

export interface AnalyzerStep {
  didRep: boolean;
  formScore: number;
  flags: ConfidenceFlag[];
  state: AnalyzerState;
}

function byName(landmarks: Landmark[], name: Landmark['name']) {
  return landmarks.find((l) => l.name === name);
}

function angle(a: Landmark, b: Landmark, c: Landmark): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const mag1 = Math.hypot(abx, aby);
  const mag2 = Math.hypot(cbx, cby);
  if (mag1 === 0 || mag2 === 0) return 180;
  const cos = Math.min(1, Math.max(-1, dot / (mag1 * mag2)));
  return Math.acos(cos) * (180 / Math.PI);
}

function avg(...values: number[]) {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stepFromDownUp(metric: number, prev: AnalyzerState, downThreshold: number, upThreshold: number): AnalyzerState {
  const down = metric < downThreshold;
  const up = metric > upThreshold;
  let phase = prev.phase;
  if (down) phase = 'down';
  if (up && prev.phase === 'down') phase = 'up';
  return { ...prev, phase };
}

export function squatStep(pose: PoseLandmarks, prev: AnalyzerState): AnalyzerStep {
  const l = pose.landmarks;
  const lh = byName(l, 'left_hip');
  const lk = byName(l, 'left_knee');
  const la = byName(l, 'left_ankle');
  const rh = byName(l, 'right_hip');
  const rk = byName(l, 'right_knee');
  const ra = byName(l, 'right_ankle');
  if (!lh || !lk || !la || !rh || !rk || !ra) return { didRep: false, formScore: 0, flags: ['LOW_CONFIDENCE'], state: prev };

  const knee = avg(angle(lh, lk, la), angle(rh, rk, ra));
  const next = stepFromDownUp(knee, prev, 110, 155);
  const didRep = next.phase === 'up' && prev.phase === 'down';
  const flags: ConfidenceFlag[] = [];
  if (knee > 120 && prev.phase === 'down') flags.push('INSUFFICIENT_DEPTH');
  return { didRep, formScore: Math.max(0, Math.min(100, Math.round((170 - knee) * 1.4))), flags, state: next };
}

export function pushupStep(pose: PoseLandmarks, prev: AnalyzerState): AnalyzerStep {
  const l = pose.landmarks;
  const ls = byName(l, 'left_shoulder'); const le = byName(l, 'left_elbow'); const lw = byName(l, 'left_wrist');
  const rs = byName(l, 'right_shoulder'); const re = byName(l, 'right_elbow'); const rw = byName(l, 'right_wrist');
  if (!ls || !le || !lw || !rs || !re || !rw) return { didRep: false, formScore: 0, flags: ['LOW_CONFIDENCE'], state: prev };

  const elbow = avg(angle(ls, le, lw), angle(rs, re, rw));
  const next = stepFromDownUp(elbow, prev, 95, 155);
  const didRep = next.phase === 'up' && prev.phase === 'down';
  const flags: ConfidenceFlag[] = [];
  if (elbow > 110 && prev.phase === 'down') flags.push('PARTIAL_ROM');
  return { didRep, formScore: Math.max(0, Math.min(100, Math.round((170 - elbow) * 1.5))), flags, state: next };
}

export function sitToStandStep(pose: PoseLandmarks, prev: AnalyzerState): AnalyzerStep {
  const l = pose.landmarks;
  const lh = byName(l, 'left_hip'); const lk = byName(l, 'left_knee');
  const rh = byName(l, 'right_hip'); const rk = byName(l, 'right_knee');
  if (!lh || !lk || !rh || !rk) return { didRep: false, formScore: 0, flags: ['LOW_CONFIDENCE'], state: prev };

  const ratio = avg(lh.y, rh.y) / Math.max(0.001, avg(lk.y, rk.y));
  let phase = prev.phase;
  if (ratio > 1.05) phase = 'down';
  const didRep = ratio < 0.9 && prev.phase === 'down';
  if (didRep) phase = 'up';
  return {
    didRep,
    formScore: Math.max(0, Math.min(100, Math.round((1.15 - ratio) * 400))),
    flags: didRep ? [] : ratio > 1 ? ['PARTIAL_ROM'] : [],
    state: { ...prev, phase },
  };
}

export function lungeStep(pose: PoseLandmarks, prev: AnalyzerState): AnalyzerStep {
  const l = pose.landmarks;
  const lh = byName(l, 'left_hip'); const lk = byName(l, 'left_knee'); const la = byName(l, 'left_ankle');
  const rh = byName(l, 'right_hip'); const rk = byName(l, 'right_knee'); const ra = byName(l, 'right_ankle');
  if (!lh || !lk || !la || !rh || !rk || !ra) return { didRep: false, formScore: 0, flags: ['LOW_CONFIDENCE'], state: prev };
  const knee = Math.min(angle(lh, lk, la), angle(rh, rk, ra));
  const next = stepFromDownUp(knee, prev, 95, 160);
  const didRep = next.phase === 'up' && prev.phase === 'down';
  return { didRep, formScore: Math.max(0, Math.min(100, Math.round((170 - knee) * 1.2))), flags: [], state: next };
}

export function gluteBridgeStep(pose: PoseLandmarks, prev: AnalyzerState): AnalyzerStep {
  const l = pose.landmarks;
  const lh = byName(l, 'left_hip'); const rh = byName(l, 'right_hip');
  if (!lh || !rh) return { didRep: false, formScore: 0, flags: ['LOW_CONFIDENCE'], state: prev };
  const hipY = avg(lh.y, rh.y);
  let phase = prev.phase;
  if (hipY < 0.54) phase = 'up';
  const didRep = hipY > 0.57 && prev.phase === 'up';
  if (didRep) phase = 'down';
  const flags: ConfidenceFlag[] = Math.abs(lh.y - rh.y) > 0.05 ? ['POOR_FORM'] : [];
  return { didRep, formScore: Math.max(0, Math.min(100, Math.round((0.62 - hipY) * 500))), flags, state: { ...prev, phase } };
}

export function kneeExtensionStep(pose: PoseLandmarks, prev: AnalyzerState): AnalyzerStep {
  const l = pose.landmarks;
  const lh = byName(l, 'left_hip'); const lk = byName(l, 'left_knee'); const la = byName(l, 'left_ankle');
  const rh = byName(l, 'right_hip'); const rk = byName(l, 'right_knee'); const ra = byName(l, 'right_ankle');
  if (!lh || !lk || !la || !rh || !rk || !ra) return { didRep: false, formScore: 0, flags: ['LOW_CONFIDENCE'], state: prev };
  const knee = avg(angle(lh, lk, la), angle(rh, rk, ra));
  let phase = prev.phase;
  if (knee > 165) phase = 'up';
  const didRep = knee < 100 && prev.phase === 'up';
  if (didRep) phase = 'down';
  return { didRep, formScore: Math.max(0, Math.min(100, Math.round((knee - 90) * 1.2))), flags: [], state: { ...prev, phase } };
}

export function calfRaiseStep(pose: PoseLandmarks, prev: AnalyzerState): AnalyzerStep {
  const l = pose.landmarks;
  const la = byName(l, 'left_ankle'); const ra = byName(l, 'right_ankle'); const lf = byName(l, 'left_foot'); const rf = byName(l, 'right_foot');
  if (!la || !ra || !lf || !rf) return { didRep: false, formScore: 0, flags: ['LOW_CONFIDENCE'], state: prev };
  const lift = avg(la.y - lf.y, ra.y - rf.y);
  let phase = prev.phase;
  if (lift > 0.07) phase = 'up';
  const didRep = lift < 0.03 && prev.phase === 'up';
  if (didRep) phase = 'down';
  return { didRep, formScore: Math.max(0, Math.min(100, Math.round(lift * 1200))), flags: [], state: { ...prev, phase } };
}

export function heelRaiseStep(pose: PoseLandmarks, prev: AnalyzerState): AnalyzerStep {
  return calfRaiseStep(pose, prev);
}

export function shoulderAbductionStep(pose: PoseLandmarks, prev: AnalyzerState): AnalyzerStep {
  const l = pose.landmarks;
  const lh = byName(l, 'left_hip'); const ls = byName(l, 'left_shoulder'); const le = byName(l, 'left_elbow');
  const rh = byName(l, 'right_hip'); const rs = byName(l, 'right_shoulder'); const re = byName(l, 'right_elbow');
  if (!lh || !ls || !le || !rh || !rs || !re) return { didRep: false, formScore: 0, flags: ['LOW_CONFIDENCE'], state: prev };
  const abd = avg(angle(lh, ls, le), angle(rh, rs, re));
  let phase = prev.phase;
  if (abd > 120) phase = 'up';
  const didRep = abd < 45 && prev.phase === 'up';
  if (didRep) phase = 'down';
  const flags: ConfidenceFlag[] = Math.abs(angle(lh, ls, le) - angle(rh, rs, re)) > 20 ? ['POOR_FORM'] : [];
  return { didRep, formScore: Math.max(0, Math.min(100, Math.round(abd * 0.8))), flags, state: { ...prev, phase } };
}

export function plankStep(pose: PoseLandmarks, prev: AnalyzerState): AnalyzerStep {
  const l = pose.landmarks;
  const ls = byName(l, 'left_shoulder'); const lh = byName(l, 'left_hip'); const la = byName(l, 'left_ankle');
  const rs = byName(l, 'right_shoulder'); const rh = byName(l, 'right_hip'); const ra = byName(l, 'right_ankle');
  if (!ls || !lh || !la || !rs || !rh || !ra) return { didRep: false, formScore: 0, flags: ['LOW_CONFIDENCE'], state: prev };
  const bodyAngle = avg(angle(ls, lh, la), angle(rs, rh, ra));
  const deviation = Math.abs(180 - bodyAngle);
  const flags: ConfidenceFlag[] = deviation > 20 ? ['POOR_FORM'] : [];
  return { didRep: false, formScore: Math.max(0, 100 - Math.round(deviation * 2.5)), flags, state: prev };
}

export function stepForExercise(exerciseType: ExerciseType) {
  switch (exerciseType) {
    case 'squat': return squatStep;
    case 'pushup': return pushupStep;
    case 'sit_to_stand': return sitToStandStep;
    case 'lunge': return lungeStep;
    case 'glute_bridge': return gluteBridgeStep;
    case 'knee_extension': return kneeExtensionStep;
    case 'heel_raise': return heelRaiseStep;
    case 'calf_raise': return calfRaiseStep;
    case 'shoulder_abduction': return shoulderAbductionStep;
    case 'plank': return plankStep;
    default: return null;
  }
}
