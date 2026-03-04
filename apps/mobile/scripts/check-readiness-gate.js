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

const BLOCKER_FALLBACKS = {
  AUTH_BLOCKER: [
    'Use fixture mode for deterministic CV validation',
    'Replay cached readiness bundle without remote auth',
    'Defer upload gate and run local non-upload checks',
  ],
  CREDITS_BLOCKER: [
    'Switch to fixture mode and dry-run validation',
    'Replay last cached successful readiness artifact',
    'Defer quota-bound upload checks and run local checks',
  ],
  RATE_LIMIT_BLOCKER: [
    'Use cached bundle replay to avoid repeated API calls',
    'Backoff and retry in next lane slot',
    'Run non-upload readiness checks while quota cools down',
  ],
};

function detectBlockers(text) {
  const t = String(text || '').toLowerCase();
  const out = [];
  if (t.includes('auth') || t.includes('unauthorized') || t.includes('forbidden') || t.includes('401') || t.includes('403')) out.push('AUTH_BLOCKER');
  if (t.includes('credit') || t.includes('quota exceeded') || t.includes('insufficient funds') || t.includes('payment required') || t.includes('402')) out.push('CREDITS_BLOCKER');
  if (t.includes('rate') || t.includes('429') || t.includes('too many requests') || t.includes('throttle')) out.push('RATE_LIMIT_BLOCKER');
  return out;
}

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
  blocker_catalog: [],
  fallback_options: [],
};

let failures = 0;
const blockers = new Set();
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

  for (const b of detectBlockers(`${q.status_reason} ${(row.reasons && Object.keys(row.reasons).join(' ')) || ''} ${reasons.join(' ')}`)) {
    blockers.add(b);
  }

  const gatePass = reasons.length === 0;
  if (!gatePass) failures++;
  summary.exercises.push({
    exercise: ex,
    gate_pass: gatePass,
    quality_score: Math.max(0, 100 - reasons.length * 20),
    fail_reasons: reasons,
    threshold_profile_version: report.threshold_profile_version,
  });
}

summary.blocker_catalog = [...blockers];
summary.fallback_options = [...new Set(summary.blocker_catalog.flatMap((b) => BLOCKER_FALLBACKS[b] || []))];

fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');

if (failures > 0) {
  console.error(`[readiness-gate] FAIL: ${failures} exercise gate(s) failed`);
  for (const ex of summary.exercises) {
    if (!ex.gate_pass) console.error(` - ${ex.exercise}: ${ex.fail_reasons.join(',')}`);
  }
  if (summary.blocker_catalog.length) {
    console.error(`[readiness-gate] blockers: ${summary.blocker_catalog.join(',')}`);
  }
  process.exit(3);
}

console.log(`[readiness-gate] PASS: all ${EXERCISES.length} exercise gates passed`);
console.log(`[readiness-gate] summary: ${path.resolve(summaryPath)}`);
