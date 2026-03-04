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

def write(name, delta):
    rows=[]
    for e in ex:
        rows.append({'exercise_id':e,'delta':{'atlas':'unchanged','helios':'unchanged','orion':'unchanged','overall':'unchanged'}})
    for exid,val in delta.items():
        for r in rows:
            if r['exercise_id']==exid:
                r['delta']['overall']=val
    json.dump({'version':'v1','exercises':rows}, open(f'{TMP}/{name}','w'))

# single-run baseline
write('m1.json',{})
# improving streak for squat (newest first)
write('m2.json',{'squat':'improved'})
write('m3.json',{'squat':'improved'})
# two regressions for pushup
write('r1.json',{'pushup':'regressed'})
write('r2.json',{'pushup':'regressed'})
# volatile for plank
write('v1.json',{'plank':'improved'})
write('v2.json',{'plank':'regressed'})
PY

# baseline no prior
node scripts/build-realcv-trend-history.js "$TMP/m1.json" --out "$TMP/out.base.json" --md "$TMP/out.base.md"
python3 - <<'PY'
import json,os
j=json.load(open(os.environ['TMP']+'/out.base.json'))
assert j['sample_size']==1 and j['guard_fail'] is False
PY

# improvement streak
node scripts/build-realcv-trend-history.js "$TMP/m2.json" "$TMP/m3.json" --out "$TMP/out.imp.json" --md "$TMP/out.imp.md"
python3 - <<'PY'
import json,os
j=json.load(open(os.environ['TMP']+'/out.imp.json'))
row=[r for r in j['exercises'] if r['exercise_id']=='squat'][0]
assert row['trend_streak']=='improving'
PY

# 2x regression fail
set +e
node scripts/build-realcv-trend-history.js "$TMP/r1.json" "$TMP/r2.json" --out "$TMP/out.reg.json" --md "$TMP/out.reg.md" >/tmp/trend-reg.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]
python3 - <<'PY'
import json,os
j=json.load(open(os.environ['TMP']+'/out.reg.json'))
row=[r for r in j['exercises'] if r['exercise_id']=='pushup'][0]
assert row['consecutive_regressions']>=2
assert j['guard_fail'] is True
PY

# volatile
node scripts/build-realcv-trend-history.js "$TMP/v1.json" "$TMP/v2.json" --out "$TMP/out.vol.json" --md "$TMP/out.vol.md" || true
python3 - <<'PY'
import json,os
j=json.load(open(os.environ['TMP']+'/out.vol.json'))
row=[r for r in j['exercises'] if r['exercise_id']=='plank'][0]
assert row['trend_streak']=='volatile'
PY

# missing history artifact
set +e
node scripts/build-realcv-trend-history.js /tmp/not-here.json --out "$TMP/out.miss.json" --md "$TMP/out.miss.md" >/tmp/trend-miss.log 2>&1
C=$?
set -e
[[ $C -eq 2 ]]

echo "PASS realcv-trend-history.test.sh"
