from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy.exc import SQLAlchemyError

from app.schemas.comparison import ComparisonRequest, ComparisonResponse
from app.services.comparison_service import ComparisonService
from app.services.investment_service import InvestmentDataError, InvestmentInputError
from app.services.savings_service import SavingsDataError, SavingsInputError


router = APIRouter(prefix="/comparisons")


@router.post("/calculate", response_model=ComparisonResponse)
def calculate_comparison(payload: ComparisonRequest, request: Request) -> ComparisonResponse:
    try:
        with request.app.state.session_factory() as session:
            return ComparisonService(session).calculate(payload)
    except (SavingsInputError, InvestmentInputError) as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)) from error
    except (SavingsDataError, InvestmentDataError, SQLAlchemyError) as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
