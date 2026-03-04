#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORION_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MODE="${1:-}"

if [[ -z "${HELIOS_DIR:-}" ]]; then
  for candidate in "$(cd "$ORION_DIR/../pt-helios" 2>/dev/null && pwd || true)" "/private/tmp/pt-helios" "/tmp/pt-helios"; do
    if [[ -n "$candidate" && -d "$candidate/apps/mobile" ]]; then HELIOS_DIR="$candidate"; break; fi
  done
fi

[[ -z "${HELIOS_DIR:-}" ]] && { echo "ERROR: Helios repo not found. Set HELIOS_DIR=/path/to/pt-helios"; exit 2; }
HELIOS_MOBILE="$HELIOS_DIR/apps/mobile"
[[ ! -d "$HELIOS_MOBILE/src/cv" ]] && { echo "ERROR: CV module not found at $HELIOS_MOBILE/src/cv"; exit 2; }

command -v node >/dev/null || { echo "ERROR: node is required"; exit 2; }
command -v npx >/dev/null || { echo "ERROR: npx is required"; exit 2; }

if [[ ! -d "$HELIOS_MOBILE/node_modules" ]]; then
  echo "Installing Helios mobile dependencies (first run)..."
  (cd "$HELIOS_MOBILE" && npm install --silent 2>&1 | tail -3)
fi

echo ""
echo "CV Detector Test Matrix — pt-helios"
echo "  Helios : $HELIOS_DIR"
echo "  Suite  : apps/mobile/src/cv/__tests__/*.test.ts"
echo ""

JEST_JSON="$(cd "$HELIOS_MOBILE" && npx jest --testPathPattern="cv" --json --runInBand 2>/dev/null || true)"
[[ -z "$JEST_JSON" ]] && { echo "ERROR: Jest produced no JSON output."; exit 2; }

if [[ "$MODE" == "--json" ]]; then
  echo "$JEST_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.stringify(JSON.parse(d),null,2)))"
  exit 0
fi

echo "$JEST_JSON" > "$ORION_DIR/jest-cv-results.local.json"

echo "$JEST_JSON" | node "$SCRIPT_DIR/parse-cv-results.js"
GATE_STATUS=$?

node "$SCRIPT_DIR/cv-generate-artifacts.js" "$ORION_DIR/jest-cv-results.local.json" || true
if [[ $GATE_STATUS -ne 0 ]]; then
  echo ""
  echo "Failure diagnostics:"
  node "$SCRIPT_DIR/cv-diagnose-failures.js" "$ORION_DIR/jest-cv-results.local.json" || true
fi

exit $GATE_STATUS
