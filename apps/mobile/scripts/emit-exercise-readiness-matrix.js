#!/usr/bin/env node
/* Emit deterministic exercise-level readiness matrix for Atlas+Orion merge */
const fs = require('fs');
const path = require('path');

const OUT_IDS = ['squat','pushup','sit_to_stand','plank','lunge','glute_bridge','knee_extension','heel_raise','calf_raise','shoulder_abduction'];
const SRC_IDS = ['squat','pushup','sit_to_stand','plank_hold','lunge','glute_bridge','knee_extension','heel_raise','calf_raise','shoulder_abduction'];
const SRC_TO_OUT = { plank_hold: 'plank' };

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
  QUALITY_BLOCKER: [
    'Use fixture mode to isolate CV pipeline from live noise',
    'Replay cached bundle and inspect per-check deltas',
    'Defer upload gate and run local form/quality checks',
  ],
};

function fail(msg, code = 2) {
  console.error(`[exercise-readiness] FAIL: ${msg}`);
  process.exit(code);
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { fail(`Cannot parse ${p}: ${e.message}`); }
}

function detectBlockers(text) {
  const t = String(text || '').toLowerCase();
  const out = [];
  if (t.includes('auth') || t.includes('unauthorized') || t.includes('forbidden') || t.includes('401') || t.includes('403')) out.push('AUTH_BLOCKER');
  if (t.includes('credit') || t.includes('quota exceeded') || t.includes('insufficient funds') || t.includes('payment required') || t.includes('402')) out.push('CREDITS_BLOCKER');
  if (t.includes('rate') || t.includes('429') || t.includes('too many requests') || t.includes('throttle')) out.push('RATE_LIMIT_BLOCKER');
  return out;
}

const inPath = process.argv[2];
const outPath = process.argv[3] || path.resolve('artifacts/helios-exercise-readiness.v1.json');
if (!inPath) {
  fail('Usage: node apps/mobile/scripts/emit-exercise-readiness-matrix.js <orion.readiness.v1.json> [out.json]', 64);
}

const report = readJson(inPath);
if (report.schemaVersion !== 'orion.readiness.v1') fail('schemaVersion must be orion.readiness.v1');
if (!report.byExercise || typeof report.byExercise !== 'object') fail('missing byExercise');

const keys = Object.keys(report.byExercise);
const missing = SRC_IDS.filter((id) => !keys.includes(id));
if (missing.length) fail(`malformed id set: missing ${missing.join(',')}`, 3);

const exercises = [];
for (const srcId of SRC_IDS) {
  const row = report.byExercise[srcId];
  const q = row?.quality || {};
  const outId = SRC_TO_OUT[srcId] || srcId;

  const checks = {
    sample_count: { pass: (q.sample_count ?? 0) > 0, value: q.sample_count ?? 0 },
    confidence_p50: { pass: (q.confidence_p50 ?? 0) > 0, value: q.confidence_p50 ?? 0 },
    confidence_p90: { pass: (q.confidence_p90 ?? 0) > 0, value: q.confidence_p90 ?? 0 },
    rep_signal_present: { pass: !!q.rep_signal_present, value: !!q.rep_signal_present },
    status_reason_ready: { pass: q.status_reason === 'READY', value: q.status_reason ?? 'UNKNOWN' },
    quality_gate: { pass: !!q.gate_pass, value: !!q.gate_pass },
  };

  const blockers = new Set(detectBlockers(`${q.status_reason || ''} ${JSON.stringify(row?.reasons || {})}`));
  if (!q.gate_pass) blockers.add('QUALITY_BLOCKER');

  const blockerArr = [...blockers];
  const fallback_options = [...new Set(blockerArr.flatMap((b) => BLOCKER_FALLBACKS[b] || []))];

  exercises.push({
    exercise: outId,
    gate_pass: !!q.gate_pass,
    blockers: blockerArr,
    fallback_options,
    checks,
  });
}

const set = exercises.map((e) => e.exercise).sort();
const expected = [...OUT_IDS].sort();
if (JSON.stringify(set) !== JSON.stringify(expected)) {
  fail(`malformed output id set: got=${set.join(',')}`, 4);
}

const matrix = {
  schemaVersion: 'helios-exercise-readiness.v1',
  source_schema: report.schemaVersion,
  threshold_profile_version: report.threshold_profile_version,
  exercises,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(matrix, null, 2) + '\n', 'utf8');
console.log(`[exercise-readiness] PASS: emitted ${exercises.length} exercise rows`);
console.log(`[exercise-readiness] artifact: ${path.resolve(outPath)}`);
