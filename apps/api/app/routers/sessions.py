from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

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


class SessionOut(SessionCreate):
    id: str
    user_id: str
    status: str


@router.post("/", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
async def create_session(body: SessionCreate) -> SessionOut:
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/", response_model=list[SessionOut])
async def list_sessions() -> list[SessionOut]:
    raise HTTPException(status_code=501, detail="Not implemented")


@router.patch("/{session_id}/complete", response_model=SessionOut)
async def complete_session(session_id: str) -> SessionOut:
    raise HTTPException(status_code=501, detail="Not implemented")
