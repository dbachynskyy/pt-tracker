from sqlalchemy import Column, ForeignKey, JSON, String, Integer, Enum
from sqlalchemy.dialects.postgresql import UUID
import enum
from app.models.base import Base, TimestampMixin


class SessionStatus(str, enum.Enum):
    in_progress = "in_progress"
    completed = "completed"
    skipped = "skipped"


class ExerciseSession(Base, TimestampMixin):
    __tablename__ = "exercise_sessions"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    plan_id = Column(UUID(as_uuid=True), ForeignKey("rehab_plans.id"))
    status = Column(Enum(SessionStatus), default=SessionStatus.in_progress)
    exercises_completed = Column(JSON, default=list)  # [{exercise_name, sets_done, reps_done}]
    notes = Column(String)
    pain_level = Column(Integer)  # 0-10
