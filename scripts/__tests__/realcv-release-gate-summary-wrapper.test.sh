#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ATLAS_DIR=/tmp/pt-atlas HELIOS_DIR=/tmp/pt-helios \
ATLAS_READINESS_FILE=schemas/cv/native-readiness.atlas.fixture.json \
HELIOS_READINESS_FILE=schemas/cv/native-readiness.helios.fixture.json \
bash scripts/run-realcv-crosslane-orchestrator.sh >/tmp/rgw-prep.log 2>&1 || true

python3 - <<'PY'
import json
ex=['squat','pushup','sit_to_stand','plank','lunge','glute_bridge','knee_extension','heel_raise','calf_raise','shoulder_abduction']
json.dump({'exercises':[{'exercise_id':x,'coverage_pass':True} for x in ex]}, open('artifacts/atlas-coverage-gate.v1.json','w'))
json.dump({'exercises':[{'exercise_id':x,'helios_gate_pass':True} for x in ex]}, open('artifacts/helios-exercise-readiness.v1.json','w'))
json.dump({'exercises':[{'exercise_id':x,'evidence':'ok','real_camera_evidence':True} for x in ex]}, open('artifacts/helios-exercise-readiness-evidence.v1.json','w'))
json.dump({'exercises':[{'exercise_id':x,'normalized':True} for x in ex]}, open('artifacts/atlas-normalized.v1.json','w'))
json.dump({'exercises':[{'exercise_id':x,'pack_ready':True} for x in ex]}, open('artifacts/atlas-pack-output.v1.json','w'))
json.dump({'plan':'ok'}, open('artifacts/helios-fallback-plan.v1.json','w'))
PY

ALLOW_REALCV_REGRESSION_OVERRIDE=ALLOW bash scripts/run-realcv-release-gate.sh >/tmp/rgw-pass.log 2>&1
[[ -f artifacts/realcv-10ex-summary.v1.json ]]
[[ -f artifacts/realcv-10ex-summary.md ]]
grep -q 'REALCV_10EX_SUMMARY\[v1\] overall_pass=10/10' /tmp/rgw-pass.log
grep -q 'REALCV_10EX_BLOCKERS\[v1\] count=0' /tmp/rgw-pass.log

set +e
ATLAS_V2_READINESS_FILE=/tmp/orion-partial-atlas-for-release.json ALLOW_REALCV_REGRESSION_OVERRIDE=ALLOW bash scripts/run-realcv-release-gate.sh >/tmp/rgw-fail.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]

echo '{"exercises":[{"exerciseId":"squat","ready":true}]}' > /tmp/orion-partial-atlas-for-release.json
set +e
ATLAS_V2_READINESS_FILE=/tmp/orion-partial-atlas-for-release.json ALLOW_REALCV_REGRESSION_OVERRIDE=ALLOW bash scripts/run-realcv-release-gate.sh >/tmp/rgw-fail2.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]
grep -q 'REALCV_10EX_BLOCKERS\[v1\] count=' /tmp/rgw-fail2.log

ALLOW_PARTIAL_REALCV=1 ALLOW_REALCV_RELEASE_HOLD_OVERRIDE=ALLOW ALLOW_REALCV_REGRESSION_OVERRIDE=ALLOW ATLAS_V2_READINESS_FILE=/tmp/orion-partial-atlas-for-release.json bash scripts/run-realcv-release-gate.sh >/tmp/rgw-allow.log 2>&1 || true
grep -q 'REALCV_10EX_SUMMARY\[v1\]' /tmp/rgw-allow.log

echo "PASS realcv-release-gate-summary-wrapper.test.sh"
