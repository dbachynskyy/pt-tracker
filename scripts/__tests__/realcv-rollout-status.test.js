#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { buildStatus } = require('../write-realcv-rollout-status');

const passSummary = {
  requiredCount: 10,
  pass_count: 10,
  status: 'PASS',
  strictGateStatus: 'PASS',
  blockers: [],
};

const failSummary = {
  requiredCount: 10,
  pass_count: 7,
  status: 'BLOCKED',
  strictGateStatus: 'BLOCKED',
  blockers: [
    { code: 'MISSING_READINESS_ARTIFACT', detail: 'missing file', fallback: 'Supply readiness files' },
  ],
};

const pass = buildStatus(passSummary);
assert.equal(pass.exercise_coverage.passed, 10);
assert.equal(pass.tests_passed, true);
assert(pass.next_actions[0].includes('Proceed'));

const fail = buildStatus(failSummary);
assert.equal(fail.exercise_coverage.missing, 3);
assert.equal(fail.tests_passed, false);
assert(fail.next_actions[0].includes('Supply readiness files'));

console.log('PASS realcv-rollout-status.test.js');
