# CV Exercise Backlog

Implemented vertical slice:
- [x] squat
- [x] pushup
- [x] sit_to_stand
- [x] camera frame ingestion from `expo-camera`
- [x] landmark adapter + frame source interfaces (real-source only; no default mock)

Remaining exercises (next passes):
- [ ] plank (hold-quality scoring + shoulder/hip alignment)
- [ ] lunge
- [ ] step_up
- [ ] glute_bridge
- [ ] clamshell
- [ ] bird_dog
- [ ] dead_bug

Adapter integration backlog:
- [ ] Wire native on-device pose landmarks provider (MediaPipe/MLKit bridge)
- [ ] Add smoothing + occlusion handling
- [ ] Add per-exercise calibration phase
