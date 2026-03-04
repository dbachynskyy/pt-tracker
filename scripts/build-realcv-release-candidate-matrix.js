#!/usr/bin/env node
'use strict';

const fs = require('fs');

function readJsonSafe(path) {
  try { return { ok: true, data: JSON.parse(fs.readFileSync(path, 'utf8')) }; }
  catch (e) { return { ok: false, error: e.message }; }
}

function norm(s){return String(s||'').trim().toLowerCase().replace(/[\s-]+/g,'_');}

function toMap(report) {
  const map = {};
  for (const row of report.exercises || []) map[norm(row.exercise_id || row.exerciseId)] = row;
  return map;
}

function delta(prev, curr) {
  if (prev === curr) return 'unchanged';
  if (prev === false && curr === true) return 'improved';
  if (prev === true && curr === false) return 'regressed';
  return 'unchanged';
}

function build(currentWrap, priorWrap) {
  if (!currentWrap.ok) throw new Error(`current final contract unreadable: ${currentWrap.error}`);
  const current = currentWrap.data;
  const prior = priorWrap.ok ? priorWrap.data : null;

  const currentMap = toMap(current);
  const priorMap = prior ? toMap(prior) : {};

  const exercises = [];
  let regressions = 0;

  for (const ex of Object.keys(currentMap)) {
    const c = currentMap[ex];
    const p = priorMap[ex] || null;

    const atlasDelta = p ? delta(Boolean(p.atlas_coverage_pass), Boolean(c.atlas_coverage_pass)) : 'unchanged';
    const heliosDelta = p ? delta(Boolean(p.helios_readiness_pass), Boolean(c.helios_readiness_pass)) : 'unchanged';
    const orionDelta = p ? delta(Boolean(p.orion_overall_pass), Boolean(c.orion_overall_pass)) : 'unchanged';
    const overallDelta = p ? delta(Boolean(p.overall_pass), Boolean(c.overall_pass)) : 'unchanged';

    if (atlasDelta === 'regressed' || heliosDelta === 'regressed' || orionDelta === 'regressed' || overallDelta === 'regressed') regressions += 1;

    exercises.push({
      exercise_id: ex,
      current: {
        atlas_coverage_pass: Boolean(c.atlas_coverage_pass),
        helios_readiness_pass: Boolean(c.helios_readiness_pass),
        orion_overall_pass: Boolean(c.orion_overall_pass),
        overall_pass: Boolean(c.overall_pass),
      },
      delta: {
        atlas: atlasDelta,
        helios: heliosDelta,
        orion: orionDelta,
        overall: overallDelta,
      },
      reasons: c.reasons || [],
    });
  }

  exercises.sort((a,b)=>a.exercise_id.localeCompare(b.exercise_id));

  const passCount = exercises.filter(e => e.current.overall_pass).length;
  const recommendation = regressions > 0 ? 'HOLD_REGRESSION' : (current.release === 'PASS' ? 'PROMOTE' : 'HOLD');

  return {
    version: 'v1',
    generated_at: new Date().toISOString(),
    baseline_present: Boolean(prior),
    pass_count: passCount,
    total: exercises.length,
    regressions,
    release_recommendation: recommendation,
    exercises,
    notes: prior ? [] : ['No prior artifact found; deltas default to unchanged baseline.'],
  };
}

function renderMd(m) {
  const lines = [
    '# RealCV Release Candidate Matrix',
    '',
    `- pass: ${m.pass_count}/${m.total}`,
    `- regressions: ${m.regressions}`,
    `- recommendation: ${m.release_recommendation}`,
    `- baseline_present: ${m.baseline_present}`,
    '',
    '| Exercise | Atlas Δ | Helios Δ | Orion Δ | Overall Δ | Overall Pass |',
    '|---|---|---|---|---|---:|',
  ];
  for (const e of m.exercises) {
    lines.push(`| ${e.exercise_id} | ${e.delta.atlas} | ${e.delta.helios} | ${e.delta.orion} | ${e.delta.overall} | ${e.current.overall_pass ? '✅' : '❌'} |`);
  }
  if (m.notes?.length) {
    lines.push('', '## Notes', '');
    for (const n of m.notes) lines.push(`- ${n}`);
  }
  return lines.join('\n');
}

function main() {
  const currentPath = process.argv[2] || 'artifacts/realcv-final-contract.v1.json';
  const priorPath = process.argv[3] || 'artifacts/realcv-final-contract.prev.v1.json';
  const outJson = process.argv[4] || 'artifacts/realcv-release-candidate-matrix.v1.json';
  const outMd = process.argv[5] || 'artifacts/realcv-release-candidate-matrix.md';

  const curr = readJsonSafe(currentPath);
  const prior = readJsonSafe(priorPath);

  // compatibility mapping: if prior is alternate schema with rows in readiness_matrix
  if (prior.ok && !Array.isArray(prior.data.exercises) && Array.isArray(prior.data.readiness_matrix)) {
    prior.data = {
      release: prior.data.release || 'FAIL',
      exercises: prior.data.readiness_matrix.map((r) => ({
        exercise_id: r.exercise_id || r.exerciseId,
        atlas_coverage_pass: !!r.atlas_coverage_pass,
        helios_readiness_pass: !!r.helios_readiness_pass,
        orion_overall_pass: !!r.orion_overall_pass,
        overall_pass: !!r.overall_pass,
        reasons: r.reasons || [],
      })),
    };
  }

  let matrix;
  try {
    matrix = build(curr, prior);
  } catch (e) {
    console.error(`REALCV_RC_MATRIX[v1] error=${e.message}`);
    process.exit(2);
  }

  fs.writeFileSync(outJson, JSON.stringify(matrix, null, 2));
  fs.writeFileSync(outMd, renderMd(matrix));
  console.log(`REALCV_RC_MATRIX[v1] pass=${matrix.pass_count}/${matrix.total} regressions=${matrix.regressions} recommendation=${matrix.release_recommendation}`);
  process.exit(matrix.regressions > 0 ? 1 : 0);
}

if (require.main === module) main();
module.exports = { build };
