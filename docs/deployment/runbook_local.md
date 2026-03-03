# Runbook — Local Development Environment

**Project:** PT Adherence MVP
**Updated:** 2026-03-02

Step-by-step guide to spin up the full stack on a developer's machine, run
the test suite, and validate the API before opening a PR.

---

## Prerequisites

| Tool | Minimum version | Install |
|---|---|---|
| Python | 3.9 | `pyenv install 3.11` (recommended) |
| Node.js | 18 | `nvm install 20` (recommended) |
| npm | 9 | ships with Node |
| Expo CLI | latest | `npm install -g expo-cli` |
| curl | any | ships with macOS / most Linux |
| jq | 1.6 | `brew install jq` |
| ShellCheck | any | `brew install shellcheck` (optional, for CI parity) |

---

## 1. Clone and bootstrap

```bash
git clone https://github.com/your-org/pt-adherence.git
cd pt-adherence

# Python virtualenv
python3 -m venv .venv
source .venv/bin/activate
pip install -r apps/api/requirements.txt   # FastAPI, uvicorn, python-jose, passlib, etc.

# Node (for scripts and mobile)
npm install --prefix apps/mobile
```

---

## 2. Environment variables

Create a `.env` file in the repo root (gitignored):

```bash
# .env  — local dev only, never commit
PORT=3000
JWT_SECRET=dev-secret-do-not-use
JWT_EXPIRY_SECONDS=3600
REFRESH_TOKEN_EXPIRY_DAYS=30
LOG_LEVEL=DEBUG
# Leave SEGMENT_WRITE_KEY, SENTRY_DSN, SES_FROM_ADDRESS unset
```

Load it before starting the server:

```bash
set -a; source .env; set +a
```

---

## 3. Start the API server

```bash
# From repo root, with virtualenv active and .env loaded
uvicorn apps.api.app.main:app \
  --host 0.0.0.0 \
  --port 3000 \
  --reload       # hot-reload on file change

# Verify health
curl -s http://localhost:3000/v1/health | jq .
# Expected: { "status": "ok", "version": "1.0.0" }
```

---

## 4. Start the mobile app

```bash
# Point mobile at local API
export EXPO_PUBLIC_API_URL=http://localhost:3000/v1

cd apps/mobile
npx expo start

# Scan QR with Expo Go on a physical device, or press:
#   i  — open iOS Simulator
#   a  — open Android Emulator
```

> **Note:** On a physical device use your machine's LAN IP instead of
> `localhost` (e.g., `http://192.168.1.42:3000/v1`).

---

## 5. Run the test suite

```bash
# Release artefact check
python3 scripts/check_release_readiness.py

# API smoke test (server must be running on :3000)
bash scripts/smoke-test.sh

# JSON schema validation
node scripts/test-api-schemas.js

# Validate a sample analytics event
echo '{"event":"session_completed","userId":"u1","sessionId":"s1","timestamp":"2026-03-02T10:00:00Z","platform":"ios","appVersion":"1.0.0","properties":{"exercisesCompleted":3,"totalSets":9}}' \
  | node scripts/validate-event.js

# OpenAPI lint (requires npx + @redocly/cli globally or in devDeps)
npx @redocly/cli lint docs/openapi.yaml

# Shell script lint
shellcheck scripts/smoke-test.sh scripts/qa-checklist.sh
```

All commands above are expected to exit `0`.

---

## 6. Before opening a PR

Run the QA checklist in non-interactive mode to print current P0 status:

```bash
bash scripts/qa-checklist.sh --non-interactive
```

Then verify CI locally mirrors what GitHub Actions will run:

```bash
# Mirror ci.yml jobs manually:
python3 scripts/check_release_readiness.py --no-color
node scripts/test-api-schemas.js
npx @redocly/cli lint docs/openapi.yaml --format=stylish
shellcheck scripts/smoke-test.sh scripts/qa-checklist.sh
```

---

## 7. Resetting state

The local API uses an in-memory store; state is lost on process restart.
To get a clean slate simply `Ctrl+C` the server and restart it.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `curl: connection refused` on port 3000 | Server not running | Start uvicorn (step 3) |
| `ModuleNotFoundError: fastapi` | Virtualenv not active | `source .venv/bin/activate` |
| Mobile "Network request failed" | Wrong `EXPO_PUBLIC_API_URL` | Use LAN IP not `localhost` on device |
| `jwt.exceptions.DecodeError` | Wrong `JWT_SECRET` | Ensure `.env` is loaded; restart server |
| `jq: command not found` in smoke-test | jq missing | `brew install jq` |
| Schema test reports missing file | Schema file not committed | Check `schemas/api/*.schema.json` exist |
