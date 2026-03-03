from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr

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
    # TODO: hash password, persist to DB, return created user
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/me", response_model=UserOut)
async def me() -> UserOut:
    # TODO: decode JWT, fetch user from DB
    raise HTTPException(status_code=501, detail="Not implemented")
