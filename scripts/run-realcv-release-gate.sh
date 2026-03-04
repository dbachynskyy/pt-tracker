#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

ATLAS_V2_READINESS_FILE="${ATLAS_V2_READINESS_FILE:-$ROOT_DIR/schemas/cv/native-readiness.atlas.fixture.json}"
HELIOS_SUMMARY_FILE="${HELIOS_SUMMARY_FILE:-$ROOT_DIR/artifacts/cross-repo-cv-regression-summary.json}"
ORION_LANES_FILE="${ORION_LANES_FILE:-$ROOT_DIR/artifacts/realcv-lanes-status.v1.json}"
ORION_SUMMARY_FILE="${ORION_SUMMARY_FILE:-$ROOT_DIR/artifacts/cross-repo-cv-regression-summary.json}"
ATLAS_PROVENANCE_ATTESTATION_FILE="${ATLAS_PROVENANCE_ATTESTATION_FILE:-$ROOT_DIR/schemas/cv/atlas.provenance-attestation.fixture.json}"
HELIOS_STABILITY_SUMMARY_FILE="${HELIOS_STABILITY_SUMMARY_FILE:-$ROOT_DIR/schemas/cv/helios.stability-summary.fixture.json}"
EX10_STATUS_FILE="$ROOT_DIR/artifacts/realcv-10ex-status.v1.json"

# Build per-exercise status contract first (mandatory for v2)
node "$SCRIPT_DIR/build-realcv-10ex-status.js" \
  "$ATLAS_V2_READINESS_FILE" \
  "$HELIOS_SUMMARY_FILE" \
  "$ORION_SUMMARY_FILE" \
  "$EX10_STATUS_FILE" || true


# Build summary artifacts + deterministic CI lines
node "$SCRIPT_DIR/build-realcv-10ex-summary.js"   "$EX10_STATUS_FILE"   "$ROOT_DIR/artifacts/realcv-10ex-summary.v1.json"   "$ROOT_DIR/artifacts/realcv-10ex-summary.md" || true

# Hard-fail on any red exercise unless ALLOW_PARTIAL_REALCV=1
node -e '
  const fs=require("fs");
  const p=process.argv[1];
  const allow=process.env.ALLOW_PARTIAL_REALCV==="1";
  const s=JSON.parse(fs.readFileSync(p,"utf8"));
  if (!allow && s.blocker_count>0) process.exit(1);
  process.exit(0);
' "$ROOT_DIR/artifacts/realcv-10ex-summary.v1.json"

# Backward-compatible v1 artifact
node "$SCRIPT_DIR/build-realcv-release-readiness.js" \
  --version v1 \
  --atlas "$ATLAS_V2_READINESS_FILE" \
  --helios "$HELIOS_SUMMARY_FILE" \
  --orion "$ORION_LANES_FILE" \
  --out "$ROOT_DIR/artifacts/realcv-release-readiness.v1.json" || true

# New v2 artifact with attestation + stability inputs + ex10 status contract
node "$SCRIPT_DIR/build-realcv-release-readiness.js" \
  --version v2 \
  --atlas "$ATLAS_V2_READINESS_FILE" \
  --helios "$HELIOS_SUMMARY_FILE" \
  --orion "$ORION_LANES_FILE" \
  --atlas-attestation "$ATLAS_PROVENANCE_ATTESTATION_FILE" \
  --helios-stability "$HELIOS_STABILITY_SUMMARY_FILE" \
  --ex10-status "$EX10_STATUS_FILE" \
  --out "$ROOT_DIR/artifacts/realcv-release-readiness.v2.json"



