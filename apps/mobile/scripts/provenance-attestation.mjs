import fs from 'node:fs';
import path from 'node:path';
import { CANONICAL_EXERCISES, validateBundle } from './native-capture-schema.mjs';

const SIMULATED_SOURCE_PATTERNS = [/placeholder/i, /simulated/i, /mock/i, /synthetic/i, /test/i];

function validSemver(v) {
  return typeof v === 'string' && /^v?\d+\.\d+\.\d+$/.test(v);
}

function validOs(v) {
  return typeof v === 'string' && /^(iOS|Android)\s+\d+(\.\d+){0,2}$/.test(v);
}

function sourceLooksSimulated(source) {
  if (typeof source !== 'string' || source.trim().length === 0) return true;
  return SIMULATED_SOURCE_PATTERNS.some((re) => re.test(source));
}

export function buildProvenanceAttestation(bundle) {
  validateBundle(bundle);
  const byExercise = new Map((bundle.captures ?? []).map((c) => [c.exercise, c]));

  const exercises = CANONICAL_EXERCISES.map((exercise) => {
    const c = byExercise.get(exercise);
    const reasons = [];

    if (!c) reasons.push('missing_exercise_capture');
    if (c && sourceLooksSimulated(c.source)) reasons.push('source_placeholder_or_simulated');
    if (c && (!c.device_id || c.device_id === 'placeholder')) reasons.push('device_id_missing');
    if (c && !validOs(c.os_version)) reasons.push('os_version_invalid');
    if (c && !validSemver(c.app_version)) reasons.push('app_version_invalid');
    if (c && (!Number.isFinite(c.capture_ts) || c.capture_ts <= 0)) reasons.push('capture_ts_invalid');

    return {
      exercise,
      pass: reasons.length === 0,
      reasons,
      metadata: c
        ? {
            source: c.source ?? null,
            device_id: c.device_id ?? null,
            os_version: c.os_version ?? null,
            app_version: c.app_version ?? null,
            capture_ts: c.capture_ts ?? null,
          }
        : null,
    };
  });

  const passCount = exercises.filter((e) => e.pass).length;

  return {
    version: 'atlas-provenance-attestation.v1',
    generatedAt: new Date().toISOString(),
    aggregate: {
      total_exercises: CANONICAL_EXERCISES.length,
      passed_exercises: passCount,
      failed_exercises: CANONICAL_EXERCISES.length - passCount,
      coverage_ratio: Number((passCount / CANONICAL_EXERCISES.length).toFixed(3)),
    },
    exercises,
  };
}

export function assertProvenanceAttested(bundle) {
  const report = buildProvenanceAttestation(bundle);
  const failed = report.exercises.find((e) => !e.pass);
  if (failed) {
    throw new Error(`provenance attestation failed: ${failed.exercise} -> ${failed.reasons.join(',')}`);
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const bundlePath = process.argv[2] ?? path.resolve('fixtures/native-frame-bundles/atlas-captures.v1.json');
  const outPath = process.argv[3] ?? path.resolve('artifacts/atlas-provenance-attestation.v1.json');
  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  const report = buildProvenanceAttestation(bundle);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (report.aggregate.failed_exercises > 0) {
    const first = report.exercises.find((e) => !e.pass);
    console.error(`provenance-incomplete: ${first.exercise} -> ${first.reasons.join(',')}`);
    console.error(`wrote ${outPath}`);
    process.exit(1);
  }

  console.log(`provenance-complete: ${report.aggregate.passed_exercises}/${report.aggregate.total_exercises}`);
  console.log(`wrote ${outPath}`);
}
