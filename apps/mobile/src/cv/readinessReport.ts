import type { ExerciseId } from './exerciseRegistry';
import type { ExerciseTelemetry } from './sessionTelemetry';
import { writeFileSync } from 'fs';
import { READINESS_THRESHOLDS, THRESHOLD_PROFILE_VERSION, type ExerciseReadinessThreshold } from './readinessThresholds';

export interface SessionTelemetrySnapshot {
  sessionId: string;
  exercises: ExerciseTelemetry[];
}

export interface ExerciseQualityGate {
  sample_count: number;
  confidence_p50: number;
  confidence_p90: number;
  rep_signal_present: boolean;
  status_reason: string;
  gate_pass: boolean;
  gate_fail_reasons: string[];
}

export interface ReadinessFailureReport {
  schemaVersion: 'orion.readiness.v1';
  threshold_profile_version: string;
  generatedAt: string;
  totals: {
    sessions: number;
    exercisesObserved: number;
    failures: number;
  };
  byExercise: Record<ExerciseId, {
    failures: number;
    reasons: Record<string, number>;
    quality: ExerciseQualityGate;
  }>;
}

export interface CompactGateSummary {
  schemaVersion: 'orion.readiness.gate.v1';
  threshold_profile_version: string;
  exercises: Array<{
    exercise: ExerciseId;
    gate_pass: boolean;
    fail_reasons: string[];
    threshold_profile_version: string;
  }>;
}

const IDS: ExerciseId[] = [
  'squat','pushup','sit_to_stand','lunge','calf_raise','glute_bridge','shoulder_abduction','heel_raise','knee_extension','plank_hold',
];

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function p90(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.ceil(0.9 * s.length) - 1;
  return s[Math.max(0, Math.min(s.length - 1, idx))];
}

function qualityGate(summary: {
  sampleCount: number;
  confidenceP50Values: number[];
  confidenceP90Values: number[];
  repSignalPresent: boolean;
  statusReason: string;
}, threshold: ExerciseReadinessThreshold): ExerciseQualityGate {
  const q: ExerciseQualityGate = {
    sample_count: summary.sampleCount,
    confidence_p50: median(summary.confidenceP50Values),
    confidence_p90: p90(summary.confidenceP90Values),
    rep_signal_present: summary.repSignalPresent,
    status_reason: summary.statusReason,
    gate_pass: true,
    gate_fail_reasons: [],
  };
  if (q.sample_count < threshold.minSamples) q.gate_fail_reasons.push('NO_SAMPLES');
  if (q.confidence_p50 < threshold.minConfidenceP50) q.gate_fail_reasons.push('LOW_CONFIDENCE_P50');
  if (q.confidence_p90 < threshold.minConfidenceP90) q.gate_fail_reasons.push('LOW_CONFIDENCE_P90');
  if (threshold.requireRepSignal && !q.rep_signal_present) q.gate_fail_reasons.push('NO_REP_SIGNAL');
  if (!threshold.allowedStatus.includes(q.status_reason)) q.gate_fail_reasons.push(`STATUS_${q.status_reason}`);
  q.gate_pass = q.gate_fail_reasons.length === 0;
  return q;
}

