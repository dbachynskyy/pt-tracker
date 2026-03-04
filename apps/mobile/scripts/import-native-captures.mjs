import fs from 'node:fs';
import path from 'node:path';
import { CANONICAL_EXERCISES, validateBundle } from './native-capture-schema.mjs';

const inPath = process.argv[2];
const outPath = process.argv[3] ?? path.resolve('fixtures/native-frame-bundles/atlas-captures.v1.json');

if (!inPath) {
  console.error('usage: node scripts/import-native-captures.mjs <raw-input.json> [out.json]');
  process.exit(2);
}

const raw = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const incoming = Array.isArray(raw) ? raw : Array.isArray(raw.captures) ? raw.captures : [];

const captures = CANONICAL_EXERCISES.map((exercise) => {
  const match = incoming.find((c) => c.exercise === exercise);
  if (!match) return { exercise, source: 'placeholder', frames: [] };
  return {
    exercise,
    source: match.source ?? 'imported',
    frames: Array.isArray(match.frames) ? match.frames : [],
  };
});

const bundle = {
  version: 'atlas.native.capture.v1',
  generatedAt: new Date().toISOString(),
  captures,
};

validateBundle(bundle);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(bundle, null, 2)}\n`);
console.log(`imported ${outPath}`);
