#!/usr/bin/env node
'use strict';

const fs = require('fs');

function readJsonSafe(path) {
  try { return { ok: true, data: JSON.parse(fs.readFileSync(path, 'utf8')) }; }
  catch (e) { return { ok: false, error: e.message }; }
}

function norm(s){return String(s||'').trim().toLowerCase().replace(/[\s-]+/g,'_');}

function normalizeMatrix(doc) {
  if (Array.isArray(doc?.exercises)) return doc.exercises;
  if (Array.isArray(doc?.readiness_matrix)) {
    return doc.readiness_matrix.map((r) => ({
      exercise_id: r.exercise_id || r.exerciseId,
      delta: r.delta || {
        atlas: r.atlas_delta || 'unchanged',
        helios: r.helios_delta || 'unchanged',
        orion: r.orion_delta || 'unchanged',
        overall: r.overall_delta || 'unchanged',
      },
    }));
  }
  return null;
}

function classifyStreak(overallSeq) {
  if (!overallSeq.length) return 'flat';
  const set = new Set(overallSeq);
  if (set.size === 1 && set.has('improved')) return 'improving';
  if (set.size === 1 && set.has('regressed')) return 'regressing';
  if (set.size === 1 && set.has('unchanged')) return 'flat';
  if (set.has('regressed') && set.has('improved')) return 'volatile';
  if (set.has('regressed')) return 'regressing';
  if (set.has('improved')) return 'improving';
  return 'flat';
}

function consecutiveRegressions(overallSeqLatestFirst) {
  let c = 0;
  for (const d of overallSeqLatestFirst) {
    if (d === 'regressed') c++;
    else break;
  }
  return c;
}

function build(paths) {
  const docs = paths.map((p) => ({ path: p, wrap: readJsonSafe(p) })).filter((x) => x.wrap.ok);
  if (docs.length === 0) throw new Error('no readable matrix artifacts provided');

  // newest first expected; preserve input order
  const byExercise = {};

  for (const { path, wrap } of docs) {
    const rows = normalizeMatrix(wrap.data);
    if (!rows) continue;
    for (const r of rows) {
      const id = norm(r.exercise_id || r.exerciseId);
      if (!id) continue;
      byExercise[id] = byExercise[id] || { history: [] };
      byExercise[id].history.push({
        source: path,
        overall: r?.delta?.overall || 'unchanged',
        atlas: r?.delta?.atlas || 'unchanged',
        helios: r?.delta?.helios || 'unchanged',
        orion: r?.delta?.orion || 'unchanged',
      });
    }
  }

  const exercises = Object.keys(byExercise).sort().map((id) => {
    const hist = byExercise[id].history;
    const overallSeq = hist.map((h) => h.overall);
    return {
      exercise_id: id,
      trend_streak: classifyStreak(overallSeq),
      consecutive_regressions: consecutiveRegressions(overallSeq),
      history: hist,
    };
  });

  const offenders = exercises.filter((e) => e.consecutive_regressions >= 2);

  return {
    version: 'v1',
    generated_at: new Date().toISOString(),
    sample_size: docs.length,
    exercises,
    guard_fail: offenders.length > 0,
    offenders: offenders.map((e) => ({ exercise_id: e.exercise_id, consecutive_regressions: e.consecutive_regressions })),
  };
}

function renderMd(r) {
  const lines = [
    '# RealCV Release Trend History',
    '',
    `- sample_size: ${r.sample_size}`,
    `- guard_fail: ${r.guard_fail}`,
    `- offenders: ${r.offenders.length}`,
    '',
    '| Exercise | Trend | Consecutive Regressions |',
    '|---|---|---:|',
  ];
  for (const e of r.exercises) lines.push(`| ${e.exercise_id} | ${e.trend_streak} | ${e.consecutive_regressions} |`);
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: node scripts/build-realcv-trend-history.js <matrix1.json> [matrix2.json ...] [--out <json>] [--md <md>]');
    process.exit(2);
  }

  let outJson = 'artifacts/realcv-release-trend-history.v1.json';
  let outMd = 'artifacts/realcv-release-trend-history.md';
  const paths = [];

  for (let i=0; i<args.length; i++) {
    if (args[i] === '--out') { outJson = args[++i]; continue; }
    if (args[i] === '--md') { outMd = args[++i]; continue; }
    paths.push(args[i]);
  }

  let r;
  try { r = build(paths); }
  catch (e) {
    console.error(`REALCV_TREND_HISTORY[v1] error=${e.message}`);
    process.exit(2);
  }

  fs.writeFileSync(outJson, JSON.stringify(r, null, 2));
  fs.writeFileSync(outMd, renderMd(r));
  console.log(`REALCV_TREND_HISTORY[v1] sample=${r.sample_size} offenders=${r.offenders.length}`);
  process.exit(r.guard_fail ? 1 : 0);
}

if (require.main === module) main();
module.exports = { build, normalizeMatrix, classifyStreak, consecutiveRegressions };
