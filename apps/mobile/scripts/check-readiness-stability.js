#!/usr/bin/env node
/* Lane stability guard from readiness history (orion.readiness.gate.v1 series) */
const fs = require('fs');
const path = require('path');

const EXERCISES = [
  'squat','pushup','sit_to_stand','lunge','calf_raise','glute_bridge','shoulder_abduction','heel_raise','knee_extension','plank_hold',
];
const VOL_THRESHOLD = Number(process.env.HELIOS_STABILITY_VOL_THRESHOLD || 15);
const FLIP_WEIGHT = Number(process.env.HELIOS_STABILITY_FLIP_WEIGHT || 50);

function fail(msg, code = 2) {
  console.error(`[readiness-stability] FAIL: ${msg}`);
  process.exit(code);
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { fail(`Cannot parse ${p}: ${e.message}`); }
}

function stddev(values) {
  if (!values.length) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const varr = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(varr);
}

function normalizeHistory(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.history)) return raw.history;
  fail('history must be an array or { history: [] }');
}

function toMap(summary) {
  if (!summary || summary.schemaVersion !== 'orion.readiness.gate.v1') {
    fail('each history item schemaVersion must be orion.readiness.gate.v1');
  }
  const m = new Map();
  for (const row of summary.exercises || []) m.set(row.exercise, row);
  return m;
}

const historyPath = process.argv[2];
const outPath = process.argv[3] || path.resolve('artifacts/helios-stability-summary.v1.json');
if (!historyPath) {
  fail('Usage: node apps/mobile/scripts/check-readiness-stability.js <history.json> [out.json]', 64);
}
if (!fs.existsSync(historyPath)) fail(`missing history file: ${historyPath}`, 5);

const history = normalizeHistory(readJson(historyPath));
if (history.length < 2) fail('history must contain at least 2 summaries', 65);

const series = Object.fromEntries(EXERCISES.map((e) => [e, { scores: [], passes: [] }]))
for (const item of history) {
  const m = toMap(item);
  for (const e of EXERCISES) {
    const row = m.get(e);
    if (!row) fail(`missing exercise ${e} in one history summary`);
    const score = typeof row.quality_score === 'number' ? row.quality_score : Math.max(0, 100 - ((row.fail_reasons || []).length * 20));
    series[e].scores.push(score);
    series[e].passes.push(!!row.gate_pass);
  }
}

const exercises = [];
const severe_incidents = [];
for (const e of EXERCISES) {
  const scores = series[e].scores;
  const passes = series[e].passes;
  const deltas = [];
  for (let i = 1; i < scores.length; i++) deltas.push(scores[i] - scores[i - 1]);
  let flips = 0;
  for (let i = 1; i < passes.length; i++) if (passes[i] !== passes[i - 1]) flips++;
  const flipRate = passes.length > 1 ? flips / (passes.length - 1) : 0;
  const dStd = stddev(deltas);
  const volatility = dStd + flipRate * FLIP_WEIGHT;
  const currentPass = passes[passes.length - 1];
  const severe = currentPass === true && volatility > VOL_THRESHOLD;
  if (severe) severe_incidents.push({ exercise: e, volatility_score: volatility });

  exercises.push({
    exercise: e,
    rolling_delta_stddev: dStd,
    pass_fail_flip_rate: flipRate,
    volatility_score: volatility,
    current_gate_pass: currentPass,
    severe_instability: severe,
  });
}

const summary = {
  schemaVersion: 'helios-stability-summary.v1',
  volatility_threshold: VOL_THRESHOLD,
  flip_weight: FLIP_WEIGHT,
  source_history_path: path.resolve(historyPath),
  exercises,
  severe_instability_incidents: severe_incidents,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');

if (severe_incidents.length > 0) {
  console.error(`[readiness-stability] FAIL: ${severe_incidents.length} severe instability incident(s)`);
  for (const i of severe_incidents) console.error(` - ${i.exercise}: volatility=${i.volatility_score.toFixed(2)}`);
  process.exit(7);
}

console.log('[readiness-stability] PASS: no severe instability incidents');
console.log(`[readiness-stability] artifact: ${path.resolve(outPath)}`);
