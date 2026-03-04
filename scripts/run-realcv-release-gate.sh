#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

ATLAS_V2_READINESS_FILE="${ATLAS_V2_READINESS_FILE:-$ROOT_DIR/schemas/cv/native-readiness.atlas.fixture.json}"
HELIOS_SUMMARY_FILE="${HELIOS_SUMMARY_FILE:-$ROOT_DIR/artifacts/cross-repo-cv-regression-summary.json}"
ORION_LANES_FILE="${ORION_LANES_FILE:-$ROOT_DIR/artifacts/realcv-lanes-status.v1.json}"
ORION_SUMMARY_FILE="${ORION_SUMMARY_FILE:-$ROOT_DIR/artifacts/cross-repo-cv-regression-summary.json}"
ATLAS_PROVENANCE_ATTESTATION_FILE="${ATLAS_PROVENANCE_ATTESTATION_FILE:-$ROOT_DIR/schemas/cv/atlas.provenance-attestation.fixture.json}"
HELIOS_STABILITY_SUMMARY_FILE="${HELIOS_STABILITY_SUMMARY_FILE:-$ROOT_DIR/schemas/cv/helios.stability-summary.fixture.json}"
EX10_STATUS_FILE="$ROOT_DIR/artifacts/realcv-10ex-status.v1.json"

# Build per-exercise status contract first (mandatory for v2)
node "$SCRIPT_DIR/build-realcv-10ex-status.js" \
  "$ATLAS_V2_READINESS_FILE" \
  "$HELIOS_SUMMARY_FILE" \
  "$ORION_SUMMARY_FILE" \
  "$EX10_STATUS_FILE" || true


# Build summary artifacts + deterministic CI lines
node "$SCRIPT_DIR/build-realcv-10ex-summary.js"   "$EX10_STATUS_FILE"   "$ROOT_DIR/artifacts/realcv-10ex-summary.v1.json"   "$ROOT_DIR/artifacts/realcv-10ex-summary.md" || true

# Hard-fail on any red exercise unless ALLOW_PARTIAL_REALCV=1
node -e '
  const fs=require("fs");
  const p=process.argv[1];
  const allow=process.env.ALLOW_PARTIAL_REALCV==="1";
  const s=JSON.parse(fs.readFileSync(p,"utf8"));
  if (!allow && s.blocker_count>0) process.exit(1);
  process.exit(0);
' "$ROOT_DIR/artifacts/realcv-10ex-summary.v1.json"

# Backward-compatible v1 artifact
node "$SCRIPT_DIR/build-realcv-release-readiness.js" \
  --version v1 \
  --atlas "$ATLAS_V2_READINESS_FILE" \
  --helios "$HELIOS_SUMMARY_FILE" \
  --orion "$ORION_LANES_FILE" \
  --out "$ROOT_DIR/artifacts/realcv-release-readiness.v1.json" || true

# New v2 artifact with attestation + stability inputs + ex10 status contract
node "$SCRIPT_DIR/build-realcv-release-readiness.js" \
  --version v2 \
  --atlas "$ATLAS_V2_READINESS_FILE" \
  --helios "$HELIOS_SUMMARY_FILE" \
  --orion "$ORION_LANES_FILE" \
  --atlas-attestation "$ATLAS_PROVENANCE_ATTESTATION_FILE" \
  --helios-stability "$HELIOS_STABILITY_SUMMARY_FILE" \
  --ex10-status "$EX10_STATUS_FILE" \
  --out "$ROOT_DIR/artifacts/realcv-release-readiness.v2.json"
