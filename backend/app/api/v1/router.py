from fastapi import APIRouter

from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.comparisons import router as comparisons_router
from app.api.v1.endpoints.daily import router as daily_router
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.investments import router as investments_router
from app.api.v1.endpoints.savings import router as savings_router


api_router = APIRouter()
api_router.include_router(auth_router, tags=["auth"])
api_router.include_router(comparisons_router, tags=["comparisons"])
api_router.include_router(daily_router, tags=["daily"])
api_router.include_router(health_router, tags=["system"])
api_router.include_router(investments_router, tags=["investments"])
api_router.include_router(savings_router, tags=["savings"])
