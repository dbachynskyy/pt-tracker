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
json.dump({'attestation_status':'verified','provenance':{'verified':True}}, open(f'{TMP}/att.ok.json','w'))
json.dump({'severity':'low','severe_incident':False,'incidents':[]}, open(f'{TMP}/stability.ok.json','w'))
json.dump({'version':'v1','exercises':[{'exercise_id':x,'atlas_attested':True,'helios_gate_pass':True,'orion_regression_pass':True,'overall_pass':True,'reasons':[]} for x in ten]}, open(f'{TMP}/ex10.ok.json','w'))
PY

# v1 compatibility PASS
node scripts/build-realcv-release-readiness.js "$TMP/atlas.json" "$TMP/helios.json" "$TMP/orion.json" "$TMP/out.v1.json"
python3 - <<PY
import json,os
j=json.load(open(os.environ['TMP']+'/out.v1.json'))
assert j['version']=='v1'
assert j['go_no_go']=='GO'
PY

# v2 PASS
node scripts/build-realcv-release-readiness.js --version v2 --atlas "$TMP/atlas.json" --helios "$TMP/helios.json" --orion "$TMP/orion.json" --atlas-attestation "$TMP/att.ok.json" --helios-stability "$TMP/stability.ok.json" --ex10-status "$TMP/ex10.ok.json" --out "$TMP/out.v2.json"
python3 - <<PY
import json,os
j=json.load(open(os.environ['TMP']+'/out.v2.json'))
assert j['version']=='v2'
assert j['go_no_go']=='GO'
PY

# new blocker: atlas attestation fail
python3 - <<PY
import json,os
json.dump({'attestation_status':'unverified','provenance':{'verified':False}}, open(os.environ['TMP']+'/att.bad.json','w'))
PY
set +e
node scripts/build-realcv-release-readiness.js --version v2 --atlas "$TMP/atlas.json" --helios "$TMP/helios.json" --orion "$TMP/orion.json" --atlas-attestation "$TMP/att.bad.json" --helios-stability "$TMP/stability.ok.json" --ex10-status "$TMP/ex10.ok.json" --out "$TMP/out.att.bad.json" >/tmp/release-att.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]
python3 - <<PY
import json,os
j=json.load(open(os.environ['TMP']+'/out.att.bad.json'))
assert any(b['code']=='ATLAS_ATTESTATION_FAIL' for b in j['blocker_catalog'])
PY

# new blocker: helios severe instability
python3 - <<PY
import json,os
json.dump({'severity':'severe','severe_incident':True,'incidents':[{'severity':'severe'}]}, open(os.environ['TMP']+'/stability.bad.json','w'))
PY
set +e
node scripts/build-realcv-release-readiness.js --version v2 --atlas "$TMP/atlas.json" --helios "$TMP/helios.json" --orion "$TMP/orion.json" --atlas-attestation "$TMP/att.ok.json" --helios-stability "$TMP/stability.bad.json" --ex10-status "$TMP/ex10.ok.json" --out "$TMP/out.stab.bad.json" >/tmp/release-stab.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]
python3 - <<PY
import json,os
j=json.load(open(os.environ['TMP']+'/out.stab.bad.json'))
assert any(b['code']=='HELIOS_SEVERE_INSTABILITY' for b in j['blocker_catalog'])
PY

# existing single blockers deterministic
# atlas provenance fail
echo '{bad' > "$TMP/atlas.bad.json"
set +e
node scripts/build-realcv-release-readiness.js --version v2 --atlas "$TMP/atlas.bad.json" --helios "$TMP/helios.json" --orion "$TMP/orion.json" --atlas-attestation "$TMP/att.ok.json" --helios-stability "$TMP/stability.ok.json" --ex10-status "$TMP/ex10.ok.json" --out "$TMP/out2.json" >/tmp/release-atlas.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]
python3 - <<PY
import json,os
j=json.load(open(os.environ['TMP']+'/out2.json'))
assert any(b['code']=='ATLAS_PROVENANCE_FAIL' for b in j['blocker_catalog'])
PY

# helios gated degrade incident
python3 - <<PY
import json,os
h={'strictGateStatus':'FAIL_FAST','readiness_matrix':[{'exerciseId':'squat'}],'failFast':{'categories':[{'code':'AUTH_BLOCKER'}]}}
json.dump(h, open(os.environ['TMP']+'/helios.bad.json','w'))
PY
set +e
node scripts/build-realcv-release-readiness.js --version v2 --atlas "$TMP/atlas.json" --helios "$TMP/helios.bad.json" --orion "$TMP/orion.json" --atlas-attestation "$TMP/att.ok.json" --helios-stability "$TMP/stability.ok.json" --ex10-status "$TMP/ex10.ok.json" --out "$TMP/out3.json" >/tmp/release-helios.log 2>&1
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
node scripts/build-realcv-release-readiness.js --version v2 --atlas "$TMP/atlas.json" --helios "$TMP/helios.json" --orion "$TMP/orion.bad.json" --atlas-attestation "$TMP/att.ok.json" --helios-stability "$TMP/stability.ok.json" --ex10-status "$TMP/ex10.ok.json" --out "$TMP/out4.json" >/tmp/release-orion.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]
python3 - <<PY
import json,os
j=json.load(open(os.environ['TMP']+'/out4.json'))
assert any(b['code']=='ORION_LANE_BLOCKED' for b in j['blocker_catalog'])
PY

# v2 blocker: missing/malformed 10ex status
set +e
node scripts/build-realcv-release-readiness.js --version v2 --atlas "$TMP/atlas.json" --helios "$TMP/helios.json" --orion "$TMP/orion.json" --atlas-attestation "$TMP/att.ok.json" --helios-stability "$TMP/stability.ok.json" --ex10-status "/tmp/does-not-exist-ex10.json" --out "$TMP/out.ex10.missing.json" >/tmp/release-ex10-missing.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]
python3 - <<PY
import json,os
j=json.load(open(os.environ['TMP']+'/out.ex10.missing.json'))
assert any(b['code']=='REALCV_10EX_STATUS_MISSING_OR_MALFORMED' for b in j['blocker_catalog'])
PY

echo '{bad' > "$TMP/ex10.bad.json"
set +e
node scripts/build-realcv-release-readiness.js --version v2 --atlas "$TMP/atlas.json" --helios "$TMP/helios.json" --orion "$TMP/orion.json" --atlas-attestation "$TMP/att.ok.json" --helios-stability "$TMP/stability.ok.json" --ex10-status "$TMP/ex10.bad.json" --out "$TMP/out.ex10.bad.json" >/tmp/release-ex10-bad.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]
python3 - <<PY
import json,os
j=json.load(open(os.environ['TMP']+'/out.ex10.bad.json'))
assert any(b['code']=='REALCV_10EX_STATUS_MISSING_OR_MALFORMED' for b in j['blocker_catalog'])
PY

echo "PASS realcv-release-readiness.test.sh"
