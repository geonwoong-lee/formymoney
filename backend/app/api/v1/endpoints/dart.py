from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy.exc import SQLAlchemyError

from app.services.dart_service import DartService
from app.services.news_digest import korea_today

router = APIRouter()


def _unavailable(error: SQLAlchemyError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="전자공시 자료를 불러오지 못했습니다.")


@router.get("/banks/{bank_code}/financials")
def get_bank_financials(bank_code: str, request: Request) -> dict[str, object]:
    try:
        with request.app.state.session_factory() as session:
            found = DartService(session).financials(bank_code)
    except SQLAlchemyError as error:
        raise _unavailable(error) from error
    if found is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="이 은행의 DART 주요 재무 자료가 없어요.")
    return found


@router.get("/dart/banks")
def list_banks_with_financials(request: Request) -> dict[str, object]:
    try:
        with request.app.state.session_factory() as session:
            return {"banks": DartService(session).banks_with_financials()}
    except SQLAlchemyError as error:
        raise _unavailable(error) from error


@router.get("/dart/filings")
def list_recent_filings(request: Request, days: int = Query(default=14, ge=1, le=60), limit: int = Query(default=30, ge=1, le=100)) -> dict[str, object]:
    try:
        with request.app.state.session_factory() as session:
            items, routine = DartService(session).recent_filings(korea_today(), days, limit)
    except SQLAlchemyError as error:
        raise _unavailable(error) from error
    return {
        "items": items, "routineBondFilings": routine,
        "sourceName": "금융감독원 전자공시시스템(DART)", "sourceUrl": "https://dart.fss.or.kr/",
    }
