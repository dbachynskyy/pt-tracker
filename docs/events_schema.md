# Events Schema

Analytics and audit events emitted by the PT Adherence app. All events are sent to the event pipeline (e.g., Segment → data warehouse). Backend events are also written to an `events` table for audit.

**Envelope (all events)**
```json
{
  "event":      "string",       // snake_case event name
  "userId":     "uuid|null",    // null for pre-auth events
  "sessionId":  "uuid|null",    // app session, not rehab session
  "timestamp":  "ISO8601",
  "platform":   "ios|android|web",
  "appVersion": "string",
  "properties": { }             // event-specific payload
}
```

---

## Auth Events

### `user_registered`
```json
{ "method": "email" }
```

### `user_logged_in`
```json
{ "method": "email" }
```

### `user_logged_out`
```json
{}
```

### `token_refreshed`
```json
{}
```

---

## Onboarding Events

### `onboarding_started`
```json
{}
```

### `onboarding_completed`
```json
{
  "injuryType": "string",
  "hasSurgeryDate": true,
  "constraintCount": 2
}
```

### `onboarding_dropped`
```json
{ "step": "injury_info|camera_permission|plan_review" }
```

### `camera_permission_granted`
```json
{}
```

### `camera_permission_denied`
```json
{}
```

---

## Plan Events

### `plan_viewed`
```json
{ "planId": "uuid", "exerciseCount": 6 }
```

### `exercise_detail_viewed`
```json
{ "exerciseId": "uuid", "exerciseName": "string" }
```

---

## Session Events

### `session_started`
```json
{ "rehabSessionId": "uuid", "scheduledExerciseCount": 6 }
```

### `exercise_started`
```json
{
  "rehabSessionId": "uuid",
  "exerciseId": "uuid",
  "exerciseName": "string",
  "targetSets": 3,
  "targetReps": 10
}
```

### `set_completed`
```json
{
  "rehabSessionId": "uuid",
  "exerciseId": "uuid",
  "setNumber": 1,
  "repsCompleted": 10,
  "formScore": 0.82       // 0.0–1.0
}
```

### `exercise_completed`
```json
{
  "rehabSessionId": "uuid",
  "exerciseId": "uuid",
  "setsCompleted": 3,
  "totalReps": 29,
  "avgFormScore": 0.80,
  "durationSeconds": 145
}
```

### `exercise_skipped`
```json
{
  "rehabSessionId": "uuid",
  "exerciseId": "uuid",
  "reason": "pain|tired|other|not_specified"
}
```

### `session_completed`
```json
{
  "rehabSessionId": "uuid",
  "exercisesCompleted": 5,
  "exercisesScheduled": 6,
  "completionRate": 0.83,
  "durationSeconds": 1240,
  "newStreak": 5
}
```

### `session_abandoned`
```json
{
  "rehabSessionId": "uuid",
  "exercisesCompleted": 2,
  "exercisesScheduled": 6,
  "durationSeconds": 420
}
```

---

## Form Feedback Events

### `form_feedback_shown`
```json
{
  "exerciseId": "uuid",
  "feedbackType": "posture_deviation|rep_count_mismatch|good_form",
  "formScore": 0.55
}
```

### `form_feedback_dismissed`
```json
{ "exerciseId": "uuid", "feedbackType": "string" }
```

---

## Dashboard Events

### `dashboard_viewed`
```json
{
  "currentStreak": 5,
  "weeklyCompletionRate": 0.71
}
```

### `weekly_summary_viewed`
```json
{ "weekOf": "YYYY-MM-DD", "completionRate": 0.71 }
```

### `weekly_summary_exported`
```json
{ "weekOf": "YYYY-MM-DD", "method": "email|download" }
```

---

## Error Events

### `api_error`
```json
{
  "endpoint": "string",
  "statusCode": 500,
  "errorCode": "string"
}
```

### `form_detection_failed`
```json
{ "exerciseId": "uuid", "reason": "low_light|occlusion|model_error" }
```

---

## Key Metrics Derivable from Events

| Metric | Events Used |
|---|---|
| D7/D30 retention | `user_logged_in` distinct users |
| Weekly completion rate | `session_completed.completionRate` |
| Onboarding funnel drop-off | `onboarding_started` → `onboarding_completed` |
| Camera adoption | `camera_permission_granted` / `user_registered` |
| Avg form score | `exercise_completed.avgFormScore` |
| Exercise skip reasons | `exercise_skipped.reason` |
