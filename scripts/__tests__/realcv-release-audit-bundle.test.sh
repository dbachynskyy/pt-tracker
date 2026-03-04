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
json.dump({'release':'PASS','exercises':[{'exercise_id':x,'atlas_coverage_pass':True,'helios_readiness_pass':True,'orion_overall_pass':True,'overall_pass':True,'reasons':[]} for x in ex]}, open(f'{TMP}/final.json','w'))
json.dump({'regressions':0,'exercises':[]}, open(f'{TMP}/matrix.json','w'))
json.dump({'guard_fail':False,'offenders':[]}, open(f'{TMP}/trend.json','w'))
json.dump({'x':1}, open(f'{TMP}/atlas.json','w'))
json.dump({'x':1}, open(f'{TMP}/helios.json','w'))
json.dump({'x':1}, open(f'{TMP}/orion.json','w'))
PY

# all-go
node scripts/build-realcv-release-audit-bundle.js --final "$TMP/final.json" --matrix "$TMP/matrix.json" --trend "$TMP/trend.json" --atlas "$TMP/atlas.json" --helios "$TMP/helios.json" --orion "$TMP/orion.json" --out "$TMP/out.go.json" --md "$TMP/out.go.md"
python3 - <<'PY'
import json, os
j=json.load(open(os.environ['TMP']+'/out.go.json'))
assert j['release_decision']=='GO'
PY

# matrix regression hold
python3 - <<'PY'
import json, os
j={'regressions':1,'exercises':[]}
json.dump(j, open(os.environ['TMP']+'/matrix.bad.json','w'))
PY
set +e
node scripts/build-realcv-release-audit-bundle.js --final "$TMP/final.json" --matrix "$TMP/matrix.bad.json" --trend "$TMP/trend.json" --atlas "$TMP/atlas.json" --helios "$TMP/helios.json" --orion "$TMP/orion.json" --out "$TMP/out.mreg.json" --md "$TMP/out.mreg.md" >/tmp/audit-mreg.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]

# missing lane artifact hold
set +e
node scripts/build-realcv-release-audit-bundle.js --final "$TMP/final.json" --matrix "$TMP/matrix.json" --trend "$TMP/trend.json" --atlas /tmp/no-atlas.json --helios "$TMP/helios.json" --orion "$TMP/orion.json" --out "$TMP/out.miss.json" --md "$TMP/out.miss.md" >/tmp/audit-miss.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]
python3 - <<'PY'
import json, os
j=json.load(open(os.environ['TMP']+'/out.miss.json'))
assert any(b['code']=='MISSING_LANE_ARTIFACT' for b in j['blockers'])
PY

# stale trend hold
python3 - <<'PY'
import json, os
json.dump({'guard_fail':True,'offenders':[{'exercise_id':'squat'}]}, open(os.environ['TMP']+'/trend.bad.json','w'))
PY
set +e
node scripts/build-realcv-release-audit-bundle.js --final "$TMP/final.json" --matrix "$TMP/matrix.json" --trend "$TMP/trend.bad.json" --atlas "$TMP/atlas.json" --helios "$TMP/helios.json" --orion "$TMP/orion.json" --out "$TMP/out.trend.json" --md "$TMP/out.trend.md" >/tmp/audit-trend.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]

# override pass via wrapper-style check
python3 - <<'PY'
import json, os
json.dump({'release_decision':'HOLD','blocker_count':1}, open(os.environ['TMP']+'/hold.json','w'))
PY
set +e
node -e 'const fs=require("fs");const b=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const t=process.env.ALLOW_REALCV_RELEASE_HOLD_OVERRIDE||"";if(b.release_decision==="HOLD"&&t!=="ALLOW")process.exit(1);process.exit(0);' "$TMP/hold.json"
C=$?
set -e
[[ $C -ne 0 ]]
ALLOW_REALCV_RELEASE_HOLD_OVERRIDE=ALLOW node -e 'const fs=require("fs");const b=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const t=process.env.ALLOW_REALCV_RELEASE_HOLD_OVERRIDE||"";if(b.release_decision==="HOLD"&&t!=="ALLOW")process.exit(1);process.exit(0);' "$TMP/hold.json"

echo "PASS realcv-release-audit-bundle.test.sh"
