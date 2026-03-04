#!/usr/bin/env node
'use strict';

const fs = require('fs');

function readJsonSafe(path) {
  try { return { ok: true, data: JSON.parse(fs.readFileSync(path, 'utf8')), path }; }
  catch (e) { return { ok: false, error: e.message, path }; }
}

function discover(paths) {
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function build(inputs) {
  const blockers = [];
  const add = (code, detail, source='bundle') => blockers.push({ code, detail, source });

  const final = inputs.final;
  const matrix = inputs.matrix;
  const trend = inputs.trend;

  if (!final.ok) add('MISSING_FINAL_CONTRACT', `missing/malformed final contract: ${final.path}`,'final_contract');
  if (!matrix.ok) add('MISSING_RC_MATRIX', `missing/malformed RC matrix: ${matrix.path}`,'rc_matrix');
  if (!trend.ok) add('MISSING_TREND_HISTORY', `missing/malformed trend history: ${trend.path}`,'trend_history');

  if (final.ok && final.data.release !== 'PASS') add('FINAL_CONTRACT_FAIL', `final contract release=${final.data.release}`,'final_contract');
  if (matrix.ok && matrix.data.regressions > 0) add('RC_MATRIX_REGRESSION', `regressions=${matrix.data.regressions}`,'rc_matrix');
  if (trend.ok && trend.data.guard_fail) add('TREND_GUARD_FAIL', `offenders=${(trend.data.offenders||[]).length}`,'trend_history');

  const laneArtifacts = [];
  for (const lane of ['atlas','helios','orion']) {
    const w = inputs[lane];
    if (!w || !w.path) continue;
    laneArtifacts.push({ lane, path: w.path, present: !!w.ok, parse_error: w.ok ? null : w.error || 'missing' });
    if (!w.ok) add('MISSING_LANE_ARTIFACT', `${lane} missing/malformed: ${w.path}`, lane);
  }

  const decision = blockers.length ? 'HOLD' : 'GO';

  return {
    version: 'v1',
    generated_at: new Date().toISOString(),
    release_decision: decision,
    blocker_count: blockers.length,
    blockers,
    artifacts: {
      final_contract: { path: final.path, present: final.ok },
      release_candidate_matrix: { path: matrix.path, present: matrix.ok },
      trend_history: { path: trend.path, present: trend.ok },
      lane_artifacts: laneArtifacts,
    },
    diagnostics: {
      path_discovery: inputs.path_discovery,
      missing_artifacts: blockers.filter((b) => b.code.startsWith('MISSING')).map((b) => b.detail),
    },
  };
}

function renderMd(b) {
  const lines = [
    '# RealCV Release Audit Bundle',
    '',
    `- release_decision: ${b.release_decision}`,
    `- blocker_count: ${b.blocker_count}`,
    '',
    '## Ordered blockers',
    '',
  ];
  for (const bl of b.blockers) lines.push(`1. [${bl.code}] ${bl.detail}`);
  if (!b.blockers.length) lines.push('1. none');

  lines.push('', '## Artifact presence', '');
  lines.push(`- final_contract: ${b.artifacts.final_contract.present ? 'present' : 'missing'} (${b.artifacts.final_contract.path})`);
  lines.push(`- release_candidate_matrix: ${b.artifacts.release_candidate_matrix.present ? 'present' : 'missing'} (${b.artifacts.release_candidate_matrix.path})`);
  lines.push(`- trend_history: ${b.artifacts.trend_history.present ? 'present' : 'missing'} (${b.artifacts.trend_history.path})`);
  for (const l of b.artifacts.lane_artifacts) lines.push(`- lane_${l.lane}: ${l.present ? 'present' : 'missing'} (${l.path})`);
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const val = (k,d=null)=>{const i=args.indexOf(k);return i>=0?args[i+1]:d;};

  const finalPath = val('--final', discover(['artifacts/realcv-final-contract.v1.json']));
  const matrixPath = val('--matrix', discover(['artifacts/realcv-release-candidate-matrix.v1.json']));
  const trendPath = val('--trend', discover(['artifacts/realcv-release-trend-history.v1.json']));

  const atlasPath = val('--atlas', discover(['artifacts/atlas-coverage-gate.v1.json','schemas/cv/native-readiness.atlas.fixture.json']));
  const heliosPath = val('--helios', discover(['artifacts/helios-exercise-readiness.v1.json','schemas/cv/native-readiness.helios.fixture.json']));
  const orionPath = val('--orion', discover(['artifacts/realcv-lanes-status.v1.json','artifacts/realcv-10ex-summary.v1.json']));

  const outJson = val('--out', 'artifacts/realcv-release-audit-bundle.v1.json');
  const outMd = val('--md', 'artifacts/realcv-release-audit-bundle.md');

  const inputs = {
    final: readJsonSafe(finalPath || '/missing/final'),
    matrix: readJsonSafe(matrixPath || '/missing/matrix'),
    trend: readJsonSafe(trendPath || '/missing/trend'),
    atlas: readJsonSafe(atlasPath || '/missing/atlas'),
    helios: readJsonSafe(heliosPath || '/missing/helios'),
    orion: readJsonSafe(orionPath || '/missing/orion'),
    path_discovery: { finalPath, matrixPath, trendPath, atlasPath, heliosPath, orionPath },
  };

  const bundle = build(inputs);
  fs.writeFileSync(outJson, JSON.stringify(bundle, null, 2));
  fs.writeFileSync(outMd, renderMd(bundle));

  console.log(`REALCV_AUDIT_BUNDLE[v1] decision=${bundle.release_decision} blockers=${bundle.blocker_count}`);
  process.exit(bundle.release_decision === 'GO' ? 0 : 1);
}

if (require.main === module) main();
module.exports = { build };
