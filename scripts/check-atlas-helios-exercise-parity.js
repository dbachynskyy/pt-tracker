#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function arg(name, dflt = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : dflt;
}
function has(name) { return process.argv.includes(name); }

const MODE = arg('--mode', 'auto'); // auto|live|fixtures
const ROOT = process.cwd();
const ATLAS_DIR = arg('--atlas-dir', process.env.ATLAS_DIR || '/tmp/pt-atlas');
const HELIOS_DIR = arg('--helios-dir', process.env.HELIOS_DIR || '/tmp/pt-helios');
const OUT = arg('--out', path.join(ROOT, 'artifacts', 'atlas-helios-parity.json'));
const OUT_MD = arg('--out-md', path.join(ROOT, 'artifacts', 'atlas-helios-parity.md'));

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function exists(p) { return fs.existsSync(p); }
function norm(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}
function uniq(a) { return [...new Set(a)]; }

function loadTarget() {
  return readJson(path.join(ROOT, 'schemas', 'cv', 'exercise-parity-target.json'));
}

function loadFixture(kind) {
  const p = path.join(ROOT, 'schemas', 'cv', `${kind}-exercise-ids.fixture.json`);
  const j = readJson(p);
  return uniq((j.exerciseIds || []).map(norm));
}

function parseAtlasLive(blockers) {
  const out = [];
  const planTypes = path.join(ATLAS_DIR, 'packages', 'shared', 'src', 'types', 'plan.ts');
  const todo = path.join(ATLAS_DIR, 'TODO_EXERCISES.md');

  if (!exists(ATLAS_DIR)) blockers.push(`ATLAS_DIR missing: ${ATLAS_DIR}`);

  if (exists(todo)) {
    const t = fs.readFileSync(todo, 'utf8');
    const impl = t.split(/\n##\s+|\nInfra:/i)[0];
    for (const m of impl.matchAll(/- \[[xX]\]\s+([a-zA-Z0-9_\-]+)/g)) out.push(norm(m[1]));
  }

  if (exists(planTypes)) {
    const t = fs.readFileSync(planTypes, 'utf8');
    // Best-effort: parse optional string literal unions if they exist.
    for (const m of t.matchAll(/['"]([a-z][a-z0-9_\-]{2,})['"]/g)) {
      const v = norm(m[1]);
      if (v.includes('_') || ['squat', 'pushup', 'plank', 'lunge'].includes(v)) out.push(v);
    }
  }

  if (!exists(todo) && !exists(planTypes)) {
    blockers.push('Atlas exercise contract not found (expected TODO_EXERCISES.md and/or packages/shared/src/types/plan.ts)');
  }

  const ids = uniq(out).filter((x) => x && x !== 'x');
  if (ids.length === 0) blockers.push('Atlas live parse yielded 0 exercise IDs.');
  return ids;
}

function parseHeliosLive(blockers) {
  const dir = path.join(HELIOS_DIR, 'apps', 'mobile', 'src', 'cv', 'exercises');
  if (!exists(HELIOS_DIR)) blockers.push(`HELIOS_DIR missing: ${HELIOS_DIR}`);
  if (!exists(dir)) {
    blockers.push(`Helios exercises directory missing: ${dir}`);
    return [];
  }
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.ts')) continue;
    const t = fs.readFileSync(path.join(dir, f), 'utf8');
    const m = t.match(/exerciseId\s*(?::[^=]+)?=\s*['"]([^'"]+)['"]/);
    if (m) out.push(norm(m[1]));
  }
  if (out.length === 0) blockers.push('Helios live parse yielded 0 analyzer exerciseId values.');
  return uniq(out);
}

function diffSet(a, b) {
  const A = new Set(a), B = new Set(b);
  return {
    onlyA: [...A].filter((x) => !B.has(x)).sort(),
    onlyB: [...B].filter((x) => !A.has(x)).sort(),
  };
}

function renderMd(r) {
  const lines = [
    '# Atlas+Helios Exercise Parity Report', '',
    `- Mode: ${r.mode}`,
    `- Status: ${r.status}`,
    `- Required count: ${r.requiredCount}`,
    `- Atlas count: ${r.atlas.length}`,
    `- Helios count: ${r.helios.length}`,
    '',
    '## Diff',
    '',
    `- Atlas only: ${r.diff.atlasOnly.join(', ') || 'none'}`,
    `- Helios only: ${r.diff.heliosOnly.join(', ') || 'none'}`,
    `- Missing from target (atlas): ${r.targetMissing.atlas.join(', ') || 'none'}`,
    `- Missing from target (helios): ${r.targetMissing.helios.join(', ') || 'none'}`,
    '',
  ];
  if (r.blockers.length) {
    lines.push('## Blockers', '');
    for (const b of r.blockers) lines.push(`- ${b}`);
    lines.push('');
  }
  return lines.join('\n');
}

function main() {
  const blockers = [];
  const target = loadTarget();
  const targetIds = uniq((target.canonicalExerciseIds || []).map(norm));
  const ignoreIds = new Set((target.ignoreIds || []).map(norm));

  let modeUsed = MODE;
  let atlasIds = [];
  let heliosIds = [];

  if (MODE === 'fixtures') {
    atlasIds = loadFixture('atlas');
    heliosIds = loadFixture('helios');
  } else if (MODE === 'live') {
    atlasIds = parseAtlasLive(blockers);
    heliosIds = parseHeliosLive(blockers);
  } else {
    const canLive = exists(ATLAS_DIR) && exists(HELIOS_DIR);
    if (canLive) {
      modeUsed = 'live';
      atlasIds = parseAtlasLive(blockers);
      heliosIds = parseHeliosLive(blockers);
    } else {
      modeUsed = 'fixtures';
      atlasIds = loadFixture('atlas');
      heliosIds = loadFixture('helios');
      blockers.push(`Live repos unavailable; used fixtures. Expected ATLAS_DIR=${ATLAS_DIR}, HELIOS_DIR=${HELIOS_DIR}`);
    }
  }

  atlasIds = atlasIds.filter((x) => !ignoreIds.has(x));
  heliosIds = heliosIds.filter((x) => !ignoreIds.has(x));
  const d = diffSet(atlasIds, heliosIds);
  const missAtlas = targetIds.filter((x) => !atlasIds.includes(x));
  const missHelios = targetIds.filter((x) => !heliosIds.includes(x));

  const parityPass = d.onlyA.length === 0 && d.onlyB.length === 0;
  const targetPass = atlasIds.length === target.requiredExerciseCount
    && heliosIds.length === target.requiredExerciseCount
    && missAtlas.length === 0
    && missHelios.length === 0;

  const hardBlock = MODE === 'live' && blockers.length > 0;
  const status = hardBlock ? 'BLOCKED' : (parityPass && targetPass ? 'PASS' : 'FAIL');

  const report = {
    generatedAt: new Date().toISOString(),
    mode: modeUsed,
    status,
    requiredCount: target.requiredExerciseCount,
    atlas: atlasIds,
    helios: heliosIds,
    diff: { atlasOnly: d.onlyA, heliosOnly: d.onlyB },
    targetMissing: { atlas: missAtlas, helios: missHelios },
    blockers,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  fs.writeFileSync(OUT_MD, renderMd(report));

  console.log(`Atlas+Helios parity status: ${status}`);
  console.log(`Report JSON: ${OUT}`);
  console.log(`Report MD:   ${OUT_MD}`);

  if (status === 'PASS') process.exit(0);
  if (status === 'BLOCKED') process.exit(2);
  process.exit(1);
}

main();
