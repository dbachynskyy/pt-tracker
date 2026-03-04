#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

ATLAS_V2_READINESS_FILE="${ATLAS_V2_READINESS_FILE:-$ROOT_DIR/schemas/cv/native-readiness.atlas.fixture.json}"
HELIOS_SUMMARY_FILE="${HELIOS_SUMMARY_FILE:-$ROOT_DIR/artifacts/cross-repo-cv-regression-summary.json}"
ORION_LANES_FILE="${ORION_LANES_FILE:-$ROOT_DIR/artifacts/realcv-lanes-status.v1.json}"
ATLAS_PROVENANCE_ATTESTATION_FILE="${ATLAS_PROVENANCE_ATTESTATION_FILE:-$ROOT_DIR/schemas/cv/atlas.provenance-attestation.fixture.json}"
HELIOS_STABILITY_SUMMARY_FILE="${HELIOS_STABILITY_SUMMARY_FILE:-$ROOT_DIR/schemas/cv/helios.stability-summary.fixture.json}"

# Backward-compatible v1 artifact
node "$SCRIPT_DIR/build-realcv-release-readiness.js" \
  --version v1 \
  --atlas "$ATLAS_V2_READINESS_FILE" \
  --helios "$HELIOS_SUMMARY_FILE" \
  --orion "$ORION_LANES_FILE" \
  --out "$ROOT_DIR/artifacts/realcv-release-readiness.v1.json" || true

# New v2 artifact with attestation + stability inputs
node "$SCRIPT_DIR/build-realcv-release-readiness.js" \
  --version v2 \
  --atlas "$ATLAS_V2_READINESS_FILE" \
  --helios "$HELIOS_SUMMARY_FILE" \
  --orion "$ORION_LANES_FILE" \
  --atlas-attestation "$ATLAS_PROVENANCE_ATTESTATION_FILE" \
  --helios-stability "$HELIOS_STABILITY_SUMMARY_FILE" \
  --out "$ROOT_DIR/artifacts/realcv-release-readiness.v2.json"
