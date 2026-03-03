#!/usr/bin/env bash
# PT Adherence — API smoke test
#
# Exercises the critical API routes end-to-end using curl + jq.
# Creates a temporary smoke-test user, runs through the session flow, then exits.
#
# Usage:
#   bash scripts/smoke-test.sh
#   API_BASE_URL=https://staging.ptadherence.app/v1 bash scripts/smoke-test.sh
#
# Environment:
#   API_BASE_URL   Base URL including /v1 (default: http://localhost:3000/v1)
#   SMOKE_PASSWORD Password for the generated smoke-test user (default: SmokeTest1!)
#
# Exit codes:
#   0  all checks passed
#   1  one or more checks failed

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BASE_URL="${API_BASE_URL:-http://localhost:3000/v1}"
SMOKE_PASSWORD="${SMOKE_PASSWORD:-SmokeTest1!}"
# Use a timestamped email so each run is idempotent on a fresh server
SMOKE_EMAIL="smoke-$$-$(date +%s)@test.ptadherence.internal"
TODAY="$(date +%Y-%m-%d)"
WEEK_OF="$(date -v-Mon +%Y-%m-%d 2>/dev/null || date -d 'last monday' +%Y-%m-%d 2>/dev/null || echo "$TODAY")"

PASS=0
FAIL=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
check_dep() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: $1 is required. Install with: brew install $1"
    exit 1
  }
}

# check <label> <expected_status> <actual_status>
check() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    printf "  PASS  %-50s (HTTP %s)\n" "$label" "$actual"
    ((PASS++)) || true
  else
    printf "  FAIL  %-50s (expected %s, got %s)\n" "$label" "$expected" "$actual"
    ((FAIL++)) || true
  fi
}

# HTTP call: http <METHOD> <path> [body_json] [extra_curl_args...]
# Returns the HTTP status code; response body is written to $RESP
RESP=""
http() {
  local method="$1" path="$2"
  local body="${3:-}"
  shift; shift; shift 2>/dev/null || true

  local curl_args=(-s -w '\n%{http_code}' -X "$method" "${BASE_URL}${path}")
  curl_args+=(-H 'Content-Type: application/json')

  [[ -n "$body" ]] && curl_args+=(-d "$body")
  [[ -n "${TOKEN:-}" ]] && curl_args+=(-H "Authorization: Bearer $TOKEN")

  local raw
  raw="$(curl "${curl_args[@]}")"
  local status="${raw##*$'\n'}"
  RESP="${raw%$'\n'*}"
  echo "$status"
}

jq_get() { echo "$RESP" | jq -r "$1" 2>/dev/null || echo ""; }

# ---------------------------------------------------------------------------
# Pre-flight
# ---------------------------------------------------------------------------
check_dep curl
check_dep jq

echo ""
echo "PT Adherence smoke test"
echo "  Target : $BASE_URL"
echo "  Date   : $TODAY"
echo ""

# ---------------------------------------------------------------------------
# 1. Health
# ---------------------------------------------------------------------------
echo "=== [1/7] Health ==="
status="$(http GET /health)"
check "GET /health" "200" "$status"

# ---------------------------------------------------------------------------
# 2. Auth — register
# ---------------------------------------------------------------------------
echo ""
echo "=== [2/7] Auth ==="

body="{\"email\":\"$SMOKE_EMAIL\",\"password\":\"$SMOKE_PASSWORD\",\"name\":\"Smoke Test\"}"
status="$(http POST /auth/register "$body")"
check "POST /auth/register" "201" "$status"

TOKEN="$(jq_get '.token')"
REFRESH_TOKEN="$(jq_get '.refreshToken')"
USER_ID="$(jq_get '.user.id')"

if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
  echo "  ERROR: no token in register response — aborting"
  echo "$RESP" | jq . 2>/dev/null || echo "$RESP"
  exit 1
fi

# Login
status="$(http POST /auth/login "{\"email\":\"$SMOKE_EMAIL\",\"password\":\"$SMOKE_PASSWORD\"}")"
check "POST /auth/login" "200" "$status"

# Refresh
status="$(http POST /auth/refresh "{\"refreshToken\":\"$REFRESH_TOKEN\"}")"
check "POST /auth/refresh" "200" "$status"
# Update token to freshest one
NEW_TOKEN="$(jq_get '.token')"
[[ -n "$NEW_TOKEN" && "$NEW_TOKEN" != "null" ]] && TOKEN="$NEW_TOKEN"

# ---------------------------------------------------------------------------
# 3. Onboarding — set profile
# ---------------------------------------------------------------------------
echo ""
echo "=== [3/7] Onboarding ==="

body="{\"injuryType\":\"ACL\",\"surgeryDate\":\"2025-11-15\",\"constraints\":[\"no_impact\"]}"
status="$(http PUT "/users/${USER_ID}/profile" "$body")"
check "PUT /users/{userId}/profile" "200" "$status"

