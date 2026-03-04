import fs from 'node:fs';
import path from 'node:path';

const REQUIRED = [
  'squat','pushup','sit_to_stand','plank','lunge',
  'glute_bridge','knee_extension','heel_raise','calf_raise','shoulder_abduction'
];

export function buildCoverageGate(attestation) {
  if (attestation?.version !== 'atlas-provenance-attestation.v1') {
    throw new Error('invalid attestation version');
  }
  if (!Array.isArray(attestation.exercises)) {
    throw new Error('attestation.exercises must be array');
  }

  const byId = new Map(attestation.exercises.map((e) => [e.exercise, e]));
  const unknown = attestation.exercises
    .map((e) => e.exercise)
    .filter((id) => !REQUIRED.includes(id));

  const exercises = REQUIRED.map((id) => {
    const row = byId.get(id);
    if (!row) {
      return { exercise: id, present: false, pass: false, gate_pass: false, reasons: ['missing_exercise'] };
    }
    if (row.pass !== true) {
      return { exercise: id, present: true, pass: false, gate_pass: false, reasons: ['exercise_not_attested', ...(row.reasons ?? [])] };
    }
    return { exercise: id, present: true, pass: true, gate_pass: true, reasons: [] };
  });

  if (unknown.length > 0) {
    exercises.push({
      exercise: '__unknown__',
      present: true,
      pass: false,
      gate_pass: false,
      reasons: ['unexpected_exercise_ids', ...unknown],
    });
  }

  const passed = exercises.filter((e) => e.gate_pass && e.exercise !== '__unknown__').length;
  const gate_pass = passed === REQUIRED.length && unknown.length === 0;

  return {
    version: 'atlas-coverage-gate.v1',
    generatedAt: new Date().toISOString(),
    aggregate: {
      required_exercises: REQUIRED.length,
      passed_exercises: passed,
      failed_exercises: REQUIRED.length - passed,
      unknown_exercise_ids: unknown,
      gate_pass,
    },
    exercises,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const inPath = process.argv[2] ?? path.resolve('artifacts/atlas-provenance-attestation.v1.json');
  const outPath = process.argv[3] ?? path.resolve('artifacts/atlas-coverage-gate.v1.json');

  const att = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const report = buildCoverageGate(att);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (!report.aggregate.gate_pass) {
    const failed = report.exercises.find((e) => !e.gate_pass);
    console.error(`coverage-gate-failed: ${failed.exercise} -> ${failed.reasons.join(',')}`);
    console.error(`wrote ${outPath}`);
    process.exit(1);
  }

  console.log(`coverage-gate-pass: ${report.aggregate.passed_exercises}/${report.aggregate.required_exercises}`);
  console.log(`wrote ${outPath}`);
}
