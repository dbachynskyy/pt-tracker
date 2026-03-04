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
