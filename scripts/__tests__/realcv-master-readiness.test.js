#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const script = path.join(__dirname, '..', 'build-realcv-master-readiness.js');
const tmp = path.join(__dirname, 'fixtures', 'master');
fs.mkdirSync(tmp, { recursive: true });

function w(name, obj) {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
  return p;
}

const ten = ['squat','pushup','sit_to_stand','plank','lunge','glute_bridge','knee_extension','heel_raise','calf_raise','shoulder_abduction'];
const atlasGood = w('atlas.good.json', { exercises: ten.map((x) => ({ exerciseId: x, ready: true })) });
const heliosGood = w('helios.good.json', { exercises: ten.map((x) => ({ exerciseId: x, ready: true })) });
const summaryGood = w('summary.good.json', { strictGateStatus: 'PASS', readiness_matrix: ten.map((x) => ({ exerciseId: x })) });
const outGood = path.join(tmp, 'out.good.json');
try { execFileSync('node', [script, atlasGood, heliosGood, summaryGood, outGood], { stdio: 'pipe' }); } catch {}
const g = JSON.parse(fs.readFileSync(outGood, 'utf8'));
assert.equal(g.tests_passed, true);

const summaryPartial = w('summary.partial.json', { strictGateStatus: 'PASS', readiness_matrix: ten.slice(0, 7).map((x) => ({ exerciseId: x })) });
const outPartial = path.join(tmp, 'out.partial.json');
let failed = false;
try { execFileSync('node', [script, atlasGood, heliosGood, summaryPartial, outPartial], { stdio: 'pipe' }); } catch { failed = true; }
assert.equal(failed, true);
const p = JSON.parse(fs.readFileSync(outPartial, 'utf8'));
assert(p.blockers.some((b) => b.code === 'PARTIAL_ORION_COVERAGE'));

const bad = path.join(tmp, 'bad.json');
fs.writeFileSync(bad, '{broken');
const outBad = path.join(tmp, 'out.bad.json');
failed = false;
try { execFileSync('node', [script, bad, heliosGood, summaryGood, outBad], { stdio: 'pipe' }); } catch { failed = true; }
assert.equal(failed, true);
const b = JSON.parse(fs.readFileSync(outBad, 'utf8'));
assert(b.blockers.some((x) => x.code === 'UNPARSEABLE_ATLAS_READINESS'));

console.log('PASS realcv-master-readiness.test.js');
