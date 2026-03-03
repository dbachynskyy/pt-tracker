#!/usr/bin/env python3
"""
PT Adherence — release readiness checker
=========================================
Validates that all artefacts required for a safe release are present and
structurally sound, and that every required CLI tool is on $PATH.

Usage:
    python3 scripts/check_release_readiness.py
    python3 scripts/check_release_readiness.py --no-color

Exit codes:
    0   all required checks pass (optional warnings may exist)
    1   one or more required checks failed
"""

import json
import os
import shutil
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------------------
# Check catalogue
# ---------------------------------------------------------------------------

# (relative_path, human label)
REQUIRED_FILES = [
    ("docs/openapi.yaml",            "OpenAPI 3 spec"),
    ("docs/api_contract.md",         "API contract documentation"),
    ("docs/mvp_spec.md",             "MVP product specification"),
    ("docs/RELEASE_CRITERIA.md",     "Release criteria (P0 gate)"),
    ("docs/events_schema.md",        "Analytics events schema reference"),
    ("schemas/events.schema.json",   "Analytics event JSON Schema"),
    ("scripts/smoke-test.sh",        "API smoke test"),
    ("scripts/qa-checklist.sh",      "Go/no-go QA checklist"),
    ("scripts/validate-event.js",    "Analytics event validator (Node)"),
]

# Files that must also parse as valid JSON
REQUIRE_VALID_JSON = [
    "schemas/events.schema.json",
]

# Scripts that must be executable
REQUIRE_EXECUTABLE = [
    "scripts/smoke-test.sh",
    "scripts/qa-checklist.sh",
    "scripts/validate-event.js",
]

# (command, description) — hard required
REQUIRED_COMMANDS = [
    ("curl",    "HTTP client — used by smoke-test.sh"),
    ("jq",      "JSON processor — used by smoke-test.sh"),
    ("node",    "Node.js ≥ 16 — used by validate-event.js"),
]

# (command, description, install hint) — optional, warnings only
OPTIONAL_COMMANDS = [
    ("k6",  "Load testing tool (G-04)",    "brew install k6  or  https://k6.io/docs/get-started/installation/"),
    ("gh",  "GitHub CLI (G-03 bug query)", "brew install gh"),
    ("npx", "npx — for OpenAPI linting",   "ships with Node.js ≥ 16; run: npm install -g npm"),
]

# ---------------------------------------------------------------------------
# Terminal colours
# ---------------------------------------------------------------------------
_USE_COLOR = "--no-color" not in sys.argv and sys.stdout.isatty()

GREEN  = "\033[32m" if _USE_COLOR else ""
RED    = "\033[31m" if _USE_COLOR else ""
YELLOW = "\033[33m" if _USE_COLOR else ""
BOLD   = "\033[1m"  if _USE_COLOR else ""
RESET  = "\033[0m"  if _USE_COLOR else ""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
_failures = 0
_warnings = 0


def _pass(label: str) -> None:
    print(f"  {GREEN}PASS{RESET}  {label}")


def _fail(label: str, hint: str = "") -> None:
    global _failures
    _failures += 1
    print(f"  {RED}FAIL{RESET}  {label}")
    if hint:
        print(f"         {hint}")


def _warn(label: str, hint: str = "") -> None:
    global _warnings
    _warnings += 1
    print(f"  {YELLOW}WARN{RESET}  {label}")
    if hint:
        print(f"         {hint}")


def _section(title: str) -> None:
    print(f"\n{BOLD}=== {title} ==={RESET}")


# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------

def check_required_files() -> None:
    _section("Required artefacts")
    for rel, description in REQUIRED_FILES:
        full = REPO_ROOT / rel
        if full.exists() and full.stat().st_size > 0:
            _pass(f"{rel}  ({description})")
        elif full.exists():
            _fail(f"{rel}  ({description})", hint="file is empty")
        else:
            _fail(f"{rel}  ({description})", hint="file not found")


