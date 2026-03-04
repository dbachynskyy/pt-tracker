#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# PASS case
ATLAS_DIR=/tmp/pt-atlas \
HELIOS_DIR=/tmp/pt-helios \
ATLAS_READINESS_FILE=schemas/cv/native-readiness.atlas.fixture.json \
HELIOS_READINESS_FILE=schemas/cv/native-readiness.helios.fixture.json \
ATLAS_MASTER_READINESS_FILE=schemas/cv/native-readiness.atlas.fixture.json \
HELIOS_MASTER_READINESS_FILE=schemas/cv/native-readiness.helios.fixture.json \
bash scripts/run-realcv-rollout-gate.sh >/tmp/realcv-wrapper-pass.log 2>&1

grep -q "REALCV_LANE_STATUS" /tmp/realcv-wrapper-pass.log

# BLOCKED case (missing helios master readiness)
set +e
ATLAS_DIR=/tmp/pt-atlas \
HELIOS_DIR=/tmp/pt-helios \
ATLAS_READINESS_FILE=schemas/cv/native-readiness.atlas.fixture.json \
HELIOS_READINESS_FILE=schemas/cv/native-readiness.helios.fixture.json \
ATLAS_MASTER_READINESS_FILE=schemas/cv/native-readiness.atlas.fixture.json \
HELIOS_MASTER_READINESS_FILE=/tmp/does-not-exist-helios.json \
bash scripts/run-realcv-rollout-gate.sh >/tmp/realcv-wrapper-blocked.log 2>&1
CODE=$?
set -e

if [[ "$CODE" -eq 0 ]]; then
  echo "expected wrapper failure for blocked master readiness"
  exit 1
fi

grep -q "REALCV_LANE_STATUS" /tmp/realcv-wrapper-blocked.log

echo "PASS realcv-rollout-gate-wrapper.test.sh"
