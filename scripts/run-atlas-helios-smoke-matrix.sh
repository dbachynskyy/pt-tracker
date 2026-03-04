#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MODE="${1:-fixtures}"   # fixtures|live|auto

echo "Atlas+Helios smoke matrix (mode=$MODE)"

node "$SCRIPT_DIR/check-atlas-helios-exercise-parity.js" \
  --mode "$MODE" \
  --atlas-dir "${ATLAS_DIR:-/tmp/pt-atlas}" \
  --helios-dir "${HELIOS_DIR:-/tmp/pt-helios}" \
  --out "$ROOT_DIR/artifacts/atlas-helios-parity.json" \
  --out-md "$ROOT_DIR/artifacts/atlas-helios-parity.md"

echo "Done. See artifacts/atlas-helios-parity.{json,md}"
