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
json.dump({'exercises':[{'exercise_id':x,'coverage_pass':True} for x in ten]}, open(f'{TMP}/atlas.json','w'))
json.dump({'exercises':[{'exercise_id':x,'helios_gate_pass':True} for x in ten]}, open(f'{TMP}/helios.json','w'))
json.dump({'exercises':[{'exercise_id':x,'evidence':'ok'} for x in ten]}, open(f'{TMP}/evidence.json','w'))
json.dump({'exercises':[{'exercise_id':x,'overall_pass':True,'reasons':[]} for x in ten]}, open(f'{TMP}/orion.json','w'))
PY

# pass
node scripts/build-realcv-final-contract-report.js "$TMP/atlas.json" "$TMP/helios.json" "$TMP/evidence.json" "$TMP/orion.json" "$TMP/out.pass.json" "$TMP/out.pass.md"
python3 - <<PY
import json,os
j=json.load(open(os.environ['TMP']+'/out.pass.json'))
assert j['release']=='PASS' and j['pass_count']==10
PY

# single lane fail atlas
python3 - <<PY
import json,os
j=json.load(open(os.environ['TMP']+'/atlas.json'))
j['exercises'][0]['coverage_pass']=False
json.dump(j, open(os.environ['TMP']+'/atlas.fail.json','w'))
PY
set +e
node scripts/build-realcv-final-contract-report.js "$TMP/atlas.fail.json" "$TMP/helios.json" "$TMP/evidence.json" "$TMP/orion.json" "$TMP/out.afail.json" "$TMP/out.afail.md" >/tmp/final-afail.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]

# single lane fail helios
python3 - <<PY
import json,os
j=json.load(open(os.environ['TMP']+'/helios.json'))
j['exercises'][1]['helios_gate_pass']=False
json.dump(j, open(os.environ['TMP']+'/helios.fail.json','w'))
PY
set +e
node scripts/build-realcv-final-contract-report.js "$TMP/atlas.json" "$TMP/helios.fail.json" "$TMP/evidence.json" "$TMP/orion.json" "$TMP/out.hfail.json" "$TMP/out.hfail.md" >/tmp/final-hfail.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]

# single lane fail orion
python3 - <<PY
import json,os
j=json.load(open(os.environ['TMP']+'/orion.json'))
j['exercises'][2]['overall_pass']=False
j['exercises'][2]['reasons']=['orion_fail']
json.dump(j, open(os.environ['TMP']+'/orion.fail.json','w'))
PY
set +e
node scripts/build-realcv-final-contract-report.js "$TMP/atlas.json" "$TMP/helios.json" "$TMP/evidence.json" "$TMP/orion.fail.json" "$TMP/out.ofail.json" "$TMP/out.ofail.md" >/tmp/final-ofail.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]

# mixed fail
python3 - <<PY
import json,os
a=json.load(open(os.environ['TMP']+'/atlas.json'));a['exercises'][0]['coverage_pass']=False
h=json.load(open(os.environ['TMP']+'/helios.json'));h['exercises'][1]['helios_gate_pass']=False
o=json.load(open(os.environ['TMP']+'/orion.json'));o['exercises'][2]['overall_pass']=False;o['exercises'][2]['reasons']=['orion_fail']
json.dump(a,open(os.environ['TMP']+'/atlas.mixed.json','w'));json.dump(h,open(os.environ['TMP']+'/helios.mixed.json','w'));json.dump(o,open(os.environ['TMP']+'/orion.mixed.json','w'))
PY
set +e
node scripts/build-realcv-final-contract-report.js "$TMP/atlas.mixed.json" "$TMP/helios.mixed.json" "$TMP/evidence.json" "$TMP/orion.mixed.json" "$TMP/out.mixed.json" "$TMP/out.mixed.md" >/tmp/final-mixed.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]

# missing required artifact
set +e
node scripts/build-realcv-final-contract-report.js /tmp/no-atlas.json "$TMP/helios.json" "$TMP/evidence.json" "$TMP/orion.json" "$TMP/out.missing.json" "$TMP/out.missing.md" >/tmp/final-missing.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]
python3 - <<PY
import json,os
j=json.load(open(os.environ['TMP']+'/out.missing.json'))
assert any(b['code']=='MISSING_ATLAS_COVERAGE_GATE' for b in j['blockers'])
PY

echo "PASS realcv-final-contract.test.sh"
