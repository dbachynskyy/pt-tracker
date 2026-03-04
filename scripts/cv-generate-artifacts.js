#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const THRESHOLDS = {
  ACCURACY_FLOOR: { pct: 100, desc: 'All describe-blocks pass (100% scenario pass rate required)' },
  FALSE_POSITIVE_CAP: { maxFail: 0, desc: 'False-positive guard tests must not fail (0 failures allowed)' },
  LOCKOUT_CORRECTNESS: { pct: 100, desc: 'Anti-cheat describe-blocks pass (velocity, debounce, warmup, occlusion, continuity)' },
  EXERCISE_COVERAGE: { count: 10, desc: 'All 10 required exercises must have scenario coverage and pass' },
};

const FP_PATTERNS = ['does not flag', 'not flagged', 'not flag', 'no flags', 'no false', 'good form', 'clean rep'];
const LOCKOUT_PATTERNS = ['velocity ceiling', 'global velocity', 'debounce window', 'warmup gate', 'occlusion gating', 'session continuity', 'anti-cheat'];

function matchesAny(str, patterns) {
  const lower = String(str || '').toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

function loadExerciseGateConfig() {
  const cfgPath = path.join(process.cwd(), 'schemas', 'cv', 'exercise-gates.json');
  if (!fs.existsSync(cfgPath)) {
    return { requiredExerciseCount: 10, exercises: [] };
  }
  return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
}

function parseJestJson(data) {
  const groups = [];
  for (const suite of data.testResults ?? []) {
    const filePath = suite.name ?? suite.testFilePath ?? '';
    const fileLabel = filePath.replace(/.*\/([^/]+)\.test\.ts$/, '$1');
    const byDescribe = new Map();

    for (const t of suite.assertionResults ?? suite.testResults ?? []) {
      const describeKey = t.ancestorTitles?.[0] ?? '(top-level)';
      if (!byDescribe.has(describeKey)) byDescribe.set(describeKey, []);
      byDescribe.get(describeKey).push(t);
    }

    for (const [describe, tests] of byDescribe) {
      const passed = tests.filter((t) => t.status === 'passed').length;
      const failed = tests.filter((t) => t.status !== 'passed').length;
      groups.push({ fileLabel, filePath, describe, tests, passed, failed, allPass: failed === 0 });
    }
  }
  return groups;
}

function detectExercise(group, config) {
  const hay = `${group.fileLabel} ${group.describe}`.toLowerCase();
  for (const ex of config.exercises ?? []) {
    for (const alias of ex.aliases ?? []) {
      if (hay.includes(String(alias).toLowerCase())) return ex.id;
    }
  }
  return null;
}

function enforceThresholds(groups, config) {
  const violations = [];

  const total = groups.length;
  const passing = groups.filter((g) => g.allPass).length;
  const failing = total - passing;
  if (failing > 0) {
    const pct = total > 0 ? Math.round((passing / total) * 100) : 0;
    violations.push({
      threshold: 'ACCURACY_FLOOR',
      required: `${THRESHOLDS.ACCURACY_FLOOR.pct}%`,
      actual: `${pct}%`,
      detail: `${failing} failing describe-block(s): ${groups.filter((g) => !g.allPass).map((g) => `"${g.describe}"`).join(', ')}`,
    });
  }

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
      required: `${THRESHOLDS.FALSE_POSITIVE_CAP.maxFail} failures`,
      actual: `${fpFailed.length} failures`,
      detail: `False-positive guard test(s) failing: ${fpFailed.map((t) => `"${t.title}"`).join('; ')}`,
    });
  }

  const lockoutGroups = groups.filter((g) => matchesAny(g.describe, LOCKOUT_PATTERNS));
  const lockoutFail = lockoutGroups.filter((g) => !g.allPass);
  if (lockoutFail.length > 0) {
    const pct = lockoutGroups.length > 0 ? Math.round(((lockoutGroups.length - lockoutFail.length) / lockoutGroups.length) * 100) : 0;
    violations.push({
      threshold: 'LOCKOUT_CORRECTNESS',
      required: `${THRESHOLDS.LOCKOUT_CORRECTNESS.pct}%`,
      actual: `${pct}%`,
      detail: `Anti-cheat block(s) failing: ${lockoutFail.map((g) => `"${g.describe}"`).join(', ')}`,
    });
  }

  const required = config.requiredExerciseCount || THRESHOLDS.EXERCISE_COVERAGE.count;
  const requiredSet = new Set((config.exercises ?? []).map((e) => e.id));
  const coverage = new Map();

  for (const g of groups) {
    const exId = detectExercise(g, config);
    if (!exId) continue;
    if (!coverage.has(exId)) coverage.set(exId, { scenarios: 0, failed: 0 });
    const c = coverage.get(exId);
    c.scenarios += 1;
    if (!g.allPass) c.failed += 1;
  }

  const missing = [...requiredSet].filter((id) => !coverage.has(id));
  const failingExercises = [...coverage.entries()].filter(([, c]) => c.failed > 0).map(([id]) => id);
  if (missing.length > 0 || failingExercises.length > 0 || coverage.size < required) {
    violations.push({
      threshold: 'EXERCISE_COVERAGE',
      required: `${required} exercises`,
      actual: `${coverage.size} covered`,
      detail: [
        missing.length ? `missing: ${missing.join(', ')}` : null,
        failingExercises.length ? `failing: ${failingExercises.join(', ')}` : null,
      ].filter(Boolean).join(' | ') || 'coverage below required threshold',
    });
  }

  return { violations, coverage: Object.fromEntries(coverage), missingExercises: missing, failingExercises };
}

