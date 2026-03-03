#!/usr/bin/env bash
# check-real-cv-default.sh
#
# QA/operator gate: block release checks if Helios defaults to mock/simulated CV mode.
#
# Usage:
#   HELIOS_DIR=/path/to/pt-helios bash scripts/check-real-cv-default.sh
#   bash scripts/check-real-cv-default.sh /path/to/pt-helios
#
# Exit codes:
#   0  PASS (real CV required by default)
#   1  FAIL (mock/sim mode appears enabled by default)
#   2  ERROR (missing repo/path)

set -euo pipefail

HELIOS_DIR="${1:-${HELIOS_DIR:-pt-helios}}"
MOBILE_DIR="$HELIOS_DIR/apps/mobile"
SESSION_SCREEN="$MOBILE_DIR/src/screens/SessionScreen.tsx"

if [[ ! -d "$MOBILE_DIR" ]]; then
  echo "ERROR: Helios mobile app not found at: $MOBILE_DIR"
  echo "Set HELIOS_DIR or pass the repo path as arg 1."
  exit 2
fi

if [[ ! -f "$SESSION_SCREEN" ]]; then
  echo "ERROR: Expected CV session screen not found: $SESSION_SCREEN"
  exit 2
fi

# Hard gate 1: explicit UI default toggle must be OFF.
if grep -nE 'mockMode[^\n]*useState\(\s*true\s*\)' "$SESSION_SCREEN" >/dev/null; then
  echo "FAIL: mock CV mode is enabled by default in SessionScreen.tsx"
  grep -nE 'mockMode[^\n]*useState\(\s*true\s*\)' "$SESSION_SCREEN" || true
  exit 1
fi

# Hard gate 2: catch common config defaults that fall back to mock/simulation mode.
# Exclude test/mock-only files to avoid false positives from fixtures.
MATCHES="$(grep -RInE \
  "EXPO_PUBLIC_(CV|POSE)_(MODE|SOURCE).*\?\?\s*['\"](mock|sim|simulation)['\"]|CV_(MODE|SOURCE).*\?\?\s*['\"](mock|sim|simulation)['\"]|default.*(mock|sim|simulation)" \
  "$MOBILE_DIR" \
  --exclude-dir='__tests__' \
  --exclude-dir='__mocks__' \
  --exclude='*.test.ts' \
  --exclude='*.spec.ts' \
  --exclude='mockSimulation.ts' \
  || true)"

if [[ -n "$MATCHES" ]]; then
  echo "FAIL: mock/simulation appears to be defaulted in production CV config."
  echo "$MATCHES"
  exit 1
fi

echo "PASS: real CV mode required by default (no mock/simulation defaults detected)."
