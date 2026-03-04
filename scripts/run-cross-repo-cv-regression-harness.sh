#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MODE="${1:-fixtures}" # fixtures|live|auto
STRICT_FLAG="${2:-}"   # --strict-gate optional
PREVIOUS_SUMMARY_PATH="${PREVIOUS_SUMMARY_PATH:-$ROOT_DIR/artifacts/cross-repo-cv-regression-summary.json}"

echo "Cross-repo CV regression harness (mode=$MODE ${STRICT_FLAG})"
node "$SCRIPT_DIR/run-cross-repo-cv-regression-harness.js" \
  --mode "$MODE" \
  ${STRICT_FLAG:+$STRICT_FLAG} \
  --atlas-dir "${ATLAS_DIR:-/tmp/pt-atlas}" \
  --helios-dir "${HELIOS_DIR:-/tmp/pt-helios}" \
  --out "$ROOT_DIR/artifacts/cross-repo-cv-regression.json" \
  --out-md "$ROOT_DIR/artifacts/cross-repo-cv-regression.md" \
  --out-summary "$ROOT_DIR/artifacts/cross-repo-cv-regression-summary.json" \
  --out-summary-md "$ROOT_DIR/artifacts/cross-repo-cv-regression-summary.md" \
  --previous-summary "$PREVIOUS_SUMMARY_PATH" \
  --atlas-readiness-file "${ATLAS_READINESS_FILE:-}" \
  --helios-readiness-file "${HELIOS_READINESS_FILE:-}"

echo "Done. See artifacts/cross-repo-cv-regression{,-summary}.{json,md}"
