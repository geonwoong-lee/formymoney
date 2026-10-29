from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy.exc import SQLAlchemyError

from app.schemas.investment import (
    InvestmentAssetsResponse,
    InvestmentCalculationRequest,
    InvestmentCalculationResponse,
)
from app.services.investment_service import InvestmentDataError, InvestmentInputError, InvestmentService


router = APIRouter(prefix="/investments")


@router.get("/assets", response_model=InvestmentAssetsResponse)
def get_investment_assets(request: Request) -> InvestmentAssetsResponse:
    try:
        with request.app.state.session_factory() as session:
            return InvestmentService(session).get_assets()
    except (InvestmentDataError, SQLAlchemyError) as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error


@router.post("/calculate", response_model=InvestmentCalculationResponse)
def calculate_investments(
    payload: InvestmentCalculationRequest,
    request: Request,
) -> InvestmentCalculationResponse:
    try:
        with request.app.state.session_factory() as session:
            return InvestmentService(session).calculate(payload)
    except InvestmentInputError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)) from error
    except (InvestmentDataError, SQLAlchemyError) as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
