#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

ATLAS_DIR="${ATLAS_DIR:-/tmp/pt-atlas}"
HELIOS_DIR="${HELIOS_DIR:-/tmp/pt-helios}"
ATLAS_READINESS_FILE="${ATLAS_READINESS_FILE:-$ROOT_DIR/schemas/cv/native-readiness.atlas.fixture.json}"
HELIOS_READINESS_FILE="${HELIOS_READINESS_FILE:-$ROOT_DIR/schemas/cv/native-readiness.helios.fixture.json}"

node "$SCRIPT_DIR/run-cross-repo-cv-regression-harness.js" \
  --mode live \
  --strict-gate \
  --atlas-dir "$ATLAS_DIR" \
  --helios-dir "$HELIOS_DIR" \
  --atlas-readiness-file "$ATLAS_READINESS_FILE" \
  --helios-readiness-file "$HELIOS_READINESS_FILE" \
  --out "$ROOT_DIR/artifacts/cross-repo-cv-regression.json" \
  --out-md "$ROOT_DIR/artifacts/cross-repo-cv-regression.md" \
  --out-summary "$ROOT_DIR/artifacts/cross-repo-cv-regression-summary.json" \
  --out-summary-md "$ROOT_DIR/artifacts/cross-repo-cv-regression-summary.md" \
  --previous-summary "$ROOT_DIR/artifacts/cross-repo-cv-regression-summary.json" || true

node "$SCRIPT_DIR/write-realcv-rollout-status.js" \
  "$ROOT_DIR/artifacts/cross-repo-cv-regression-summary.json" \
  "$ROOT_DIR/artifacts/realcv-rollout-status.json"

# enforce gate exit after status artifact creation
node -e '
  const fs=require("fs");
  const s=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
  if (s.strictGateStatus && ["PASS"].includes(s.strictGateStatus)) process.exit(0);
  process.exit(1);
' "$ROOT_DIR/artifacts/cross-repo-cv-regression-summary.json"