function buildSummary(groups, data, thresholdResult, timestamp, config) {
  const { violations, coverage, missingExercises, failingExercises } = thresholdResult;
  const total = groups.length;
  const passing = groups.filter((g) => g.allPass).length;
  const status = (k) => (violations.some((v) => v.threshold === k) ? 'FAIL' : 'PASS');

  return {
    timestamp,
    gate: violations.length === 0 ? 'PASS' : 'FAIL',
    thresholds: {
      ACCURACY_FLOOR: { description: THRESHOLDS.ACCURACY_FLOOR.desc, required: '100%', status: status('ACCURACY_FLOOR') },
      FALSE_POSITIVE_CAP: { description: THRESHOLDS.FALSE_POSITIVE_CAP.desc, required: '0 failures', status: status('FALSE_POSITIVE_CAP') },
      LOCKOUT_CORRECTNESS: { description: THRESHOLDS.LOCKOUT_CORRECTNESS.desc, required: '100%', status: status('LOCKOUT_CORRECTNESS') },
      EXERCISE_COVERAGE: { description: THRESHOLDS.EXERCISE_COVERAGE.desc, required: `${config.requiredExerciseCount || 10} exercises`, status: status('EXERCISE_COVERAGE') },
    },
    metrics: {
      totalScenarios: total,
      passedScenarios: passing,
      failedScenarios: total - passing,
      totalTests: (data.numPassedTests ?? 0) + (data.numFailedTests ?? 0),
      passedTests: data.numPassedTests ?? 0,
      failedTests: data.numFailedTests ?? 0,
      exerciseCoverage: Object.keys(coverage).length,
      requiredExerciseCoverage: config.requiredExerciseCount || 10,
    },
    coverage: { requiredExercises: (config.exercises ?? []).map((e) => e.id), seen: Object.keys(coverage), missingExercises, failingExercises, byExercise: coverage },
    violations,
    scenarios: groups.map((g) => ({ file: g.fileLabel, describe: g.describe, status: g.allPass ? 'PASS' : 'FAIL', passed: g.passed, total: g.passed + g.failed })),
  };
}

function buildJUnit(groups, timestamp) {
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const totalTests = groups.reduce((n, g) => n + g.passed + g.failed, 0);
  const totalFailed = groups.reduce((n, g) => n + g.failed, 0);
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', `<testsuites name="CV Quality Gate" tests="${totalTests}" failures="${totalFailed}" timestamp="${esc(timestamp)}">`];
  const byFile = new Map();
  for (const g of groups) {
    if (!byFile.has(g.fileLabel)) byFile.set(g.fileLabel, []);
    byFile.get(g.fileLabel).push(g);
  }
  for (const [fileLabel, fileGroups] of byFile) {
    const fileTests = fileGroups.reduce((n, g) => n + g.passed + g.failed, 0);
    const fileFailed = fileGroups.reduce((n, g) => n + g.failed, 0);
    lines.push(`  <testsuite name="${esc(fileLabel)}" tests="${fileTests}" failures="${fileFailed}">`);
    for (const g of fileGroups) {
      for (const t of g.tests) {
        const name = esc(`${g.describe} > ${t.title}`);
        const time = typeof t.duration === 'number' ? (t.duration / 1000).toFixed(3) : '0.000';
        if (t.status === 'passed') lines.push(`    <testcase name="${name}" time="${time}"/>`);
        else {
          const firstMsg = esc((((t.failureMessages ?? []).join('\n')).split('\n').find((l) => l.trim()) ?? 'FAILED').trim().slice(0, 200));
          lines.push(`    <testcase name="${name}" time="${time}">`);
          lines.push(`      <failure message="${firstMsg}"/>`);
          lines.push('    </testcase>');
        }
      }
    }
    lines.push('  </testsuite>');
  }
  lines.push('</testsuites>');
  return lines.join('\n');
}

