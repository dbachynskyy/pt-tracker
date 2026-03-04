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
  MISSING_READINESS_ARTIFACT: 'readiness artifact path missing in strict mode',
  UNPARSEABLE_READINESS_ARTIFACT: 'readiness artifact exists but is not valid JSON',
  MISSING_READINESS_EXERCISE: 'canonical exercise missing from readiness artifact',
};

const BLOCKER_FALLBACKS = {
  MISSING_READINESS_ARTIFACT: 'Fallback: supply ATLAS_READINESS_FILE/HELIOS_READINESS_FILE or use fixtures mode until readiness outputs are wired.',
  UNPARSEABLE_READINESS_ARTIFACT: 'Fallback: validate readiness JSON schema/format and rerun strict gate.',
  MISSING_READINESS_EXERCISE: 'Fallback: regenerate readiness outputs ensuring all 10 canonical exercises are included.',
  MISSING_REPO: 'Fallback: run fixtures mode in CI or provide valid ATLAS_DIR/HELIOS_DIR paths.',
  MISSING_CONTRACT: 'Fallback: sync Atlas/Helios repo contracts and rerun.',
};

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function exists(p) { return fs.existsSync(p); }
function norm(s) { return String(s || '').trim().toLowerCase().replace(/[\s-]+/g, '_'); }
function pushBlocker(blockers, code, detail) { blockers.push({ code, detail }); }

function gitSha(repoDir) {
  if (!exists(repoDir) || !exists(path.join(repoDir, '.git'))) return null;
  try { return execSync('git rev-parse --short HEAD', { cwd: repoDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return null; }
}

function findMatchesInFile(filePath, patterns) {
  const matches = [];
  if (!exists(filePath)) return matches;
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const p of patterns) if (p && line.includes(p)) matches.push({ file: filePath, line: i + 1, pattern: p, snippet: line.trim().slice(0, 180) });
  });
  return matches;
}

function parseReadinessFile(filePath, sourceName, blockers, strictMode = false) {
  const map = {};
  if (!filePath) {
    if (strictMode) pushBlocker(blockers, 'MISSING_READINESS_ARTIFACT', `${sourceName} readiness file not provided`);
    return map;
  }
  if (!exists(filePath)) {
    pushBlocker(blockers, strictMode ? 'MISSING_READINESS_ARTIFACT' : 'MISSING_CONTRACT', `${sourceName} readiness file missing: ${filePath}`);
    return map;
  }
  let raw;
  try {
    raw = readJson(filePath);
  } catch (e) {
    pushBlocker(blockers, strictMode ? 'UNPARSEABLE_READINESS_ARTIFACT' : 'MISSING_CONTRACT', `${sourceName} readiness parse error: ${filePath} (${e.message})`);
    return map;
  }

  const entries = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.exercises)
      ? raw.exercises
      : Object.entries(raw.readiness || {}).map(([k, v]) => ({ exerciseId: k, ...(typeof v === 'string' ? { reason: v } : v) }));

  for (const e of entries) {
    const id = norm(e.exerciseId || e.id);
    if (!id) continue;
    map[id] = { ready: e.ready !== false, reason: e.reason || e.readinessReason || null, source: sourceName, raw: e };
  }
  return map;
}

