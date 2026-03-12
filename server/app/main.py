from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine, SessionLocal
from app.routers import (
    auth,
    upload,
    vendors,
    review,
    dashboard,
    history,
    specs,
    analytics,
    ai,
    wafer_map,
    rules,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables if they don't exist
    Base.metadata.create_all(bind=engine)

    # Run seed data
    db = SessionLocal()
    try:
        from app.seed.seed_vendors import seed_vendors
        from app.seed.seed_users import seed_users
        seed_vendors(db)
        seed_users(db)
    finally:
        db.close()

    # Ensure upload directory exists
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)

    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="IQC Wafer CP Review System",
        version="2.0.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(upload.router)
    app.include_router(vendors.router)
    app.include_router(review.router)
    app.include_router(dashboard.router)
    app.include_router(history.router)
    app.include_router(specs.router)
    app.include_router(analytics.router)
    app.include_router(ai.router)
    app.include_router(wafer_map.router)
    app.include_router(rules.router)

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    return app


app = create_app()
