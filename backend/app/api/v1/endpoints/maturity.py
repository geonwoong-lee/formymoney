from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy.exc import SQLAlchemyError

from app.schemas.maturity import DepositProductsRequest, DepositProductsResponse, MaturityPlanRequest, MaturityPlanResponse, RateScenarioRequest, RateScenarioResponse
from app.services.maturity_service import MaturityDataError, MaturityInputError, MaturityService, deposit_products, rate_scenario

router = APIRouter()


@router.post("/maturity-plan", response_model=MaturityPlanResponse)
def plan_after_maturity(payload: MaturityPlanRequest, request: Request) -> MaturityPlanResponse:
    try:
        with request.app.state.session_factory() as session:
            return MaturityService(session).plan(payload)
    except MaturityInputError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)) from error
    except (MaturityDataError, SQLAlchemyError) as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="만기 후 계획을 계산하지 못했습니다.") from error


@router.post("/maturity-plan/deposit-products", response_model=DepositProductsResponse)
def disclosed_deposit_products(payload: DepositProductsRequest, request: Request) -> DepositProductsResponse:
    try:
        with request.app.state.session_factory() as session:
            return deposit_products(session, payload)
    except SQLAlchemyError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="예금 상품 금리를 불러오지 못했습니다.") from error


@router.post("/rate-scenario", response_model=RateScenarioResponse)
def compare_rate_scenarios(payload: RateScenarioRequest) -> RateScenarioResponse:
    return rate_scenario(payload)
