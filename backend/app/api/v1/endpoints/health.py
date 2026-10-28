from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy.exc import SQLAlchemyError

from app.schemas.health import HealthResponse
from app.services.health_service import HealthService


router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def get_health(request: Request) -> HealthResponse:
    try:
        with request.app.state.session_factory() as session:
            reference_key = HealthService(session).get_reference_key()
    except (RuntimeError, SQLAlchemyError) as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SQLite 기준 데이터를 확인하지 못했습니다.",
        ) from error

    return HealthResponse(
        status="ok",
        app=request.app.state.settings.app_name,
        database="ok",
        reference_key=reference_key,
    )
