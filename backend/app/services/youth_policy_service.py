"""온통청년 youth policies, filtered on the server by keyword, field, region, age and whether applications are still open.

Nothing here ranks or recommends a policy. The list is ordered by application deadline (or most recently changed) only,
and the visitor's age is used to filter the request and is not stored.
"""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.collectors.youth_policy import REGIONS, YouthPolicy as FetchedPolicy
from app.models.youth_policy import YouthPolicy
from app.schemas.youth_policies import ProfileOptions, RegionOption, YouthPoliciesRequest, YouthPoliciesResponse, YouthPolicyRow

KST = ZoneInfo("Asia/Seoul")
SOURCE_NAME = "온통청년 청년정책 Open API (한국고용정보원)"
SOURCE_URL = "https://www.youthcenter.go.kr/"
NO_PERIOD = "신청 기간은 공고에서 확인하세요"
NOTES = [
    "온통청년에 등록된 정책을 하루 한 번 가져와요. 신청 기간, 대상, 금액은 바뀔 수 있으니 신청 전에 공고에서 다시 확인해 주세요.",
    "나이는 정책에 나이 제한이 적혀 있을 때만 걸러요. 취업 상태·결혼 여부·학력은 온통청년에 등록된 대상 구분으로만 걸러요. 소득, 거주 기간 같은 다른 조건은 정책마다 달라서 판정하지 않고 '확인할 조건'으로 알려 드려요. 신청 전에 공고에서 확인해 주세요.",
    "목록은 신청 마감이 가까운 순서(또는 최근에 바뀐 순서)로 줄 세웠을 뿐이고 어떤 정책이 좋다는 뜻이 아니에요.",
    "신청 기간이 날짜로 들어 있지 않은 정책(상시 모집 등)은 '신청 기간은 공고에서 확인하세요'로 보여요. 지금 신청할 수 있는지는 공고에서 확인해 주세요.",
]


# 온통청년 조건 코드. 정책 원문과 맞춰 본 뜻(2026-11-05, 예: 0013001 정책은 "재직 청년", 0055001은 신혼부부 지원).
JOBS = {
    "0013001": "재직자", "0013002": "자영업자", "0013003": "미취업자", "0013004": "프리랜서", "0013005": "일용근로자",
    "0013006": "(예비)창업자", "0013007": "단기근로자", "0013008": "영농종사자", "0013009": "기타",
}
JOB_ANY = "0013010"
# 화면에서 고를 수 있는 내 취업 상태(정책 원문으로 뜻을 확인한 것)
# 0013005·0013007은 "노동자 청년", "일하는 청년" 정책에 재직자와 함께 붙어 있어 일용·단기 근로자로 확인했다. 0013009(기타)는 어업 등 여러 경우를 묶어 고르게 하지 않는다.
PICKABLE_JOBS = ("0013001", "0013002", "0013003", "0013004", "0013005", "0013006", "0013007", "0013008")
MARRIAGES = {"0055001": "기혼", "0055002": "미혼"}
MARRIAGE_ANY = "0055003"
SCHOOLS = {
    "0049001": "고졸 미만", "0049002": "고교 재학", "0049003": "고졸 예정", "0049004": "고교 졸업", "0049005": "대학 재학",
    "0049006": "대졸 예정", "0049007": "대학 졸업", "0049008": "석·박사", "0049009": "기타",
}
SCHOOL_ANY = "0049010"
INCOME_ANY, INCOME_ANNUAL, INCOME_OTHER = "0043001", "0043002", "0043003"


def _restricted(codes: str, any_code: str) -> list[str]:
    """정책이 정한 대상 코드. 비었거나 '제한없음'이 들어 있으면 제한이 없는 것으로 본다."""
    parts = [code for code in codes.split(",") if code]
    return [] if not parts or any_code in parts else parts


def _names(codes: list[str], table: dict[str, str]) -> str:
    return ", ".join(table.get(code, "기타") for code in codes)


def _matches(column, code: str, any_code: str):
    # 조건이 없거나, '제한없음'이거나, 내 상황 코드가 들어 있는 정책
    return or_(column == "", column.contains(any_code), column.contains(code))


