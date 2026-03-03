#!/usr/bin/env node
/**
 * parse-cv-results.js
 *
 * Reads Jest --json output from stdin and renders a CV detector test matrix:
 *   - One row per describe-block, showing PASS/FAIL + scenario summary
 *   - False-positive notes for scenarios with known design trade-offs
 *   - Quality-gate verdict at the bottom
 *
 * Called by run-cv-matrix.sh; can also be used standalone:
 *   npx jest --json 2>/dev/null | node scripts/parse-cv-results.js
 *
 * Exit codes:
 *   0  quality gate PASS (all describe-blocks pass)
 *   1  quality gate FAIL (one or more describe-blocks fail)
 *   2  parse error
 */

'use strict';

// ---------------------------------------------------------------------------
// False-positive / design-note annotations
// Keyed by substring that appears in the describe block name.
// ---------------------------------------------------------------------------
const FP_NOTES = [
  {
    match: 'warmup gate',
    note: 'First 10 frames always discarded regardless of pose quality.',
  },
  {
    match: 'velocity ceiling',
    note: 'Reps < 400 ms silently dropped — no RepEvent or user feedback.',
  },
  {
    match: 'debounce window',
    note: 'Second rep within 500 ms silently dropped (rare at rehab pacing).',
  },
  {
    match: 'occlusion gating',
    note: 'Streak ≤ 3: plugin still runs — low-quality-frame count window.',
  },
  {
    match: 'session continuity',
    note: 'Auto-pauses at 10 s gap; user must call resume() explicitly.',
  },
  {
    match: 'INSUFFICIENT_DEPTH',
    note: 'Partial-depth reps ARE counted + flagged — intentional by design.',
  },
  {
    match: 'PARTIAL_ROM',
    note: 'Partial-ROM reps ARE counted + flagged — intentional by design.',
  },
  {
    match: 'phase-lock',
    note: 'SEEKING_DOWN→UP path emits rep with ROM flag — counts partial descents.',
  },
  {
    match: 'TOO_FAST',
    note: 'Analyzer flags 400 ms–min_ms range; RepCounter hard-drops < 400 ms.',
  },
  {
    match: 'global velocity ceiling',
    note: 'Reps < 400 ms produce no event; completedReps stays unchanged.',
  },
  {
    match: 'end-to-end',
    note: '',
  },
];

function fpNote(describeName) {
  for (const { match, note } of FP_NOTES) {
    if (describeName.includes(match)) return note;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Column widths
// ---------------------------------------------------------------------------
const C = {
  file:     12,
  describe: 45,
  result:    4,
  count:     8,
  note:     52,
};
const ROW_WIDTH = C.file + C.describe + C.result + C.count + C.note + 10;
const HR = '─'.repeat(ROW_WIDTH);

function pad(s, n) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n);
}

// ANSI colour helpers (omit when not a TTY)
const isTTY = process.stdout.isTTY;
const green  = (s) => isTTY ? `\x1b[32m${s}\x1b[0m` : s;
const red    = (s) => isTTY ? `\x1b[31m${s}\x1b[0m` : s;
const bold   = (s) => isTTY ? `\x1b[1m${s}\x1b[0m`  : s;
const dim    = (s) => isTTY ? `\x1b[2m${s}\x1b[0m`  : s;

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function render(data) {
  // Header row
  console.log(HR);
  console.log(
    bold(pad('File',     C.file))   + '  ' +
    bold(pad('Scenario', C.describe)) + '  ' +
    bold(pad('',         C.result))  + '  ' +
    bold(pad('Tests',    C.count))   + '  ' +
    bold('Notes'),
  );
  console.log(HR);

  let suitePass = 0;
  let suiteFail = 0;

  for (const suite of data.testResults) {
    // Derive short file label: "repCounter", "squat", "pushup", "plank"
    // Jest JSON uses `name` for the file path (not `testFilePath`)
    const fileLabel = (suite.name ?? suite.testFilePath ?? '')
      .replace(/.*\/([^/]+)\.test\.ts$/, '$1')
      .replace(/^(.{12}).*/, (_, m) => m);    // cap at C.file

    // Group individual tests by describe block
    // Jest JSON uses `assertionResults` (not `testResults`)
    const groups = new Map();
    for (const t of (suite.assertionResults ?? suite.testResults ?? [])) {
      const describe = t.ancestorTitles[0] ?? '(top-level)';
      if (!groups.has(describe)) groups.set(describe, []);
      groups.get(describe).push(t);
    }

    let firstInFile = true;

    for (const [describe, tests] of groups) {
      const passed  = tests.filter((t) => t.status === 'passed').length;
      const failed  = tests.filter((t) => t.status !== 'passed').length;
      const allPass = failed === 0;

      if (allPass) suitePass++; else suiteFail++;

      // Strip exercise-name prefix for brevity: "SquatAnalyzer — foo" → "foo"
      const shortDesc = describe
        .replace(/^[A-Za-z]+Analyzer\s+\+\s+RepCounter\s+—\s+/, '')
        .replace(/^[A-Za-z]+Analyzer\s+—\s+/, '')
        .replace(/^RepCounter\s+—\s+/, '');

      const resultStr = allPass ? green('PASS') : red('FAIL');
      const countStr  = allPass
        ? dim(`${passed}/${passed}`)
        : red(`${passed}/${passed + failed}`);
      const note = fpNote(describe);

      console.log(
        pad(firstInFile ? fileLabel : '', C.file) + '  ' +
        pad(shortDesc,  C.describe) + '  ' +
        resultStr       + '  ' +
        pad(countStr,   C.count)    + '  ' +
        dim(note),
      );
      firstInFile = false;

      // Expand failure details
      if (!allPass) {
        for (const t of tests.filter((x) => x.status !== 'passed')) {
          const indent = ' '.repeat(C.file + 2);
          console.log(indent + red('✗') + ' ' + t.title);
          for (const msg of (t.failureMessages ?? [])) {
            const firstLine = msg.split('\n').find((l) => l.trim()) ?? '';
            console.log(indent + '  ' + dim(firstLine.trim().slice(0, 90)));
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log(HR);
  console.log('');

  const totalSuites = suitePass + suiteFail;
  const passRate    = totalSuites > 0 ? Math.round((suitePass / totalSuites) * 100) : 0;

  console.log(
    `  Scenarios : ${totalSuites}   ` +
    green(`PASS: ${suitePass}`) + `   ` +
    (suiteFail > 0 ? red(`FAIL: ${suiteFail}`) : `FAIL: 0`) +
    `   (${passRate}%)`,
  );
  console.log(
    `  Tests     : ` +
    green(`${data.numPassedTests ?? '?'} passed`) +
    `, ` +
    (data.numFailedTests > 0 ? red(`${data.numFailedTests} failed`) : `${data.numFailedTests ?? 0} failed`),
  );
  console.log('');

  // Quality gate
  const GATE_THRESHOLD = 100; // CV module requires 100% scenario pass rate
  if (suiteFail === 0) {
    console.log(bold(green('  ✓ QUALITY GATE: PASS')) + ` — all ${totalSuites} scenarios at 100%`);
    console.log('');
    process.exit(0);
  } else {
    console.log(
      bold(red('  ✗ QUALITY GATE: FAIL')) +
      ` — ${suitePass}/${totalSuites} scenarios pass ` +
      `(threshold: ${GATE_THRESHOLD}%)`,
    );
    console.log('  Review failures above before marking CV gate green.');
    console.log('');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Read stdin
// ---------------------------------------------------------------------------
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`ERROR: Failed to parse Jest JSON output.\n  ${e.message}\n`);
    process.exit(2);
  }
  render(data);
});
