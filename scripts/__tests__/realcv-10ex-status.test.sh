#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
export TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

TEN='["squat","pushup","sit_to_stand","plank","lunge","glute_bridge","knee_extension","heel_raise","calf_raise","shoulder_abduction"]'

python3 - <<PY
import json,os
ten=${TEN}
TMP=os.environ['TMP']
json.dump({'exercises':[{'exerciseId':x,'ready':True} for x in ten]}, open(f'{TMP}/atlas.json','w'))
json.dump({'readiness_matrix':[{'exerciseId':x,'analyzerRouting':True,'minimumTestCoverageSignal':True,'failureCodes':[]} for x in ten]}, open(f'{TMP}/helios.json','w'))
json.dump({'readiness_matrix':[{'exerciseId':x,'status':'PASS','failureCodes':[]} for x in ten]}, open(f'{TMP}/orion.json','w'))
PY

# PASS
node scripts/build-realcv-10ex-status.js "$TMP/atlas.json" "$TMP/helios.json" "$TMP/orion.json" "$TMP/out.pass.json"
python3 - <<PY
import json,os
j=json.load(open(os.environ['TMP']+'/out.pass.json'))
assert len(j['exercises'])==10
assert all(e['overall_pass'] for e in j['exercises'])
PY

# single-lane failure per exercise (atlas)
python3 - <<PY
import json,os
j=json.load(open(os.environ['TMP']+'/atlas.json'))
j['exercises'][0]['ready']=False
j['exercises'][0]['reason']='attestation missing'
json.dump(j, open(os.environ['TMP']+'/atlas.fail.json','w'))
PY
set +e
node scripts/build-realcv-10ex-status.js "$TMP/atlas.fail.json" "$TMP/helios.json" "$TMP/orion.json" "$TMP/out.afail.json" >/tmp/10ex-afail.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]
python3 - <<PY
import json,os
j=json.load(open(os.environ['TMP']+'/out.afail.json'))
row=[r for r in j['exercises'] if r['exercise_id']=='squat'][0]
assert row['atlas_attested'] is False and row['overall_pass'] is False
PY

# helios single failure
python3 - <<PY
import json,os
j=json.load(open(os.environ['TMP']+'/helios.json'))
j['readiness_matrix'][1]['analyzerRouting']=False
j['readiness_matrix'][1]['failureCodes']=['MISSING_ANALYZER_ROUTING']
json.dump(j, open(os.environ['TMP']+'/helios.fail.json','w'))
PY
set +e
node scripts/build-realcv-10ex-status.js "$TMP/atlas.json" "$TMP/helios.fail.json" "$TMP/orion.json" "$TMP/out.hfail.json" >/tmp/10ex-hfail.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]
python3 - <<PY
import json,os
j=json.load(open(os.environ['TMP']+'/out.hfail.json'))
row=[r for r in j['exercises'] if r['exercise_id']=='pushup'][0]
assert row['helios_gate_pass'] is False and row['overall_pass'] is False
PY

# orion single failure
python3 - <<PY
import json,os
j=json.load(open(os.environ['TMP']+'/orion.json'))
j['readiness_matrix'][2]['status']='FAIL'
j['readiness_matrix'][2]['failureCodes']=['MISSING_TEST_SIGNAL']
json.dump(j, open(os.environ['TMP']+'/orion.fail.json','w'))
PY
set +e
node scripts/build-realcv-10ex-status.js "$TMP/atlas.json" "$TMP/helios.json" "$TMP/orion.fail.json" "$TMP/out.ofail.json" >/tmp/10ex-ofail.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]
python3 - <<PY
import json,os
j=json.load(open(os.environ['TMP']+'/out.ofail.json'))
row=[r for r in j['exercises'] if r['exercise_id']=='sit_to_stand'][0]
assert row['orion_regression_pass'] is False and row['overall_pass'] is False
PY

echo "PASS realcv-10ex-status.test.sh"
