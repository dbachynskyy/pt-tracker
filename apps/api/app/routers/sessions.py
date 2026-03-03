from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

import app.store as store
from app.auth import get_current_user

router = APIRouter()


class ExerciseLog(BaseModel):
    exercise_name: str
    sets_done: int
    reps_done: int


class SessionCreate(BaseModel):
    plan_id: str | None = None
    exercises_completed: list[ExerciseLog] = []
    notes: str | None = None
    pain_level: int | None = None  # 0-10


class SessionOut(BaseModel):
    id: str
    user_id: str
    plan_id: str | None
    status: str
    exercises_completed: list[ExerciseLog]
    notes: str | None
    pain_level: int | None
    created_at: str


@router.post("/", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
async def create_session(
    body: SessionCreate,
    current_user: dict = Depends(get_current_user),
) -> SessionOut:
    s = store.create_session(current_user["id"], body.model_dump())
    return SessionOut(**s)


@router.get("/", response_model=list[SessionOut])
async def list_sessions(current_user: dict = Depends(get_current_user)) -> list[SessionOut]:
    return [SessionOut(**s) for s in store.list_sessions(current_user["id"])]


@router.patch("/{session_id}/complete", response_model=SessionOut)
async def complete_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
) -> SessionOut:
    s = store.get_session(session_id)
    if s is None or s["user_id"] != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    s = store.update_session(session_id, {"status": "completed"})
    return SessionOut(**s)
