#!/usr/bin/env node
'use strict';

const fs = require('fs');

function readJsonSafe(p) {
  try {
    return { ok: true, data: JSON.parse(fs.readFileSync(p, 'utf8')) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function norm(s) {
  return String(s || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function getSetFromReadiness(doc) {
  const out = new Set();
  const arr = Array.isArray(doc?.exercises) ? doc.exercises : [];
  for (const e of arr) out.add(norm(e.exerciseId || e.id));
  out.delete('');
  return out;
}

function build(atlasDoc, heliosDoc, rolloutDoc, masterDoc) {
  const blockers = [];
  const required = 10;

  let atlasSet = new Set();
  let heliosSet = new Set();

  if (!atlasDoc.ok) blockers.push({ lane: 'atlas', code: 'BLOCKED', detail: `unparseable atlas readiness: ${atlasDoc.error}` });
  else atlasSet = getSetFromReadiness(atlasDoc.data);

  if (!heliosDoc.ok) blockers.push({ lane: 'helios', code: 'BLOCKED', detail: `unparseable helios readiness: ${heliosDoc.error}` });
  else heliosSet = getSetFromReadiness(heliosDoc.data);

  const atlasStatus = !atlasDoc.ok ? 'BLOCKED' : (atlasSet.size >= required ? 'PASS' : 'BLOCKED');
  const heliosStatus = !heliosDoc.ok ? 'BLOCKED' : (heliosSet.size >= required ? 'PASS' : 'BLOCKED');

  const orionStatus = (!rolloutDoc.ok || !masterDoc.ok)
    ? 'BLOCKED'
    : ((rolloutDoc.data.tests_passed === true && masterDoc.data.tests_passed === true) ? 'PASS' : 'BLOCKED');

  if (atlasStatus === 'BLOCKED' && atlasDoc.ok) blockers.push({ lane: 'atlas', code: 'PARTIAL_COVERAGE', detail: `atlas coverage ${atlasSet.size}/${required}` });
  if (heliosStatus === 'BLOCKED' && heliosDoc.ok) blockers.push({ lane: 'helios', code: 'PARTIAL_COVERAGE', detail: `helios coverage ${heliosSet.size}/${required}` });
  if (orionStatus === 'BLOCKED') blockers.push({ lane: 'orion', code: 'BLOCKED', detail: 'rollout/master readiness indicates not passed' });

  const all = new Set([...atlasSet, ...heliosSet]);
  const unified = {
    generated_at: new Date().toISOString(),
    exercise_coverage: {
      required,
      covered: all.size,
      missing: Math.max(0, required - all.size),
    },
    lane_status: {
      atlas: atlasStatus,
      helios: heliosStatus,
      orion: orionStatus,
    },
    blockers,
    tests_passed: blockers.length === 0,
    next_actions: blockers.length
      ? blockers.map((b) => `Resolve ${b.lane}:${b.code} (${b.detail})`)
      : ['All lanes PASS. Continue rollout execution.'],
  };
  return unified;
}

function main() {
  const [atlasPath, heliosPath, rolloutPath, masterPath, outPath] = process.argv.slice(2);
  if (!atlasPath || !heliosPath || !rolloutPath || !masterPath || !outPath) {
    console.error('Usage: node scripts/write-realcv-crosslane-status.js <atlas.json> <helios.json> <rollout.json> <master.json> <out.json>');
    process.exit(2);
  }

  const out = build(
    readJsonSafe(atlasPath),
    readJsonSafe(heliosPath),
    readJsonSafe(rolloutPath),
    readJsonSafe(masterPath),
  );

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${outPath}`);
  process.exit(out.tests_passed ? 0 : 1);
}

if (require.main === module) main();

module.exports = { build, readJsonSafe };
