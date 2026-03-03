# PT Adherence MVP

MVP for home rehab adherence with form-aware exercise tracking and adaptive coaching.

## Goal

Build a focused MVP that improves completion and consistency for rehab exercises done at home.

## Initial Scope

- User onboarding + simple rehab plan
- Session tracking for a small set of movements
- Basic form/repetition feedback
- Streaks + adherence dashboard
- Exportable weekly summary

---

## Repository Structure

```
pt-atlas/
├── apps/
│   ├── mobile/          # Expo React Native app (iOS + Android)
│   └── api/             # FastAPI backend
├── packages/
│   └── shared/          # Shared TypeScript types
├── docker-compose.yml   # Local dev services (Postgres + API)
└── .env.example         # Environment variable template
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | >= 20 |
| Python | >= 3.12 |
| Docker + Docker Compose | latest |
| Expo CLI | `npm i -g expo-cli` |

---

## Quick Start

### 1. Clone & configure environment

```bash
git clone <repo-url> && cd pt-atlas
cp .env.example .env
# Edit .env — at minimum set SECRET_KEY to a random string
```

### 2. Start backend services

```bash
docker compose up --build
```

The API will be available at <http://localhost:8000>.
Interactive docs: <http://localhost:8000/docs>
Health check: <http://localhost:8000/health>

### 3. Run database migrations

```bash
# Inside the api container (or with a local Python env):
docker compose exec api alembic upgrade head
```

> Alembic migrations are not yet generated — run `alembic revision --autogenerate -m "init"` after setting up your DB connection.

### 4. Start the mobile app

```bash
cd apps/mobile
npm install
npm start          # Opens Expo dev server
# Press i → iOS simulator, a → Android emulator, w → browser
```

Set `EXPO_PUBLIC_API_URL` in `.env` to match your machine's LAN IP when testing on a physical device.

---

## Development

### API (FastAPI)

```bash
cd apps/api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Shared types

The `packages/shared` package exports TypeScript interfaces used by the mobile app. Import them as:

```ts
import type { ExerciseSession, RehabPlan } from '@pt-adherence/shared';
```

---

## API Endpoints (stub)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/users/register` | Register new user |
| GET | `/users/me` | Current user profile |
| POST | `/plans/` | Create rehab plan |
| GET | `/plans/` | List user's plans |
| GET | `/plans/{id}` | Get single plan |
| POST | `/sessions/` | Log a session |
| GET | `/sessions/` | List sessions |
| PATCH | `/sessions/{id}/complete` | Mark session complete |

> All endpoints except `/health` require JWT auth (implementation in progress).
