import { ConfidenceFlag, Landmark, PoseLandmarks } from './types';

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
  const down = knee < 110;
  const up = knee > 155;

  const flags: ConfidenceFlag[] = [];
  if (knee > 120 && prev.phase === 'down') flags.push('INSUFFICIENT_DEPTH');

  let didRep = false;
  let phase = prev.phase;
  if (down) phase = 'down';
  if (up && prev.phase === 'down') {
    didRep = true;
    phase = 'up';
  }

  const depthScore = Math.max(0, Math.min(100, Math.round((170 - knee) * 1.4)));
  return { didRep, formScore: depthScore, flags, state: { ...prev, phase } };
}

export function pushupStep(pose: PoseLandmarks, prev: AnalyzerState): AnalyzerStep {
  const l = pose.landmarks;
  const ls = byName(l, 'left_shoulder');
  const le = byName(l, 'left_elbow');
  const lw = byName(l, 'left_wrist');
  const rs = byName(l, 'right_shoulder');
  const re = byName(l, 'right_elbow');
  const rw = byName(l, 'right_wrist');
  if (!ls || !le || !lw || !rs || !re || !rw) return { didRep: false, formScore: 0, flags: ['LOW_CONFIDENCE'], state: prev };

  const elbow = avg(angle(ls, le, lw), angle(rs, re, rw));
  const down = elbow < 95;
  const up = elbow > 155;

  const flags: ConfidenceFlag[] = [];
  if (elbow > 110 && prev.phase === 'down') flags.push('PARTIAL_ROM');

  let didRep = false;
  let phase = prev.phase;
  if (down) phase = 'down';
  if (up && prev.phase === 'down') {
    didRep = true;
    phase = 'up';
  }

  const romScore = Math.max(0, Math.min(100, Math.round((170 - elbow) * 1.5)));
  return { didRep, formScore: romScore, flags, state: { ...prev, phase } };
}

export function sitToStandStep(pose: PoseLandmarks, prev: AnalyzerState): AnalyzerStep {
  const l = pose.landmarks;
  const lh = byName(l, 'left_hip');
  const lk = byName(l, 'left_knee');
  const rh = byName(l, 'right_hip');
  const rk = byName(l, 'right_knee');
  if (!lh || !lk || !rh || !rk) return { didRep: false, formScore: 0, flags: ['LOW_CONFIDENCE'], state: prev };

  const hipHeight = avg(lh.y, rh.y);
  const kneeHeight = avg(lk.y, rk.y);
  const ratio = hipHeight / Math.max(0.001, kneeHeight);

  const down = ratio > 1.05;
  const up = ratio < 0.9;

  const flags: ConfidenceFlag[] = [];
  if (!down && prev.phase === 'down') flags.push('PARTIAL_ROM');

  let didRep = false;
  let phase = prev.phase;
  if (down) phase = 'down';
  if (up && prev.phase === 'down') {
    didRep = true;
    phase = 'up';
  }

  const score = Math.max(0, Math.min(100, Math.round((1.15 - ratio) * 400)));
  return { didRep, formScore: score, flags, state: { ...prev, phase } };
}
