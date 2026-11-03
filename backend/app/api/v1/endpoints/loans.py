from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy.exc import SQLAlchemyError

from app.schemas.loans import LoanProductsRequest, LoanProductsResponse
from app.services.loan_service import loan_products

router = APIRouter()


@router.post("/loan-products", response_model=LoanProductsResponse)
def disclosed_loan_products(payload: LoanProductsRequest, request: Request) -> LoanProductsResponse:
    """Disclosed rent deposit loans for an amount and term, with the cost at each product's lowest and highest rate."""
    try:
        with request.app.state.session_factory() as session:
            return loan_products(session, payload)
    except SQLAlchemyError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="전세자금대출 금리를 불러오지 못했습니다.") from error
