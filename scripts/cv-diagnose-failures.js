#!/usr/bin/env node
'use strict';

const fs = require('fs');

function loadJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function classify(describe, title) {
  const s = `${describe} ${title}`.toLowerCase();
  if (/(good form|not flag|no flags|clean)/.test(s)) return 'false-positive';
  if (/(velocity|debounce|warmup|occlusion|continuity|anti-cheat|too_fast)/.test(s)) return 'lockout';
  if (/(alignment|calibration|angle|landmark|asymmetric|depth|rom)/.test(s)) return 'calibration';
  return 'functional';
}

function fromJest(data) {
  const rows = [];
  for (const suite of data.testResults ?? []) {
    const file = (suite.name ?? '').replace(/.*\/([^/]+)\.test\.ts$/, '$1');
    for (const t of suite.assertionResults ?? []) {
      if (t.status === 'passed') continue;
      const describe = t.ancestorTitles?.[0] ?? '(top-level)';
      rows.push({
        file,
        describe,
        title: t.title,
        class: classify(describe, t.title),
        message: ((t.failureMessages ?? [])[0] || 'FAILED').split('\n').find((l) => l.trim())?.trim() || 'FAILED',
      });
    }
  }
  return rows;
}

function print(rows) {
  if (rows.length === 0) {
    console.log('No failing tests detected.');
    return;
  }
  const byClass = rows.reduce((m, r) => ((m[r.class] ||= []).push(r), m), {});
  console.log('# CV Failure Diagnostics\n');
  for (const key of ['false-positive', 'lockout', 'calibration', 'functional']) {
    const items = byClass[key] || [];
    if (!items.length) continue;
    console.log(`## ${key} (${items.length})`);
    for (const r of items) {
      console.log(`- [${r.file}] ${r.describe} > ${r.title}`);
      console.log(`  - ${r.message.slice(0, 160)}`);
    }
    console.log('');
  }
}

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: node scripts/cv-diagnose-failures.js <jest-results.json>');
    process.exit(2);
  }
  const data = loadJson(input);
  const rows = fromJest(data);
  print(rows);
}

main();