function parseAtlasSelectorExposure(blockers, atlasDir) {
  const todo = path.join(atlasDir, 'TODO_EXERCISES.md');
  const ids = new Set(); const evidenceById = {};
  if (!exists(atlasDir)) pushBlocker(blockers, 'MISSING_REPO', `ATLAS_DIR missing: ${atlasDir}`);
  if (!exists(todo)) { pushBlocker(blockers, 'MISSING_CONTRACT', `Atlas selector contract missing: ${todo}`); return { ids, evidenceById }; }
  const impl = fs.readFileSync(todo, 'utf8').split(/\n##\s+|\nInfra:/i)[0];
  impl.split('\n').forEach((line, i) => {
    const m = line.match(/- \[[xX]\]\s+([a-zA-Z0-9_\-]+)/); if (!m) return;
    const id = norm(m[1]); ids.add(id); evidenceById[id] = evidenceById[id] || [];
    evidenceById[id].push({ file: todo, line: i + 1, pattern: m[1], snippet: line.trim().slice(0, 180) });
  });
  return { ids, evidenceById };
}

function parseHeliosAnalyzerRouting(blockers, contract, heliosDir) {
  const ids = new Set(); const evidenceById = {};
  const src = path.join(heliosDir, 'apps', 'mobile', 'src');
  const cvEx = path.join(src, 'cv', 'exercises');
  const candidates = [path.join(src, 'screens', 'SessionScreen.tsx'), path.join(src, 'cv', 'calibrationStabilization.ts'), path.join(src, 'cv', 'exerciseSelector.ts'), path.join(src, 'cv', 'routing.ts')];
  if (!exists(heliosDir)) pushBlocker(blockers, 'MISSING_REPO', `HELIOS_DIR missing: ${heliosDir}`);
  if (!exists(cvEx)) { pushBlocker(blockers, 'MISSING_CONTRACT', `Helios exercise analyzer dir missing: ${cvEx}`); return { ids, evidenceById }; }
  const files = candidates.filter(exists);
  if (!files.length) { pushBlocker(blockers, 'MISSING_CONTRACT', `No routing source found in candidates: ${candidates.join(', ')}`); return { ids, evidenceById }; }

  for (const ex of contract.exercises) {
    const id = norm(ex.id);
    const acceptedIds = (ex.acceptedRoutingIds || [id]).map(norm);
    const acceptedClasses = (ex.acceptedAnalyzerClasses || [ex.analyzerClass]).filter(Boolean);
    const patterns = [...acceptedIds.flatMap((x) => [`'${x}'`, `"${x}"`]), ...acceptedClasses];
    let m = [];
    for (const f of files) m = m.concat(findMatchesInFile(f, patterns));
    if (m.length) { ids.add(id); evidenceById[id] = m; }
  }
  return { ids, evidenceById };
}

function parseHeliosCoverageSignal(blockers, contract, heliosDir) {
  const ids = new Set(); const evidenceById = {};
  const testsDir = path.join(heliosDir, 'apps', 'mobile', 'src', 'cv', '__tests__');
  if (!exists(testsDir)) { pushBlocker(blockers, 'MISSING_CONTRACT', `Helios test dir missing: ${testsDir}`); return { ids, evidenceById }; }
  const files = fs.readdirSync(testsDir).filter((f) => f.endsWith('.ts')); const fileSet = new Set(files);
  for (const ex of contract.exercises) {
    const id = norm(ex.id);
    const acceptedIds = (ex.acceptedRoutingIds || [id]).map(norm);
    const acceptedClasses = (ex.acceptedAnalyzerClasses || [ex.analyzerClass]).filter(Boolean);
    let m = [];
    for (const sig of (ex.testSignals || [])) if (fileSet.has(sig)) m.push({ file: path.join(testsDir, sig), line: 1, pattern: sig, snippet: 'test signal file present' });
    if (!m.length) {
      const patterns = [...acceptedClasses, ...acceptedIds.flatMap((x) => [`'${x}'`, `"${x}"`])];
      for (const f of files) m = m.concat(findMatchesInFile(path.join(testsDir, f), patterns));
    }
    if (m.length) { ids.add(id); evidenceById[id] = m; }
  }
  return { ids, evidenceById };
}

function loadFixture(rootDir) {
  const j = readJson(path.join(rootDir, 'schemas', 'cv', 'cross-repo-regression.fixture.json'));
  const mk = (ids, channel) => {
    const set = new Set((ids || []).map(norm)); const evidence = {};
    for (const id of set) evidence[id] = [{ file: 'fixture', line: 1, pattern: id, snippet: `${channel} fixture` }];
    return { ids: set, evidenceById: evidence };
  };
  return { selector: mk(j.selectorExposure, 'selector'), routing: mk(j.analyzerRouting, 'routing'), coverage: mk(j.testCoverageSignal, 'coverage') };
}

function classifyFailFast(report, summary) {
  const phrases = [
    ...report.blockers.map((b) => `${b.code} ${b.detail}`),
    ...summary.readiness_matrix.flatMap((r) => [r.atlasReadinessReason || '', r.heliosReadinessReason || '']),
  ].map((x) => x.toLowerCase());
  const isNegative = (t) => /(denied|missing|failed|error|blocked|unavailable|invalid|expired|insufficient|quota exceeded|unauthori|forbidden)/.test(t);
  const any = (re) => phrases.some((p) => re.test(p) && isNegative(p));
  const categories = [];
  const add = (code, when, fallback) => { if (when) categories.push({ code, fallback }); };
  add('CAMERA_BLOCKER', any(/(camera|permission|capture|lens|device)/), 'Fallback: run fixtures mode; verify camera permissions/device binding on Atlas/Helios hosts.');
  add('AUTH_BLOCKER', any(/(auth|token|login|session)/), 'Fallback: refresh service auth/token, then rerun live strict gate.');
  add('CREDITS_BLOCKER', any(/(credit|quota|billing|limit)/), 'Fallback: top up credits/quota or switch to fixture mode for CI until restored.');
  return { triggered: categories.length > 0, categories };
}

function computeTrend(previousSummary, currentSummary) {
  if (!previousSummary) return null;
  return {
    pass_delta: currentSummary.pass_count - (previousSummary.pass_count || 0),
    fail_delta: currentSummary.fail_count - (previousSummary.fail_count || 0),
    blocked_delta: currentSummary.blocked_count - (previousSummary.blocked_count || 0),
    status_changed: (previousSummary.status || null) !== currentSummary.status,
    strict_status_changed: (previousSummary.strictGateStatus || null) !== currentSummary.strictGateStatus,
    previous_generatedAt: previousSummary.generatedAt || null,
  };
}

function evaluate(contract, selectorInfo, routingInfo, coverageInfo, blockers, modeUsed, atlasReadiness, heliosReadiness) {
  const rows = []; const failures = [];
  for (const ex of contract.exercises) {
    const id = norm(ex.id); const aR = atlasReadiness[id] || null; const hR = heliosReadiness[id] || null;
    const row = {
      exerciseId: id,
      selectorExposure: selectorInfo.ids.has(id),
      analyzerRouting: routingInfo.ids.has(id),
      minimumTestCoverageSignal: coverageInfo.ids.has(id),
      atlasReadiness: aR ? aR.ready : null,
      atlasReadinessReason: aR ? aR.reason : null,
      heliosReadiness: hR ? hR.ready : null,
      heliosReadinessReason: hR ? hR.reason : null,
      evidence: {
        selectorExposure: selectorInfo.evidenceById[id] || [],
        analyzerRouting: routingInfo.evidenceById[id] || [],
        minimumTestCoverageSignal: coverageInfo.evidenceById[id] || [],
      },
      status: 'PASS', failureCodes: [],
    };
    if (!row.selectorExposure) row.failureCodes.push('MISSING_SELECTOR_EXPOSURE');
    if (!row.analyzerRouting) row.failureCodes.push('MISSING_ANALYZER_ROUTING');
    if (!row.minimumTestCoverageSignal) row.failureCodes.push('MISSING_TEST_SIGNAL');
    if (row.failureCodes.length) { row.status = 'FAIL'; failures.push({ exerciseId: id, failureCodes: row.failureCodes }); }
    rows.push(row);
  }
  const blocked = modeUsed === 'live' && blockers.length > 0;
  return { status: blocked ? 'BLOCKED' : (failures.length ? 'FAIL' : 'PASS'), rows, failures };
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

  const blockersWithFallback = report.blockers.map((b) => ({ ...b, fallback: BLOCKER_FALLBACKS[b.code] || 'Fallback: inspect blocker detail and rerun with fixtures mode if needed.' }));

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
    blockers: blockersWithFallback,
    fallbackSuggestions: blockersWithFallback.map((b) => ({ code: b.code, fallback: b.fallback })),
    readiness_matrix: report.results.map((r) => ({
      exerciseId: r.exerciseId,
      selectorExposure: r.selectorExposure,
      analyzerRouting: r.analyzerRouting,
      minimumTestCoverageSignal: r.minimumTestCoverageSignal,
      atlasReadiness: r.atlasReadiness,
      atlasReadinessReason: r.atlasReadinessReason,
      heliosReadiness: r.heliosReadiness,
      heliosReadinessReason: r.heliosReadinessReason,
      status: r.status,
      failureCodes: r.failureCodes,
    })),
  };
}

