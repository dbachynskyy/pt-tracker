#!/usr/bin/env node
'use strict';

const fs = require('fs');

const EXERCISES = [
  'squat','pushup','sit_to_stand','plank','lunge',
  'glute_bridge','knee_extension','heel_raise','calf_raise','shoulder_abduction',
];

function norm(s){return String(s||'').trim().toLowerCase().replace(/[\s-]+/g,'_');}
function readJsonSafe(p){try{return{ok:true,data:JSON.parse(fs.readFileSync(p,'utf8'))};}catch(e){return{ok:false,error:e.message};}}

function indexByExercise(arr, keys=['exercise_id','exerciseId','id']) {
  const m = {};
  for (const row of arr || []) {
    let id = null;
    for (const k of keys) if (row && row[k]) { id = norm(row[k]); break; }
    if (id) m[id] = row;
  }
  return m;
}

function build(atlasGate, heliosReady, heliosEvidence, orionSummary) {
  const blockers = [];
  const addBlocker = (code, detail, fallback) => blockers.push({ code, detail, fallback });

  if (!atlasGate.ok) addBlocker('MISSING_ATLAS_COVERAGE_GATE', `missing/malformed artifacts/atlas-coverage-gate.v1.json: ${atlasGate.error}`, 'Generate Atlas coverage gate artifact before final contract.');
  if (!heliosReady.ok) addBlocker('MISSING_HELIOS_READINESS', `missing/malformed artifacts/helios-exercise-readiness.v1.json: ${heliosReady.error}`, 'Generate Helios readiness artifact before final contract.');
  if (!orionSummary.ok) addBlocker('MISSING_ORION_10EX_SUMMARY', `missing/malformed artifacts/realcv-10ex-summary.v1.json: ${orionSummary.error}`, 'Generate Orion 10-ex summary before final contract.');

  const atlasRows = atlasGate.ok ? (atlasGate.data.exercises || atlasGate.data.readiness_matrix || []) : [];
  const heliosRows = heliosReady.ok ? (heliosReady.data.exercises || heliosReady.data.readiness_matrix || []) : [];
  const orionRows = orionSummary.ok ? (orionSummary.data.exercises || []) : [];
  const evidenceRows = heliosEvidence.ok ? (heliosEvidence.data.exercises || heliosEvidence.data.readiness_matrix || []) : [];

  const atlasMap = indexByExercise(atlasRows, ['exercise_id','exerciseId','id']);
  const heliosMap = indexByExercise(heliosRows, ['exercise_id','exerciseId','id']);
  const orionMap = indexByExercise(orionRows, ['exercise_id','exerciseId','id']);
  const evidenceMap = indexByExercise(evidenceRows, ['exercise_id','exerciseId','id']);

  const rows = [];
  for (const ex of EXERCISES) {
    const a = atlasMap[ex] || {};
    const h = heliosMap[ex] || {};
    const o = orionMap[ex] || {};
    const e = evidenceMap[ex] || {};

    const atlasCoveragePass = Boolean(a.coverage_pass ?? a.overall_pass ?? a.pass ?? a.status === 'PASS');
    const heliosReadinessPass = Boolean(h.helios_gate_pass ?? h.overall_pass ?? h.pass ?? h.status === 'PASS');
    const orionOverallPass = Boolean(o.overall_pass ?? o.pass ?? o.status === 'PASS');

    const reasons = [];
    if (!atlasCoveragePass) reasons.push('atlas_coverage_fail');
    if (!heliosReadinessPass) reasons.push('helios_readiness_fail');
    if (!orionOverallPass) reasons.push('orion_overall_fail');
    if (!heliosEvidence.ok) reasons.push('helios_evidence_missing_optional');

    rows.push({
      exercise_id: ex,
      atlas_coverage_pass: atlasCoveragePass,
      helios_readiness_pass: heliosReadinessPass,
      orion_overall_pass: orionOverallPass,
      overall_pass: atlasCoveragePass && heliosReadinessPass && orionOverallPass,
      reasons,
      helios_evidence_ref: e.evidence || e.ref || null,
    });
  }

  const pass = rows.filter(r => r.overall_pass).length;
  const release = (blockers.length === 0 && pass === 10) ? 'PASS' : 'FAIL';

  // strict blocker from row failures
  for (const r of rows) {
    if (!r.overall_pass) addBlocker('EXERCISE_CONTRACT_FAIL', `${r.exercise_id}: ${r.reasons.join(',')}`, 'Fix failing lane(s) for this exercise and regenerate upstream artifacts.');
  }

  return {
    version: 'v1',
    generated_at: new Date().toISOString(),
    pass_count: pass,
    total: 10,
    release,
    exercises: rows,
    blockers,
  };
}

function renderMd(report) {
  const lines = [
    '# RealCV Final Contract Report',
    '',
    `- pass: ${report.pass_count}/${report.total}`,
    `- release: ${report.release}`,
    '',
    '| Exercise | Atlas Coverage | Helios Readiness | Orion Overall | Overall | Reasons |',
    '|---|---:|---:|---:|---:|---|',
  ];
  for (const r of report.exercises) {
    const icon = (v) => (v ? '✅' : '❌');
    lines.push(`| ${r.exercise_id} | ${icon(r.atlas_coverage_pass)} | ${icon(r.helios_readiness_pass)} | ${icon(r.orion_overall_pass)} | ${icon(r.overall_pass)} | ${r.reasons.join(', ') || '—'} |`);
  }
  if (report.blockers.length) {
    lines.push('', '## Blockers', '');
    for (const b of report.blockers) lines.push(`- ${b.code}: ${b.detail}`);
  }
  return lines.join('\n');
}

function main() {
  const atlasPath = process.argv[2] || 'artifacts/atlas-coverage-gate.v1.json';
  const heliosPath = process.argv[3] || 'artifacts/helios-exercise-readiness.v1.json';
  const evidencePath = process.argv[4] || 'artifacts/helios-exercise-readiness-evidence.v1.json';
  const orionPath = process.argv[5] || 'artifacts/realcv-10ex-summary.v1.json';
  const outJson = process.argv[6] || 'artifacts/realcv-final-contract.v1.json';
  const outMd = process.argv[7] || 'artifacts/realcv-final-contract.md';

  const report = build(
    readJsonSafe(atlasPath),
    readJsonSafe(heliosPath),
    readJsonSafe(evidencePath),
    readJsonSafe(orionPath),
  );

  fs.writeFileSync(outJson, JSON.stringify(report, null, 2));
  fs.writeFileSync(outMd, renderMd(report));

  console.log(`REALCV_FINAL_CONTRACT[v1] pass=${report.pass_count}/10 release=${report.release}`);
  process.exit(report.release === 'PASS' ? 0 : 1);
}

if (require.main === module) main();
module.exports = { build, EXERCISES };
