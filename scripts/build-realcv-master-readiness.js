#!/usr/bin/env node
'use strict';

const fs = require('fs');

function readJson(path) {
  try {
    return { ok: true, data: JSON.parse(fs.readFileSync(path, 'utf8')) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function norm(s) {
  return String(s || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function exerciseSetFromAtlas(artifact) {
  const arr = Array.isArray(artifact?.exercises) ? artifact.exercises : [];
  return new Set(arr.map((e) => norm(e.exerciseId || e.id)).filter(Boolean));
}

function exerciseSetFromSummary(summary) {
  const arr = Array.isArray(summary?.readiness_matrix) ? summary.readiness_matrix : [];
  return new Set(arr.map((e) => norm(e.exerciseId)).filter(Boolean));
}

function main() {
  const atlasPath = process.argv[2];
  const heliosPath = process.argv[3];
  const summaryPath = process.argv[4];
  const outPath = process.argv[5] || 'artifacts/realcv-master-readiness.json';

  if (!atlasPath || !heliosPath || !summaryPath) {
    console.error('Usage: node scripts/build-realcv-master-readiness.js <atlas.native-readiness.v1.json> <helios-readiness.json> <rollout-summary.json> [out.json]');
    process.exit(2);
  }

  const blockers = [];
  const addBlocker = (code, detail, fallback) => blockers.push({ code, detail, fallback });

  const atlas = readJson(atlasPath);
  if (!atlas.ok) addBlocker('UNPARSEABLE_ATLAS_READINESS', `atlas input invalid: ${atlasPath}`, 'Provide valid atlas.native-readiness.v1.json');
  const helios = readJson(heliosPath);
  if (!helios.ok) addBlocker('UNPARSEABLE_HELIOS_READINESS', `helios input invalid: ${heliosPath}`, 'Provide valid Helios readiness artifact JSON');
  const summary = readJson(summaryPath);
  if (!summary.ok) addBlocker('UNPARSEABLE_ORION_SUMMARY', `orion summary invalid: ${summaryPath}`, 'Regenerate cross-repo rollout summary artifact');

  const required = 10;
  const atlasSet = atlas.ok ? exerciseSetFromAtlas(atlas.data) : new Set();
  const heliosSet = helios.ok ? exerciseSetFromAtlas(helios.data) : new Set();
  const orionSet = summary.ok ? exerciseSetFromSummary(summary.data) : new Set();

  const all = new Set([...atlasSet, ...heliosSet, ...orionSet]);
  const covered = [...all].length;
  const missing = Math.max(0, required - covered);

  if (atlas.ok && atlasSet.size < required) addBlocker('PARTIAL_ATLAS_COVERAGE', `atlas covers ${atlasSet.size}/${required}`, 'Backfill missing exercises in atlas readiness output');
  if (helios.ok && heliosSet.size < required) addBlocker('PARTIAL_HELIOS_COVERAGE', `helios covers ${heliosSet.size}/${required}`, 'Backfill missing exercises in helios readiness output');
  if (summary.ok && orionSet.size < required) addBlocker('PARTIAL_ORION_COVERAGE', `orion covers ${orionSet.size}/${required}`, 'Rerun strict gate and ensure readiness_matrix has all canonical exercises');

  const laneStatus = {
    atlas: atlas.ok ? (atlasSet.size >= required ? 'PASS' : 'PARTIAL') : 'BLOCKED',
    helios: helios.ok ? (heliosSet.size >= required ? 'PASS' : 'PARTIAL') : 'BLOCKED',
    orion: summary.ok ? ((summary.data.strictGateStatus === 'PASS' && orionSet.size >= required) ? 'PASS' : 'PARTIAL') : 'BLOCKED',
  };

  const testsPassed = blockers.length === 0 && Object.values(laneStatus).every((x) => x === 'PASS');

  const nextActions = testsPassed
    ? ['Proceed to release candidate checklist and staging validation.']
    : [...new Set(blockers.map((b) => b.fallback))];

  const out = {
    generated_at: new Date().toISOString(),
    exercise_coverage: { required, covered, missing },
    lane_status: laneStatus,
    blockers,
    tests_passed: testsPassed,
    next_actions: nextActions,
  };

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${outPath}`);
  process.exit(testsPassed ? 0 : 1);
}

if (require.main === module) main();

module.exports = { norm, exerciseSetFromAtlas, exerciseSetFromSummary };
