#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.cwd();

const TAXONOMY = {
  MISSING_REPO: 'required repository path missing',
  MISSING_CONTRACT: 'required contract file/folder missing',
  MISSING_SELECTOR_EXPOSURE: 'exercise missing from selector exposure set',
  MISSING_ANALYZER_ROUTING: 'exercise missing from analyzer routing source',
  MISSING_TEST_SIGNAL: 'exercise missing minimum test coverage signal',
};

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function exists(p) { return fs.existsSync(p); }
function norm(s) { return String(s || '').trim().toLowerCase().replace(/[\s-]+/g, '_'); }
function pushBlocker(blockers, code, detail) { blockers.push({ code, detail }); }

function gitSha(repoDir) {
  if (!exists(repoDir) || !exists(path.join(repoDir, '.git'))) return null;
  try {
    return execSync('git rev-parse --short HEAD', { cwd: repoDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

function findMatchesInFile(filePath, patterns) {
  const matches = [];
  if (!exists(filePath)) return matches;
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const p of patterns) {
      if (!p) continue;
      if (line.includes(p)) {
        matches.push({ file: filePath, line: i + 1, pattern: p, snippet: line.trim().slice(0, 180) });
      }
    }
  });
  return matches;
}

function parseAtlasSelectorExposure(blockers, atlasDir) {
  const todo = path.join(atlasDir, 'TODO_EXERCISES.md');
  const ids = new Set();
  const evidenceById = {};

  if (!exists(atlasDir)) pushBlocker(blockers, 'MISSING_REPO', `ATLAS_DIR missing: ${atlasDir}`);
  if (!exists(todo)) {
    pushBlocker(blockers, 'MISSING_CONTRACT', `Atlas selector contract missing: ${todo}`);
    return { ids, evidenceById };
  }

  const t = fs.readFileSync(todo, 'utf8');
  const impl = t.split(/\n##\s+|\nInfra:/i)[0];
  const lines = impl.split('\n');
  lines.forEach((line, i) => {
    const m = line.match(/- \[[xX]\]\s+([a-zA-Z0-9_\-]+)/);
    if (!m) return;
    const id = norm(m[1]);
    ids.add(id);
    evidenceById[id] = evidenceById[id] || [];
    evidenceById[id].push({ file: todo, line: i + 1, pattern: m[1], snippet: line.trim().slice(0, 180) });
  });

  return { ids, evidenceById };
}

function parseHeliosAnalyzerRouting(blockers, contract, heliosDir) {
  const ids = new Set();
  const evidenceById = {};

  const srcRoot = path.join(heliosDir, 'apps', 'mobile', 'src');
  const cvEx = path.join(srcRoot, 'cv', 'exercises');
  const routingCandidates = [
    path.join(srcRoot, 'screens', 'SessionScreen.tsx'),
    path.join(srcRoot, 'cv', 'calibrationStabilization.ts'),
    path.join(srcRoot, 'cv', 'exerciseSelector.ts'),
    path.join(srcRoot, 'cv', 'routing.ts'),
  ];

  if (!exists(heliosDir)) pushBlocker(blockers, 'MISSING_REPO', `HELIOS_DIR missing: ${heliosDir}`);
  if (!exists(cvEx)) {
    pushBlocker(blockers, 'MISSING_CONTRACT', `Helios exercise analyzer dir missing: ${cvEx}`);
    return { ids, evidenceById };
  }

  const availableRoutingFiles = routingCandidates.filter(exists);
  if (!availableRoutingFiles.length) {
    pushBlocker(blockers, 'MISSING_CONTRACT', `No routing source found in candidates: ${routingCandidates.join(', ')}`);
    return { ids, evidenceById };
  }

  for (const ex of contract.exercises) {
    const id = norm(ex.id);
    const acceptedIds = (ex.acceptedRoutingIds || [id]).map(norm);
    const acceptedClasses = (ex.acceptedAnalyzerClasses || [ex.analyzerClass]).filter(Boolean);
    const patterns = [...acceptedIds.flatMap((x) => [`'${x}'`, `"${x}"`]), ...acceptedClasses];

    let exMatches = [];
    for (const file of availableRoutingFiles) {
      exMatches = exMatches.concat(findMatchesInFile(file, patterns));
    }

    if (exMatches.length) {
      ids.add(id);
      evidenceById[id] = exMatches;
    }
  }

  return { ids, evidenceById };
}

function parseHeliosCoverageSignal(blockers, contract, heliosDir) {
  const ids = new Set();
  const evidenceById = {};
  const testsDir = path.join(heliosDir, 'apps', 'mobile', 'src', 'cv', '__tests__');

  if (!exists(testsDir)) {
    pushBlocker(blockers, 'MISSING_CONTRACT', `Helios test dir missing: ${testsDir}`);
    return { ids, evidenceById };
  }

  const files = fs.readdirSync(testsDir).filter((f) => f.endsWith('.ts'));
  const fileSet = new Set(files);

  for (const ex of contract.exercises) {
    const id = norm(ex.id);
    const acceptedIds = (ex.acceptedRoutingIds || [id]).map(norm);
    const acceptedClasses = (ex.acceptedAnalyzerClasses || [ex.analyzerClass]).filter(Boolean);
    const testSignals = ex.testSignals || [];
    let matches = [];

    for (const sig of testSignals) {
      if (fileSet.has(sig)) {
        matches.push({ file: path.join(testsDir, sig), line: 1, pattern: sig, snippet: 'test signal file present' });
      }
    }

    if (!matches.length) {
      const patterns = [...acceptedClasses, ...acceptedIds.flatMap((x) => [`'${x}'`, `"${x}"`])];
      for (const f of files) {
        matches = matches.concat(findMatchesInFile(path.join(testsDir, f), patterns));
      }
    }

    if (matches.length) {
      ids.add(id);
      evidenceById[id] = matches;
    }
  }

  return { ids, evidenceById };
}

function loadFixture(rootDir) {
  const j = readJson(path.join(rootDir, 'schemas', 'cv', 'cross-repo-regression.fixture.json'));
  const mk = (ids, channel) => {
    const set = new Set((ids || []).map(norm));
    const evidence = {};
    for (const id of set) evidence[id] = [{ file: 'fixture', line: 1, pattern: id, snippet: `${channel} fixture` }];
    return { ids: set, evidenceById: evidence };
  };
  return {
    selector: mk(j.selectorExposure, 'selector'),
    routing: mk(j.analyzerRouting, 'routing'),
    coverage: mk(j.testCoverageSignal, 'coverage'),
  };
}

function evaluate(contract, selectorInfo, routingInfo, coverageInfo, blockers, modeUsed) {
  const rows = [];
  const failures = [];

  for (const ex of contract.exercises) {
    const id = norm(ex.id);
    const row = {
      exerciseId: id,
      selectorExposure: selectorInfo.ids.has(id),
      analyzerRouting: routingInfo.ids.has(id),
      minimumTestCoverageSignal: coverageInfo.ids.has(id),
      evidence: {
        selectorExposure: selectorInfo.evidenceById[id] || [],
        analyzerRouting: routingInfo.evidenceById[id] || [],
        minimumTestCoverageSignal: coverageInfo.evidenceById[id] || [],
      },
      status: 'PASS',
      failureCodes: [],
    };

    if (!row.selectorExposure) row.failureCodes.push('MISSING_SELECTOR_EXPOSURE');
    if (!row.analyzerRouting) row.failureCodes.push('MISSING_ANALYZER_ROUTING');
    if (!row.minimumTestCoverageSignal) row.failureCodes.push('MISSING_TEST_SIGNAL');

    if (row.failureCodes.length) {
      row.status = 'FAIL';
      failures.push({ exerciseId: id, failureCodes: row.failureCodes });
    }

    rows.push(row);
  }

  const blocked = modeUsed === 'live' && blockers.length > 0;
  const status = blocked ? 'BLOCKED' : (failures.length === 0 ? 'PASS' : 'FAIL');
  return { status, rows, failures };
}

function buildSummary(report, opts = {}) {
  const strictGate = Boolean(opts.strictGate);
  const passCount = report.summary.pass;
  const blockedCount = report.blockers.length;
  const requiredCount = report.requiredExerciseCount;

  let strictGateStatus = 'DISABLED';
  if (strictGate) {
    if (report.mode !== 'live') strictGateStatus = 'NOT_LIVE';
    else if (report.status === 'BLOCKED') strictGateStatus = 'BLOCKED';
    else strictGateStatus = passCount >= requiredCount ? 'PASS' : 'FAIL';
  }

  return {
    generatedAt: report.generatedAt,
    mode: report.mode,
    strictGateEnabled: strictGate,
    strictGateStatus,
    status: report.status,
    requiredCount,
    pass_count: passCount,
    fail_count: report.summary.fail,
    blocked_count: blockedCount,
    atlas_git_sha: report.provenance.atlasGitSha,
    helios_git_sha: report.provenance.heliosGitSha,
    taxonomy: report.taxonomy,
    blockers: report.blockers,
    readiness_matrix: report.results.map((r) => ({
      exerciseId: r.exerciseId,
      selectorExposure: r.selectorExposure,
      analyzerRouting: r.analyzerRouting,
      minimumTestCoverageSignal: r.minimumTestCoverageSignal,
      status: r.status,
      failureCodes: r.failureCodes,
    })),
  };
}

function renderMd(report, summary) {
  const lines = [
    '# Cross-Repo CV Regression Harness Report',
    '',
    `- Timestamp: ${report.generatedAt}`,
    `- Mode: ${report.mode}`,
    `- Status: ${report.status}`,
    `- Strict gate: ${summary.strictGateEnabled ? summary.strictGateStatus : 'DISABLED'}`,
    `- Atlas SHA: ${report.provenance.atlasGitSha || 'unknown'}`,
    `- Helios SHA: ${report.provenance.heliosGitSha || 'unknown'}`,
    `- Pass count: ${summary.pass_count}/${summary.requiredCount}`,
    `- Blocked count: ${summary.blocked_count}`,
    '',
    '## Per-exercise readiness matrix',
    '',
    '| Exercise | Selector exposure | Analyzer routing | Min test signal | Status | Codes |',
    '|---|---:|---:|---:|---|---|',
  ];

  for (const r of report.results) {
    lines.push(`| ${r.exerciseId} | ${r.selectorExposure ? '✅' : '❌'} | ${r.analyzerRouting ? '✅' : '❌'} | ${r.minimumTestCoverageSignal ? '✅' : '❌'} | ${r.status} | ${r.failureCodes.join(', ') || '—'} |`);
  }

  lines.push('', '## Evidence snapshot', '');
  for (const r of report.results) {
    lines.push(`### ${r.exerciseId}`);
    for (const [k, ev] of Object.entries(r.evidence)) {
      if (!ev.length) lines.push(`- ${k}: none`);
      else lines.push(`- ${k}: ${ev[0].file}:${ev[0].line} (${ev[0].pattern})`);
    }
    lines.push('');
  }

  lines.push('## Blocker taxonomy', '');
  for (const [k, v] of Object.entries(report.taxonomy)) lines.push(`- ${k}: ${v}`);

  if (report.blockers.length) {
    lines.push('', '## Blockers', '');
    for (const b of report.blockers) lines.push(`- ${b.code}: ${b.detail}`);
  }

  lines.push('', '## Fallback options', '',
    '- Use `--mode fixtures` in CI when sibling repos are unavailable.',
    '- Use `--mode auto` to prefer live parsing and fall back to fixtures with explicit blocker note.',
    '- Use `--mode live --strict-gate` for release gating (real-camera 10/10 readiness).');

  return lines.join('\n');
}

function renderSummaryMd(summary) {
  const lines = [
    '# Cross-Repo CV Regression Summary',
    '',
    `- Timestamp: ${summary.generatedAt}`,
    `- Mode: ${summary.mode}`,
    `- Status: ${summary.status}`,
    `- Strict gate enabled: ${summary.strictGateEnabled}`,
    `- Strict gate status: ${summary.strictGateStatus}`,
    `- Atlas SHA: ${summary.atlas_git_sha || 'unknown'}`,
    `- Helios SHA: ${summary.helios_git_sha || 'unknown'}`,
    `- Pass count: ${summary.pass_count}/${summary.requiredCount}`,
    `- Fail count: ${summary.fail_count}`,
    `- Blocked count: ${summary.blocked_count}`,
    '',
    '## Readiness matrix',
    '',
    '| Exercise | Selector | Routing | Tests | Status |',
    '|---|---:|---:|---:|---|',
  ];
  for (const r of summary.readiness_matrix) {
    lines.push(`| ${r.exerciseId} | ${r.selectorExposure ? '✅' : '❌'} | ${r.analyzerRouting ? '✅' : '❌'} | ${r.minimumTestCoverageSignal ? '✅' : '❌'} | ${r.status} |`);
  }
  return lines.join('\n');
}

function runHarness({ mode, atlasDir, heliosDir, rootDir = ROOT, strictGate = false, outJson, outMd, outSummaryJson, outSummaryMd }) {
  const contract = readJson(path.join(rootDir, 'schemas', 'cv', 'cross-repo-regression.contract.json'));
  const blockers = [];
  let modeUsed = mode;

  let selectorInfo = { ids: new Set(), evidenceById: {} };
  let routingInfo = { ids: new Set(), evidenceById: {} };
  let coverageInfo = { ids: new Set(), evidenceById: {} };

  if (mode === 'fixtures') {
    const fx = loadFixture(rootDir);
    selectorInfo = fx.selector;
    routingInfo = fx.routing;
    coverageInfo = fx.coverage;
  } else if (mode === 'live') {
    selectorInfo = parseAtlasSelectorExposure(blockers, atlasDir);
    routingInfo = parseHeliosAnalyzerRouting(blockers, contract, heliosDir);
    coverageInfo = parseHeliosCoverageSignal(blockers, contract, heliosDir);
  } else {
    const canLive = exists(atlasDir) && exists(heliosDir);
    if (canLive) {
      modeUsed = 'live';
      selectorInfo = parseAtlasSelectorExposure(blockers, atlasDir);
      routingInfo = parseHeliosAnalyzerRouting(blockers, contract, heliosDir);
      coverageInfo = parseHeliosCoverageSignal(blockers, contract, heliosDir);
    } else {
      modeUsed = 'fixtures';
      const fx = loadFixture(rootDir);
      selectorInfo = fx.selector;
      routingInfo = fx.routing;
      coverageInfo = fx.coverage;
      pushBlocker(blockers, 'MISSING_REPO', `auto fallback to fixtures; expected ATLAS_DIR=${atlasDir}, HELIOS_DIR=${heliosDir}`);
    }
  }

  const evalResult = evaluate(contract, selectorInfo, routingInfo, coverageInfo, blockers, modeUsed);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: modeUsed,
    status: evalResult.status,
    requiredExerciseCount: contract.requiredExerciseCount,
    taxonomy: TAXONOMY,
    blockers,
    provenance: {
      atlasGitSha: gitSha(atlasDir),
      heliosGitSha: gitSha(heliosDir),
      atlasDir,
      heliosDir,
    },
    results: evalResult.rows,
    failures: evalResult.failures,
    summary: {
      pass: evalResult.rows.filter((r) => r.status === 'PASS').length,
      fail: evalResult.rows.filter((r) => r.status === 'FAIL').length,
    },
  };

  const summary = buildSummary(report, { strictGate });

  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2));
  fs.writeFileSync(outMd, renderMd(report, summary));
  fs.writeFileSync(outSummaryJson, JSON.stringify(summary, null, 2));
  fs.writeFileSync(outSummaryMd, renderSummaryMd(summary));

  return { report, summary };
}

