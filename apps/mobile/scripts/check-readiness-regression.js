#!/usr/bin/env node
/* CI regression guard: compare current gate summary against baseline */
const fs = require('fs');
const path = require('path');

const EXERCISES = [
  'squat','pushup','sit_to_stand','lunge','calf_raise','glute_bridge','shoulder_abduction','heel_raise','knee_extension','plank_hold',
];

function fail(msg, code = 2) {
  console.error(`[readiness-regression] FAIL: ${msg}`);
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
  if (typeof row.quality_score === 'number') return row.quality_score;
  return Math.max(0, 100 - ((row.fail_reasons || []).length * 20));
}

const currentPath = process.argv[2];
const baselinePath = process.argv[3];
const outPath = process.argv[4] || `${currentPath}.regression-summary.json`;
if (!currentPath || !baselinePath) {
  fail('Usage: node apps/mobile/scripts/check-readiness-regression.js <current.gate-summary.json> <baseline.gate-summary.json> [out.json]', 64);
}
if (!fs.existsSync(baselinePath)) fail(`missing baseline: ${baselinePath}`, 5);

const current = readJson(currentPath);
const baseline = readJson(baselinePath);
const cm = toMap(current);
const bm = toMap(baseline);

const regressions = [];
const rows = [];
for (const ex of EXERCISES) {
  const c = cm.get(ex);
  const b = bm.get(ex);
  if (!c) { regressions.push(`${ex}:MISSING_CURRENT_EXERCISE`); continue; }
  if (!b) { regressions.push(`${ex}:MISSING_BASELINE_EXERCISE`); continue; }

  const cPass = !!c.gate_pass;
  const bPass = !!b.gate_pass;
  const cScore = scoreOf(c);
  const bScore = scoreOf(b);

  const reasons = [];
  if (bPass && !cPass) reasons.push('GATE_PASS_FLIP');
  if (cScore < bScore) reasons.push(`SCORE_DROP:${bScore}->${cScore}`);
  if (reasons.length) regressions.push(`${ex}:${reasons.join('|')}`);

  rows.push({
    exercise: ex,
    baseline_gate_pass: bPass,
    current_gate_pass: cPass,
    baseline_quality_score: bScore,
    current_quality_score: cScore,
    regressed: reasons.length > 0,
    reasons,
  });
}

const summary = {
  schemaVersion: 'orion.readiness.regression.v1',
  threshold_profile_version: current.threshold_profile_version,
  baseline_path: path.resolve(baselinePath),
  current_path: path.resolve(currentPath),
  regressions,
  exercises: rows,
};
fs.writeFileSync(outPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');

if (regressions.length > 0) {
  console.error(`[readiness-regression] FAIL: ${regressions.length} regression(s) detected`);
  for (const r of regressions) console.error(` - ${r}`);
  process.exit(4);
}

console.log('[readiness-regression] PASS: no per-exercise regressions detected');
console.log(`[readiness-regression] summary: ${path.resolve(outPath)}`);
