# Running PT Adherence MVP locally

## Prerequisites

| Tool | Version |
|------|---------|
| Docker + Compose | ≥ 24 |
| Node.js + npm | ≥ 20 |
| Expo CLI | `npm i -g expo-cli` or use `npx expo` |
| Python | ≥ 3.9 (for running API outside Docker) |

---

## 1 — API (Docker)

```bash
# Copy env template (edit SECRET_KEY if desired)
cp .env.example .env

# Build and start the FastAPI server
docker compose up --build
```

The API runs at **http://localhost:8000**.
Interactive docs: **http://localhost:8000/docs**

> **Note:** the MVP uses an in-memory store — data resets on restart.

---

## 2 — API (local Python, no Docker)

```bash
cd apps/api
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

---

## 3 — Mobile (Expo)

```bash
cd apps/mobile
npm install

# Start Expo dev server (pick your target)
npx expo start        # scan QR with Expo Go on device
npx expo start --web  # open in browser at http://localhost:8081
npx expo start --ios  # iOS Simulator (macOS only)
```

Set the API URL the app uses:

```bash
# .env (in the repo root or apps/mobile/)
EXPO_PUBLIC_API_URL=http://localhost:8000
```

On a physical device, replace `localhost` with your machine's LAN IP.

---

## Quick smoke test (curl)

```bash
BASE=http://localhost:8000

# Register
curl -sX POST $BASE/users/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"secret","full_name":"You"}' | jq

# Login
TOKEN=$(curl -sX POST $BASE/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"secret"}' | jq -r .access_token)

# Create a plan
curl -sX POST $BASE/plans/ \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Knee Rehab","exercises":[{"name":"Quad Set","sets":3,"reps":10}]}' | jq

# Create + complete a session
SID=$(curl -sX POST $BASE/sessions/ \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}' | jq -r .id)

curl -sX PATCH $BASE/sessions/$SID/complete \
  -H "Authorization: Bearer $TOKEN" | jq
```

---

## Project structure

```
pt-atlas/
├── apps/
│   ├── api/              FastAPI backend (in-memory store)
│   │   ├── app/
│   │   │   ├── main.py
│   │   │   ├── auth.py   JWT + password hashing
│   │   │   ├── store.py  In-memory data store
│   │   │   └── routers/  auth, users, plans, sessions
│   │   └── Dockerfile
│   └── mobile/           Expo / React Native app
│       ├── app/          expo-router screens
│       │   ├── login.tsx
│       │   └── (tabs)/   index (dashboard), session, progress
│       └── src/
│           ├── api/client.ts    Typed fetch client
│           └── hooks/useAuth.tsx Auth context
├── packages/shared/      Shared TypeScript types
├── docker-compose.yml
└── RUNNING_LOCALLY.md
```