def fit_and_checks(row: YouthPolicy, request: YouthPoliciesRequest) -> tuple[list[str], list[str]]:
    fit: list[str] = []
    checks: list[str] = []
    if request.age is not None:
        fit.append(f"나이 {age_label(row.min_age, row.max_age)} 대상에 들어요" if row.min_age or row.max_age else "나이 제한이 없어요")
    if request.region in REGIONS:
        fit.append("전국 대상이에요" if row.nationwide else f"{REGIONS[request.region]} 대상이에요")
    for chosen, codes, any_code, table, label in (
        (request.job, row.job_codes, JOB_ANY, JOBS, "취업 상태"),
        (request.marriage, row.marriage_code, MARRIAGE_ANY, MARRIAGES, "결혼 여부"),
        (request.school, row.school_codes, SCHOOL_ANY, SCHOOLS, "학력"),
    ):
        targets = _restricted(codes, any_code)
        if not codes:
            # 코드가 없는 정책(이 칸을 모으기 전에 저장됐거나 온통청년에 비어 있음)은 제한이 없다고 말하지 않는다.
            if chosen:
                checks.append(f"{label} 조건은 공고에서 확인")
        elif chosen:
            fit.append(f"{label} 제한이 없어요" if not targets else f"{label}: {table.get(chosen, '고른 상황')} 대상에 들어요")
        elif targets:
            checks.append(f"{label}: {_names(targets, table)} 대상")
    if row.income_condition == INCOME_ANNUAL:
        checks.append("연소득 조건이 있어요(금액은 공고에서 확인)")
    elif row.income_condition == INCOME_OTHER or (row.income_condition != INCOME_ANY and row.income_note):
        checks.append("소득 조건이 있어요(아래 소득 조건 참고)")
    if row.extra_conditions:
        checks.append("추가 자격 조건이 있어요(아래 추가 자격 참고)")
    return fit, checks


def today() -> date:
    return datetime.now(KST).date()


def save_youth_policies(session: Session, day: date, policies: list[FetchedPolicy]) -> int:
    """Replace the stored policies with today's list. Nothing is replaced when the list came back empty."""
    if not policies:
        return 0
    session.execute(delete(YouthPolicy))
    seen: set[str] = set()
    for policy in policies:
        if policy.policy_no in seen:
            continue
        seen.add(policy.policy_no)
        session.add(YouthPolicy(
            policy_no=policy.policy_no, name=policy.name, keywords=policy.keywords, summary=policy.summary, support=policy.support,
            category=policy.category, subcategory=policy.subcategory, min_age=policy.min_age, max_age=policy.max_age,
            income_note=policy.income_note, extra_conditions=policy.extra_conditions, apply_start=policy.apply_start,
            apply_end=policy.apply_end, apply_method=policy.apply_method, selection=policy.selection, institution=policy.institution,
            apply_url=policy.apply_url, ref_url=policy.ref_url, regions=policy.regions, nationwide=policy.nationwide,
            modified_on=policy.modified_on, updated_on=day, job_codes=policy.job_codes, marriage_code=policy.marriage_code,
            school_codes=policy.school_codes, income_condition=policy.income_condition,
        ))
    session.commit()
    return len(seen)


def age_label(low: int | None, high: int | None) -> str:
    if low and high:
        return f"만 {low}~{high}세"
    if high:
        return f"만 {high}세 이하"
    if low:
        return f"만 {low}세 이상"
    return ""


def region_label(row: YouthPolicy) -> str:
    if row.nationwide:
        return "전국"
    names = [REGIONS[code] for code in row.regions.split(",") if code in REGIONS]
    if not names:
        return "지역 정보 없음"
    return "·".join(names[:3]) + (f" 외 {len(names) - 3}곳" if len(names) > 3 else "")


def apply_label(row: YouthPolicy, now: date) -> str:
    if row.apply_start and row.apply_end:
        label = f"{row.apply_start:%Y.%m.%d} ~ {row.apply_end:%Y.%m.%d}"
        return label + (" (마감)" if row.apply_end < now else "")
    return NO_PERIOD


