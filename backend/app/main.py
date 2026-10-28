from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import Settings, get_settings
from app.core.errors import register_error_handlers
from app.db.init_db import initialize_database
from app.db.session import create_database_engine, create_session_factory
from app.services.auth_gateway import AuthGateway, SupabaseAuthGateway


def create_app(database_url: str | None = None, auth_gateway: AuthGateway | None = None) -> FastAPI:
    settings = get_settings()
    if database_url is not None:
        settings = settings.model_copy(update={"database_url": database_url})

    engine = create_database_engine(settings.database_url)
    session_factory = create_session_factory(engine)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        initialize_database(engine, session_factory)
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
