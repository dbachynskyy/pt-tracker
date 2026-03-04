#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# Prep artifacts for happy path
ATLAS_DIR=/tmp/pt-atlas HELIOS_DIR=/tmp/pt-helios \
ATLAS_READINESS_FILE=schemas/cv/native-readiness.atlas.fixture.json \
HELIOS_READINESS_FILE=schemas/cv/native-readiness.helios.fixture.json \
bash scripts/run-realcv-crosslane-orchestrator.sh >/tmp/auditw-prep.log 2>&1 || true

python3 - <<'PY'
import json
ex=['squat','pushup','sit_to_stand','plank','lunge','glute_bridge','knee_extension','heel_raise','calf_raise','shoulder_abduction']
json.dump({'exercises':[{'exercise_id':x,'coverage_pass':True} for x in ex]}, open('artifacts/atlas-coverage-gate.v1.json','w'))
json.dump({'exercises':[{'exercise_id':x,'helios_gate_pass':True} for x in ex]}, open('artifacts/helios-exercise-readiness.v1.json','w'))
json.dump({'exercises':[{'exercise_id':x,'evidence':'ok'} for x in ex]}, open('artifacts/helios-exercise-readiness-evidence.v1.json','w'))
PY

# pass
ALLOW_REALCV_REGRESSION_OVERRIDE=ALLOW bash scripts/run-realcv-release-gate.sh >/tmp/auditw-pass.log 2>&1 || true
[[ -f artifacts/realcv-release-audit-bundle.v1.json ]]
grep -q 'REALCV_AUDIT_BUNDLE\[v1\]' /tmp/auditw-pass.log

# hold when missing lane artifact
rm -f artifacts/atlas-coverage-gate.v1.json
set +e
ALLOW_REALCV_REGRESSION_OVERRIDE=ALLOW bash scripts/run-realcv-release-gate.sh >/tmp/auditw-hold.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]

# override hold
ALLOW_REALCV_RELEASE_HOLD_OVERRIDE=ALLOW ALLOW_REALCV_REGRESSION_OVERRIDE=ALLOW bash scripts/run-realcv-release-gate.sh >/tmp/auditw-allow.log 2>&1 || true
grep -q 'REALCV_AUDIT_BUNDLE\[v1\]' /tmp/auditw-allow.log

echo "PASS realcv-release-gate-audit-wrapper.test.sh"
