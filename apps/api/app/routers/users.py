from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr

import app.store as store
from app.auth import get_current_user, hash_password

router = APIRouter()


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str | None


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(body: UserCreate) -> UserOut:
    if store.get_user_by_email(body.email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    user = store.create_user(body.email, hash_password(body.password), body.full_name)
    return UserOut(id=user["id"], email=user["email"], full_name=user["full_name"])


@router.get("/me", response_model=UserOut)
async def me(current_user: dict = Depends(get_current_user)) -> UserOut:
    return UserOut(
        id=current_user["id"],
        email=current_user["email"],
        full_name=current_user["full_name"],
    )
