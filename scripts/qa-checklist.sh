#!/usr/bin/env bash
# PT Adherence — interactive go/no-go QA checklist
#
# Walks through the 7 P0 launch criteria (G-01 … G-07).
# Records pass/fail/skip interactively, then prints a signed-off report.
# Launch is BLOCKED if any P0 criterion is marked FAIL.
#
# Usage:
#   bash scripts/qa-checklist.sh
#   bash scripts/qa-checklist.sh --non-interactive   # print criteria and exit 0
#
# Exit codes:
#   0  all P0 criteria passed (or --non-interactive)
#   1  one or more P0 criteria FAILED
#   2  one or more P0 criteria SKIPPED (no FAILs)

set -euo pipefail

NON_INTERACTIVE=false
[[ "${1:-}" == "--non-interactive" ]] && NON_INTERACTIVE=true

# ---------------------------------------------------------------------------
# Criteria: "ID|PRIORITY|description|how_to_verify"
# ---------------------------------------------------------------------------
CRITERIA=(
  "G-01|P0|Session logging end-to-end works on iOS and Android|bash scripts/smoke-test.sh"
  "G-02|P0|Rehab plan renders correctly for all template plans|Confirm plan fixture in smoke test returns all required fields"
  "G-03|P0|No P0/P1 open bugs in production build|gh issue list --label p0,p1 --state open --json number | jq 'length == 0'"
  "G-04|P0|Load test passed at 500 concurrent users|k6 run load-tests/session-flow.js --vus 500 --duration 60s"
  "G-05|P0|PHI scrub audit passed — no patient data in logs or events|grep -rE 'injuryType|surgeryDate|email' logs/ | grep -v '.example.' && echo FOUND PHI || echo CLEAN"
  "G-06|P0|App store builds approved (TestFlight + Play Internal Track)|Check App Store Connect + Google Play Console manually"
  "G-07|P0|On-call runbook and PagerDuty alerts live|Trigger PagerDuty test alert and confirm acknowledgement"
)

PASS=0
FAIL=0
SKIP=0
declare -A RESULTS

# ---------------------------------------------------------------------------
# Non-interactive mode: just print and exit
# ---------------------------------------------------------------------------
if $NON_INTERACTIVE; then
  echo ""
  echo "PT Adherence — Go/No-Go Criteria"
  echo ""
  printf "  %-5s  %-4s  %s\n" "ID" "PRI" "Description"
  printf "  %-5s  %-4s  %s\n" "-----" "----" "-----------"
  for criterion in "${CRITERIA[@]}"; do
    IFS="|" read -r id priority description verify <<< "$criterion"
    printf "  %-5s  %-4s  %s\n" "$id" "$priority" "$description"
    printf "         verify: %s\n" "$verify"
    echo ""
  done
  exit 0
fi

# ---------------------------------------------------------------------------
# Interactive mode
# ---------------------------------------------------------------------------
echo ""
echo "========================================"
echo "  PT Adherence — Go/No-Go QA Checklist"
echo "========================================"
echo ""
echo "  Enter p=PASS  f=FAIL  s=SKIP  then Return"
echo ""

for criterion in "${CRITERIA[@]}"; do
  IFS="|" read -r id priority description verify <<< "$criterion"

  echo "  ──────────────────────────────────────────"
  echo "  $id [$priority]  $description"
  echo "  Verify: $verify"
  echo ""

  result=""
  while true; do
    read -r -p "  Result [p/f/s]: " result < /dev/tty
    result="${result,,}"   # lowercase
    case "$result" in
      p|pass)  result="PASS"; break ;;
      f|fail)  result="FAIL"; break ;;
      s|skip)  result="SKIP"; break ;;
      *)       echo "  Please enter p, f, or s" ;;
    esac
  done

  case "$result" in
    PASS)
      echo "  ✓ PASS"
      ((PASS++)) || true
      ;;
    FAIL)
      echo "  ✗ FAIL — launch BLOCKED"
      ((FAIL++)) || true
      ;;
    SKIP)
      echo "  — SKIP"
      ((SKIP++)) || true
      ;;
  esac

  RESULTS["$id"]="$result"
  echo ""
done

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
TIMESTAMP="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

echo "========================================"
echo "  QA Summary — $TIMESTAMP"
echo "========================================"
echo ""
for criterion in "${CRITERIA[@]}"; do
  IFS="|" read -r id priority description verify <<< "$criterion"
  result="${RESULTS[$id]:-SKIP}"
  case "$result" in
    PASS) symbol="✓" ;;
    FAIL) symbol="✗" ;;
    *)    symbol="-" ;;
  esac
  printf "  %s  %-5s  %s\n" "$symbol" "$id" "$description"
done

echo ""
printf "  PASS: %d   FAIL: %d   SKIP: %d\n" "$PASS" "$FAIL" "$SKIP"
echo ""

if [[ "$FAIL" -gt 0 ]]; then
  echo "  LAUNCH BLOCKED — $FAIL P0 criteria failed"
  echo ""
  exit 1
elif [[ "$SKIP" -gt 0 ]]; then
  echo "  WARNING — $SKIP criteria not yet verified; do not ship until all are PASS"
  echo ""
  exit 2
else
  echo "  ALL P0 CRITERIA PASS — launch approved"
  echo ""
  exit 0
fi
