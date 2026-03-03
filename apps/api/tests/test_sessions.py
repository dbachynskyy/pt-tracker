from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient


# ── helpers ────────────────────────────────────────────────────────────────

def _create(client: TestClient, headers: dict, exercises: list | None = None) -> dict:
    body: dict = {}
    if exercises:
        body["exercises_completed"] = exercises
    r = client.post("/sessions/", json=body, headers=headers)
    assert r.status_code == 201
    return r.json()


def _complete(client: TestClient, headers: dict, session_id: str) -> dict:
    r = client.patch(f"/sessions/{session_id}/complete", headers=headers)
    assert r.status_code == 200
    return r.json()


# ── list / pagination ──────────────────────────────────────────────────────

def test_list_empty(client, auth_headers):
    r = client.get("/sessions/", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0
    assert body["has_more"] is False


def test_list_pagination(client, auth_headers):
    for _ in range(5):
        _create(client, auth_headers)

    r = client.get("/sessions/?page=1&page_size=3", headers=auth_headers)
    body = r.json()
    assert len(body["items"]) == 3
    assert body["total"] == 5
    assert body["has_more"] is True

    r2 = client.get("/sessions/?page=2&page_size=3", headers=auth_headers)
    body2 = r2.json()
    assert len(body2["items"]) == 2
    assert body2["has_more"] is False


def test_list_sorted_newest_first(client, auth_headers):
    s1 = _create(client, auth_headers)
    s2 = _create(client, auth_headers)
    r = client.get("/sessions/", headers=auth_headers)
    ids = [s["id"] for s in r.json()["items"]]
    # newest (s2) should appear first
    assert ids.index(s2["id"]) < ids.index(s1["id"])


# ── filter by exercise type ────────────────────────────────────────────────

def test_filter_by_exercise_type(client, auth_headers):
    _create(client, auth_headers, exercises=[{"exercise_name": "Squat", "sets_done": 3, "reps_done": 10}])
    _create(client, auth_headers, exercises=[{"exercise_name": "Pushup", "sets_done": 2, "reps_done": 15}])
    _create(client, auth_headers)  # no exercises

    r = client.get("/sessions/?exercise_type=squat", headers=auth_headers)
    body = r.json()
    assert body["total"] == 1
    assert body["items"][0]["exercises_completed"][0]["exercise_name"] == "Squat"


def test_filter_exercise_type_case_insensitive(client, auth_headers):
    _create(client, auth_headers, exercises=[{"exercise_name": "Quad Set", "sets_done": 3, "reps_done": 10}])
    r = client.get("/sessions/?exercise_type=QUAD", headers=auth_headers)
    assert r.json()["total"] == 1


# ── filter by date ─────────────────────────────────────────────────────────

def test_filter_by_date(client, auth_headers):
    _create(client, auth_headers)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    r = client.get(f"/sessions/?date={today}", headers=auth_headers)
    body = r.json()
    assert body["total"] == 1


def test_filter_by_date_no_match(client, auth_headers):
    _create(client, auth_headers)
    r = client.get("/sessions/?date=2000-01-01", headers=auth_headers)
    assert r.json()["total"] == 0


# ── adherence summary ──────────────────────────────────────────────────────

def test_summary_empty(client, auth_headers):
    r = client.get("/sessions/summary", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["streak_days"] == 0
    assert body["completed_7d"] == 0
    assert body["completed_30d"] == 0
    assert body["total_completed"] == 0
    assert body["total_sessions"] == 0


def test_summary_counts(client, auth_headers):
    s1 = _create(client, auth_headers)
    _complete(client, auth_headers, s1["id"])

    s2 = _create(client, auth_headers)
    _complete(client, auth_headers, s2["id"])

    # one in_progress (not counted in completions)
    _create(client, auth_headers)

    r = client.get("/sessions/summary", headers=auth_headers)
    body = r.json()
    assert body["total_sessions"] == 3
    assert body["total_completed"] == 2
    assert body["completed_7d"] == 2
    assert body["completed_30d"] == 2
    assert body["streak_days"] == 1  # completed today → streak of 1


def test_summary_requires_auth(client):
    r = client.get("/sessions/summary")
    assert r.status_code == 403


def test_list_requires_auth(client):
    r = client.get("/sessions/")
    assert r.status_code == 403


# ── isolation: users cannot see each other's sessions ─────────────────────

def test_session_isolation(client, auth_headers):
    _create(client, auth_headers)

    # register a second user
    client.post("/users/register", json={"email": "other@example.com", "password": "pass1234"})
    r2 = client.post("/auth/login", json={"email": "other@example.com", "password": "pass1234"})
    other_headers = {"Authorization": f"Bearer {r2.json()['access_token']}"}

    r = client.get("/sessions/", headers=other_headers)
    assert r.json()["total"] == 0