def _like(text: str) -> str:
    return "%" + text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def youth_policies(session: Session, request: YouthPoliciesRequest, now: date | None = None) -> YouthPoliciesResponse:
    now = now or today()
    conditions = []
    keyword = " ".join(request.keyword.split())
    if keyword:
        pattern = _like(keyword)
        conditions.append(or_(*(column.ilike(pattern, escape="\\") for column in (YouthPolicy.name, YouthPolicy.keywords, YouthPolicy.summary, YouthPolicy.support))))
    if request.category:
        conditions.append(YouthPolicy.category.ilike(_like(request.category), escape="\\"))
    if request.region in REGIONS:
        conditions.append(or_(YouthPolicy.nationwide.is_(True), YouthPolicy.regions.ilike(_like(request.region), escape="\\")))
    if request.age is not None:
        conditions.append(or_(YouthPolicy.min_age.is_(None), YouthPolicy.min_age <= request.age))
        conditions.append(or_(YouthPolicy.max_age.is_(None), YouthPolicy.max_age >= request.age))
    if request.job:
        conditions.append(_matches(YouthPolicy.job_codes, request.job, JOB_ANY))
    if request.marriage:
        conditions.append(_matches(YouthPolicy.marriage_code, request.marriage, MARRIAGE_ANY))
    if request.school:
        conditions.append(_matches(YouthPolicy.school_codes, request.school, SCHOOL_ANY))
    if request.open_only:
        conditions.append(or_(YouthPolicy.apply_end.is_(None), YouthPolicy.apply_end >= now))

    total = session.scalar(select(func.count()).select_from(YouthPolicy)) or 0
    count = session.scalar(select(func.count()).select_from(YouthPolicy).where(*conditions)) or 0
    if request.sort == "deadline":
        # Policies with a dated deadline first, soonest first; the rest by most recent change.
        order = (YouthPolicy.apply_end.is_(None), YouthPolicy.apply_end.asc(), YouthPolicy.modified_on.desc(), YouthPolicy.id)
    else:
        order = (YouthPolicy.modified_on.is_(None), YouthPolicy.modified_on.desc(), YouthPolicy.id)
    rows = session.scalars(select(YouthPolicy).where(*conditions).order_by(*order).offset(request.offset).limit(request.limit))

    categories = sorted({part for value in session.scalars(select(YouthPolicy.category).distinct()) for part in value.split(",") if part})
    day = session.scalar(select(func.max(YouthPolicy.updated_on)))
    return YouthPoliciesResponse(
        day=day.isoformat() if isinstance(day, date) else None, total=total, count=count, offset=request.offset,
        policies=[YouthPolicyRow(
            policy_no=row.policy_no, name=row.name, keywords=[word for word in row.keywords.split(",") if word.strip()][:6],
            summary=row.summary, support=row.support, category=row.category.replace(",", " · "), age_label=age_label(row.min_age, row.max_age),
            income_note=row.income_note, extra_conditions=row.extra_conditions, apply_label=apply_label(row, now),
            apply_end=row.apply_end.isoformat() if row.apply_end else None, apply_method=row.apply_method, selection=row.selection,
            institution=row.institution, apply_url=row.apply_url, ref_url=row.ref_url, region_label=region_label(row),
            modified_on=row.modified_on.isoformat() if row.modified_on else None,
            fit=(pair := fit_and_checks(row, request))[0], to_check=pair[1],
        ) for row in rows],
        categories=categories, regions=[RegionOption(code=code, name=name) for code, name in REGIONS.items()],
        notes=NOTES, source_name=SOURCE_NAME, source_url=SOURCE_URL,
        profile_options=ProfileOptions(
            jobs=[RegionOption(code=code, name=name) for code, name in JOBS.items() if code in PICKABLE_JOBS],
            marriages=[RegionOption(code=code, name=name) for code, name in MARRIAGES.items()],
            schools=[RegionOption(code=code, name=name) for code, name in SCHOOLS.items() if code != "0049009"],
        ),
        conditions_collected=bool(session.scalar(select(func.count()).select_from(YouthPolicy).where(
            or_(YouthPolicy.job_codes != "", YouthPolicy.marriage_code != "", YouthPolicy.school_codes != "")))),
    )