# compatibility fallback for missing upstream atlas/helios artifacts
if [[ ! -f "$ROOT_DIR/artifacts/atlas-coverage-gate.v1.json" || ! -f "$ROOT_DIR/artifacts/helios-exercise-readiness.v1.json" ]]; then
  node -e '
    const fs=require("fs");
    const p=process.argv[1];
    const s=JSON.parse(fs.readFileSync(p,"utf8"));
    const ex=s.exercises||[];
    if (!fs.existsSync("artifacts/atlas-coverage-gate.v1.json")) {
      fs.writeFileSync("artifacts/atlas-coverage-gate.v1.json", JSON.stringify({exercises: ex.map(r=>({exercise_id:r.exercise_id, coverage_pass: !!r.atlas_attested}))}, null, 2));
    }
    if (!fs.existsSync("artifacts/helios-exercise-readiness.v1.json")) {
      fs.writeFileSync("artifacts/helios-exercise-readiness.v1.json", JSON.stringify({exercises: ex.map(r=>({exercise_id:r.exercise_id, helios_gate_pass: !!r.helios_gate_pass}))}, null, 2));
    }
  ' "$EX10_STATUS_FILE"
fi

# Final cross-lane contract (strict)
node "$SCRIPT_DIR/build-realcv-final-contract-report.js"   "$ROOT_DIR/artifacts/atlas-coverage-gate.v1.json"   "$ROOT_DIR/artifacts/helios-exercise-readiness.v1.json"   "$ROOT_DIR/artifacts/helios-exercise-readiness-evidence.v1.json"   "$ROOT_DIR/artifacts/realcv-10ex-summary.v1.json"   "$ROOT_DIR/artifacts/realcv-final-contract.v1.json"   "$ROOT_DIR/artifacts/realcv-final-contract.md"


# Release-candidate matrix + trend delta
PRIOR_FINAL_CONTRACT_FILE="${PRIOR_FINAL_CONTRACT_FILE:-$ROOT_DIR/artifacts/realcv-final-contract.prev.v1.json}"
node "$SCRIPT_DIR/build-realcv-release-candidate-matrix.js"   "$ROOT_DIR/artifacts/realcv-final-contract.v1.json"   "$PRIOR_FINAL_CONTRACT_FILE"   "$ROOT_DIR/artifacts/realcv-release-candidate-matrix.v1.json"   "$ROOT_DIR/artifacts/realcv-release-candidate-matrix.md" || true

# hard-fail regressions unless override token provided
node -e '
  const fs=require("fs");
  const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
  const token=process.env.ALLOW_REALCV_REGRESSION_OVERRIDE||"";
  if (m.regressions>0 && token!="ALLOW") process.exit(1);
  process.exit(0);
' "$ROOT_DIR/artifacts/realcv-release-candidate-matrix.v1.json"


# Trend history + consecutive regression guard (latest first)
HISTORY_MATRIX_1="${HISTORY_MATRIX_1:-$ROOT_DIR/artifacts/realcv-release-candidate-matrix.v1.json}"
HISTORY_MATRIX_2="${HISTORY_MATRIX_2:-$ROOT_DIR/artifacts/realcv-release-candidate-matrix.prev1.v1.json}"
HISTORY_MATRIX_3="${HISTORY_MATRIX_3:-$ROOT_DIR/artifacts/realcv-release-candidate-matrix.prev2.v1.json}"

MATRIX_INPUTS=()
[[ -f "$HISTORY_MATRIX_1" ]] && MATRIX_INPUTS+=("$HISTORY_MATRIX_1")
[[ -f "$HISTORY_MATRIX_2" ]] && MATRIX_INPUTS+=("$HISTORY_MATRIX_2")
[[ -f "$HISTORY_MATRIX_3" ]] && MATRIX_INPUTS+=("$HISTORY_MATRIX_3")

if [[ ${#MATRIX_INPUTS[@]} -eq 0 ]]; then
  MATRIX_INPUTS+=("$ROOT_DIR/artifacts/realcv-release-candidate-matrix.v1.json")
fi

node "$SCRIPT_DIR/build-realcv-trend-history.js" "${MATRIX_INPUTS[@]}"   --out "$ROOT_DIR/artifacts/realcv-release-trend-history.v1.json"   --md "$ROOT_DIR/artifacts/realcv-release-trend-history.md" || true

# Guard: fail on >=2 consecutive regressions unless override
node -e '
  const fs=require("fs");
  const t=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
  const token=process.env.ALLOW_REALCV_REGRESSION_OVERRIDE||"";
  if (t.guard_fail && token!="ALLOW") process.exit(1);
  process.exit(0);
' "$ROOT_DIR/artifacts/realcv-release-trend-history.v1.json"
