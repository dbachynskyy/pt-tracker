#!/usr/bin/env node
/* Trend-aware readiness scorer: emits per-exercise + lane summary artifacts */
const fs = require('fs');
const path = require('path');

const EXERCISES = [
  'squat','pushup','sit_to_stand','lunge','calf_raise','glute_bridge','shoulder_abduction','heel_raise','knee_extension','plank_hold',
];
const DEGRADE_THRESHOLD = Number(process.env.HELIOS_TREND_DEGRADE_THRESHOLD || 5);

function fail(msg, code = 2) {
  console.error(`[readiness-trend] FAIL: ${msg}`);
  process.exit(code);
}
function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { fail(`Cannot parse ${p}: ${e.message}`); }
}
function toMap(summary) {
  if (!summary || summary.schemaVersion !== 'orion.readiness.gate.v1') {
    fail('summary schemaVersion must be orion.readiness.gate.v1');
  }
  const m = new Map();
  for (const row of summary.exercises || []) m.set(row.exercise, row);
  return m;
}
function scoreOf(row) {
  return typeof row.quality_score === 'number' ? row.quality_score : Math.max(0, 100 - ((row.fail_reasons || []).length * 20));
}
function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const currentPath = process.argv[2];
const baselinePath = process.argv[3];
const outPath = process.argv[4] || path.resolve('artifacts/helios-readiness-trend.v1.json');
const outSummaryPath = process.argv[5] || path.resolve('artifacts/helios-readiness-trend-summary.v1.json');
if (!currentPath || !baselinePath) {
  fail('Usage: node apps/mobile/scripts/check-readiness-trend.js <current.gate-summary.json> <baseline.gate-summary.json> [trend.out.json] [summary.out.json]', 64);
}
if (!fs.existsSync(baselinePath)) fail(`missing baseline: ${baselinePath}`, 5);

const current = readJson(currentPath);
const baseline = readJson(baselinePath);
const cm = toMap(current);
const bm = toMap(baseline);

const exercises = [];
const ciFailures = [];
for (const ex of EXERCISES) {
  const c = cm.get(ex);
  const b = bm.get(ex);
  if (!c || !b) fail(`missing exercise in ${!c ? 'current' : 'baseline'}: ${ex}`);

  const cScore = scoreOf(c);
  const bScore = scoreOf(b);
  const delta = cScore - bScore;
  const band = delta > 0 ? 'improved' : delta < 0 ? 'degraded' : 'flat';

  if (band === 'degraded' && c.gate_pass === true && Math.abs(delta) > DEGRADE_THRESHOLD) {
    ciFailures.push(`${ex}:score_drop:${bScore}->${cScore}`);
  }

  exercises.push({
    exercise: ex,
    baseline_score: bScore,
    current_score: cScore,
    delta,
    band,
    gate_pass: !!c.gate_pass,
    threshold_profile_version: current.threshold_profile_version,
  });
}

const trend = {
  schemaVersion: 'helios-readiness-trend.v1',
  threshold_profile_version: current.threshold_profile_version,
  degrade_threshold: DEGRADE_THRESHOLD,
  baseline_path: path.resolve(baselinePath),
  current_path: path.resolve(currentPath),
  exercises,
  ci_failures: ciFailures,
};

const improved = exercises.filter((e) => e.band === 'improved');
const flat = exercises.filter((e) => e.band === 'flat');
const degraded = exercises.filter((e) => e.band === 'degraded');
const deltas = exercises.map((e) => e.delta);
const worst = [...exercises].sort((a, b) => a.delta - b.delta).slice(0, 3).map((e) => ({ exercise: e.exercise, delta: e.delta }));
const gatedIncidents = exercises
  .filter((e) => e.band === 'degraded' && e.gate_pass === true && Math.abs(e.delta) > DEGRADE_THRESHOLD)
  .map((e) => ({ exercise: e.exercise, delta: e.delta }));

const summary = {
  schemaVersion: 'helios-readiness-trend-summary.v1',
  threshold_profile_version: current.threshold_profile_version,
  totals: {
    exercises: EXERCISES.length,
    improved_count: improved.length,
    flat_count: flat.length,
    degraded_count: degraded.length,
    improved_rate: improved.length / EXERCISES.length,
    flat_rate: flat.length / EXERCISES.length,
    degraded_rate: degraded.length / EXERCISES.length,
  },
  median_delta: median(deltas),
  worst_deltas: worst,
  gated_degrade_incidents: gatedIncidents,
  degrade_threshold: DEGRADE_THRESHOLD,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.mkdirSync(path.dirname(outSummaryPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(trend, null, 2) + '\n', 'utf8');
fs.writeFileSync(outSummaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');

if (ciFailures.length) {
  console.error(`[readiness-trend] FAIL: ${ciFailures.length} degraded exercise(s) exceeded threshold while gate_pass=true`);
  for (const x of ciFailures) console.error(` - ${x}`);
  process.exit(6);
}

console.log('[readiness-trend] PASS: no degradations breaching CI policy');
console.log(`[readiness-trend] artifact: ${path.resolve(outPath)}`);
console.log(`[readiness-trend] summary: ${path.resolve(outSummaryPath)}`);
