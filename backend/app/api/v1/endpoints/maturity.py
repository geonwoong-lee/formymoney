from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy.exc import SQLAlchemyError

from app.schemas.maturity import MaturityPlanRequest, MaturityPlanResponse, RateScenarioRequest, RateScenarioResponse
from app.services.maturity_service import MaturityDataError, MaturityInputError, MaturityService, rate_scenario

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


@router.post("/rate-scenario", response_model=RateScenarioResponse)
def compare_rate_scenarios(payload: RateScenarioRequest) -> RateScenarioResponse:
    return rate_scenario(payload)
