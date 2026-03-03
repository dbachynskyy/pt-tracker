from __future__ import annotations

"""Integration tests for auth endpoints: login, refresh, logout, registration."""

import pytest
from fastapi.testclient import TestClient


# ── helpers ────────────────────────────────────────────────────────────────

def _register(client: TestClient, email: str = "user@example.com", password: str = "pass1234") -> dict:
    r = client.post("/users/register", json={"email": email, "password": password, "full_name": "Test User"})
    assert r.status_code == 201
    return r.json()


def _login(client: TestClient, email: str = "user@example.com", password: str = "pass1234") -> str:
    r = client.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200
    return r.json()["access_token"]


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── registration ────────────────────────────────────────────────────────────

def test_register_success(client):
    r = client.post(
        "/users/register",
        json={"email": "new@example.com", "password": "secret123", "full_name": "Alice"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["email"] == "new@example.com"
    assert body["full_name"] == "Alice"
    assert "id" in body
    assert "hashed_password" not in body


def test_register_duplicate_email(client):
    client.post("/users/register", json={"email": "dup@example.com", "password": "pass1"})
    r = client.post("/users/register", json={"email": "dup@example.com", "password": "pass2"})
    assert r.status_code == 409


def test_register_no_full_name(client):
    r = client.post("/users/register", json={"email": "nofull@example.com", "password": "pass1234"})
    assert r.status_code == 201
    assert r.json()["full_name"] is None


# ── login ───────────────────────────────────────────────────────────────────

def test_login_success(client):
    _register(client)
    r = client.post("/auth/login", json={"email": "user@example.com", "password": "pass1234"})
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"


def test_login_wrong_password(client):
    _register(client)
    r = client.post("/auth/login", json={"email": "user@example.com", "password": "wrong"})
    assert r.status_code == 401
    assert "credentials" in r.json()["detail"].lower()


def test_login_unknown_email(client):
    r = client.post("/auth/login", json={"email": "ghost@example.com", "password": "pass1234"})
    assert r.status_code == 401


def test_login_token_allows_protected_endpoint(client):
    _register(client)
    token = _login(client)
    r = client.get("/users/me", headers=_headers(token))
    assert r.status_code == 200
    assert r.json()["email"] == "user@example.com"


# ── refresh ─────────────────────────────────────────────────────────────────

def test_refresh_returns_new_token(client):
    _register(client)
    old_token = _login(client)
    r = client.post("/auth/refresh", headers=_headers(old_token))
    assert r.status_code == 200
    new_token = r.json()["access_token"]
    assert new_token != old_token


def test_refresh_old_token_rejected(client):
    _register(client)
    old_token = _login(client)
    client.post("/auth/refresh", headers=_headers(old_token))
    # old token should now be revoked
    r = client.get("/users/me", headers=_headers(old_token))
    assert r.status_code == 401
    assert "revoked" in r.json()["detail"].lower()


def test_refresh_new_token_works(client):
    _register(client)
    old_token = _login(client)
    r = client.post("/auth/refresh", headers=_headers(old_token))
    new_token = r.json()["access_token"]
    r2 = client.get("/users/me", headers=_headers(new_token))
    assert r2.status_code == 200


def test_refresh_requires_auth(client):
    r = client.post("/auth/refresh")
    assert r.status_code == 403


# ── logout ──────────────────────────────────────────────────────────────────

def test_logout_returns_204(client):
    _register(client)
    token = _login(client)
    r = client.post("/auth/logout", headers=_headers(token))
    assert r.status_code == 204


def test_logout_token_rejected_afterwards(client):
    _register(client)
    token = _login(client)
    client.post("/auth/logout", headers=_headers(token))
    r = client.get("/users/me", headers=_headers(token))
    assert r.status_code == 401
    assert "revoked" in r.json()["detail"].lower()


def test_logout_requires_auth(client):
    r = client.post("/auth/logout")
    assert r.status_code == 403


def test_logout_blocked_on_all_protected_endpoints(client):
    _register(client)
    token = _login(client)
    client.post("/auth/logout", headers=_headers(token))

    assert client.get("/users/me", headers=_headers(token)).status_code == 401
    assert client.get("/plans/", headers=_headers(token)).status_code == 401
    assert client.get("/sessions/", headers=_headers(token)).status_code == 401


# ── /users/me ───────────────────────────────────────────────────────────────

def test_me_returns_current_user(client):
    _register(client, email="me@example.com")
    token = _login(client, email="me@example.com")
    r = client.get("/users/me", headers=_headers(token))
    assert r.status_code == 200
    assert r.json()["email"] == "me@example.com"


def test_me_requires_auth(client):
    r = client.get("/users/me")
    assert r.status_code == 403


def test_invalid_token_rejected(client):
    r = client.get("/users/me", headers={"Authorization": "Bearer not.a.real.token"})
    assert r.status_code == 401
