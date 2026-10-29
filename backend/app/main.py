from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import SQLAlchemyError

from app.api.v1.router import api_router
from app.core.config import Settings, get_settings
from app.core.errors import register_error_handlers
from app.db.base import Base
from app.db.init_db import initialize_database
from app.db.session import (
    DatabaseConfigurationError,
    create_database_engine,
    create_session_factory,
    require_postgres_url,
    verify_database_connection,
)
from app.services.auth_gateway import AuthGateway, SupabaseAuthGateway


def create_app(
    database_url: str | None = None,
    auth_gateway: AuthGateway | None = None,
    create_schema_for_tests: bool = False,
    n8n_ingest_secret: str | None = None,
) -> FastAPI:
    settings = get_settings()
    configured_url = database_url or settings.database_url
    configuration_error: DatabaseConfigurationError | None = None
    if database_url is None:
        try:
            configured_url = require_postgres_url(configured_url)
        except DatabaseConfigurationError as error:
            configuration_error = error

    engine = create_database_engine(configured_url) if configured_url and configuration_error is None else None
    session_factory = create_session_factory(engine) if engine is not None else None

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        if configuration_error is not None:
            raise configuration_error
        if engine is None or session_factory is None:
            raise DatabaseConfigurationError("PostgreSQL 연결 설정을 확인해 주세요.")
        verify_database_connection(engine)
        if create_schema_for_tests:
            Base.metadata.create_all(engine)
        try:
            initialize_database(session_factory)
        except SQLAlchemyError:
            raise RuntimeError(
                "필요한 DB 테이블을 확인하지 못했습니다. backend 폴더에서 Alembic upgrade head를 실행해 주세요."
            ) from None
        yield
        engine.dispose()

    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = session_factory
    app.state.auth_gateway = auth_gateway or SupabaseAuthGateway(
        settings.supabase_url,
        settings.supabase_anon_key,
    )
    app.state.n8n_ingest_secret = n8n_ingest_secret or settings.n8n_ingest_secret

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"],
    )
    register_error_handlers(app)
    app.include_router(api_router, prefix=settings.api_v1_prefix)
    return app


app = create_app()
