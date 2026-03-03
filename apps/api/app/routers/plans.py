from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

router = APIRouter()


class ExerciseSpec(BaseModel):
    name: str
    sets: int
    reps: int
    hold_seconds: int = 0


class PlanCreate(BaseModel):
    name: str
    description: str | None = None
    exercises: list[ExerciseSpec] = []
    sessions_per_week: int = 3


class PlanOut(PlanCreate):
    id: str
    user_id: str


@router.post("/", response_model=PlanOut, status_code=status.HTTP_201_CREATED)
async def create_plan(body: PlanCreate) -> PlanOut:
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/", response_model=list[PlanOut])
async def list_plans() -> list[PlanOut]:
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/{plan_id}", response_model=PlanOut)
async def get_plan(plan_id: str) -> PlanOut:
    raise HTTPException(status_code=501, detail="Not implemented")
