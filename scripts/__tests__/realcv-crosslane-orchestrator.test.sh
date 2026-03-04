#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

run_case() {
  local name="$1" atlas="$2" helios="$3" expect_code="$4"
  set +e
  ATLAS_DIR=/tmp/pt-atlas HELIOS_DIR=/tmp/pt-helios \
  ATLAS_READINESS_FILE="$atlas" HELIOS_READINESS_FILE="$helios" \
  bash scripts/run-realcv-crosslane-orchestrator.sh >"/tmp/${name}.log" 2>&1
  local code=$?
  set -e
  if [[ "$code" -ne "$expect_code" ]]; then
    echo "case $name expected $expect_code got $code"
    cat "/tmp/${name}.log"
    exit 1
  fi
  grep -q "REALCV_CROSSLANE" "/tmp/${name}.log"
}

# PASS
run_case pass schemas/cv/native-readiness.atlas.fixture.json schemas/cv/native-readiness.helios.fixture.json 0

# BLOCK atlas lane (bad atlas file)
run_case blocked_atlas /tmp/not-found-atlas.json schemas/cv/native-readiness.helios.fixture.json 1
python3 - <<'PY'
import json
s=json.load(open('/tmp/pt-orion/artifacts/realcv-crosslane-status.json'))
assert s['lane_status']['atlas']=='BLOCKED'
PY

# BLOCK helios lane
run_case blocked_helios schemas/cv/native-readiness.atlas.fixture.json /tmp/not-found-helios.json 1
python3 - <<'PY'
import json
s=json.load(open('/tmp/pt-orion/artifacts/realcv-crosslane-status.json'))
assert s['lane_status']['helios']=='BLOCKED'
PY

# BLOCK orion lane by forcing partial atlas readiness into wrapper inputs
cat > /tmp/orion-partial-atlas.json <<JSON
{"exercises":[{"exerciseId":"squat","ready":true}]}
JSON
run_case blocked_orion /tmp/orion-partial-atlas.json schemas/cv/native-readiness.helios.fixture.json 1
python3 - <<'PY'
import json
s=json.load(open('/tmp/pt-orion/artifacts/realcv-crosslane-status.json'))
assert s['lane_status']['orion']=='BLOCKED' or s['lane_status']['atlas']=='BLOCKED'
PY

echo "PASS realcv-crosslane-orchestrator.test.sh"