function buildMarkdown(summary, violations, timestamp) {
  const gate = violations.length === 0;
  const lines = [];
  lines.push('# CV Quality Gate Report', '', `**Generated:** ${timestamp}`, `**Gate:** ${gate ? '✅ PASS' : '❌ FAIL'}`);
  lines.push(`**Scenarios:** ${summary.metrics.passedScenarios}/${summary.metrics.totalScenarios} pass`);
  lines.push(`**Tests:** ${summary.metrics.passedTests}/${summary.metrics.totalTests} pass`);
  lines.push(`**Exercise coverage:** ${summary.metrics.exerciseCoverage}/${summary.metrics.requiredExerciseCoverage}`);
  lines.push('', '## Threshold Enforcement', '', '| Threshold | Required | Status | Detail |', '|---|---|---|---|');
  for (const [key, val] of Object.entries(summary.thresholds)) {
    const v = violations.find((x) => x.threshold === key);
    lines.push(`| \`${key}\` | ${val.required} | ${val.status === 'PASS' ? '✅ PASS' : '❌ FAIL'} | ${v ? v.detail : '—'} |`);
  }
  lines.push('', '## Exercise Coverage', '', `- Required exercises: ${summary.coverage.requiredExercises.join(', ')}`);
  lines.push(`- Seen exercises: ${summary.coverage.seen.join(', ') || '(none)'}`);
  lines.push(`- Missing exercises: ${summary.coverage.missingExercises.join(', ') || 'none'}`);
  lines.push('', '## Scenario Matrix', '', '| File | Scenario | Status | Tests |', '|---|---|---|---|');
  for (const s of summary.scenarios) {
    lines.push(`| \`${s.file}\` | ${s.describe} | ${s.status === 'PASS' ? '✅ PASS' : '❌ FAIL'} | ${s.passed}/${s.total} |`);
  }
  lines.push('');
  return lines.join('\n');
}

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
  try { data = JSON.parse(fs.readFileSync(inputFile, 'utf8')); }
  catch (e) { process.stderr.write(`ERROR: Failed to parse Jest JSON: ${e.message}\n`); process.exit(2); }

  const groups = parseJestJson(data);
  if (groups.length === 0) {
    process.stderr.write('ERROR: No test results found in Jest JSON output.\n');
    process.exit(2);
  }

  const config = loadExerciseGateConfig();
  const timestamp = new Date().toISOString();
  const thresholdResult = enforceThresholds(groups, config);
  const summary = buildSummary(groups, data, thresholdResult, timestamp, config);

  const artifactsDir = path.join(process.cwd(), 'artifacts');
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(path.join(artifactsDir, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(artifactsDir, 'junit.xml'), buildJUnit(groups, timestamp));
  fs.writeFileSync(path.join(artifactsDir, 'quality-report.md'), buildMarkdown(summary, thresholdResult.violations, timestamp));

  console.log('Artifacts written: artifacts/summary.json, artifacts/junit.xml, artifacts/quality-report.md');
  if (thresholdResult.violations.length === 0) {
    console.log(`✓ QUALITY GATE: PASS — all thresholds met across ${groups.length} scenarios`);
    process.exit(0);
  }

  console.log(`✗ QUALITY GATE: FAIL — ${thresholdResult.violations.length} threshold violation(s):`);
  for (const v of thresholdResult.violations) {
    console.log(`  [${v.threshold}] expected ${v.required}, got ${v.actual}: ${v.detail}`);
  }
  process.exit(1);
}

main();
