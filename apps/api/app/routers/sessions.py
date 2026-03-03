from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
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


class EventIn(BaseModel):
    type: str
    ts: str  # ISO timestamp from client
    payload: dict = {}


class EventOut(BaseModel):
    type: str
    ts: str
    payload: dict


class SessionOut(BaseModel):
    id: str
    user_id: str
    plan_id: str | None
    status: str
    exercises_completed: list[ExerciseLog]
    notes: str | None
    pain_level: int | None
    created_at: str
    events: list[EventOut] = []


class SessionsPage(BaseModel):
    items: list[SessionOut]
    total: int
    page: int
    page_size: int
    has_more: bool


class AdherenceSummary(BaseModel):
    streak_days: int
    completed_7d: int
    completed_30d: int
    total_completed: int
    total_sessions: int


def _session_out(s: dict) -> SessionOut:
    events = [EventOut(**e) for e in store.get_events(s["id"])]
    return SessionOut(**s, events=events)


@router.post("/", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
async def create_session(
    body: SessionCreate,
    current_user: dict = Depends(get_current_user),
) -> SessionOut:
    s = store.create_session(current_user["id"], body.model_dump())
    return _session_out(s)


@router.post("/{session_id}/events", response_model=EventOut, status_code=status.HTTP_201_CREATED)
async def ingest_event(
    session_id: str,
    body: EventIn,
    current_user: dict = Depends(get_current_user),
) -> EventOut:
    s = store.get_session(session_id)
    if s is None or s["user_id"] != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    event = store.append_event(session_id, body.type, body.ts, body.payload)
    return EventOut(**event)


# NOTE: /summary must be declared before /{session_id} routes to avoid capture.
@router.get("/summary", response_model=AdherenceSummary)
async def adherence_summary(
    current_user: dict = Depends(get_current_user),
) -> AdherenceSummary:
    return AdherenceSummary(**store.get_adherence_summary(current_user["id"]))


@router.get("/", response_model=SessionsPage)
async def list_sessions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    exercise_type: str | None = Query(None),
    date: str | None = Query(None, description="YYYY-MM-DD"),
    current_user: dict = Depends(get_current_user),
) -> SessionsPage:
    items, total = store.list_sessions(
        current_user["id"],
        exercise_type=exercise_type,
        date=date,
        page=page,
        page_size=page_size,
    )
    return SessionsPage(
        items=[_session_out(s) for s in items],
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.patch("/{session_id}/complete", response_model=SessionOut)
async def complete_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
) -> SessionOut:
    s = store.get_session(session_id)
    if s is None or s["user_id"] != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    s = store.update_session(session_id, {"status": "completed"})
    return _session_out(s)
