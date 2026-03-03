#!/usr/bin/env node
/**
 * PT Adherence — event validator
 * Zero external dependencies. Validates an analytics/audit event JSON against
 * the envelope and per-event property rules defined in schemas/events.schema.json.
 *
 * Usage:
 *   node scripts/validate-event.js path/to/event.json
 *   echo '{"event":"user_registered",...}' | node scripts/validate-event.js
 *   node scripts/validate-event.js --help
 *
 * Exit codes:
 *   0  valid
 *   1  invalid JSON or schema violation
 */

'use strict';

const fs = require('fs');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PLATFORMS = ['ios', 'android', 'web'];

// ---------------------------------------------------------------------------
// Primitive validators (each returns [] or [errorString])
// ---------------------------------------------------------------------------
function str(obj, key) {
  if (typeof obj[key] !== 'string' || obj[key].length === 0)
    return [`properties.${key}: must be a non-empty string`];
  return [];
}

function bool(obj, key) {
  if (typeof obj[key] !== 'boolean')
    return [`properties.${key}: must be a boolean`];
  return [];
}

function int(obj, key) {
  if (!Number.isInteger(obj[key]))
    return [`properties.${key}: must be an integer`];
  return [];
}

function num(obj, key) {
  if (typeof obj[key] !== 'number')
    return [`properties.${key}: must be a number`];
  return [];
}

function oneOf(obj, key, values) {
  if (!values.includes(obj[key]))
    return [`properties.${key}: must be one of [${values.join(', ')}], got ${JSON.stringify(obj[key])}`];
  return [];
}

function uuid(obj, key) {
  if (typeof obj[key] !== 'string' || !UUID_RE.test(obj[key]))
    return [`properties.${key}: must be a valid UUID, got ${JSON.stringify(obj[key])}`];
  return [];
}

function formScore(obj, key) {
  if (typeof obj[key] !== 'number' || obj[key] < 0 || obj[key] > 1)
    return [`properties.${key}: must be a number 0.0–1.0, got ${JSON.stringify(obj[key])}`];
  return [];
}

function date(obj, key) {
  if (typeof obj[key] !== 'string' || !DATE_RE.test(obj[key]))
    return [`properties.${key}: must be a YYYY-MM-DD date string`];
  return [];
}

// Combines multiple validators; all receive the same (obj, key) pair.
function all(...validators) {
  return (obj, key) => validators.flatMap((v) => v(obj, key));
}

// ---------------------------------------------------------------------------
// Per-event property validators
// Maps event name → (properties object) → error[]
// ---------------------------------------------------------------------------
const EVENT_VALIDATORS = {
  // Auth
  user_registered:  (p) => str(p, 'method'),
  user_logged_in:   (p) => str(p, 'method'),
  user_logged_out:  () => [],
  token_refreshed:  () => [],

  // Onboarding
  onboarding_started:        () => [],
  onboarding_completed:      (p) => [
    ...str(p, 'injuryType'),
    ...bool(p, 'hasSurgeryDate'),
    ...int(p, 'constraintCount'),
  ],
  onboarding_dropped:        (p) => oneOf(p, 'step', ['injury_info', 'camera_permission', 'plan_review']),
  camera_permission_granted: () => [],
  camera_permission_denied:  () => [],

  // Plan
  plan_viewed:            (p) => [...uuid(p, 'planId'), ...int(p, 'exerciseCount')],
  exercise_detail_viewed: (p) => [...uuid(p, 'exerciseId'), ...str(p, 'exerciseName')],

  // Session
  session_started:    (p) => [...uuid(p, 'rehabSessionId'), ...int(p, 'scheduledExerciseCount')],
  exercise_started:   (p) => [
    ...uuid(p, 'rehabSessionId'),
    ...uuid(p, 'exerciseId'),
    ...str(p, 'exerciseName'),
    ...int(p, 'targetSets'),
    ...int(p, 'targetReps'),
  ],
  set_completed:      (p) => [
    ...uuid(p, 'rehabSessionId'),
    ...uuid(p, 'exerciseId'),
    ...int(p, 'setNumber'),
    ...int(p, 'repsCompleted'),
    ...formScore(p, 'formScore'),
  ],
  exercise_completed: (p) => [
    ...uuid(p, 'rehabSessionId'),
    ...uuid(p, 'exerciseId'),
    ...int(p, 'setsCompleted'),
    ...int(p, 'totalReps'),
    ...formScore(p, 'avgFormScore'),
    ...int(p, 'durationSeconds'),
  ],
  exercise_skipped:   (p) => [
    ...uuid(p, 'rehabSessionId'),
    ...uuid(p, 'exerciseId'),
    ...oneOf(p, 'reason', ['pain', 'tired', 'other', 'not_specified']),
  ],
  session_completed:  (p) => [
    ...uuid(p, 'rehabSessionId'),
    ...int(p, 'exercisesCompleted'),
    ...int(p, 'exercisesScheduled'),
    ...formScore(p, 'completionRate'),
    ...int(p, 'durationSeconds'),
    ...int(p, 'newStreak'),
  ],
  session_abandoned:  (p) => [
    ...uuid(p, 'rehabSessionId'),
    ...int(p, 'exercisesCompleted'),
    ...int(p, 'exercisesScheduled'),
    ...int(p, 'durationSeconds'),
  ],

  // Form Feedback
  form_feedback_shown:     (p) => [
    ...uuid(p, 'exerciseId'),
    ...oneOf(p, 'feedbackType', ['posture_deviation', 'rep_count_mismatch', 'good_form']),
    ...formScore(p, 'formScore'),
  ],
  form_feedback_dismissed: (p) => [...uuid(p, 'exerciseId'), ...str(p, 'feedbackType')],

  // Dashboard
  dashboard_viewed:        (p) => [...int(p, 'currentStreak'), ...formScore(p, 'weeklyCompletionRate')],
  weekly_summary_viewed:   (p) => [...date(p, 'weekOf'), ...formScore(p, 'completionRate')],
  weekly_summary_exported: (p) => [...date(p, 'weekOf'), ...oneOf(p, 'method', ['email', 'download'])],

  // Error
  api_error:             (p) => [...str(p, 'endpoint'), ...int(p, 'statusCode'), ...str(p, 'errorCode')],
  form_detection_failed: (p) => [
    ...uuid(p, 'exerciseId'),
    ...oneOf(p, 'reason', ['low_light', 'occlusion', 'model_error']),
  ],
};

