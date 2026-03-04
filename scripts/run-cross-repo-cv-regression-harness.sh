#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MODE="${1:-fixtures}" # fixtures|live|auto

echo "Cross-repo CV regression harness (mode=$MODE)"
node "$SCRIPT_DIR/run-cross-repo-cv-regression-harness.js" \
  --mode "$MODE" \
  --atlas-dir "${ATLAS_DIR:-/tmp/pt-atlas}" \
  --helios-dir "${HELIOS_DIR:-/tmp/pt-helios}" \
  --out "$ROOT_DIR/artifacts/cross-repo-cv-regression.json" \
  --out-md "$ROOT_DIR/artifacts/cross-repo-cv-regression.md"

echo "Done. See artifacts/cross-repo-cv-regression.{json,md}"
