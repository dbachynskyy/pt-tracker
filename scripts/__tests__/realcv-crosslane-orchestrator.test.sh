#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

TEN='["squat","pushup","sit_to_stand","plank","lunge","glute_bridge","knee_extension","heel_raise","calf_raise","shoulder_abduction"]'

make_readiness() {
  local out="$1" count="$2"
  node -e '
    const fs=require("fs");
    const exercises=JSON.parse(process.argv[2]);
    const count=Number(process.argv[3]);
    fs.writeFileSync(process.argv[1], JSON.stringify({exercises: exercises.slice(0,count).map((e)=>({exerciseId:e,ready:true}))}, null, 2));
  ' "$out" "$TEN" "$count"
}

write_json() {
  local out="$1" body="$2"
  printf '%s\n' "$body" > "$out"
}

run_case() {
  local name="$1" atlas="$2" helios="$3" rollout="$4" master="$5" expect_code="$6" expected_lane="$7"
  local out="$TMPDIR/${name}.realcv-lanes-status.v1.json"

  set +e
  SKIP_REALCV_ROLLOUT_GATE=1 \
  ATLAS_READINESS_FILE="$atlas" \
  HELIOS_READINESS_FILE="$helios" \
  ROLLOUT_STATUS_FILE="$rollout" \
  MASTER_READINESS_FILE="$master" \
  UNIFIED_STATUS_FILE="$out" \
  bash scripts/run-realcv-crosslane-orchestrator.sh >"$TMPDIR/${name}.log" 2>&1
  local code=$?
  set -e

  if [[ "$code" -ne "$expect_code" ]]; then
    echo "case $name expected exit=$expect_code got=$code"
    cat "$TMPDIR/${name}.log"
    exit 1
  fi

  python3 - <<'PY' "$out" "$expected_lane"
import json,sys
status=json.load(open(sys.argv[1]))
expected=sys.argv[2]
lane=status['lane_status']
if expected == 'all-pass':
  assert lane['atlas']=='PASS' and lane['helios']=='PASS' and lane['orion']=='PASS'
else:
  for k,v in lane.items():
    if k == expected:
      assert v=='BLOCKED', (k,v,lane)
    else:
      assert v=='PASS', (k,v,lane)
PY
}

ATLAS_PASS="$TMPDIR/atlas.pass.json"
HELIOS_PASS="$TMPDIR/helios.pass.json"
ATLAS_BLOCKED="$TMPDIR/atlas.blocked.json"
HELIOS_BLOCKED="$TMPDIR/helios.blocked.json"
ROLLOUT_PASS="$TMPDIR/rollout.pass.json"
MASTER_PASS="$TMPDIR/master.pass.json"
ROLLOUT_BLOCKED="$TMPDIR/rollout.blocked.json"

make_readiness "$ATLAS_PASS" 10
make_readiness "$HELIOS_PASS" 10
make_readiness "$ATLAS_BLOCKED" 3
make_readiness "$HELIOS_BLOCKED" 2

write_json "$ROLLOUT_PASS" '{"tests_passed":true}'
write_json "$MASTER_PASS" '{"tests_passed":true}'
write_json "$ROLLOUT_BLOCKED" '{"tests_passed":false}'

run_case pass "$ATLAS_PASS" "$HELIOS_PASS" "$ROLLOUT_PASS" "$MASTER_PASS" 0 all-pass
run_case blocked_atlas "$ATLAS_BLOCKED" "$HELIOS_PASS" "$ROLLOUT_PASS" "$MASTER_PASS" 1 atlas
run_case blocked_helios "$ATLAS_PASS" "$HELIOS_BLOCKED" "$ROLLOUT_PASS" "$MASTER_PASS" 1 helios
run_case blocked_orion "$ATLAS_PASS" "$HELIOS_PASS" "$ROLLOUT_BLOCKED" "$MASTER_PASS" 1 orion

echo "PASS realcv-crosslane-orchestrator.test.sh"
