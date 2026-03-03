from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr

import app.store as store
import app.auth as auth_module
from app.auth import (
    bearer_scheme,
    create_access_token,
    get_current_user,
    revoke_token,
    verify_password,
)

router = APIRouter()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/login", response_model=TokenOut)
async def login(body: LoginRequest) -> TokenOut:
    user = store.get_user_by_email(body.email)
    if user is None or not verify_password(body.password, user["hashed_password"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token(user["id"])
    return TokenOut(access_token=token)


@router.post("/refresh", response_model=TokenOut)
async def refresh(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    current_user: dict = Depends(get_current_user),
) -> TokenOut:
    """Revoke the current token and issue a fresh one."""
    revoke_token(credentials.credentials)
    new_token = create_access_token(current_user["id"])
    return TokenOut(access_token=new_token)


@router.post("/logout")
async def logout(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    _user: dict = Depends(get_current_user),
) -> Response:
    """Revoke the current token server-side. Returns 204 No Content."""
    revoke_token(credentials.credentials)
    return Response(status_code=204)
