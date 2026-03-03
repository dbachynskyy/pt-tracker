# API Contract

**Base URL:** `https://api.ptadherence.app/v1`
**Auth:** Bearer JWT in `Authorization` header. Refresh via `/auth/refresh`.
**Content-Type:** `application/json`
**Errors:** `{ "error": { "code": string, "message": string } }`

---

## Auth

### POST /auth/register
```json
// Request
{ "email": "string", "password": "string", "name": "string" }

// Response 201
{ "user": { "id": "uuid", "email": "string", "name": "string" }, "token": "string", "refreshToken": "string" }
```

### POST /auth/login
```json
// Request
{ "email": "string", "password": "string" }

// Response 200
{ "token": "string", "refreshToken": "string", "user": { "id": "uuid", "email": "string" } }
```

### POST /auth/refresh
```json
// Request
{ "refreshToken": "string" }

// Response 200
{ "token": "string", "refreshToken": "string" }
```

---

## Onboarding

### PUT /users/{userId}/profile
```json
// Request
{
  "injuryType": "string",        // e.g. "ACL", "rotator_cuff"
  "surgeryDate": "YYYY-MM-DD",   // optional
  "constraints": ["string"]      // e.g. ["no_impact", "limited_range"]
}

// Response 200
{ "profile": { "userId": "uuid", "injuryType": "string", "surgeryDate": "string|null", "constraints": ["string"] } }
```

---

## Rehab Plan

### GET /users/{userId}/plan
```json
// Response 200
{
  "plan": {
    "id": "uuid",
    "name": "string",
    "createdAt": "ISO8601",
    "exercises": [
      {
        "id": "uuid",
        "name": "string",
        "sets": 3,
        "reps": 10,
        "restSeconds": 30,
        "videoUrl": "string",   // instructional clip
        "instructions": "string"
      }
    ]
  }
}
```

### GET /users/{userId}/plan/today
Returns today's scheduled exercises with completion status.
```json
// Response 200
{
  "date": "YYYY-MM-DD",
  "exercises": [
    {
      "exerciseId": "uuid",
      "name": "string",
      "sets": 3,
      "reps": 10,
      "completedSets": 1,
      "status": "pending|in_progress|complete"
    }
  ]
}
```

---

## Sessions

### POST /sessions
Start a new session.
```json
// Request
{ "userId": "uuid", "date": "YYYY-MM-DD" }

// Response 201
{ "sessionId": "uuid", "startedAt": "ISO8601" }
```

### PATCH /sessions/{sessionId}/exercises/{exerciseId}
Log completion of a set or exercise.
```json
// Request
{
  "setsCompleted": 3,
  "repsPerSet": [10, 10, 9],
  "formScore": 0.82,            // 0.0–1.0, from on-device model
  "durationSeconds": 145
}

// Response 200
{ "logged": true, "streak": { "current": 5, "longest": 12 } }
```

### POST /sessions/{sessionId}/complete
Mark session done.
```json
// Response 200
{ "completionRate": 0.9, "sessionId": "uuid", "completedAt": "ISO8601" }
```

---

## Adherence & Dashboard

### GET /users/{userId}/adherence
```json
// Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD

// Response 200
{
  "weeklyCompletionRate": 0.71,
  "currentStreak": 5,
  "longestStreak": 12,
  "dailySummary": [
    { "date": "YYYY-MM-DD", "completionRate": 0.9, "sessionId": "uuid|null" }
  ]
}
```

---

## Weekly Summary

### GET /users/{userId}/summary/{weekOf}
`weekOf` = Monday date (`YYYY-MM-DD`).
```json
// Response 200
{
  "weekOf": "YYYY-MM-DD",
  "completionRate": 0.71,
  "exercisesCompleted": 18,
  "exercisesScheduled": 25,
  "avgFormScore": 0.78,
  "missedDays": [{ "date": "YYYY-MM-DD" }],
  "pdfUrl": "string"   // pre-signed S3 URL, expires 24h
}
```

### POST /users/{userId}/summary/{weekOf}/send
Triggers email delivery of summary to patient + PT on file.
```json
// Response 202
{ "queued": true }
```

---

## Error Codes

| Code | Meaning |
|---|---|
| `AUTH_INVALID` | Bad credentials or expired token |
| `NOT_FOUND` | Resource does not exist |
| `VALIDATION_ERROR` | Request body invalid |
| `PLAN_NOT_ASSIGNED` | User has no active plan |
| `SESSION_ALREADY_COMPLETE` | Session already closed |
| `RATE_LIMITED` | Too many requests (429) |
