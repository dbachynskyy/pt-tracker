#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
export TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

python3 - <<'PY'
import json, os
TMP=os.environ['TMP']
ex=['squat','pushup','sit_to_stand','plank','lunge','glute_bridge','knee_extension','heel_raise','calf_raise','shoulder_abduction']
base={'version':'v1','generated_at':'x','exercises':[]}
for e in ex:
    base['exercises'].append({'exercise_id':e,'atlas_attested':True,'helios_gate_pass':True,'orion_regression_pass':True,'overall_pass':True,'reasons':[]})
json.dump(base, open(f'{TMP}/pass.json','w'))

# single-lane failures
for lane,key in [('atlas','atlas_attested'),('helios','helios_gate_pass'),('orion','orion_regression_pass')]:
    d=json.loads(json.dumps(base))
    d['exercises'][0][key]=False
    d['exercises'][0]['overall_pass']=False
    d['exercises'][0]['reasons']=[f'{lane}_fail']
    json.dump(d, open(f'{TMP}/{lane}.json','w'))

# mixed failures
m=json.loads(json.dumps(base))
m['exercises'][0]['atlas_attested']=False;m['exercises'][0]['overall_pass']=False;m['exercises'][0]['reasons']=['atlas_fail']
m['exercises'][1]['helios_gate_pass']=False;m['exercises'][1]['overall_pass']=False;m['exercises'][1]['reasons']=['helios_fail']
m['exercises'][2]['orion_regression_pass']=False;m['exercises'][2]['overall_pass']=False;m['exercises'][2]['reasons']=['orion_fail']
json.dump(m, open(f'{TMP}/mixed.json','w'))

# malformed
json.dump({'exercises':[{'exercise_id':'squat'}]}, open(f'{TMP}/bad.json','w'))
PY

# all pass
node scripts/build-realcv-10ex-summary.js "$TMP/pass.json" "$TMP/pass.out.json" "$TMP/pass.md"
python3 - <<'PY'
import json, os
j=json.load(open(os.environ['TMP']+'/pass.out.json'))
assert j['overall_pass']==10 and j['blocker_count']==0
PY

# each single lane fail
for lane in atlas helios orion; do
  set +e
  node scripts/build-realcv-10ex-summary.js "$TMP/$lane.json" "$TMP/$lane.out.json" "$TMP/$lane.md" >/tmp/sum-$lane.log 2>&1
  C=$?
  set -e
  [[ $C -ne 0 ]]
  python3 - <<PY
import json, os
j=json.load(open(os.environ['TMP']+'/$lane.out.json'))
assert j['overall_pass']==9 and j['blocker_count']==1
PY
done

# mixed
set +e
node scripts/build-realcv-10ex-summary.js "$TMP/mixed.json" "$TMP/mixed.out.json" "$TMP/mixed.md" >/tmp/sum-mixed.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]
python3 - <<'PY'
import json, os
j=json.load(open(os.environ['TMP']+'/mixed.out.json'))
assert j['overall_pass']==7 and j['blocker_count']==3
PY

# malformed input
set +e
node scripts/build-realcv-10ex-summary.js "$TMP/bad.json" "$TMP/bad.out.json" "$TMP/bad.md" >/tmp/sum-bad.log 2>&1
C=$?
set -e
[[ $C -eq 2 ]]

echo "PASS realcv-10ex-summary.test.sh"
