# Native Frame Bundle Schema (`atlas.native.capture.v1`)

Each bundle contains exercise-labeled replay frames for fallback native readiness validation.

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
          "base64": "...jpeg/png bytes...",
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

Notes:
- `nativePoseResult` and `nativeError` are optional replay controls for deterministic contract testing.
- For missing captures, leave `frames: []`; readiness artifact will mark `blocked` with `missing_capture_frames`.