def check_json_validity() -> None:
    _section("JSON Schema validity")
    for rel in REQUIRE_VALID_JSON:
        full = REPO_ROOT / rel
        if not full.exists():
            _fail(f"{rel}  (file missing — skipping JSON parse)")
            continue
        try:
            with open(full, encoding="utf-8") as fh:
                json.load(fh)
            _pass(f"{rel}  (parses as valid JSON)")
        except json.JSONDecodeError as exc:
            _fail(f"{rel}  (invalid JSON)", hint=str(exc))


def check_api_schemas() -> None:
    """Check that API payload schemas exist (created alongside this script)."""
    _section("API payload schemas")
    api_schemas = [
        ("schemas/api/auth.register.request.schema.json",     "POST /auth/register request"),
        ("schemas/api/auth.login.request.schema.json",        "POST /auth/login request"),
        ("schemas/api/user.profile.request.schema.json",      "PUT /users/{id}/profile request"),
        ("schemas/api/session.start.request.schema.json",     "POST /sessions request"),
        ("schemas/api/session.exercise_log.request.schema.json", "PATCH /sessions/{id}/exercises/{id} request"),
    ]
    for rel, description in api_schemas:
        full = REPO_ROOT / rel
        if not full.exists():
            _fail(f"{rel}  ({description})", hint="file not found")
            continue
        try:
            with open(full, encoding="utf-8") as fh:
                data = json.load(fh)
            # Sanity: must declare $schema and have properties
            if "$schema" not in data:
                _warn(f"{rel}  (missing $schema keyword)")
            elif "properties" not in data and "oneOf" not in data and "allOf" not in data:
                _warn(f"{rel}  (no properties / oneOf / allOf — may be incomplete)")
            else:
                _pass(f"{rel}  ({description})")
        except json.JSONDecodeError as exc:
            _fail(f"{rel}  (invalid JSON)", hint=str(exc))


def check_executable_scripts() -> None:
    _section("Script executability")
    for rel in REQUIRE_EXECUTABLE:
        full = REPO_ROOT / rel
        if not full.exists():
            _fail(f"{rel}", hint="file not found")
        elif not os.access(full, os.X_OK):
            _fail(f"{rel}", hint=f"not executable — fix with: chmod +x {rel}")
        else:
            _pass(f"{rel}  (executable)")


def check_required_commands() -> None:
    _section("Required CLI tools")
    for cmd, description in REQUIRED_COMMANDS:
        if shutil.which(cmd) is not None:
            _pass(f"{cmd}  ({description})")
        else:
            _fail(f"{cmd}  ({description})", hint=f"install {cmd} and ensure it is on $PATH")


def check_optional_commands() -> None:
    _section("Optional CLI tools")
    for cmd, description, hint in OPTIONAL_COMMANDS:
        if shutil.which(cmd) is not None:
            _pass(f"{cmd}  ({description})")
        else:
            _warn(f"{cmd}  ({description})", hint=f"install: {hint}")


def check_test_plan() -> None:
    _section("Test plan document")
    full = REPO_ROOT / "docs/TEST_PLAN.md"
    if full.exists() and full.stat().st_size > 0:
        _pass("docs/TEST_PLAN.md  (manual + automated test plan)")
    else:
        _fail("docs/TEST_PLAN.md", hint="create docs/TEST_PLAN.md before release")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    print()
    print(f"{BOLD}PT Adherence — Release Readiness Check{RESET}")
    print(f"  Repo root : {REPO_ROOT}")
    print()

    check_required_files()
    check_json_validity()
    check_api_schemas()
    check_executable_scripts()
    check_required_commands()
    check_optional_commands()
    check_test_plan()

    print()
    print("=" * 44)
    if _failures == 0:
        print(f"  {GREEN}{BOLD}ALL REQUIRED CHECKS PASS{RESET}  "
              f"({_warnings} optional warning(s))")
        print()
        sys.exit(0)
    else:
        print(f"  {RED}{BOLD}READINESS CHECK FAILED{RESET}  "
              f"— {_failures} required item(s) missing, {_warnings} warning(s)")
        print()
        sys.exit(1)


if __name__ == "__main__":
    main()