function cli() {
  const args = process.argv.slice(2);
  const arg = (name, dflt = null) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : dflt;
  };
  const has = (name) => args.includes(name);

  const mode = arg('--mode', 'auto');
  const atlasDir = arg('--atlas-dir', process.env.ATLAS_DIR || '/tmp/pt-atlas');
  const heliosDir = arg('--helios-dir', process.env.HELIOS_DIR || '/tmp/pt-helios');
  const strictGate = has('--strict-gate');

  const outJson = arg('--out', path.join(ROOT, 'artifacts', 'cross-repo-cv-regression.json'));
  const outMd = arg('--out-md', path.join(ROOT, 'artifacts', 'cross-repo-cv-regression.md'));
  const outSummaryJson = arg('--out-summary', path.join(ROOT, 'artifacts', 'cross-repo-cv-regression-summary.json'));
  const outSummaryMd = arg('--out-summary-md', path.join(ROOT, 'artifacts', 'cross-repo-cv-regression-summary.md'));

  const { report, summary } = runHarness({ mode, atlasDir, heliosDir, strictGate, outJson, outMd, outSummaryJson, outSummaryMd });

  console.log(`Cross-repo CV regression harness status: ${report.status}`);
  console.log(`Strict gate status: ${summary.strictGateStatus}`);
  console.log(`JSON: ${outJson}`);
  console.log(`MD:   ${outMd}`);
  console.log(`Summary JSON: ${outSummaryJson}`);
  console.log(`Summary MD:   ${outSummaryMd}`);

  if (report.status === 'BLOCKED') process.exit(2);
  if (strictGate && summary.strictGateStatus === 'FAIL') process.exit(1);
  if (strictGate && summary.strictGateStatus === 'NOT_LIVE') process.exit(1);
  if (report.status === 'PASS') process.exit(0);
  process.exit(1);
}

if (require.main === module) cli();

module.exports = {
  TAXONOMY,
  norm,
  findMatchesInFile,
  parseAtlasSelectorExposure,
  parseHeliosAnalyzerRouting,
  parseHeliosCoverageSignal,
  loadFixture,
  evaluate,
  buildSummary,
  renderSummaryMd,
  runHarness,
};
