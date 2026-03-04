#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const CANONICAL = [
  'squat','pushup','sit_to_stand','plank','lunge','glute_bridge','knee_extension','heel_raise','calf_raise','shoulder_abduction',
];
const BLOCKERS = new Set(['none','auth','credits','rate_limit','data_gap','other']);

function die(msg, code = 2) {
  console.error(`[realcv-completeness] FAIL: ${msg}`);
  process.exit(code);
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { die(`cannot parse ${p}: ${e.message}`); }
}

function toMillis(v) {
  if (!v) return NaN;
  const n = Date.parse(v);
  return Number.isNaN(n) ? NaN : n;
}

const inPath = process.argv[2];
const outPath = process.argv[3] || path.resolve('apps/mobile/artifacts/helios-realcv-evidence-completeness.v1.json');
if (!inPath) die('Usage: node apps/mobile/scripts/verify-realcv-evidence-completeness.mjs <realcv-evidence.json> [out.json]', 64);

const input = readJson(inPath);
const records = Array.isArray(input) ? input : Array.isArray(input.records) ? input.records : null;
if (!records) die('input must be an array or { records: [] }', 65);

const staleMs = Number(process.env.HELIOS_REALCV_STALE_MS || 72 * 60 * 60 * 1000);
const nowMs = Number(process.env.HELIOS_REALCV_NOW_MS || Date.parse('2026-03-04T00:00:00.000Z'));

const byExercise = Object.fromEntries(CANONICAL.map((e) => [e, []]));
for (const r of records) {
  if (r && typeof r.exercise === 'string' && r.exercise in byExercise) byExercise[r.exercise].push(r);
}

const matrix = {};
let pass = true;
for (const ex of CANONICAL) {
  const rows = byExercise[ex];
  const missing = [];
  let stale = false;
  let malformedBlocker = false;

  if (!rows.length) missing.push('real_camera_evidence');

  const hasBundle = rows.some((r) => !!r.capture_bundle_id);
  if (!hasBundle) missing.push('capture_bundle_id');

  const hasAttestation = rows.some((r) => !!r.provenance_attestation_id);
  if (!hasAttestation) missing.push('provenance_attestation_id');

  const hasBlocker = rows.some((r) => typeof r.blocker_class === 'string');
  if (!hasBlocker) missing.push('blocker_class');
  for (const r of rows) {
    const bc = r.blocker_class;
    if (bc !== undefined && !BLOCKERS.has(bc)) malformedBlocker = true;
  }
  if (malformedBlocker) missing.push('blocker_class_invalid');

  const hasFreshnessField = rows.some((r) => !!(r.captured_at || r.timestamp || r.created_at));
  if (!hasFreshnessField) missing.push('captured_at');

  const latestTs = Math.max(...rows.map((r) => toMillis(r.captured_at || r.timestamp || r.created_at)).filter((n) => !Number.isNaN(n)), -Infinity);
  if (latestTs !== -Infinity) {
    stale = (nowMs - latestTs) > staleMs;
    if (stale) missing.push('stale_evidence');
  }

  const exPass = missing.length === 0;
  if (!exPass) pass = false;
  matrix[ex] = {
    pass: exPass,
    missing_fields: missing,
    record_count: rows.length,
    stale,
  };
}

const artifact = {
  schemaVersion: 'helios-realcv-evidence-completeness.v1',
  stale_threshold_ms: staleMs,
  now_ms: nowMs,
  completeness_pass: pass,
  missing_field_matrix: matrix,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2) + '\n', 'utf8');
if (!pass) {
  console.error('[realcv-completeness] FAIL: completeness checks failed');
  process.exit(3);
}
console.log('[realcv-completeness] PASS');
console.log(`[realcv-completeness] artifact: ${path.resolve(outPath)}`);
