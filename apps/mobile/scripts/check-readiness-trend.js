#!/usr/bin/env node
/* Trend-aware readiness scorer: emits helios-readiness-trend.v1 and fails only on hidden degradation */
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

const currentPath = process.argv[2];
const baselinePath = process.argv[3];
const outPath = process.argv[4] || path.resolve('artifacts/helios-readiness-trend.v1.json');
if (!currentPath || !baselinePath) {
  fail('Usage: node apps/mobile/scripts/check-readiness-trend.js <current.gate-summary.json> <baseline.gate-summary.json> [out.json]', 64);
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

  const cScore = typeof c.quality_score === 'number' ? c.quality_score : Math.max(0, 100 - ((c.fail_reasons || []).length * 20));
  const bScore = typeof b.quality_score === 'number' ? b.quality_score : Math.max(0, 100 - ((b.fail_reasons || []).length * 20));
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

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(trend, null, 2) + '\n', 'utf8');

if (ciFailures.length) {
  console.error(`[readiness-trend] FAIL: ${ciFailures.length} degraded exercise(s) exceeded threshold while gate_pass=true`);
  for (const x of ciFailures) console.error(` - ${x}`);
  process.exit(6);
}

console.log('[readiness-trend] PASS: no degradations breaching CI policy');
console.log(`[readiness-trend] artifact: ${path.resolve(outPath)}`);
