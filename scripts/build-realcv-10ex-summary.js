#!/usr/bin/env node
'use strict';

const fs = require('fs');

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function boolIcon(v) { return v ? '✅' : '❌'; }

function buildSummary(status) {
  const rows = Array.isArray(status.exercises) ? status.exercises : null;
  if (!rows || rows.length !== 10) {
    throw new Error('realcv-10ex-status.v1.json malformed: expected exercises[10]');
  }

  const overallPass = rows.filter((r) => r.overall_pass === true).length;
  const blockers = rows.filter((r) => r.overall_pass !== true);

  return {
    version: 'v1',
    generated_at: new Date().toISOString(),
    overall_pass: overallPass,
    total: 10,
    blocker_count: blockers.length,
    blockers: blockers.map((r) => ({ exercise_id: r.exercise_id, reasons: r.reasons || [] })),
    exercises: rows,
  };
}

function renderMd(summary) {
  const lines = [
    '# RealCV 10-Exercise Summary',
    '',
    `- overall_pass: ${summary.overall_pass}/${summary.total}`,
    `- blockers: ${summary.blocker_count}`,
    '',
    '| Exercise | Atlas | Helios | Orion | Overall | Reasons |',
    '|---|---:|---:|---:|---:|---|',
  ];

  for (const r of summary.exercises) {
    lines.push(`| ${r.exercise_id} | ${boolIcon(r.atlas_attested)} | ${boolIcon(r.helios_gate_pass)} | ${boolIcon(r.orion_regression_pass)} | ${boolIcon(r.overall_pass)} | ${(r.reasons || []).join(', ') || '—'} |`);
  }
  return lines.join('\n');
}

function main() {
  const [inPath='artifacts/realcv-10ex-status.v1.json', outJson='artifacts/realcv-10ex-summary.v1.json', outMd='artifacts/realcv-10ex-summary.md'] = process.argv.slice(2);

  let summary;
  try {
    const status = readJson(inPath);
    summary = buildSummary(status);
  } catch (e) {
    console.error(`REALCV_10EX_SUMMARY[v1] error=${e.message}`);
    process.exit(2);
  }

  fs.writeFileSync(outJson, JSON.stringify(summary, null, 2));
  fs.writeFileSync(outMd, renderMd(summary));

  console.log(`REALCV_10EX_SUMMARY[v1] overall_pass=${summary.overall_pass}/${summary.total}`);
  console.log(`REALCV_10EX_BLOCKERS[v1] count=${summary.blocker_count}`);

  process.exit(summary.blocker_count === 0 ? 0 : 1);
}

if (require.main === module) main();

module.exports = { buildSummary, renderMd };
