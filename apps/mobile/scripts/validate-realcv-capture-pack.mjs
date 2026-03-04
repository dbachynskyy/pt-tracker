import fs from 'node:fs';
import path from 'node:path';

const EXERCISES = [
  'squat','pushup','sit_to_stand','plank','lunge',
  'glute_bridge','knee_extension','heel_raise','calf_raise','shoulder_abduction'
];

const MIN_FRAMES = 3;
const MIN_REP_OBS = 2;
const CONF_FLOOR = 0.5;
const CONF_PASS_RATIO = 0.7;

const SIM_RE = /(placeholder|simulated|mock|synthetic|test)/i;

function num(v) { return Number.isFinite(v); }

function validateExerciseCapture(c) {
  const reasons = [];
  if (!c) return { pass: false, reasons: ['capture_missing'], frame_count: 0, rep_obs: 0, conf_ratio: 0 };

  if (!c.capture_id || typeof c.capture_id !== 'string') reasons.push('capture_id_missing');
  if (!c.device_id || typeof c.device_id !== 'string' || c.device_id === 'placeholder') reasons.push('device_id_missing');
  if (!num(c.ts) || c.ts <= 0) reasons.push('ts_invalid');
  if (!c.source || SIM_RE.test(c.source)) reasons.push('source_not_real_camera');

  const frames = Array.isArray(c.frames) ? c.frames : [];
  const frame_count = frames.length;
  if (frame_count < MIN_FRAMES) reasons.push('insufficient_frames');

  const rep_obs = frames.filter((f) => num(f?.rep_count)).length;
  if (rep_obs < MIN_REP_OBS) reasons.push('insufficient_rep_observations');

  const confValues = frames
    .map((f) => (num(f?.confidence) ? f.confidence : (num(f?.nativePoseResult?.confidence) ? f.nativePoseResult.confidence : null)))
    .filter((v) => v != null);
  const confPass = confValues.filter((v) => v >= CONF_FLOOR).length;
  const conf_ratio = confValues.length > 0 ? confPass / confValues.length : 0;
  if (conf_ratio < CONF_PASS_RATIO) reasons.push('confidence_distribution_below_floor');

  return { pass: reasons.length === 0, reasons, frame_count, rep_obs, conf_ratio: Number(conf_ratio.toFixed(3)) };
}

export function buildRealCapturePackGate(bundle) {
  const captures = Array.isArray(bundle?.captures) ? bundle.captures : [];
  const byEx = new Map(captures.map((c) => [c.exercise ?? c.exercise_id, c]));

  const exercises = EXERCISES.map((exercise) => {
    const c = byEx.get(exercise);
    const r = validateExerciseCapture(c);
    return { exercise, ...r };
  });

  const deviceIds = new Set(
    captures
      .map((c) => c?.device_id)
      .filter((d) => typeof d === 'string' && d.length > 0 && d !== 'placeholder')
  );

  const gate_reasons = [];
  if (deviceIds.size < 2) gate_reasons.push('single_device_pack');
  if (exercises.some((e) => !e.pass)) gate_reasons.push('exercise_quality_failures');

  return {
    version: 'atlas-real-capture-pack-gate.v1',
    generatedAt: new Date().toISOString(),
    aggregate: {
      total_exercises: EXERCISES.length,
      passing_exercises: exercises.filter((e) => e.pass).length,
      failing_exercises: exercises.filter((e) => !e.pass).length,
      distinct_device_ids: [...deviceIds],
      gate_pass: gate_reasons.length === 0,
      gate_reasons,
      thresholds: { MIN_FRAMES, MIN_REP_OBS, CONF_FLOOR, CONF_PASS_RATIO, MIN_DEVICE_IDS: 2 },
    },
    exercises,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const bundlePath = process.argv[2] ?? path.resolve('fixtures/native-frame-bundles/atlas-captures.v1.json');
  const outPath = process.argv[3] ?? path.resolve('artifacts/atlas-real-capture-pack-gate.v1.json');
  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  const report = buildRealCapturePackGate(bundle);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (!report.aggregate.gate_pass) {
    const first = report.exercises.find((e) => !e.pass);
    console.error(`real-capture-pack-failed: ${first?.exercise ?? 'aggregate'} -> ${(first?.reasons ?? report.aggregate.gate_reasons).join(',')}`);
    console.error(`wrote ${outPath}`);
    process.exit(1);
  }

  console.log(`real-capture-pack-pass: ${report.aggregate.passing_exercises}/${report.aggregate.total_exercises}`);
  console.log(`wrote ${outPath}`);
}
