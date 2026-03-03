#!/usr/bin/env node
/**
 * cv-generate-artifacts.js
 *
 * Reads Jest --json output from a file, enforces CV quality gate thresholds,
 * and writes three artifacts to ./artifacts/:
 *   summary.json       Machine-readable gate results + per-threshold status
 *   junit.xml          JUnit-format XML for CI test reporting panels
 *   quality-report.md  Human-readable triage report
 *
 * Hard thresholds enforced:
 *   ACCURACY_FLOOR      100% — all describe-blocks must pass
 *   FALSE_POSITIVE_CAP    0  — "NOT flagged / does NOT flag / good form" tests must all pass
 *   LOCKOUT_CORRECTNESS 100% — anti-cheat describe-blocks (velocity, debounce, warmup,
 *                              occlusion, session continuity) must all pass
 *
 * Usage:
 *   node scripts/cv-generate-artifacts.js jest-cv-results.json
 *
 * Exit codes:
 *   0  all thresholds met
 *   1  one or more thresholds violated
 *   2  bad arguments or parse error
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Threshold definitions
// ---------------------------------------------------------------------------
const THRESHOLDS = {
  ACCURACY_FLOOR: {
    pct:  100,
    desc: 'All describe-blocks pass (100% scenario pass rate required)',
  },
  FALSE_POSITIVE_CAP: {
    maxFail: 0,
    desc:    'False-positive guard tests must not fail (0 failures allowed)',
  },
  LOCKOUT_CORRECTNESS: {
    pct:  100,
    desc: 'Anti-cheat describe-blocks pass (velocity, debounce, warmup, occlusion, continuity)',
  },
};

// Tests whose full title matches any of these are false-positive guards.
// They assert that the system does NOT flag clean reps.
const FP_PATTERNS = [
  'does not flag',
  'not flagged',
  'not flag',
  'no flags',
  'no false',
  'good form',
  'clean rep',
];

// Describe-blocks whose name matches any of these are anti-cheat / lockout suites.
const LOCKOUT_PATTERNS = [
  'velocity ceiling',
  'global velocity',
  'debounce window',
  'warmup gate',
  'occlusion gating',
  'session continuity',
  'anti-cheat',
];

function matchesAny(str, patterns) {
  const lower = str.toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Parse Jest JSON → describe-block groups
// ---------------------------------------------------------------------------
function parseJestJson(data) {
  const groups = [];
  for (const suite of data.testResults ?? []) {
    const filePath  = suite.name ?? suite.testFilePath ?? '';
    const fileLabel = filePath.replace(/.*\/([^/]+)\.test\.ts$/, '$1');

    const byDescribe = new Map();
    for (const t of suite.assertionResults ?? suite.testResults ?? []) {
      const describeKey = t.ancestorTitles[0] ?? '(top-level)';
      if (!byDescribe.has(describeKey)) byDescribe.set(describeKey, []);
      byDescribe.get(describeKey).push(t);
    }

    for (const [describe, tests] of byDescribe) {
      const passed = tests.filter((t) => t.status === 'passed').length;
      const failed = tests.filter((t) => t.status !== 'passed').length;
      groups.push({
        fileLabel, filePath, describe, tests,
        passed, failed, allPass: failed === 0,
      });
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Threshold enforcement → violations[]
// ---------------------------------------------------------------------------
function enforceThresholds(groups, data) {
  const violations = [];

  // 1. ACCURACY_FLOOR — 100% of describe-blocks must pass
  const total    = groups.length;
  const passing  = groups.filter((g) => g.allPass).length;
  const failing  = total - passing;
  if (failing > 0) {
    const pct = total > 0 ? Math.round((passing / total) * 100) : 0;
    violations.push({
      threshold: 'ACCURACY_FLOOR',
      required:  `${THRESHOLDS.ACCURACY_FLOOR.pct}%`,
      actual:    `${pct}%`,
      detail:    `${failing} failing describe-block(s): ` +
        groups.filter((g) => !g.allPass).map((g) => `"${g.describe}"`).join(', '),
    });
  }

  // 2. FALSE_POSITIVE_CAP — false-positive guard tests must all pass
  const fpFailed = [];
  for (const g of groups) {
    for (const t of g.tests) {
      if (t.status !== 'passed' && matchesAny(`${g.describe} ${t.title}`, FP_PATTERNS)) {
        fpFailed.push({ describe: g.describe, title: t.title });
      }
    }
  }
  if (fpFailed.length > 0) {
    violations.push({
      threshold: 'FALSE_POSITIVE_CAP',
      required:  `${THRESHOLDS.FALSE_POSITIVE_CAP.maxFail} failures`,
      actual:    `${fpFailed.length} failures`,
      detail:    `False-positive guard test(s) failing: ` +
        fpFailed.map((t) => `"${t.title}"`).join('; '),
    });
  }

  // 3. LOCKOUT_CORRECTNESS — anti-cheat blocks must all pass
  const lockoutGroups = groups.filter((g) => matchesAny(g.describe, LOCKOUT_PATTERNS));
  const lockoutFail   = lockoutGroups.filter((g) => !g.allPass);
  if (lockoutFail.length > 0) {
    const pct = lockoutGroups.length > 0
      ? Math.round(((lockoutGroups.length - lockoutFail.length) / lockoutGroups.length) * 100)
      : 0;
    violations.push({
      threshold: 'LOCKOUT_CORRECTNESS',
      required:  `${THRESHOLDS.LOCKOUT_CORRECTNESS.pct}%`,
      actual:    `${pct}%`,
      detail:    `Anti-cheat block(s) failing: ` +
        lockoutFail.map((g) => `"${g.describe}"`).join(', '),
    });
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Build summary.json
// ---------------------------------------------------------------------------
function buildSummary(groups, data, violations, timestamp) {
  const total   = groups.length;
  const passing = groups.filter((g) => g.allPass).length;

  const thresholdStatus = (key) => violations.some((v) => v.threshold === key) ? 'FAIL' : 'PASS';

  return {
    timestamp,
    gate:   violations.length === 0 ? 'PASS' : 'FAIL',
    thresholds: {
      ACCURACY_FLOOR: {
        description: THRESHOLDS.ACCURACY_FLOOR.desc,
        required:    `${THRESHOLDS.ACCURACY_FLOOR.pct}%`,
        status:      thresholdStatus('ACCURACY_FLOOR'),
      },
      FALSE_POSITIVE_CAP: {
        description: THRESHOLDS.FALSE_POSITIVE_CAP.desc,
        required:    `${THRESHOLDS.FALSE_POSITIVE_CAP.maxFail} failures`,
        status:      thresholdStatus('FALSE_POSITIVE_CAP'),
      },
      LOCKOUT_CORRECTNESS: {
        description: THRESHOLDS.LOCKOUT_CORRECTNESS.desc,
        required:    `${THRESHOLDS.LOCKOUT_CORRECTNESS.pct}%`,
        status:      thresholdStatus('LOCKOUT_CORRECTNESS'),
      },
    },
    metrics: {
      totalScenarios:  total,
      passedScenarios: passing,
      failedScenarios: total - passing,
      totalTests:      (data.numPassedTests ?? 0) + (data.numFailedTests ?? 0),
      passedTests:     data.numPassedTests ?? 0,
      failedTests:     data.numFailedTests ?? 0,
    },
    violations,
    scenarios: groups.map((g) => ({
      file:    g.fileLabel,
      describe: g.describe,
      status:  g.allPass ? 'PASS' : 'FAIL',
      passed:  g.passed,
      total:   g.passed + g.failed,
    })),
  };
}

// ---------------------------------------------------------------------------
// Build junit.xml
// ---------------------------------------------------------------------------
function buildJUnit(groups, timestamp) {
  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const totalTests  = groups.reduce((n, g) => n + g.passed + g.failed, 0);
  const totalFailed = groups.reduce((n, g) => n + g.failed, 0);

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="CV Quality Gate" tests="${totalTests}" failures="${totalFailed}" timestamp="${esc(timestamp)}">`,
  ];

  const byFile = new Map();
  for (const g of groups) {
    if (!byFile.has(g.fileLabel)) byFile.set(g.fileLabel, []);
    byFile.get(g.fileLabel).push(g);
  }

  for (const [fileLabel, fileGroups] of byFile) {
    const fileTests  = fileGroups.reduce((n, g) => n + g.passed + g.failed, 0);
    const fileFailed = fileGroups.reduce((n, g) => n + g.failed, 0);
    lines.push(`  <testsuite name="${esc(fileLabel)}" tests="${fileTests}" failures="${fileFailed}">`);

    for (const g of fileGroups) {
      for (const t of g.tests) {
        const name = esc(`${g.describe} > ${t.title}`);
        const time = typeof t.duration === 'number' ? (t.duration / 1000).toFixed(3) : '0.000';
        if (t.status === 'passed') {
          lines.push(`    <testcase name="${name}" time="${time}"/>`);
        } else {
          const firstMsg = esc(
            ((t.failureMessages ?? []).join('\n').split('\n').find((l) => l.trim()) ?? 'FAILED').trim().slice(0, 200),
          );
          lines.push(`    <testcase name="${name}" time="${time}">`);
          lines.push(`      <failure message="${firstMsg}"/>`);
          lines.push(`    </testcase>`);
        }
      }
    }
    lines.push('  </testsuite>');
  }

  lines.push('</testsuites>');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Build quality-report.md
// ---------------------------------------------------------------------------
function buildMarkdown(groups, violations, summary, timestamp) {
  const gate = violations.length === 0;
  const lines = [];

  lines.push('# CV Quality Gate Report');
  lines.push('');
  lines.push(`**Generated:** ${timestamp}`);
  lines.push(`**Gate:** ${gate ? '✅ PASS' : '❌ FAIL'}`);
  lines.push(`**Scenarios:** ${summary.metrics.passedScenarios}/${summary.metrics.totalScenarios} pass`);
  lines.push(`**Tests:** ${summary.metrics.passedTests}/${summary.metrics.totalTests} pass`);
  lines.push('');

  lines.push('## Threshold Enforcement');
  lines.push('');
  lines.push('| Threshold | Required | Status | Detail |');
  lines.push('|---|---|---|---|');
  for (const [key, val] of Object.entries(summary.thresholds)) {
    const v      = violations.find((x) => x.threshold === key);
    const icon   = val.status === 'PASS' ? '✅' : '❌';
    const detail = v ? v.detail : '—';
    lines.push(`| \`${key}\` | ${val.required} | ${icon} ${val.status} | ${detail} |`);
  }
  lines.push('');

  lines.push('## Scenario Matrix');
  lines.push('');
  lines.push('| File | Scenario | Status | Tests |');
  lines.push('|---|---|---|---|');
  for (const s of summary.scenarios) {
    const icon = s.status === 'PASS' ? '✅' : '❌';
    lines.push(`| \`${s.file}\` | ${s.describe} | ${icon} ${s.status} | ${s.passed}/${s.total} |`);
  }
  lines.push('');

  if (!gate) {
    lines.push('## Violations');
    lines.push('');
    for (const v of violations) {
      lines.push(`### \`${v.threshold}\``);
      lines.push('');
      lines.push(`- **Required:** ${v.required}`);
      lines.push(`- **Actual:** ${v.actual}`);
      lines.push(`- **Detail:** ${v.detail}`);
      lines.push('');
    }

    lines.push('## Triage Steps');
    lines.push('');
    lines.push('1. Open the `junit.xml` artifact in the CI panel (GitHub → Actions → run → Artifacts).');
    lines.push('2. Search for `<failure>` elements to identify which assertions failed.');
    lines.push('3. Cross-reference `summary.json` → `violations[]` for threshold context.');
    lines.push('4. Reproduce locally: `bash scripts/run-cv-matrix.sh` from pt-orion root.');
    lines.push('5. See `docs/ci-quality-gates.md` for full threshold definitions and fix guidance.');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    process.stderr.write('Usage: node scripts/cv-generate-artifacts.js <jest-json-output.json>\n');
    process.exit(2);
  }
  if (!fs.existsSync(inputFile)) {
    process.stderr.write(`ERROR: Input file not found: ${inputFile}\n`);
    process.exit(2);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  } catch (e) {
    process.stderr.write(`ERROR: Failed to parse Jest JSON: ${e.message}\n`);
    process.exit(2);
  }

  const timestamp  = new Date().toISOString();
  const groups     = parseJestJson(data);

  if (groups.length === 0) {
    process.stderr.write('ERROR: No test results found in Jest JSON output.\n');
    process.exit(2);
  }

  const violations = enforceThresholds(groups, data);
  const summary    = buildSummary(groups, data, violations, timestamp);
  const junitXml   = buildJUnit(groups, timestamp);
  const markdown   = buildMarkdown(groups, violations, summary, timestamp);

  const artifactsDir = path.join(process.cwd(), 'artifacts');
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(path.join(artifactsDir, 'summary.json'),      JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(artifactsDir, 'junit.xml'),         junitXml);
  fs.writeFileSync(path.join(artifactsDir, 'quality-report.md'), markdown);

  console.log('Artifacts written:');
  console.log('  artifacts/summary.json');
  console.log('  artifacts/junit.xml');
  console.log('  artifacts/quality-report.md');
  console.log('');

  if (violations.length === 0) {
    console.log(`✓ QUALITY GATE: PASS — all ${groups.length} scenarios pass all thresholds`);
    process.exit(0);
  } else {
    console.log(`✗ QUALITY GATE: FAIL — ${violations.length} threshold violation(s):`);
    for (const v of violations) {
      console.log(`  [${v.threshold}] expected ${v.required}, got ${v.actual}: ${v.detail}`);
    }
    process.exit(1);
  }
}

main();
