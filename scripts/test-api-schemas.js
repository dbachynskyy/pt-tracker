#!/usr/bin/env node
/**
 * PT Adherence — API payload schema validation tests
 * Zero external dependencies. Loads each schema in schemas/api/ and runs
 * a suite of valid + invalid fixtures through a minimal inline JSON Schema
 * (draft-07 subset) validator.
 *
 * Usage:
 *   node scripts/test-api-schemas.js
 *   node scripts/test-api-schemas.js --verbose
 *
 * Exit codes:
 *   0  all tests passed
 *   1  one or more tests failed
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const REPO_ROOT   = path.resolve(__dirname, '..');
const SCHEMA_DIR  = path.join(REPO_ROOT, 'schemas', 'api');
const VERBOSE     = process.argv.includes('--verbose');

// ---------------------------------------------------------------------------
// Minimal JSON Schema draft-07 validator
// Supported keywords: type, required, properties, additionalProperties,
//                     minLength, minimum, maximum, pattern, format, items, enum
// ---------------------------------------------------------------------------
const FORMAT_RE = {
  uuid:  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  date:  /^\d{4}-\d{2}-\d{2}$/,
};

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function matchesType(value, schemaType) {
  const types = Array.isArray(schemaType) ? schemaType : [schemaType];
  const actual = typeOf(value);
  return types.some((t) => {
    if (t === 'number') return typeof value === 'number';
    return t === actual;
  });
}

function validate(value, schema, pointer) {
  const p = pointer || '/';
  const errors = [];

  if (schema.type !== undefined) {
    if (!matchesType(value, schema.type)) {
      const expected = Array.isArray(schema.type) ? schema.type.join('|') : schema.type;
      errors.push(`${p}: expected ${expected}, got ${typeOf(value)}`);
      return errors; // further checks are meaningless
    }
  }

  if (schema.enum !== undefined) {
    if (!schema.enum.includes(value)) {
      errors.push(`${p}: must be one of [${schema.enum.map((v) => JSON.stringify(v)).join(', ')}]`);
    }
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${p}: minLength ${schema.minLength} violated (length ${value.length})`);
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${p}: does not match pattern ${schema.pattern}`);
    }
    if (schema.format !== undefined && FORMAT_RE[schema.format]) {
      if (!FORMAT_RE[schema.format].test(value)) {
        errors.push(`${p}: invalid ${schema.format} format`);
      }
    }
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${p}: ${value} < minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${p}: ${value} > maximum ${schema.maximum}`);
    }
  }

  if (Array.isArray(value) && schema.items !== undefined) {
    value.forEach((item, i) => {
      errors.push(...validate(item, schema.items, `${p}/${i}`));
    });
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in value)) {
          errors.push(`${p}/${key}: required property missing`);
        }
      }
    }
    if (schema.properties) {
      for (const [key, subSchema] of Object.entries(schema.properties)) {
        if (key in value) {
          errors.push(...validate(value[key], subSchema, `${p}/${key}`));
        }
      }
    }
    if (schema.additionalProperties === false && schema.properties) {
      const allowed = new Set(Object.keys(schema.properties));
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
          errors.push(`${p}/${key}: additional property not allowed`);
        }
      }
    }
  }

  return errors;
}

function loadSchema(filename) {
  const full = path.join(SCHEMA_DIR, filename);
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

// ---------------------------------------------------------------------------
// Test suite
// Each entry: { schema, description, fixture, valid }
// ---------------------------------------------------------------------------
const TESTS = [
  // ─── POST /auth/register ─────────────────────────────────────────────────
  {
    schema: loadSchema('auth.register.request.schema.json'),
    description: 'register — valid full payload',
    fixture: { email: 'patient@example.com', password: 'SecurePass1!', name: 'Alex Reyes' },
    valid: true,
  },
  {
    schema: loadSchema('auth.register.request.schema.json'),
    description: 'register — missing name',
    fixture: { email: 'patient@example.com', password: 'SecurePass1!' },
    valid: false,
  },
  {
    schema: loadSchema('auth.register.request.schema.json'),
    description: 'register — password too short (< 8 chars)',
    fixture: { email: 'patient@example.com', password: 'short', name: 'Alex' },
    valid: false,
  },
  {
    schema: loadSchema('auth.register.request.schema.json'),
    description: 'register — invalid email format',
    fixture: { email: 'not-an-email', password: 'SecurePass1!', name: 'Alex' },
    valid: false,
  },
  {
    schema: loadSchema('auth.register.request.schema.json'),
    description: 'register — additional property not allowed',
    fixture: { email: 'a@b.com', password: 'SecurePass1!', name: 'Alex', role: 'admin' },
    valid: false,
  },

  // ─── POST /auth/login ─────────────────────────────────────────────────────
  {
    schema: loadSchema('auth.login.request.schema.json'),
    description: 'login — valid payload',
    fixture: { email: 'patient@example.com', password: 'SecurePass1!' },
    valid: true,
  },
  {
    schema: loadSchema('auth.login.request.schema.json'),
    description: 'login — missing email',
    fixture: { password: 'SecurePass1!' },
    valid: false,
  },
  {
    schema: loadSchema('auth.login.request.schema.json'),
    description: 'login — empty password',
    fixture: { email: 'a@b.com', password: '' },
    valid: false,
  },
  {
    schema: loadSchema('auth.login.request.schema.json'),
    description: 'login — extra field rejected',
    fixture: { email: 'a@b.com', password: 'ok', remember: true },
    valid: false,
  },

  // ─── PUT /users/{userId}/profile ─────────────────────────────────────────
  {
    schema: loadSchema('user.profile.request.schema.json'),
    description: 'profile — valid with surgery date',
    fixture: { injuryType: 'ACL', surgeryDate: '2025-11-15', constraints: ['no_impact'] },
    valid: true,
  },
  {
    schema: loadSchema('user.profile.request.schema.json'),
    description: 'profile — valid with null surgery date and empty constraints',
    fixture: { injuryType: 'rotator_cuff', surgeryDate: null, constraints: [] },
    valid: true,
  },
  {
    schema: loadSchema('user.profile.request.schema.json'),
    description: 'profile — optional surgeryDate absent',
    fixture: { injuryType: 'knee_replacement', constraints: ['limited_range'] },
    valid: true,
  },
  {
    schema: loadSchema('user.profile.request.schema.json'),
    description: 'profile — missing injuryType',
    fixture: { constraints: [] },
    valid: false,
  },
  {
    schema: loadSchema('user.profile.request.schema.json'),
    description: 'profile — surgeryDate wrong format (not YYYY-MM-DD)',
    fixture: { injuryType: 'ACL', surgeryDate: '15/11/2025', constraints: [] },
    valid: false,
  },
  {
    schema: loadSchema('user.profile.request.schema.json'),
    description: 'profile — constraints must be array of strings (integer element rejected)',
    fixture: { injuryType: 'ACL', constraints: [42] },
    valid: false,
  },

  // ─── POST /sessions ───────────────────────────────────────────────────────
  {
    schema: loadSchema('session.start.request.schema.json'),
    description: 'session start — valid payload',
    fixture: { userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', date: '2026-03-02' },
    valid: true,
  },
  {
    schema: loadSchema('session.start.request.schema.json'),
    description: 'session start — missing userId',
    fixture: { date: '2026-03-02' },
    valid: false,
  },
  {
    schema: loadSchema('session.start.request.schema.json'),
    description: 'session start — invalid userId (not uuid)',
    fixture: { userId: 'not-a-uuid', date: '2026-03-02' },
    valid: false,
  },
  {
    schema: loadSchema('session.start.request.schema.json'),
    description: 'session start — date wrong format',
    fixture: { userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', date: '02-03-2026' },
    valid: false,
  },
  {
    schema: loadSchema('session.start.request.schema.json'),
    description: 'session start — extra field rejected',
    fixture: { userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', date: '2026-03-02', source: 'mobile' },
    valid: false,
  },

  // ─── PATCH /sessions/{id}/exercises/{id} ─────────────────────────────────
  {
    schema: loadSchema('session.exercise_log.request.schema.json'),
    description: 'exercise log — valid full set (3 sets)',
    fixture: { setsCompleted: 3, repsPerSet: [10, 10, 9], formScore: 0.82, durationSeconds: 145 },
    valid: true,
  },
  {
    schema: loadSchema('session.exercise_log.request.schema.json'),
    description: 'exercise log — zero sets (skipped)',
    fixture: { setsCompleted: 0, repsPerSet: [], formScore: 0.0, durationSeconds: 0 },
    valid: true,
  },
  {
    schema: loadSchema('session.exercise_log.request.schema.json'),
    description: 'exercise log — formScore boundary 1.0',
    fixture: { setsCompleted: 3, repsPerSet: [10, 10, 10], formScore: 1.0, durationSeconds: 120 },
    valid: true,
  },
  {
    schema: loadSchema('session.exercise_log.request.schema.json'),
    description: 'exercise log — missing formScore',
    fixture: { setsCompleted: 3, repsPerSet: [10, 10, 9], durationSeconds: 145 },
    valid: false,
  },
  {
    schema: loadSchema('session.exercise_log.request.schema.json'),
    description: 'exercise log — formScore out of range (> 1)',
    fixture: { setsCompleted: 1, repsPerSet: [10], formScore: 1.1, durationSeconds: 30 },
    valid: false,
  },
  {
    schema: loadSchema('session.exercise_log.request.schema.json'),
    description: 'exercise log — negative durationSeconds',
    fixture: { setsCompleted: 1, repsPerSet: [10], formScore: 0.9, durationSeconds: -1 },
    valid: false,
  },
  {
    schema: loadSchema('session.exercise_log.request.schema.json'),
    description: 'exercise log — non-integer setsCompleted',
    fixture: { setsCompleted: 2.5, repsPerSet: [10, 10], formScore: 0.8, durationSeconds: 60 },
    valid: false,
  },
  {
    schema: loadSchema('session.exercise_log.request.schema.json'),
    description: 'exercise log — extra field rejected',
    fixture: { setsCompleted: 3, repsPerSet: [10, 10, 9], formScore: 0.8, durationSeconds: 145, notes: 'felt good' },
    valid: false,
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

console.log();
console.log('PT Adherence — API Schema Validation Tests');
console.log(`  Schema dir: ${SCHEMA_DIR}`);
console.log();

for (const tc of TESTS) {
  const errors = validate(tc.fixture, tc.schema, '');
  const isValid = errors.length === 0;
  const ok = isValid === tc.valid;

  if (ok) {
    passed++;
    if (VERBOSE) {
      console.log(`  PASS  ${tc.description}`);
    }
  } else {
    failed++;
    const expectation = tc.valid ? 'VALID (expected no errors)' : 'INVALID (expected errors)';
    console.log(`  FAIL  ${tc.description}`);
    console.log(`        fixture was ${expectation}`);
    if (tc.valid && errors.length > 0) {
      for (const e of errors) console.log(`        - ${e}`);
    } else if (!tc.valid && errors.length === 0) {
      console.log('        - schema accepted the fixture but should have rejected it');
    }
  }
}

if (!VERBOSE && failed === 0) {
  console.log(`  (${passed} tests — run with --verbose to see each)`);
}

console.log();
console.log('================================');
console.log(`  PASS: ${passed}   FAIL: ${failed}`);
console.log('================================');
console.log();

if (failed > 0) {
  console.error('SCHEMA TESTS FAILED');
  process.exit(1);
} else {
  console.log('SCHEMA TESTS PASSED');
  process.exit(0);
}
