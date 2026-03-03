from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, users, plans, sessions
from app.config import settings

app = FastAPI(
    title="PT Adherence API",
    version="0.1.0",
    description="Backend for home rehab adherence tracking",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(plans.router, prefix="/plans", tags=["plans"])
app.include_router(sessions.router, prefix="/sessions", tags=["sessions"])


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "version": app.version}