const KNOWN_EVENTS = new Set(Object.keys(EVENT_VALIDATORS));

// ---------------------------------------------------------------------------
// Envelope validation
// ---------------------------------------------------------------------------
function validateEnvelope(evt) {
  const errors = [];

  if (typeof evt.event !== 'string' || evt.event.length === 0)
    errors.push('event: required, must be a non-empty string');
  else if (!KNOWN_EVENTS.has(evt.event))
    errors.push(`event: unknown event name "${evt.event}"`);

  // userId — uuid | null | absent
  if (evt.userId !== undefined && evt.userId !== null) {
    if (typeof evt.userId !== 'string' || !UUID_RE.test(evt.userId))
      errors.push('userId: must be a UUID or null');
  }

  // sessionId — uuid | null | absent
  if (evt.sessionId !== undefined && evt.sessionId !== null) {
    if (typeof evt.sessionId !== 'string' || !UUID_RE.test(evt.sessionId))
      errors.push('sessionId: must be a UUID or null');
  }

  if (typeof evt.timestamp !== 'string' || !ISO8601_RE.test(evt.timestamp))
    errors.push('timestamp: must be an ISO 8601 datetime string');

  if (!PLATFORMS.includes(evt.platform))
    errors.push(`platform: must be one of [${PLATFORMS.join(', ')}], got ${JSON.stringify(evt.platform)}`);

  if (typeof evt.appVersion !== 'string' || evt.appVersion.length === 0)
    errors.push('appVersion: required, must be a non-empty string');

  if (typeof evt.properties !== 'object' || evt.properties === null || Array.isArray(evt.properties))
    errors.push('properties: must be a plain object');

  return errors;
}

// ---------------------------------------------------------------------------
// Main validate function
// ---------------------------------------------------------------------------
function validate(evt) {
  const envelopeErrors = validateEnvelope(evt);

  const propErrors =
    KNOWN_EVENTS.has(evt.event) &&
    typeof evt.properties === 'object' &&
    evt.properties !== null &&
    !Array.isArray(evt.properties)
      ? EVENT_VALIDATORS[evt.event](evt.properties)
      : [];

  return [...envelopeErrors, ...propErrors];
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
function run(raw) {
  let evt;
  try {
    evt = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`INVALID JSON: ${e.message}\n`);
    process.exit(1);
  }

  if (typeof evt !== 'object' || evt === null || Array.isArray(evt)) {
    process.stderr.write('INVALID: top-level value must be a JSON object\n');
    process.exit(1);
  }

  const errors = validate(evt);
  const label = evt.event ? `event="${evt.event}"` : 'event=?';

  if (errors.length === 0) {
    process.stdout.write(`VALID  ${label}\n`);
    process.exit(0);
  } else {
    process.stderr.write(`INVALID  ${label}\n`);
    for (const e of errors) process.stderr.write(`  - ${e}\n`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(
    [
      'Usage:',
      '  node scripts/validate-event.js <event.json>',
      '  echo \'{"event":"user_registered",...}\' | node scripts/validate-event.js',
      '',
      'Exit codes:  0 = valid   1 = invalid or parse error',
      '',
      'Known events:',
      ...Array.from(KNOWN_EVENTS).map((e) => `  ${e}`),
      '',
    ].join('\n')
  );
  process.exit(0);
}

if (args[0] && !args[0].startsWith('-')) {
  run(fs.readFileSync(args[0], 'utf8'));
} else {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { buf += chunk; });
  process.stdin.on('end', () => run(buf));
}
