from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

import app.store as store
from app.auth import get_current_user

router = APIRouter()


class ExerciseSpec(BaseModel):
    name: str
    sets: int
    reps: int
    hold_seconds: int = 0
    notes: str | None = None


class PlanCreate(BaseModel):
    name: str
    description: str | None = None
    exercises: list[ExerciseSpec] = []
    sessions_per_week: int = 3


class PlanOut(BaseModel):
    id: str
    user_id: str
    name: str
    description: str | None
    exercises: list[ExerciseSpec]
    sessions_per_week: int
    created_at: str


@router.post("/", response_model=PlanOut, status_code=status.HTTP_201_CREATED)
async def create_plan(
    body: PlanCreate,
    current_user: dict = Depends(get_current_user),
) -> PlanOut:
    p = store.create_plan(current_user["id"], body.model_dump())
    return PlanOut(**p)


@router.get("/", response_model=list[PlanOut])
async def list_plans(current_user: dict = Depends(get_current_user)) -> list[PlanOut]:
    return [PlanOut(**p) for p in store.list_plans(current_user["id"])]


@router.get("/{plan_id}", response_model=PlanOut)
async def get_plan(
    plan_id: str,
    current_user: dict = Depends(get_current_user),
) -> PlanOut:
    p = store.get_plan(plan_id)
    if p is None or p["user_id"] != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    return PlanOut(**p)