function renderSummaryMd(summary) {
  const lines = [
    '# Cross-Repo CV Regression Summary', '',
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
    '', '## Readiness matrix', '',
    '| Exercise | Selector | Routing | Tests | Atlas ready | Helios ready | Status |',
    '|---|---:|---:|---:|---:|---:|---|',
  ];
  for (const r of summary.readiness_matrix) lines.push(`| ${r.exerciseId} | ${r.selectorExposure ? '✅' : '❌'} | ${r.analyzerRouting ? '✅' : '❌'} | ${r.minimumTestCoverageSignal ? '✅' : '❌'} | ${r.atlasReadiness === null ? '—' : (r.atlasReadiness ? '✅' : '❌')} | ${r.heliosReadiness === null ? '—' : (r.heliosReadiness ? '✅' : '❌')} | ${r.status} |`);

  if (summary.blockers?.length) {
    lines.push('', '## Blockers + fallbacks', '');
    for (const b of summary.blockers) lines.push(`- ${b.code}: ${b.detail} | ${b.fallback}`);
  }
  if (summary.failFast?.triggered) {
    lines.push('', '## Fail-fast classification', '');
    for (const c of summary.failFast.categories) lines.push(`- ${c.code}: ${c.fallback}`);
  }
  if (summary.trend) {
    lines.push('', '## Trend vs previous run', '');
    lines.push(`- pass_delta: ${summary.trend.pass_delta}`);
    lines.push(`- fail_delta: ${summary.trend.fail_delta}`);
    lines.push(`- blocked_delta: ${summary.trend.blocked_delta}`);
  }
  return lines.join('\n');
}

