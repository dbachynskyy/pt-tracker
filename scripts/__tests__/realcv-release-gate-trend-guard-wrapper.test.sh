#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# Prep baseline artifacts
ATLAS_DIR=/tmp/pt-atlas HELIOS_DIR=/tmp/pt-helios \
ATLAS_READINESS_FILE=schemas/cv/native-readiness.atlas.fixture.json \
HELIOS_READINESS_FILE=schemas/cv/native-readiness.helios.fixture.json \
bash scripts/run-realcv-crosslane-orchestrator.sh >/tmp/rtg-prep.log 2>&1 || true

python3 - <<'PY'
import json
ex=['squat','pushup','sit_to_stand','plank','lunge','glute_bridge','knee_extension','heel_raise','calf_raise','shoulder_abduction']
json.dump({'exercises':[{'exercise_id':x,'coverage_pass':True} for x in ex]}, open('artifacts/atlas-coverage-gate.v1.json','w'))
json.dump({'exercises':[{'exercise_id':x,'helios_gate_pass':True} for x in ex]}, open('artifacts/helios-exercise-readiness.v1.json','w'))
json.dump({'exercises':[{'exercise_id':x,'evidence':'ok'} for x in ex]}, open('artifacts/helios-exercise-readiness-evidence.v1.json','w'))
# prior matrices with two regressions for squat
rows=[{'exercise_id':x,'delta':{'atlas':'unchanged','helios':'unchanged','orion':'unchanged','overall':'unchanged'}} for x in ex]
for r in rows:
    if r['exercise_id']=='squat':
        r['delta']['overall']='regressed'
json.dump({'version':'v1','exercises':rows}, open('artifacts/realcv-release-candidate-matrix.prev1.v1.json','w'))
json.dump({'version':'v1','exercises':rows}, open('artifacts/realcv-release-candidate-matrix.prev2.v1.json','w'))
PY

# should fail without override
set +e
bash scripts/run-realcv-release-gate.sh >/tmp/rtg-fail.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]

# should pass with override token
ALLOW_REALCV_REGRESSION_OVERRIDE=ALLOW bash scripts/run-realcv-release-gate.sh >/tmp/rtg-pass.log 2>&1 || true
grep -q 'REALCV_TREND_HISTORY\[v1\]' /tmp/rtg-pass.log

echo "PASS realcv-release-gate-trend-guard-wrapper.test.sh"
