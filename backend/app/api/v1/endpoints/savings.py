from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy.exc import SQLAlchemyError

from app.schemas.savings import (
    MyStatusRequest,
    MyStatusResponse,
    CalculationRequest,
    CalculationResponse,
    CashflowCalculationRequest,
    CashflowCalculationResponse,
    EarlyExitRequest,
    EarlyExitResponse,
    MonthImpactRequest,
    MonthImpactResponse,
    ProductsResponse,
)
from app.services.early_exit import calculate_early_exit
from app.services.my_savings import my_status
from app.services.news_digest import korea_today
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


@router.post("/month-impact", response_model=MonthImpactResponse)
def calculate_month_impact(payload: MonthImpactRequest, request: Request) -> MonthImpactResponse:
    try:
        with request.app.state.session_factory() as session:
            return SavingsService(session).calculate_month_impact(payload)
    except SavingsInputError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)) from error
    except (SavingsDataError, SQLAlchemyError) as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error


@router.post("/early-exit", response_model=EarlyExitResponse)
def calculate_early_exit_endpoint(payload: EarlyExitRequest, request: Request) -> EarlyExitResponse:
    """지금 일반 중도해지할 때 받는 돈의 기본금리 기준 참고값과, 해지하지 않는 방법의 만기 수령액을 비교한다.

    낸 원금이 같은 것은 pause(남은 달 쉬기)뿐이고, minimum은 남은 달 최소 금액만큼 원금이 늘어난다(extraPrincipal)."""
    try:
        with request.app.state.session_factory() as session:
            return calculate_early_exit(SavingsService(session), payload)
    except SavingsInputError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)) from error
    except (SavingsDataError, SQLAlchemyError) as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error


@router.post("/my-status", response_model=MyStatusResponse)
def my_savings_status(payload: MyStatusRequest, request: Request) -> MyStatusResponse:
    """Where this person's savings stand this month, from the inputs kept in their browser or saved plan."""
    try:
        with request.app.state.session_factory() as session:
            return my_status(SavingsService(session), payload, korea_today())
    except SavingsInputError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)) from error
    except (SavingsDataError, SQLAlchemyError) as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
