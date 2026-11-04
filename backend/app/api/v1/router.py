from fastapi import APIRouter

from app.api.v1.endpoints.admin import router as admin_router
from app.api.v1.endpoints.analytics import router as analytics_router
from app.api.v1.endpoints.assistant import router as assistant_router
from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.comparisons import router as comparisons_router
from app.api.v1.endpoints.daily import router as daily_router
from app.api.v1.endpoints.dart import router as dart_router
from app.api.v1.endpoints.events import router as events_router
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.investments import router as investments_router
from app.api.v1.endpoints.loans import router as loans_router
from app.api.v1.endpoints.youth_policies import router as youth_policies_router
from app.api.v1.endpoints.market import router as market_router
from app.api.v1.endpoints.maturity import router as maturity_router
from app.api.v1.endpoints.product_detail import router as product_detail_router
from app.api.v1.endpoints.plans import router as plans_router
from app.api.v1.endpoints.watchlist import router as watchlist_router
from app.api.v1.endpoints.savings import router as savings_router


api_router = APIRouter()
api_router.include_router(admin_router, tags=["admin"])
api_router.include_router(analytics_router, tags=["analytics"])
api_router.include_router(assistant_router, tags=["assistant"])
api_router.include_router(auth_router, tags=["auth"])
api_router.include_router(comparisons_router, tags=["comparisons"])
api_router.include_router(daily_router, tags=["daily"])
api_router.include_router(dart_router, tags=["dart"])
api_router.include_router(events_router, tags=["events"])
api_router.include_router(health_router, tags=["system"])
api_router.include_router(investments_router, tags=["investments"])
api_router.include_router(loans_router, tags=["loans"])
api_router.include_router(youth_policies_router, tags=["youth-policies"])
api_router.include_router(market_router, tags=["market"])
api_router.include_router(maturity_router, tags=["maturity"])
api_router.include_router(plans_router, tags=["plans"])
api_router.include_router(product_detail_router, tags=["products"])
api_router.include_router(watchlist_router, tags=["watchlist"])
api_router.include_router(savings_router, tags=["savings"])
