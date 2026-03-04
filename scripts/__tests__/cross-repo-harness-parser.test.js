#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const {
  parseAtlasSelectorExposure,
  parseHeliosAnalyzerRouting,
  parseHeliosCoverageSignal,
  evaluate,
  buildSummary,
  renderSummaryMd,
  parseReadinessFile,
  classifyFailFast,
  computeTrend,
} = require('../run-cross-repo-cv-regression-harness');

const FIX = path.join(__dirname, 'fixtures', 'cross-repo');
const atlasDir = path.join(FIX, 'atlas');
const heliosDir = path.join(FIX, 'helios');

const contract = {
  requiredExerciseCount: 3,
  exercises: [
    { id: 'squat', analyzerClass: 'SquatAnalyzer', testSignals: ['squat.test.ts'] },
    { id: 'pushup', analyzerClass: 'PushupAnalyzer', testSignals: ['pushup.test.ts'] },
    { id: 'plank', analyzerClass: 'PlankAnalyzer', acceptedAnalyzerClasses: ['PlankAnalyzer', 'PlankHoldAnalyzer'], acceptedRoutingIds: ['plank', 'plank_hold'], testSignals: ['plankHold.test.ts'] },
  ],
};

const blockers = [];
const s = parseAtlasSelectorExposure(blockers, atlasDir);
const r = parseHeliosAnalyzerRouting(blockers, contract, heliosDir);
const c = parseHeliosCoverageSignal(blockers, contract, heliosDir);
assert.equal(blockers.length, 0);
assert(r.ids.has('plank'));

const tmpReadiness = path.join(__dirname, 'fixtures', 'readiness.tmp.json');
fs.writeFileSync(tmpReadiness, JSON.stringify({ exercises: [{ exerciseId: 'plank', ready: false, reason: 'camera permission denied' }] }));
const ar = parseReadinessFile(tmpReadiness, 'atlas', []);
assert.equal(ar.plank.ready, false);
assert(ar.plank.reason.includes('camera'));

const out = evaluate(contract, s, r, c, [], 'live', ar, {});
const report = {
  generatedAt: '2026-03-04T00:00:00.000Z', mode: 'live', status: 'PASS', requiredExerciseCount: 3,
  taxonomy: {}, blockers: [], provenance: { atlasGitSha: 'a1', heliosGitSha: 'h1' }, results: out.rows, summary: { pass: 3, fail: 0 },
};
const summary = buildSummary(report, { strictGate: true });
summary.failFast = classifyFailFast(report, summary);
assert(summary.failFast.triggered, 'camera reason should trigger fail-fast');
const trend = computeTrend({ pass_count: 1, fail_count: 2, blocked_count: 0, status: 'FAIL', strictGateStatus: 'FAIL' }, summary);
assert.equal(trend.pass_delta, 2);
assert.equal(typeof renderSummaryMd(summary), 'string');

fs.unlinkSync(tmpReadiness);
console.log('PASS cross-repo-harness-parser.test.js');
