from __future__ import annotations

"""Data store — in-memory by default; set STORE_BACKEND=json for file persistence."""
import json
import os
import uuid
from datetime import datetime, timedelta, timezone


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uuid() -> str:
    return str(uuid.uuid4())


_users: dict[str, dict] = {}
_users_by_email: dict[str, str] = {}  # email -> user_id
_plans: dict[str, dict] = {}
_sessions: dict[str, dict] = {}


# ── JSON persistence helpers ────────────────────────────────────────────────

def _persist() -> None:
    from app.config import settings  # local import to avoid circular at import time
    if settings.STORE_BACKEND != "json":
        return
    data = {
        "users": _users,
        "users_by_email": _users_by_email,
        "plans": _plans,
        "sessions": _sessions,
    }
    tmp = settings.STORE_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, settings.STORE_FILE)


def _load_from_file() -> None:
    from app.config import settings
    if settings.STORE_BACKEND != "json":
        return
    if not os.path.exists(settings.STORE_FILE):
        return
    with open(settings.STORE_FILE) as f:
        data = json.load(f)
    _users.update(data.get("users", {}))
    _users_by_email.update(data.get("users_by_email", {}))
    _plans.update(data.get("plans", {}))
    _sessions.update(data.get("sessions", {}))


_load_from_file()


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
    _persist()
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
    _persist()
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
    _persist()
    return session


def list_sessions(
    user_id: str,
    *,
    exercise_type: str | None = None,
    date: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[dict], int]:
    items = [s for s in _sessions.values() if s["user_id"] == user_id]

    if exercise_type:
        term = exercise_type.lower()
        items = [
            s for s in items
            if any(term in ex["exercise_name"].lower() for ex in s.get("exercises_completed", []))
        ]

    if date:
        items = [s for s in items if s["created_at"][:10] == date]

    items.sort(key=lambda s: s["created_at"], reverse=True)
    total = len(items)
    start = (page - 1) * page_size
    return items[start : start + page_size], total


def get_adherence_summary(user_id: str) -> dict:
    all_sessions = [s for s in _sessions.values() if s["user_id"] == user_id]
    completed = [s for s in all_sessions if s["status"] == "completed"]

    today = datetime.now(timezone.utc).date()
    cutoff_7d = today - timedelta(days=7)
    cutoff_30d = today - timedelta(days=30)

    def _date(s: dict):
        return datetime.fromisoformat(s["created_at"]).date()

    completed_7d = sum(1 for s in completed if _date(s) > cutoff_7d)
    completed_30d = sum(1 for s in completed if _date(s) > cutoff_30d)

    completed_dates = {_date(s) for s in completed}
    streak, day = 0, today
    while day in completed_dates:
        streak += 1
        day -= timedelta(days=1)

    return {
        "streak_days": streak,
        "completed_7d": completed_7d,
        "completed_30d": completed_30d,
        "total_completed": len(completed),
        "total_sessions": len(all_sessions),
    }


def get_session(session_id: str) -> dict | None:
    return _sessions.get(session_id)


def update_session(session_id: str, updates: dict) -> dict | None:
    s = _sessions.get(session_id)
    if s is None:
        return None
    s.update(updates)
    _persist()
    return s


def _reset() -> None:
    """Clear all data (tests only). Also removes JSON file if present."""
    _users.clear()
    _users_by_email.clear()
    _plans.clear()
    _sessions.clear()
    from app.config import settings
    if settings.STORE_BACKEND == "json" and os.path.exists(settings.STORE_FILE):
        os.remove(settings.STORE_FILE)
