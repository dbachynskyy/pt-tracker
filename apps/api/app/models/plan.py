from sqlalchemy import Column, String, ForeignKey, JSON, Integer
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base, TimestampMixin


class RehabPlan(Base, TimestampMixin):
    __tablename__ = "rehab_plans"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(String)
    exercises = Column(JSON, default=list)  # [{name, sets, reps, hold_seconds}]
    sessions_per_week = Column(Integer, default=3)
