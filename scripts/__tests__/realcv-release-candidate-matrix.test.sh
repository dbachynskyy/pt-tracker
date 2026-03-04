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
cur={'release':'PASS','exercises':[{'exercise_id':x,'atlas_coverage_pass':True,'helios_readiness_pass':True,'orion_overall_pass':True,'overall_pass':True,'reasons':[]} for x in ex]}
json.dump(cur, open(f'{TMP}/cur.json','w'))

# prior baseline pass
json.dump(cur, open(f'{TMP}/prior.pass.json','w'))

# prior with one lane false per scenario
for lane,key,fn in [('atlas','atlas_coverage_pass','prior.improve.json'),('helios','helios_readiness_pass','prior.improve2.json'),('orion','orion_overall_pass','prior.improve3.json')]:
    d=json.loads(json.dumps(cur))
    d['exercises'][0][key]=False
    d['exercises'][0]['overall_pass']=False
    json.dump(d, open(f'{TMP}/{fn}','w'))

# current regressed atlas
reg=json.loads(json.dumps(cur)); reg['exercises'][1]['atlas_coverage_pass']=False; reg['exercises'][1]['overall_pass']=False
json.dump(reg, open(f'{TMP}/cur.reg.json','w'))

# mixed prior/current
mix_prior=json.loads(json.dumps(cur)); mix_cur=json.loads(json.dumps(cur))
mix_prior['exercises'][2]['helios_readiness_pass']=False; mix_prior['exercises'][2]['overall_pass']=False
mix_cur['exercises'][3]['orion_overall_pass']=False; mix_cur['exercises'][3]['overall_pass']=False
json.dump(mix_prior, open(f'{TMP}/prior.mixed.json','w')); json.dump(mix_cur, open(f'{TMP}/cur.mixed.json','w'))
PY

# no-prior baseline (missing prior artifact)
node scripts/build-realcv-release-candidate-matrix.js "$TMP/cur.json" "$TMP/no-prior.json" "$TMP/out.base.json" "$TMP/out.base.md"
python3 - <<'PY'
import json, os
j=json.load(open(os.environ['TMP']+'/out.base.json'))
assert j['baseline_present'] is False
assert j['regressions']==0
PY

# improvement atlas
node scripts/build-realcv-release-candidate-matrix.js "$TMP/cur.json" "$TMP/prior.improve.json" "$TMP/out.imp1.json" "$TMP/out.imp1.md"
python3 - <<'PY'
import json, os
j=json.load(open(os.environ['TMP']+'/out.imp1.json'))
row=[r for r in j['exercises'] if r['exercise_id']=='squat'][0]
assert row['delta']['atlas']=='improved'
PY

# improvement helios
node scripts/build-realcv-release-candidate-matrix.js "$TMP/cur.json" "$TMP/prior.improve2.json" "$TMP/out.imp2.json" "$TMP/out.imp2.md"
python3 - <<'PY'
import json, os
j=json.load(open(os.environ['TMP']+'/out.imp2.json'))
row=[r for r in j['exercises'] if r['exercise_id']=='squat'][0]
assert row['delta']['helios']=='improved'
PY

# improvement orion
node scripts/build-realcv-release-candidate-matrix.js "$TMP/cur.json" "$TMP/prior.improve3.json" "$TMP/out.imp3.json" "$TMP/out.imp3.md"
python3 - <<'PY'
import json, os
j=json.load(open(os.environ['TMP']+'/out.imp3.json'))
row=[r for r in j['exercises'] if r['exercise_id']=='squat'][0]
assert row['delta']['orion']=='improved'
PY

# regression each lane via current regressed vs prior pass
set +e
node scripts/build-realcv-release-candidate-matrix.js "$TMP/cur.reg.json" "$TMP/prior.pass.json" "$TMP/out.reg.json" "$TMP/out.reg.md" >/tmp/rc-reg.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]
python3 - <<'PY'
import json, os
j=json.load(open(os.environ['TMP']+'/out.reg.json'))
assert j['regressions']>=1
row=[r for r in j['exercises'] if r['exercise_id']=='pushup'][0]
assert row['delta']['atlas']=='regressed'
PY

# mixed
set +e
node scripts/build-realcv-release-candidate-matrix.js "$TMP/cur.mixed.json" "$TMP/prior.mixed.json" "$TMP/out.mix.json" "$TMP/out.mix.md" >/tmp/rc-mix.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]
python3 - <<'PY'
import json, os
j=json.load(open(os.environ['TMP']+'/out.mix.json'))
assert j['regressions']>=1
PY

echo "PASS realcv-release-candidate-matrix.test.sh"
