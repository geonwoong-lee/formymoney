from fastapi import APIRouter, Header, HTTPException, Request, status
from sqlalchemy.exc import SQLAlchemyError

from app.api.v1.endpoints.daily import _require_ingest_secret
from app.services.collection_overview import collection_overview
from app.services.news_digest import korea_today

router = APIRouter()


@router.get("/internal/collection/overview")
def get_collection_overview(
    request: Request,
    ingest_secret: str | None = Header(default=None, alias="X-Very-Rich-Ingest-Secret"),
) -> dict[str, object]:
    """Latest day and size of every collected source, for the operator. Needs the internal secret."""
    _require_ingest_secret(request, ingest_secret)
    try:
        with request.app.state.session_factory() as session:
            return collection_overview(session, korea_today())
    except SQLAlchemyError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="수집 현황을 불러오지 못했습니다.") from error
