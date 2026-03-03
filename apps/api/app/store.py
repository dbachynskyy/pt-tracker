from __future__ import annotations

"""In-memory data store — no database required for MVP."""
import uuid
from datetime import datetime, timezone


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uuid() -> str:
    return str(uuid.uuid4())


_users: dict[str, dict] = {}
_users_by_email: dict[str, str] = {}  # email -> user_id
_plans: dict[str, dict] = {}
_sessions: dict[str, dict] = {}


# ── Users ──────────────────────────────────────────────────────────────────

def create_user(email: str, hashed_password: str, full_name: str | None) -> dict:
    uid = _uuid()
    user = {
        "id": uid,
        "email": email,
        "hashed_password": hashed_password,
        "full_name": full_name,
        "is_active": True,
        "created_at": _now(),
    }
    _users[uid] = user
    _users_by_email[email] = uid
    return user


def get_user_by_email(email: str) -> dict | None:
    uid = _users_by_email.get(email)
    return _users.get(uid) if uid else None


def get_user(user_id: str) -> dict | None:
    return _users.get(user_id)


# ── Plans ──────────────────────────────────────────────────────────────────

def create_plan(user_id: str, data: dict) -> dict:
    pid = _uuid()
    plan = {"id": pid, "user_id": user_id, "created_at": _now(), **data}
    _plans[pid] = plan
    return plan


def list_plans(user_id: str) -> list[dict]:
    return [p for p in _plans.values() if p["user_id"] == user_id]


def get_plan(plan_id: str) -> dict | None:
    return _plans.get(plan_id)


# ── Sessions ───────────────────────────────────────────────────────────────

def create_session(user_id: str, data: dict) -> dict:
    sid = _uuid()
    session = {"id": sid, "user_id": user_id, "status": "in_progress", "created_at": _now(), **data}
    _sessions[sid] = session
    return session


def list_sessions(user_id: str) -> list[dict]:
    return [s for s in _sessions.values() if s["user_id"] == user_id]


def get_session(session_id: str) -> dict | None:
    return _sessions.get(session_id)


def update_session(session_id: str, updates: dict) -> dict | None:
    s = _sessions.get(session_id)
    if s is None:
        return None
    s.update(updates)
    return s
