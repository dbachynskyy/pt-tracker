#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
export TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

TEN='["squat","pushup","sit_to_stand","plank","lunge","glute_bridge","knee_extension","heel_raise","calf_raise","shoulder_abduction"]'

python3 - <<PY
import json,os
TMP=os.environ['TMP']
ten=${TEN}
json.dump({'exercises':[{'exerciseId':x,'ready':True} for x in ten]}, open(f'{TMP}/atlas.json','w'))
json.dump({'strictGateStatus':'PASS','readiness_matrix':[{'exerciseId':x} for x in ten],'failFast':{'categories':[]}}, open(f'{TMP}/helios.json','w'))
json.dump({'lane_status':{'atlas':'PASS','helios':'PASS','orion':'PASS'},'tests_passed':True}, open(f'{TMP}/orion.json','w'))
PY

# PASS
node scripts/build-realcv-release-readiness.js "$TMP/atlas.json" "$TMP/helios.json" "$TMP/orion.json" "$TMP/out.json"
python3 - <<PY
import json,os
j=json.load(open(os.environ['TMP']+'/out.json'))
assert j['go_no_go']=='GO'
PY

# atlas provenance fail
echo '{bad' > "$TMP/atlas.bad.json"
set +e
node scripts/build-realcv-release-readiness.js "$TMP/atlas.bad.json" "$TMP/helios.json" "$TMP/orion.json" "$TMP/out2.json" >/tmp/release-atlas.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]
python3 - <<PY
import json,os
j=json.load(open(os.environ['TMP']+'/out2.json'))
assert any(b['code']=='ATLAS_PROVENANCE_FAIL' for b in j['blocker_catalog'])
PY

# helios degrade incident
python3 - <<PY
import json,os
h={'strictGateStatus':'FAIL_FAST','readiness_matrix':[{'exerciseId':'squat'}],'failFast':{'categories':[{'code':'AUTH_BLOCKER'}]}}
json.dump(h, open(os.environ['TMP']+'/helios.bad.json','w'))
PY
set +e
node scripts/build-realcv-release-readiness.js "$TMP/atlas.json" "$TMP/helios.bad.json" "$TMP/orion.json" "$TMP/out3.json" >/tmp/release-helios.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]
python3 - <<PY
import json,os
j=json.load(open(os.environ['TMP']+'/out3.json'))
assert any(b['code']=='HELIOS_GATED_DEGRADE_INCIDENT' for b in j['blocker_catalog'])
PY

# orion lane blocked
python3 - <<PY
import json,os
json.dump({'lane_status':{'atlas':'PASS','helios':'PASS','orion':'BLOCKED'},'tests_passed':False}, open(os.environ['TMP']+'/orion.bad.json','w'))
PY
set +e
node scripts/build-realcv-release-readiness.js "$TMP/atlas.json" "$TMP/helios.json" "$TMP/orion.bad.json" "$TMP/out4.json" >/tmp/release-orion.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]
python3 - <<PY
import json,os
j=json.load(open(os.environ['TMP']+'/out4.json'))
assert any(b['code']=='ORION_LANE_BLOCKED' for b in j['blocker_catalog'])
PY

echo "PASS realcv-release-readiness.test.sh"
