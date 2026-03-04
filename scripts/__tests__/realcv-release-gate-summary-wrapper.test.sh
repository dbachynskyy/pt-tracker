#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# prepare prerequisites via orchestrator
ATLAS_DIR=/tmp/pt-atlas HELIOS_DIR=/tmp/pt-helios \
ATLAS_READINESS_FILE=schemas/cv/native-readiness.atlas.fixture.json \
HELIOS_READINESS_FILE=schemas/cv/native-readiness.helios.fixture.json \
bash scripts/run-realcv-crosslane-orchestrator.sh >/tmp/rgw-prep.log 2>&1 || true

# pass run
bash scripts/run-realcv-release-gate.sh >/tmp/rgw-pass.log 2>&1
[[ -f artifacts/realcv-10ex-summary.v1.json ]]
[[ -f artifacts/realcv-10ex-summary.md ]]
grep -q 'REALCV_10EX_SUMMARY\[v1\] overall_pass=10/10' /tmp/rgw-pass.log
grep -q 'REALCV_10EX_BLOCKERS\[v1\] count=0' /tmp/rgw-pass.log

# fail run by feeding partial atlas readiness, then allow override
set +e
ATLAS_V2_READINESS_FILE=/tmp/orion-partial-atlas-for-release.json bash scripts/run-realcv-release-gate.sh >/tmp/rgw-fail.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]

echo '{"exercises":[{"exerciseId":"squat","ready":true}]}' > /tmp/orion-partial-atlas-for-release.json
set +e
ATLAS_V2_READINESS_FILE=/tmp/orion-partial-atlas-for-release.json bash scripts/run-realcv-release-gate.sh >/tmp/rgw-fail2.log 2>&1
C=$?
set -e
[[ $C -ne 0 ]]

grep -q 'REALCV_10EX_BLOCKERS\[v1\] count=' /tmp/rgw-fail2.log

# allow partial
ALLOW_PARTIAL_REALCV=1 ATLAS_V2_READINESS_FILE=/tmp/orion-partial-atlas-for-release.json bash scripts/run-realcv-release-gate.sh >/tmp/rgw-allow.log 2>&1 || true
grep -q 'REALCV_10EX_SUMMARY\[v1\]' /tmp/rgw-allow.log

echo "PASS realcv-release-gate-summary-wrapper.test.sh"
