# CV Exercise Backlog

Implemented and routed in detector:
- [x] squat
- [x] pushup
- [x] sit_to_stand
- [x] plank
- [x] lunge
- [x] glute_bridge
- [x] knee_extension
- [x] heel_raise
- [x] calf_raise
- [x] shoulder_abduction

Infra:
- [x] camera frame ingestion from `expo-camera`
- [x] landmark adapter + frame source interfaces (real-source only; no default mock)
- [x] selector wired to all supported exercises

Remaining integration:
- [ ] native on-device pose landmarks provider (MediaPipe/MLKit bridge)
- [ ] smoothing + occlusion handling
- [ ] per-exercise calibration phase