function renderMd(report, summary) {
  return renderSummaryMd(summary) + '\n\n## Evidence\n\n' + report.results.map((r) => `### ${r.exerciseId}\n- selector: ${(r.evidence.selectorExposure[0] || {}).file || 'none'}\n- routing: ${(r.evidence.analyzerRouting[0] || {}).file || 'none'}\n- tests: ${(r.evidence.minimumTestCoverageSignal[0] || {}).file || 'none'}\n`).join('\n');
}

function enforceStrictReadinessRequirements(contract, atlasReadiness, heliosReadiness, blockers) {
  for (const ex of contract.exercises) {
    const id = norm(ex.id);
    if (!atlasReadiness[id]) pushBlocker(blockers, 'MISSING_READINESS_EXERCISE', `Atlas readiness missing canonical exercise: ${id}`);
    if (!heliosReadiness[id]) pushBlocker(blockers, 'MISSING_READINESS_EXERCISE', `Helios readiness missing canonical exercise: ${id}`);
  }
}

function runHarness({ mode, atlasDir, heliosDir, rootDir = ROOT, strictGate = false, outJson, outMd, outSummaryJson, outSummaryMd, atlasReadinessFile, heliosReadinessFile, previousSummaryPath }) {
  const contract = readJson(path.join(rootDir, 'schemas', 'cv', 'cross-repo-regression.contract.json'));
  const blockers = [];
  let modeUsed = mode;
  let selectorInfo = { ids: new Set(), evidenceById: {} };
  let routingInfo = { ids: new Set(), evidenceById: {} };
  let coverageInfo = { ids: new Set(), evidenceById: {} };

  if (mode === 'fixtures') ({ selector: selectorInfo, routing: routingInfo, coverage: coverageInfo } = loadFixture(rootDir));
  else if (mode === 'live') {
    selectorInfo = parseAtlasSelectorExposure(blockers, atlasDir);
    routingInfo = parseHeliosAnalyzerRouting(blockers, contract, heliosDir);
    coverageInfo = parseHeliosCoverageSignal(blockers, contract, heliosDir);
  } else {
    if (exists(atlasDir) && exists(heliosDir)) {
      modeUsed = 'live';
      selectorInfo = parseAtlasSelectorExposure(blockers, atlasDir);
      routingInfo = parseHeliosAnalyzerRouting(blockers, contract, heliosDir);
      coverageInfo = parseHeliosCoverageSignal(blockers, contract, heliosDir);
    } else {
      modeUsed = 'fixtures';
      ({ selector: selectorInfo, routing: routingInfo, coverage: coverageInfo } = loadFixture(rootDir));
      pushBlocker(blockers, 'MISSING_REPO', `auto fallback to fixtures; expected ATLAS_DIR=${atlasDir}, HELIOS_DIR=${heliosDir}`);
    }
  }

  const strictReadiness = strictGate && modeUsed === 'live';
  const atlasReadiness = parseReadinessFile(atlasReadinessFile, 'atlas', blockers, strictReadiness);
  const heliosReadiness = parseReadinessFile(heliosReadinessFile, 'helios', blockers, strictReadiness);
  if (strictReadiness) enforceStrictReadinessRequirements(contract, atlasReadiness, heliosReadiness, blockers);

  const evalResult = evaluate(contract, selectorInfo, routingInfo, coverageInfo, blockers, modeUsed, atlasReadiness, heliosReadiness);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: modeUsed,
    status: evalResult.status,
    requiredExerciseCount: contract.requiredExerciseCount,
    taxonomy: TAXONOMY,
    blockers,
    provenance: { atlasGitSha: gitSha(atlasDir), heliosGitSha: gitSha(heliosDir), atlasDir, heliosDir },
    results: evalResult.rows,
    failures: evalResult.failures,
    summary: { pass: evalResult.rows.filter((r) => r.status === 'PASS').length, fail: evalResult.rows.filter((r) => r.status === 'FAIL').length },
  };

  const summary = buildSummary(report, { strictGate });
  summary.failFast = classifyFailFast(report, summary);
  if (strictGate && summary.failFast.triggered && summary.strictGateStatus === 'PASS') summary.strictGateStatus = 'FAIL_FAST';

  let prev = null;
  if (previousSummaryPath && exists(previousSummaryPath)) { try { prev = readJson(previousSummaryPath); } catch {} }
  summary.trend = computeTrend(prev, summary);

  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2));
  fs.writeFileSync(outMd, renderMd(report, summary));
  fs.writeFileSync(outSummaryJson, JSON.stringify(summary, null, 2));
  fs.writeFileSync(outSummaryMd, renderSummaryMd(summary));
  return { report, summary };
}

