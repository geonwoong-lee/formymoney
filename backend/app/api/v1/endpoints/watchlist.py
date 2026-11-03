"""The starred products a signed-in user chose to keep on their account. Works only on the caller's own list."""

from datetime import datetime, timezone

from fastapi import APIRouter, Header, Request, Response, status
from sqlalchemy import delete, select
from sqlalchemy.exc import SQLAlchemyError

from app.api.v1.endpoints.plans import _user_id
from app.models.saved_watchlist import SavedWatchlist
from app.schemas.saved_plan import WatchedProduct, WatchlistRequest, WatchlistResponse
from fastapi import HTTPException

router = APIRouter()


def _unavailable() -> HTTPException:
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="관심 상품을 처리하지 못했습니다.")


@router.get("/me/watchlist", response_model=WatchlistResponse)
def get_watchlist(request: Request, authorization: str | None = Header(default=None)) -> WatchlistResponse:
    user_id = _user_id(request, authorization)
    try:
        with request.app.state.session_factory() as session:
            row = session.scalar(select(SavedWatchlist).where(SavedWatchlist.user_id == user_id))
            if row is None:
                return WatchlistResponse(items=[])
            return WatchlistResponse(items=[WatchedProduct.model_validate(item) for item in row.items], updated_at=row.updated_at)
    except SQLAlchemyError as error:
        raise _unavailable() from error


@router.put("/me/watchlist", response_model=WatchlistResponse)
def save_watchlist(payload: WatchlistRequest, request: Request, authorization: str | None = Header(default=None)) -> WatchlistResponse:
    """Replaces the saved list with the one in the request (the screen sends the whole list the person chose to keep)."""
    user_id = _user_id(request, authorization)
    now = datetime.now(timezone.utc)
    unique = list({(item.kind, item.company, item.product_code): item for item in payload.items}.values())
    try:
        with request.app.state.session_factory() as session:
            row = session.scalar(select(SavedWatchlist).where(SavedWatchlist.user_id == user_id))
            if row is None:
                row = SavedWatchlist(user_id=user_id)
                session.add(row)
            row.items = [item.model_dump(by_alias=True) for item in unique]
            row.updated_at = now
            session.commit()
            return WatchlistResponse(items=unique, updated_at=now)
    except SQLAlchemyError as error:
        raise _unavailable() from error


@router.delete("/me/watchlist", status_code=status.HTTP_204_NO_CONTENT)
def delete_watchlist(request: Request, authorization: str | None = Header(default=None)) -> Response:
    user_id = _user_id(request, authorization)
    try:
        with request.app.state.session_factory() as session:
            session.execute(delete(SavedWatchlist).where(SavedWatchlist.user_id == user_id))
            session.commit()
    except SQLAlchemyError as error:
        raise _unavailable() from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)
