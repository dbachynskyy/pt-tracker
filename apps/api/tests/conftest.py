from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import app.store as store
import app.auth as auth_module
from app.main import app


@pytest.fixture(autouse=True)
def reset_store():
    store._reset()
    auth_module.reset_revoked_tokens()
    yield
    store._reset()
    auth_module.reset_revoked_tokens()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def auth_headers(client: TestClient) -> dict:
    client.post(
        "/users/register",
        json={"email": "tester@example.com", "password": "pass1234", "full_name": "Tester"},
    )
    r = client.post(
        "/auth/login",
        json={"email": "tester@example.com", "password": "pass1234"},
    )
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
