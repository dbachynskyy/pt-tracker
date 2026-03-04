#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const args = process.argv.slice(2);
const arg = (name, dflt = null) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};

const mode = arg('--mode', 'auto'); // fixtures|live|auto
const ATLAS_DIR = arg('--atlas-dir', process.env.ATLAS_DIR || '/tmp/pt-atlas');
const HELIOS_DIR = arg('--helios-dir', process.env.HELIOS_DIR || '/tmp/pt-helios');
const outJson = arg('--out', path.join(ROOT, 'artifacts', 'cross-repo-cv-regression.json'));
const outMd = arg('--out-md', path.join(ROOT, 'artifacts', 'cross-repo-cv-regression.md'));

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function exists(p) { return fs.existsSync(p); }
function norm(s) { return String(s || '').trim().toLowerCase().replace(/[\s-]+/g, '_'); }

const TAXONOMY = {
  MISSING_REPO: 'required repository path missing',
  MISSING_CONTRACT: 'required contract file/folder missing',
  MISSING_SELECTOR_EXPOSURE: 'exercise missing from selector exposure set',
  MISSING_ANALYZER_ROUTING: 'exercise missing from analyzer routing source',
  MISSING_TEST_SIGNAL: 'exercise missing minimum test coverage signal',
};

function parseAtlasSelectorExposure(blockers) {
  const todo = path.join(ATLAS_DIR, 'TODO_EXERCISES.md');
  const out = new Set();
  if (!exists(ATLAS_DIR)) blockers.push({ code: 'MISSING_REPO', detail: `ATLAS_DIR missing: ${ATLAS_DIR}` });
  if (!exists(todo)) {
    blockers.push({ code: 'MISSING_CONTRACT', detail: `Atlas selector contract missing: ${todo}` });
    return out;
  }
  const t = fs.readFileSync(todo, 'utf8');
  const impl = t.split(/\n##\s+|\nInfra:/i)[0];
  for (const m of impl.matchAll(/- \[[xX]\]\s+([a-zA-Z0-9_\-]+)/g)) out.add(norm(m[1]));
  return out;
}

function parseHeliosAnalyzerRouting(blockers, contract) {
  const out = new Set();
  const srcRoot = path.join(HELIOS_DIR, 'apps', 'mobile', 'src');
  const cvEx = path.join(srcRoot, 'cv', 'exercises');
  const routingCandidates = [
    path.join(srcRoot, 'screens', 'SessionScreen.tsx'),
    path.join(srcRoot, 'cv', 'calibrationStabilization.ts'),
    path.join(srcRoot, 'cv', 'exerciseSelector.ts'),
    path.join(srcRoot, 'cv', 'routing.ts'),
  ];

  if (!exists(HELIOS_DIR)) blockers.push({ code: 'MISSING_REPO', detail: `HELIOS_DIR missing: ${HELIOS_DIR}` });
  if (!exists(cvEx)) {
    blockers.push({ code: 'MISSING_CONTRACT', detail: `Helios exercise analyzer dir missing: ${cvEx}` });
    return out;
  }

  const analyzerById = new Map();
  for (const f of fs.readdirSync(cvEx)) {
    if (!f.endsWith('.ts')) continue;
    const txt = fs.readFileSync(path.join(cvEx, f), 'utf8');
    const idm = txt.match(/exerciseId\s*(?::[^=]+)?=\s*['"]([^'"]+)['"]/);
    const clsm = txt.match(/export\s+class\s+([A-Za-z0-9_]+)\s+/);
    if (idm && clsm) analyzerById.set(norm(idm[1]), clsm[1]);
  }

  const routingText = routingCandidates.filter(exists).map((p) => fs.readFileSync(p, 'utf8')).join('\n\n');
  if (!routingText.trim()) {
    blockers.push({ code: 'MISSING_CONTRACT', detail: `No routing source found in candidates: ${routingCandidates.join(', ')}` });
    return out;
  }

  for (const ex of contract.exercises) {
    const id = norm(ex.id);
    const analyzerClass = ex.analyzerClass || analyzerById.get(id);
    const hasId = routingText.includes(`"${id}"`) || routingText.includes(`'${id}'`);
    const hasClass = analyzerClass ? routingText.includes(analyzerClass) : false;
    if (hasId || hasClass) out.add(id);
  }

  return out;
}

function parseHeliosCoverageSignal(blockers, contract) {
  const out = new Set();
  const testsDir = path.join(HELIOS_DIR, 'apps', 'mobile', 'src', 'cv', '__tests__');
  if (!exists(testsDir)) {
    blockers.push({ code: 'MISSING_CONTRACT', detail: `Helios test dir missing: ${testsDir}` });
    return out;
  }

  const files = fs.readdirSync(testsDir).filter((f) => f.endsWith('.ts'));
  const fileSet = new Set(files);
  const textByFile = new Map(files.map((f) => [f, fs.readFileSync(path.join(testsDir, f), 'utf8')]));

  for (const ex of contract.exercises) {
    const id = norm(ex.id);
    const sigs = ex.testSignals || [];
    let hit = sigs.some((s) => fileSet.has(s));
    if (!hit && ex.analyzerClass) {
      for (const txt of textByFile.values()) {
        if (txt.includes(ex.analyzerClass) || txt.includes(`'${id}'`) || txt.includes(`"${id}"`)) { hit = true; break; }
      }
    }
    if (hit) out.add(id);
  }

  return out;
}

function loadFixture() {
  const j = readJson(path.join(ROOT, 'schemas', 'cv', 'cross-repo-regression.fixture.json'));
  return {
    selector: new Set((j.selectorExposure || []).map(norm)),
    routing: new Set((j.analyzerRouting || []).map(norm)),
    coverage: new Set((j.testCoverageSignal || []).map(norm)),
  };
}

function evaluate(contract, selector, routing, coverage, blockers, modeUsed) {
  const rows = [];
  const failures = [];

  for (const ex of contract.exercises) {
    const id = norm(ex.id);
    const row = {
      exerciseId: id,
      selectorExposure: selector.has(id),
      analyzerRouting: routing.has(id),
      minimumTestCoverageSignal: coverage.has(id),
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

function renderMd(report) {
  const lines = [
    '# Cross-Repo CV Regression Harness Report',
    '',
    `- Mode: ${report.mode}`,
    `- Status: ${report.status}`,
    `- Required exercises: ${report.requiredExerciseCount}`,
    '',
    '## Per-exercise checks',
    '',
    '| Exercise | Selector exposure | Analyzer routing | Min test signal | Status | Codes |',
    '|---|---:|---:|---:|---|---|',
  ];
  for (const r of report.results) {
    lines.push(`| ${r.exerciseId} | ${r.selectorExposure ? '✅' : '❌'} | ${r.analyzerRouting ? '✅' : '❌'} | ${r.minimumTestCoverageSignal ? '✅' : '❌'} | ${r.status} | ${r.failureCodes.join(', ') || '—'} |`);
  }
  lines.push('', '## Blocker taxonomy', '');
  for (const [k, v] of Object.entries(report.taxonomy)) lines.push(`- ${k}: ${v}`);

  if (report.blockers.length) {
    lines.push('', '## Blockers', '');
    for (const b of report.blockers) lines.push(`- ${b.code}: ${b.detail}`);
  }

  lines.push('', '## Fallback options', '',
    '- Use `--mode fixtures` in CI when sibling repos are unavailable.',
    '- Use `--mode auto` to prefer live parsing and fall back to fixtures with an explicit blocker note.',
    '- Provide `ATLAS_DIR` and `HELIOS_DIR` for strict live gating in release workflows.');

  return lines.join('\n');
}

function main() {
  const contract = readJson(path.join(ROOT, 'schemas', 'cv', 'cross-repo-regression.contract.json'));
  const blockers = [];
  let modeUsed = mode;

  let selector = new Set();
  let routing = new Set();
  let coverage = new Set();

  if (mode === 'fixtures') {
    ({ selector, routing, coverage } = loadFixture());
  } else if (mode === 'live') {
    selector = parseAtlasSelectorExposure(blockers);
    routing = parseHeliosAnalyzerRouting(blockers, contract);
    coverage = parseHeliosCoverageSignal(blockers, contract);
  } else {
    const canLive = exists(ATLAS_DIR) && exists(HELIOS_DIR);
    if (canLive) {
      modeUsed = 'live';
      selector = parseAtlasSelectorExposure(blockers);
      routing = parseHeliosAnalyzerRouting(blockers, contract);
      coverage = parseHeliosCoverageSignal(blockers, contract);
    } else {
      modeUsed = 'fixtures';
      ({ selector, routing, coverage } = loadFixture());
      blockers.push({ code: 'MISSING_REPO', detail: `auto fallback to fixtures; expected ATLAS_DIR=${ATLAS_DIR}, HELIOS_DIR=${HELIOS_DIR}` });
    }
  }

  const evalResult = evaluate(contract, selector, routing, coverage, blockers, modeUsed);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: modeUsed,
    status: evalResult.status,
    requiredExerciseCount: contract.requiredExerciseCount,
    taxonomy: TAXONOMY,
    blockers,
    results: evalResult.rows,
    failures: evalResult.failures,
    summary: {
      pass: evalResult.rows.filter((r) => r.status === 'PASS').length,
      fail: evalResult.rows.filter((r) => r.status === 'FAIL').length,
    },
  };

  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2));
  fs.writeFileSync(outMd, renderMd(report));

  console.log(`Cross-repo CV regression harness status: ${report.status}`);
  console.log(`JSON: ${outJson}`);
  console.log(`MD:   ${outMd}`);

  if (report.status === 'PASS') process.exit(0);
  if (report.status === 'BLOCKED') process.exit(2);
  process.exit(1);
}

main();
