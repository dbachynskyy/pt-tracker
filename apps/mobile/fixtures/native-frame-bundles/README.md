# Native Frame Bundle Schema (`atlas.native.capture.v1`)

Use import tool:

```bash
cd apps/mobile
node scripts/import-native-captures.mjs /path/to/raw-captures.json fixtures/native-frame-bundles/atlas-captures.v1.json
```

## Raw input accepted by import tool
- JSON object with `captures: []` or plain `[]`
- each capture: `{ exercise, source?, frames[] }`

## Canonical bundle schema

```json
{
  "version": "atlas.native.capture.v1",
  "generatedAt": "ISO-8601",
  "captures": [
    {
      "exercise": "squat|pushup|sit_to_stand|plank|lunge|glute_bridge|knee_extension|heel_raise|calf_raise|shoulder_abduction",
      "source": "camera-device-id-or-note",
      "frames": [
        {
          "base64": "...",
          "timestampMs": 1731111111111,
          "expectedExercise": "squat",
          "nativePoseResult": {
            "confidence": 0.91,
            "landmarks": [
              { "index": 11, "name": "left_shoulder", "x": 0.1, "y": 0.2, "visibility": 0.9 }
            ]
          },
          "nativeError": { "code": "CAMERA_DENIED", "message": "optional simulated error" }
        }
      ]
    }
  ]
}
```

## Strict validation
Import + readiness generation fail fast for:
- invalid exercise labels
- malformed base64
- invalid timestamps
- frame `expectedExercise` mismatch
- invalid native pose result shape

Missing captures are allowed only as explicit placeholders (`frames: []`) and will be marked blocked in readiness artifact.

## Completeness precheck (hard gate)
Readiness generation now requires all 10 exercises to have:
- non-placeholder `source`
- >=3 frames
- each frame with valid `nativePoseResult` containing >=4 landmarks

Run:
```bash
cd apps/mobile
node scripts/capture-pack-completeness.mjs fixtures/native-frame-bundles/atlas-captures.v1.json artifacts/atlas-completeness-report.v2.json artifacts/atlas-completeness-report.v1.json
node scripts/generate-native-readiness.mjs fixtures/native-frame-bundles/atlas-captures.v1.json artifacts/atlas.native-readiness.v1.json
```

## Completeness diagnostics artifact
Run:
```bash
cd apps/mobile
node scripts/capture-pack-completeness.mjs fixtures/native-frame-bundles/atlas-captures.v1.json artifacts/atlas-completeness-report.v1.json
```

Output: `artifacts/atlas-completeness-report.v1.json`

Per exercise fields:
- `present`
- `source_valid`
- `frame_count`
- `min_landmarks_ok`
- `gate_pass`
- `failure_reasons[]`

Aggregate metrics:
- `total_exercises`, `passed_exercises`, `blocked_exercises`, `coverage_ratio`
- `min_required_frames`, `min_required_landmarks`


### Provenance attestation requirements (v2 gate)
Each exercise capture must include deterministic provenance markers:
- `device_id` (non-placeholder string)
- `capture_ts` (finite positive timestamp)
- `collector_version` (semver, e.g. `v1.2.0`)

New per-exercise diagnostics in `atlas-completeness-report.v2.json`:
- `source_attested`
- `attestation_reasons[]`

Compatibility alias still emitted: `atlas-completeness-report.v1.json`.
