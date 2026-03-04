#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const {
  parseAtlasSelectorExposure,
  parseHeliosAnalyzerRouting,
  parseHeliosCoverageSignal,
  evaluate,
  buildSummary,
  renderSummaryMd,
} = require('../run-cross-repo-cv-regression-harness');

const FIX = path.join(__dirname, 'fixtures', 'cross-repo');
const atlasDir = path.join(FIX, 'atlas');
const heliosDir = path.join(FIX, 'helios');

const contract = {
  requiredExerciseCount: 3,
  exercises: [
    { id: 'squat', analyzerClass: 'SquatAnalyzer', testSignals: ['squat.test.ts'] },
    { id: 'pushup', analyzerClass: 'PushupAnalyzer', testSignals: ['pushup.test.ts'] },
    {
      id: 'plank',
      analyzerClass: 'PlankAnalyzer',
      acceptedAnalyzerClasses: ['PlankAnalyzer', 'PlankHoldAnalyzer'],
      acceptedRoutingIds: ['plank', 'plank_hold'],
      testSignals: ['plankHold.test.ts'],
    },
  ],
};

const blockers = [];
const s = parseAtlasSelectorExposure(blockers, atlasDir);
const r = parseHeliosAnalyzerRouting(blockers, contract, heliosDir);
const c = parseHeliosCoverageSignal(blockers, contract, heliosDir);

assert.equal(blockers.length, 0, 'no blockers expected in fixture parse');
assert(s.ids.has('plank'), 'plank should be exposed by atlas selector evidence');
assert(r.ids.has('plank'), 'plank should pass routing via plank_hold alias evidence');
assert(c.ids.has('plank'), 'plank should pass coverage signal via plankHold.test.ts');
assert((r.evidenceById.plank || []).length > 0, 'plank routing evidence must be captured');

const out = evaluate(contract, s, r, c, [], 'live');
assert.equal(out.status, 'PASS', 'fixture contract should pass all checks');

const report = {
  generatedAt: '2026-03-04T00:00:00.000Z',
  mode: 'live',
  status: 'PASS',
  requiredExerciseCount: 3,
  taxonomy: {},
  blockers: [],
  provenance: { atlasGitSha: 'atlas123', heliosGitSha: 'helios456' },
  results: out.rows,
  summary: { pass: 3, fail: 0 },
};

const summary = buildSummary(report, { strictGate: true });
assert.equal(summary.pass_count, 3);
assert.equal(summary.strictGateStatus, 'PASS');
assert.equal(summary.atlas_git_sha, 'atlas123');

const summaryMd = renderSummaryMd(summary);
assert(summaryMd.includes('Cross-Repo CV Regression Summary'));
assert(summaryMd.includes('Atlas SHA: atlas123'));

console.log('PASS cross-repo-harness-parser.test.js');
