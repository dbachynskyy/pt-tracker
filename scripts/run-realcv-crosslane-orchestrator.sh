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
  "$ROOT_DIR/artifacts/realcv-lanes-status.v1.json" || true

cp "$ROOT_DIR/artifacts/realcv-lanes-status.v1.json" "$ROOT_DIR/artifacts/realcv-crosslane-status.json"

node -e '
  const fs=require("fs");
  const c=fs.readFileSync(process.argv[1]);
  const a=fs.readFileSync(process.argv[2]);
  if (!c.equals(a)) {
    console.error("ERROR: canonical and alias lane artifacts differ");
    process.exit(1);
  }
  const s=JSON.parse(c.toString("utf8"));
  const blocked=Object.entries(s.lane_status||{}).filter(([,v])=>v==="BLOCKED");
  console.log(`REALCV_CROSSLANE lanes=${JSON.stringify(s.lane_status)} blockers=${(s.blockers||[]).length}`);
  process.exit(blocked.length?1:0);
' "$ROOT_DIR/artifacts/realcv-lanes-status.v1.json" "$ROOT_DIR/artifacts/realcv-crosslane-status.json"
