#!/usr/bin/env node
/* CI gate: validates orion.readiness.v1 artifact + emits compact gate summary */
const fs = require('fs');
const path = require('path');

const THRESHOLD_PROFILE_VERSION = 'readiness-thresholds.v1';
const EXERCISES = [
  'squat','pushup','sit_to_stand','lunge','calf_raise','glute_bridge','shoulder_abduction','heel_raise','knee_extension','plank_hold',
];

const READINESS_THRESHOLDS = {
  squat: { minSamples: 1, minConfidenceP50: 0.6, minConfidenceP90: 0.7, requireRepSignal: true, allowedStatus: ['READY'] },
  pushup: { minSamples: 1, minConfidenceP50: 0.6, minConfidenceP90: 0.7, requireRepSignal: true, allowedStatus: ['READY'] },
  sit_to_stand: { minSamples: 1, minConfidenceP50: 0.6, minConfidenceP90: 0.7, requireRepSignal: true, allowedStatus: ['READY'] },
  lunge: { minSamples: 1, minConfidenceP50: 0.6, minConfidenceP90: 0.7, requireRepSignal: true, allowedStatus: ['READY'] },
  calf_raise: { minSamples: 1, minConfidenceP50: 0.55, minConfidenceP90: 0.65, requireRepSignal: true, allowedStatus: ['READY'] },
  glute_bridge: { minSamples: 1, minConfidenceP50: 0.55, minConfidenceP90: 0.65, requireRepSignal: true, allowedStatus: ['READY'] },
  shoulder_abduction: { minSamples: 1, minConfidenceP50: 0.6, minConfidenceP90: 0.7, requireRepSignal: true, allowedStatus: ['READY'] },
  heel_raise: { minSamples: 1, minConfidenceP50: 0.55, minConfidenceP90: 0.65, requireRepSignal: true, allowedStatus: ['READY'] },
  knee_extension: { minSamples: 1, minConfidenceP50: 0.6, minConfidenceP90: 0.7, requireRepSignal: true, allowedStatus: ['READY'] },
  plank_hold: { minSamples: 1, minConfidenceP50: 0.6, minConfidenceP90: 0.7, requireRepSignal: true, allowedStatus: ['READY'] },
};

function fail(msg, code = 2) {
  console.error(`[readiness-gate] FAIL: ${msg}`);
  process.exit(code);
}

const artifactPath = process.argv[2];
if (!artifactPath) fail('Usage: node apps/mobile/scripts/check-readiness-gate.js <artifact.json> [summary.json]', 64);
const summaryPath = process.argv[3] || `${artifactPath}.gate-summary.json`;

let report;
try {
  report = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
} catch (e) {
  fail(`Cannot parse artifact: ${e.message}`);
}

if (report.schemaVersion !== 'orion.readiness.v1') fail('schemaVersion must be orion.readiness.v1');
if (!report.threshold_profile_version) fail('missing threshold_profile_version');
if (report.threshold_profile_version !== THRESHOLD_PROFILE_VERSION) fail(`unexpected threshold_profile_version ${report.threshold_profile_version}`);

for (const ex of EXERCISES) {
  if (!(ex in READINESS_THRESHOLDS)) fail(`missing threshold config for ${ex}`);
}

if (!report.byExercise || typeof report.byExercise !== 'object') fail('missing byExercise');

const summary = {
  schemaVersion: 'orion.readiness.gate.v1',
  threshold_profile_version: report.threshold_profile_version,
  exercises: [],
};

let failures = 0;
for (const ex of EXERCISES) {
  const row = report.byExercise[ex];
  if (!row) fail(`missing exercise in artifact: ${ex}`);
  const q = row.quality || {};
  const required = ['sample_count','confidence_p50','confidence_p90','rep_signal_present','status_reason'];
  for (const field of required) {
    if (!(field in q)) fail(`missing quality field ${field} for ${ex}`);
  }

  const t = READINESS_THRESHOLDS[ex];
  const reasons = [];
  if (!(q.sample_count >= t.minSamples)) reasons.push('NO_SAMPLES');
  if (!(q.confidence_p50 >= t.minConfidenceP50)) reasons.push('LOW_CONFIDENCE_P50');
  if (!(q.confidence_p90 >= t.minConfidenceP90)) reasons.push('LOW_CONFIDENCE_P90');
  if (t.requireRepSignal && !q.rep_signal_present) reasons.push('NO_REP_SIGNAL');
  if (!t.allowedStatus.includes(q.status_reason)) reasons.push(`STATUS_${q.status_reason}`);

  const gatePass = reasons.length === 0;
  if (!gatePass) failures++;
  summary.exercises.push({
    exercise: ex,
    gate_pass: gatePass,
    fail_reasons: reasons,
    threshold_profile_version: report.threshold_profile_version,
  });
}

fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');

if (failures > 0) {
  console.error(`[readiness-gate] FAIL: ${failures} exercise gate(s) failed`);
  for (const ex of summary.exercises) {
    if (!ex.gate_pass) console.error(` - ${ex.exercise}: ${ex.fail_reasons.join(',')}`);
  }
  process.exit(3);
}

console.log(`[readiness-gate] PASS: all ${EXERCISES.length} exercise gates passed`);
console.log(`[readiness-gate] summary: ${path.resolve(summaryPath)}`);
