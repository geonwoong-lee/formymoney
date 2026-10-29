from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy.exc import SQLAlchemyError

from app.schemas.savings import (
    CalculationRequest,
    CalculationResponse,
    CashflowCalculationRequest,
    CashflowCalculationResponse,
    ProductsResponse,
)
from app.services.savings_service import SavingsDataError, SavingsInputError, SavingsService


router = APIRouter(prefix="/savings")


@router.get("/products", response_model=ProductsResponse)
def get_products(request: Request) -> ProductsResponse:
    try:
        with request.app.state.session_factory() as session:
            return SavingsService(session).get_products()
    except (SavingsDataError, SQLAlchemyError) as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error


@router.post("/calculate", response_model=CalculationResponse)
def calculate_savings(payload: CalculationRequest, request: Request) -> CalculationResponse:
    try:
        with request.app.state.session_factory() as session:
            return SavingsService(session).calculate(payload)
    except SavingsInputError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)) from error
    except (SavingsDataError, SQLAlchemyError) as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error


@router.post("/calculate-cashflow", response_model=CashflowCalculationResponse)
def calculate_cashflow(
    payload: CashflowCalculationRequest,
    request: Request,
) -> CashflowCalculationResponse:
    try:
        with request.app.state.session_factory() as session:
            return SavingsService(session).calculate_cashflow(payload)
    except SavingsInputError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)) from error
    except (SavingsDataError, SQLAlchemyError) as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