# ---------------------------------------------------------------------------
# 4. Plan
# ---------------------------------------------------------------------------
echo ""
echo "=== [4/7] Plan ==="

status="$(http GET "/users/${USER_ID}/plan")"
# 200 if plan assigned, 404 with PLAN_NOT_ASSIGNED is also acceptable in smoke env
if [[ "$status" == "200" ]]; then
  check "GET /users/{userId}/plan" "200" "$status"
elif [[ "$status" == "404" ]]; then
  ERR_CODE="$(jq_get '.error.code')"
  if [[ "$ERR_CODE" == "PLAN_NOT_ASSIGNED" ]]; then
    printf "  SKIP  %-50s (no plan assigned in smoke env)\n" "GET /users/{userId}/plan"
  else
    check "GET /users/{userId}/plan" "200" "$status"
  fi
else
  check "GET /users/{userId}/plan" "200" "$status"
fi

status="$(http GET "/users/${USER_ID}/plan/today")"
if [[ "$status" == "200" || "$status" == "404" ]]; then
  if [[ "$status" == "200" ]]; then
    check "GET /users/{userId}/plan/today" "200" "$status"
  else
    printf "  SKIP  %-50s (no plan assigned in smoke env)\n" "GET /users/{userId}/plan/today"
  fi
else
  check "GET /users/{userId}/plan/today" "200" "$status"
fi

# ---------------------------------------------------------------------------
# 5. Session flow
# ---------------------------------------------------------------------------
echo ""
echo "=== [5/7] Session ==="

# Start session
body="{\"userId\":\"$USER_ID\",\"date\":\"$TODAY\"}"
status="$(http POST /sessions "$body")"
check "POST /sessions" "201" "$status"

SESSION_ID="$(jq_get '.sessionId')"
if [[ -z "$SESSION_ID" || "$SESSION_ID" == "null" ]]; then
  echo "  ERROR: no sessionId — skipping exercise log and complete"
  ((FAIL++)) || true
else
  # Log a placeholder exercise (use a fixed UUID stub for smoke)
  EXERCISE_ID="00000000-0000-0000-0000-000000000001"
  body="{\"setsCompleted\":3,\"repsPerSet\":[10,10,9],\"formScore\":0.82,\"durationSeconds\":145}"
  status="$(http PATCH "/sessions/${SESSION_ID}/exercises/${EXERCISE_ID}" "$body")"
  # 200 expected; 404 is acceptable if server validates exerciseId against plan
  if [[ "$status" == "200" ]]; then
    check "PATCH /sessions/{id}/exercises/{id}" "200" "$status"
  elif [[ "$status" == "404" ]]; then
    printf "  SKIP  %-50s (exercise not in plan — expected in smoke env)\n" "PATCH /sessions/{id}/exercises/{id}"
  else
    check "PATCH /sessions/{id}/exercises/{id}" "200" "$status"
  fi

  # Complete session
  status="$(http POST "/sessions/${SESSION_ID}/complete")"
  check "POST /sessions/{id}/complete" "200" "$status"

  # Second complete → should be 400 SESSION_ALREADY_COMPLETE
  status="$(http POST "/sessions/${SESSION_ID}/complete")"
  check "POST /sessions/{id}/complete (idempotency)" "400" "$status"
  ERR_CODE="$(jq_get '.error.code')"
  if [[ "$ERR_CODE" != "SESSION_ALREADY_COMPLETE" ]]; then
    printf "  WARN  idempotency error.code expected SESSION_ALREADY_COMPLETE, got %s\n" "$ERR_CODE"
  fi
fi

# ---------------------------------------------------------------------------
# 6. Adherence dashboard
# ---------------------------------------------------------------------------
echo ""
echo "=== [6/7] Dashboard ==="

status="$(http GET "/users/${USER_ID}/adherence?from=${TODAY}&to=${TODAY}")"
check "GET /users/{userId}/adherence" "200" "$status"

# ---------------------------------------------------------------------------
# 7. Weekly summary
# ---------------------------------------------------------------------------
echo ""
echo "=== [7/7] Weekly Summary ==="

status="$(http GET "/users/${USER_ID}/summary/${WEEK_OF}")"
# 200 or 404 (summary not yet generated) both acceptable
if [[ "$status" == "200" ]]; then
  check "GET /users/{userId}/summary/{weekOf}" "200" "$status"
elif [[ "$status" == "404" ]]; then
  printf "  SKIP  %-50s (summary not yet generated)\n" "GET /users/{userId}/summary/{weekOf}"
else
  check "GET /users/{userId}/summary/{weekOf}" "200" "$status"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "================================"
printf "  PASS: %d   FAIL: %d\n" "$PASS" "$FAIL"
echo "================================"

if [[ "$FAIL" -gt 0 ]]; then
  echo "SMOKE TEST FAILED"
  exit 1
else
  echo "SMOKE TEST PASSED"
  exit 0
fi
