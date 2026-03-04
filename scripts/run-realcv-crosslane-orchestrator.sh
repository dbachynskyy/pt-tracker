#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

ATLAS_READINESS_FILE="${ATLAS_READINESS_FILE:-$ROOT_DIR/schemas/cv/native-readiness.atlas.fixture.json}"
HELIOS_READINESS_FILE="${HELIOS_READINESS_FILE:-$ROOT_DIR/schemas/cv/native-readiness.helios.fixture.json}"
ATLAS_DIR="${ATLAS_DIR:-/tmp/pt-atlas}"
HELIOS_DIR="${HELIOS_DIR:-/tmp/pt-helios}"

ATLAS_DIR="$ATLAS_DIR" HELIOS_DIR="$HELIOS_DIR" \
ATLAS_READINESS_FILE="$ATLAS_READINESS_FILE" HELIOS_READINESS_FILE="$HELIOS_READINESS_FILE" \
ATLAS_MASTER_READINESS_FILE="$ATLAS_READINESS_FILE" HELIOS_MASTER_READINESS_FILE="$HELIOS_READINESS_FILE" \
bash "$SCRIPT_DIR/run-realcv-rollout-gate.sh" || true

node "$SCRIPT_DIR/write-realcv-crosslane-status.js" \
  "$ATLAS_READINESS_FILE" \
  "$HELIOS_READINESS_FILE" \
  "$ROOT_DIR/artifacts/realcv-rollout-status.json" \
  "$ROOT_DIR/artifacts/realcv-master-readiness.json" \
  "$ROOT_DIR/artifacts/realcv-crosslane-status.json" || true

node -e '
  const fs=require("fs");
  const s=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
  const blocked=Object.entries(s.lane_status||{}).filter(([,v])=>v==="BLOCKED");
  console.log(`REALCV_CROSSLANE lanes=${JSON.stringify(s.lane_status)} blockers=${(s.blockers||[]).length}`);
  process.exit(blocked.length?1:0);
' "$ROOT_DIR/artifacts/realcv-crosslane-status.json"
