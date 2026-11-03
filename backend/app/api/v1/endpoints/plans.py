"""Plans a signed-in user saved on request. Every route works only on the caller's own plans."""

from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException, Request, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import SQLAlchemyError

from app.api.v1.endpoints.auth import _bearer_token
from app.models.saved_plan import SavedPlan
from app.schemas.saved_plan import Draft, SavedPlanRequest, SavedPlanResponse, SavedPlansResponse
from app.services.auth_gateway import AuthCredentialsError, AuthGatewayError
from app.services.auth_service import AuthService

router = APIRouter()

PLAN_LIMIT = 10


def _user_id(request: Request, authorization: str | None) -> str:
    token = _bearer_token(authorization)
    try:
        return AuthService(request.app.state.auth_gateway).get_user(token).id
    except AuthCredentialsError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="로그인 상태를 확인해 주세요.") from error
    except AuthGatewayError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="로그인 확인을 하지 못했습니다.") from error


def _response(plan: SavedPlan) -> SavedPlanResponse:
    return SavedPlanResponse(
        id=plan.id, name=plan.name, draft=Draft.model_validate(plan.draft),
        created_at=plan.created_at, updated_at=plan.updated_at,
    )


def _unavailable(error: SQLAlchemyError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="저장한 계획을 처리하지 못했습니다.")


@router.get("/me/plans", response_model=SavedPlansResponse)
def list_plans(request: Request, authorization: str | None = Header(default=None)) -> SavedPlansResponse:
    user_id = _user_id(request, authorization)
    try:
        with request.app.state.session_factory() as session:
            plans = session.scalars(select(SavedPlan).where(SavedPlan.user_id == user_id).order_by(SavedPlan.updated_at.desc()))
            return SavedPlansResponse(plans=[_response(plan) for plan in plans], limit=PLAN_LIMIT)
    except SQLAlchemyError as error:
        raise _unavailable(error) from error


@router.post("/me/plans", response_model=SavedPlanResponse, status_code=status.HTTP_201_CREATED)
def save_plan(payload: SavedPlanRequest, request: Request, authorization: str | None = Header(default=None)) -> SavedPlanResponse:
    user_id = _user_id(request, authorization)
    now = datetime.now(timezone.utc)
    try:
        with request.app.state.session_factory() as session:
            count = session.scalar(select(func.count()).select_from(SavedPlan).where(SavedPlan.user_id == user_id)) or 0
            if count >= PLAN_LIMIT:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"계획은 {PLAN_LIMIT}개까지 저장할 수 있어요. 안 쓰는 계획을 지워 주세요.")
            plan = SavedPlan(
                user_id=user_id, name=payload.name, draft=payload.draft.model_dump(by_alias=True),
                created_at=now, updated_at=now,
            )
            session.add(plan)
            session.commit()
            return _response(plan)
    except SQLAlchemyError as error:
        raise _unavailable(error) from error


@router.put("/me/plans/{plan_id}", response_model=SavedPlanResponse)
def overwrite_plan(
    plan_id: int, payload: SavedPlanRequest, request: Request, authorization: str | None = Header(default=None),
) -> SavedPlanResponse:
    user_id = _user_id(request, authorization)
    try:
        with request.app.state.session_factory() as session:
            plan = session.scalar(select(SavedPlan).where(SavedPlan.id == plan_id, SavedPlan.user_id == user_id))
            if plan is None:  # someone else's plan looks exactly like a missing one
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="저장한 계획을 찾지 못했어요.")
            plan.name = payload.name
            plan.draft = payload.draft.model_dump(by_alias=True)
            plan.updated_at = datetime.now(timezone.utc)
            session.commit()
            return _response(plan)
    except SQLAlchemyError as error:
        raise _unavailable(error) from error


@router.delete("/me/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan(plan_id: int, request: Request, authorization: str | None = Header(default=None)) -> Response:
    user_id = _user_id(request, authorization)
    try:
        with request.app.state.session_factory() as session:
            result = session.execute(delete(SavedPlan).where(SavedPlan.id == plan_id, SavedPlan.user_id == user_id))
            session.commit()
    except SQLAlchemyError as error:
        raise _unavailable(error) from error
    if not result.rowcount:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="저장한 계획을 찾지 못했어요.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/me/plans", status_code=status.HTTP_204_NO_CONTENT)
def delete_all_plans(request: Request, authorization: str | None = Header(default=None)) -> Response:
    user_id = _user_id(request, authorization)
    try:
        with request.app.state.session_factory() as session:
            session.execute(delete(SavedPlan).where(SavedPlan.user_id == user_id))
            session.commit()
    except SQLAlchemyError as error:
        raise _unavailable(error) from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)
