#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

ATLAS_V2_READINESS_FILE="${ATLAS_V2_READINESS_FILE:-$ROOT_DIR/schemas/cv/native-readiness.atlas.fixture.json}"
HELIOS_SUMMARY_FILE="${HELIOS_SUMMARY_FILE:-$ROOT_DIR/artifacts/cross-repo-cv-regression-summary.json}"
ORION_LANES_FILE="${ORION_LANES_FILE:-$ROOT_DIR/artifacts/realcv-lanes-status.v1.json}"

node "$SCRIPT_DIR/build-realcv-release-readiness.js" \
  "$ATLAS_V2_READINESS_FILE" \
  "$HELIOS_SUMMARY_FILE" \
  "$ORION_LANES_FILE" \
  "$ROOT_DIR/artifacts/realcv-release-readiness.v1.json"
