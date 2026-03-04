#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
export TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

python3 - <<'PY'
import json, os, datetime
TMP=os.environ['TMP']
ex=['squat','pushup','sit_to_stand','plank','lunge','glute_bridge','knee_extension','heel_raise','calf_raise','shoulder_abduction']
now=datetime.datetime.utcnow().isoformat()+"Z"
json.dump({'exercises':[{'exercise_id':x,'normalized':True} for x in ex]}, open(f'{TMP}/atlas-normalized.json','w'))
json.dump({'exercises':[{'exercise_id':x,'coverage_pass':True} for x in ex]}, open(f'{TMP}/atlas-coverage.json','w'))
json.dump({'exercises':[{'exercise_id':x,'pack_ready':True} for x in ex]}, open(f'{TMP}/atlas-pack.json','w'))
json.dump({'exercises':[{'exercise_id':x,'real_camera_evidence':True,'captured_at':now} for x in ex]}, open(f'{TMP}/helios-evidence.json','w'))
json.dump({'plan':'ok'}, open(f'{TMP}/helios-fallback.json','w'))
json.dump({'exercises':[{'exercise_id':x,'atlas_attested':True,'overall_pass':True,'reasons':[]} for x in ex]}, open(f'{TMP}/10ex.json','w'))
PY

# full pass
node scripts/build-realcv-exercise-decision-matrix.js --atlas-normalized "$TMP/atlas-normalized.json" --atlas-coverage "$TMP/atlas-coverage.json" --atlas-pack "$TMP/atlas-pack.json" --helios-evidence "$TMP/helios-evidence.json" --helios-fallback "$TMP/helios-fallback.json" --matrix-10ex "$TMP/10ex.json" --out "$TMP/out.pass.json" --md "$TMP/out.pass.md"
python3 - <<'PY'
import json, os
j=json.load(open(os.environ['TMP']+'/out.pass.json'))
assert j['release']=='PASS' and j['pass_count']==10
PY

# one exercise missing in 10ex
python3 - <<'PY'
import json, os
j=json.load(open(os.environ['TMP']+'/10ex.json')); j['exercises']=j['exercises'][:-1]
json.dump(j, open(os.environ['TMP']+'/10ex.miss.json','w'))
PY
set +e
node scripts/build-realcv-exercise-decision-matrix.js --atlas-normalized "$TMP/atlas-normalized.json" --atlas-coverage "$TMP/atlas-coverage.json" --atlas-pack "$TMP/atlas-pack.json" --helios-evidence "$TMP/helios-evidence.json" --helios-fallback "$TMP/helios-fallback.json" --matrix-10ex "$TMP/10ex.miss.json" --out "$TMP/out.miss.json" --md "$TMP/out.miss.md" >/tmp/ex-miss.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]

# stale evidence
python3 - <<'PY'
import json, os
j=json.load(open(os.environ['TMP']+'/helios-evidence.json'))
j['exercises'][0]['captured_at']='2000-01-01T00:00:00Z'
json.dump(j, open(os.environ['TMP']+'/helios-stale.json','w'))
PY
set +e
node scripts/build-realcv-exercise-decision-matrix.js --atlas-normalized "$TMP/atlas-normalized.json" --atlas-coverage "$TMP/atlas-coverage.json" --atlas-pack "$TMP/atlas-pack.json" --helios-evidence "$TMP/helios-stale.json" --helios-fallback "$TMP/helios-fallback.json" --matrix-10ex "$TMP/10ex.json" --out "$TMP/out.stale.json" --md "$TMP/out.stale.md" >/tmp/ex-stale.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]

# malformed blocker class propagated from helios
python3 - <<'PY'
import json, os
j=json.load(open(os.environ['TMP']+'/helios-evidence.json'))
j['blockers']=[{'code':'MALFORMED_EVIDENCE_PAYLOAD'}]
json.dump(j, open(os.environ['TMP']+'/helios-malformed.json','w'))
PY
set +e
node scripts/build-realcv-exercise-decision-matrix.js --atlas-normalized "$TMP/atlas-normalized.json" --atlas-coverage "$TMP/atlas-coverage.json" --atlas-pack "$TMP/atlas-pack.json" --helios-evidence "$TMP/helios-malformed.json" --helios-fallback "$TMP/helios-fallback.json" --matrix-10ex "$TMP/10ex.json" --out "$TMP/out.mal.json" --md "$TMP/out.mal.md" >/tmp/ex-mal.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]
python3 - <<'PY'
import json, os
j=json.load(open(os.environ['TMP']+'/out.mal.json'))
assert any(b['code']=='HELIOS_MALFORMED_BLOCKER_PROPAGATED' for b in j['blockers'])
PY

# missing atlas artifact
set +e
node scripts/build-realcv-exercise-decision-matrix.js --atlas-normalized /tmp/no-atlas.json --atlas-coverage "$TMP/atlas-coverage.json" --atlas-pack "$TMP/atlas-pack.json" --helios-evidence "$TMP/helios-evidence.json" --helios-fallback "$TMP/helios-fallback.json" --matrix-10ex "$TMP/10ex.json" --out "$TMP/out.noatlas.json" --md "$TMP/out.noatlas.md" >/tmp/ex-noatlas.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]

echo "PASS realcv-exercise-decision-matrix.test.sh"