export function aggregateReadinessFailures(snapshots: SessionTelemetrySnapshot[]): ReadinessFailureReport {
  const byExercise = Object.create(null) as ReadinessFailureReport['byExercise'];
  for (const id of IDS) {
    byExercise[id] = {
      failures: 0,
      reasons: {},
      quality: {
        sample_count: 0,
        confidence_p50: 0,
        confidence_p90: 0,
        rep_signal_present: false,
        status_reason: 'UNCALIBRATED',
        gate_pass: false,
        gate_fail_reasons: ['NO_SAMPLES', 'NO_REP_SIGNAL'],
      },
    };
  }

  const qualityAcc = Object.fromEntries(IDS.map((id) => [id, {
    sampleCount: 0,
    confidenceP50Values: [] as number[],
    confidenceP90Values: [] as number[],
    repSignalPresent: false,
    statusReason: 'UNCALIBRATED',
  }])) as Record<ExerciseId, {
    sampleCount: number;
    confidenceP50Values: number[];
    confidenceP90Values: number[];
    repSignalPresent: boolean;
    statusReason: string;
  }>;

  let observed = 0;
  let failures = 0;

  for (const s of snapshots) {
    for (const ex of s.exercises) {
      observed += 1;
      const acc = qualityAcc[ex.exerciseId];
      acc.sampleCount += ex.sampleCount ?? 0;
      acc.confidenceP50Values.push(ex.confidenceP50 ?? 0);
      acc.confidenceP90Values.push(ex.confidenceP90 ?? 0);
      acc.repSignalPresent = acc.repSignalPresent || !!ex.repSignalPresent;
      acc.statusReason = ex.statusReason ?? ex.readinessReason ?? ex.calibrationStatus;

      const reason = ex.readinessReason;
      if (reason) {
        failures += 1;
        const bucket = byExercise[ex.exerciseId];
        bucket.failures += 1;
        bucket.reasons[reason] = (bucket.reasons[reason] ?? 0) + 1;
      }
    }
  }

  for (const id of IDS) {
    byExercise[id].quality = qualityGate(qualityAcc[id], READINESS_THRESHOLDS[id]);
  }

  return {
    schemaVersion: 'orion.readiness.v1',
    threshold_profile_version: THRESHOLD_PROFILE_VERSION,
    generatedAt: new Date(0).toISOString(),
    totals: { sessions: snapshots.length, exercisesObserved: observed, failures },
    byExercise,
  };
}

export function buildCompactGateSummary(report: ReadinessFailureReport): CompactGateSummary {
  return {
    schemaVersion: 'orion.readiness.gate.v1',
    threshold_profile_version: report.threshold_profile_version,
    exercises: IDS.map((id) => ({
      exercise: id,
      gate_pass: report.byExercise[id]?.quality?.gate_pass ?? false,
      fail_reasons: report.byExercise[id]?.quality?.gate_fail_reasons ?? ['MISSING_EXERCISE'],
      threshold_profile_version: report.threshold_profile_version,
    })),
  };
}

export function validateOrionReadinessArtifact(report: ReadinessFailureReport): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (report.schemaVersion !== 'orion.readiness.v1') errors.push('INVALID_SCHEMA_VERSION');
  if (!report.threshold_profile_version) errors.push('MISSING_THRESHOLD_PROFILE_VERSION');

  for (const id of IDS) {
    if (!(id in READINESS_THRESHOLDS)) {
      errors.push(`MISSING_EXERCISE_THRESHOLD:${id}`);
    }
  }

  for (const id of IDS) {
    const row = report.byExercise[id];
    if (!row) {
      errors.push(`MISSING_EXERCISE:${id}`);
      continue;
    }
    const q = row.quality as any;
    const required = ['sample_count', 'confidence_p50', 'confidence_p90', 'rep_signal_present', 'status_reason'];
    for (const field of required) {
      if (!(field in q)) errors.push(`MISSING_QUALITY_FIELD:${id}:${field}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function renderReadinessFailureReportJson(snapshots: SessionTelemetrySnapshot[]): string {
  return JSON.stringify(aggregateReadinessFailures(snapshots), null, 2);
}

export function writeOrionReadinessArtifact(path: string, snapshots: SessionTelemetrySnapshot[]): void {
  const report = aggregateReadinessFailures(snapshots);
  const verdict = validateOrionReadinessArtifact(report);
  if (!verdict.ok) throw new Error(`Invalid orion.readiness.v1 artifact: ${verdict.errors.join(',')}`);
  writeFileSync(path, JSON.stringify(report, null, 2), 'utf8');
}
