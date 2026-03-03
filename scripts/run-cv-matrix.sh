#!/usr/bin/env bash
# run-cv-matrix.sh — CV detector test matrix runner
#
# Locates the Helios CV test suite, runs it with Jest --json, then pipes
# the output to parse-cv-results.js which renders a pass/fail table with
# per-scenario false-positive notes and a quality-gate verdict.
#
# Usage:
#   bash scripts/run-cv-matrix.sh
#   HELIOS_DIR=/path/to/pt-helios bash scripts/run-cv-matrix.sh
#   bash scripts/run-cv-matrix.sh --json   # dump raw jest JSON (debugging)
#
# Environment:
#   HELIOS_DIR  Path to pt-helios repo root (auto-detected if unset)
#
# Exit codes:
#   0  all CV scenarios pass quality gate
#   1  one or more scenarios fail
#   2  setup error (Helios not found, node not available, jest misconfigured)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORION_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MODE="${1:-}"

# ---------------------------------------------------------------------------
# Locate Helios repo
# ---------------------------------------------------------------------------
if [[ -z "${HELIOS_DIR:-}" ]]; then
  for candidate in \
    "$(cd "$ORION_DIR/../pt-helios" 2>/dev/null && pwd || true)" \
    "/private/tmp/pt-helios" \
    "/tmp/pt-helios"
  do
    if [[ -n "$candidate" && -d "$candidate/apps/mobile" ]]; then
      HELIOS_DIR="$candidate"
      break
    fi
  done
fi

if [[ -z "${HELIOS_DIR:-}" ]]; then
  echo "ERROR: Helios repo not found."
  echo "  Set HELIOS_DIR=/path/to/pt-helios, or ensure the repo exists alongside pt-orion."
  exit 2
fi

HELIOS_MOBILE="$HELIOS_DIR/apps/mobile"

if [[ ! -d "$HELIOS_MOBILE/src/cv" ]]; then
  echo "ERROR: CV module not found at $HELIOS_MOBILE/src/cv"
  echo "  Ensure pt-helios feat/helios-cv branch is checked out."
  exit 2
fi

# ---------------------------------------------------------------------------
# Dependency checks
# ---------------------------------------------------------------------------
check_dep() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: '$1' is required but not installed."
    [[ "$1" == "node" ]] && echo "  Install: https://nodejs.org"
    exit 2
  }
}

check_dep node
check_dep npx

NODE_VERSION="$(node --version 2>/dev/null | sed 's/v//')"
NODE_MAJOR="${NODE_VERSION%%.*}"
if [[ "$NODE_MAJOR" -lt 16 ]]; then
  echo "ERROR: Node.js 16+ required (found v${NODE_VERSION})."
  exit 2
fi

# Install node_modules if absent
if [[ ! -d "$HELIOS_MOBILE/node_modules" ]]; then
  echo "Installing Helios mobile dependencies (first run)..."
  (cd "$HELIOS_MOBILE" && npm install --silent 2>&1 | tail -3)
  echo ""
fi

# ---------------------------------------------------------------------------
# Header
# ---------------------------------------------------------------------------
echo ""
echo "CV Detector Test Matrix — pt-helios"
echo "  Helios : $HELIOS_DIR"
echo "  Suite  : apps/mobile/src/cv/__tests__/*.test.ts"
echo "  Parser : $SCRIPT_DIR/parse-cv-results.js"
echo ""

# ---------------------------------------------------------------------------
# Run Jest with JSON reporter
# Stderr (progress, banner) is suppressed; JSON goes to stdout.
# Jest exits 1 on test failures — we capture the output regardless.
# ---------------------------------------------------------------------------
JEST_JSON="$(
  cd "$HELIOS_MOBILE" && \
  npx jest \
    --testPathPattern="cv" \
    --json \
    --runInBand \
    2>/dev/null \
  || true
)"

if [[ -z "$JEST_JSON" ]]; then
  echo "ERROR: Jest produced no JSON output."
  echo "  Run manually to diagnose: cd $HELIOS_MOBILE && npx jest --testPathPattern=cv"
  exit 2
fi

# --json flag: dump raw jest JSON for debugging
if [[ "$MODE" == "--json" ]]; then
  echo "$JEST_JSON" | node -e "
    let d='';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => d += c);
    process.stdin.on('end', () => console.log(JSON.stringify(JSON.parse(d), null, 2)));
  "
  exit 0
fi

# ---------------------------------------------------------------------------
# Parse and render matrix
# ---------------------------------------------------------------------------
echo "$JEST_JSON" | node "$SCRIPT_DIR/parse-cv-results.js"