function cli() {
  const args = process.argv.slice(2);
  const arg = (n, d = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const has = (n) => args.includes(n);

  const mode = arg('--mode', 'auto');
  const atlasDir = arg('--atlas-dir', process.env.ATLAS_DIR || '/tmp/pt-atlas');
  const heliosDir = arg('--helios-dir', process.env.HELIOS_DIR || '/tmp/pt-helios');
  const strictGate = has('--strict-gate');
  const outJson = arg('--out', path.join(ROOT, 'artifacts', 'cross-repo-cv-regression.json'));
  const outMd = arg('--out-md', path.join(ROOT, 'artifacts', 'cross-repo-cv-regression.md'));
  const outSummaryJson = arg('--out-summary', path.join(ROOT, 'artifacts', 'cross-repo-cv-regression-summary.json'));
  const outSummaryMd = arg('--out-summary-md', path.join(ROOT, 'artifacts', 'cross-repo-cv-regression-summary.md'));
  const atlasReadinessFile = arg('--atlas-readiness-file', process.env.ATLAS_READINESS_FILE || null);
  const heliosReadinessFile = arg('--helios-readiness-file', process.env.HELIOS_READINESS_FILE || null);
  const previousSummaryPath = arg('--previous-summary', outSummaryJson);

  const { report, summary } = runHarness({ mode, atlasDir, heliosDir, strictGate, outJson, outMd, outSummaryJson, outSummaryMd, atlasReadinessFile, heliosReadinessFile, previousSummaryPath });

  console.log(`Cross-repo CV regression harness status: ${report.status}`);
  console.log(`Strict gate status: ${summary.strictGateStatus}`);
  console.log(`Summary JSON: ${outSummaryJson}`);

  if (report.status === 'BLOCKED') process.exit(2);
  if (strictGate && ['FAIL', 'NOT_LIVE', 'FAIL_FAST', 'BLOCKED'].includes(summary.strictGateStatus)) process.exit(1);
  if (report.status === 'PASS') process.exit(0);
  process.exit(1);
}

if (require.main === module) cli();

module.exports = {
  TAXONOMY,
  BLOCKER_FALLBACKS,
  norm,
  parseReadinessFile,
  classifyFailFast,
  computeTrend,
  findMatchesInFile,
  parseAtlasSelectorExposure,
  parseHeliosAnalyzerRouting,
  parseHeliosCoverageSignal,
  loadFixture,
  evaluate,
  buildSummary,
  renderSummaryMd,
  enforceStrictReadinessRequirements,
  runHarness,
};
