from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy.exc import SQLAlchemyError

from app.schemas.youth_policies import YouthPoliciesRequest, YouthPoliciesResponse
from app.services.youth_policy_service import youth_policies

router = APIRouter()


@router.post("/youth-policies", response_model=YouthPoliciesResponse)
def listed_youth_policies(payload: YouthPoliciesRequest, request: Request) -> YouthPoliciesResponse:
    """온통청년 policies filtered by keyword, field, region, age and whether applications are still open."""
    try:
        with request.app.state.session_factory() as session:
            return youth_policies(session, payload)
    except SQLAlchemyError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="청년정책을 불러오지 못했습니다.") from error
