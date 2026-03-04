#!/usr/bin/env node
'use strict';

const fs = require('fs');

function buildStatus(summary) {
  const total = summary.requiredCount || (summary.readiness_matrix || []).length || 10;
  const passed = summary.pass_count || 0;
  const blockers = (summary.blockers || []).map((b) => ({ code: b.code, detail: b.detail, fallback: b.fallback || null }));

  const testsPassed = summary.status === 'PASS' && summary.strictGateStatus === 'PASS';

  const nextActions = [];
  if (!testsPassed) {
    if (blockers.length) {
      for (const b of blockers.slice(0, 5)) nextActions.push(b.fallback || `Resolve blocker ${b.code}`);
    } else {
      nextActions.push('Investigate failing exercises in readiness_matrix and rerun strict gate.');
    }
  } else {
    nextActions.push('Proceed to staging rollout checklist for real-camera CV.');
  }

  return {
    generated_at: new Date().toISOString(),
    exercise_coverage: {
      required: total,
      passed,
      missing: Math.max(0, total - passed),
    },
    blockers,
    tests_passed: testsPassed,
    next_actions: [...new Set(nextActions)],
  };
}

function main() {
  const inPath = process.argv[2];
  const outPath = process.argv[3];
  if (!inPath || !outPath) {
    console.error('Usage: node scripts/write-realcv-rollout-status.js <summary.json> <out.json>');
    process.exit(2);
  }

  const summary = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const status = buildStatus(summary);
  fs.writeFileSync(outPath, JSON.stringify(status, null, 2));
  console.log(`Wrote ${outPath}`);
}

if (require.main === module) main();

module.exports = { buildStatus };
