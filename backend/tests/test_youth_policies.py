from datetime import date

from fastapi.testclient import TestClient

from app.collectors.youth_policy import YouthPolicyError, parse_page, parse_policy
from app.core.config import Settings
from app.services.daily_jobs import JobResult, collect_youth_policies
from app.services.youth_policy_service import save_youth_policies

URL = "/api/v1/youth-policies"
ALL_REGIONS = ",".join(f"{code}110" for code in ("11", "12", "26", "27", "28", "30", "31", "36", "41", "43", "44", "47", "48", "50", "51"))


def _item(no="P1", name="청년 월세 지원", **extra) -> dict[str, object]:
    base = {
        "plcyNo": no, "plcyNm": name, "plcyKywdNm": "월세,주거", "plcyExplnCn": "월세를 지원해요.\r\n\r\n  신청은 온라인", "plcySprtCn": "월 20만원",
        "lclsfNm": "주거,주거", "mclsfNm": "전월세", "sprtTrgtAgeLmtYn": "Y", "sprtTrgtMinAge": "19", "sprtTrgtMaxAge": "34",
        "earnEtcCn": "중위소득 60% 이하", "addAplyQlfcCndCn": "", "aplyYmd": "20261101 ~ 20261130", "plcyAplyMthdCn": "온라인", "srngMthdCn": "서류",
        "sprvsnInstCdNm": "국토교통부", "aplyUrlAddr": "https://apply.example.kr/1", "refUrlAddr1": "javascript:alert(1)", "zipCd": ALL_REGIONS,
        "lastMdfcnDt": "2026-11-03 17:43:16",
    }
    return {**base, **extra}


def _page(*items: dict[str, object], total: int | None = None) -> dict[str, object]:
    return {"resultCode": 200, "result": {"pagging": {"totCount": total if total is not None else len(items)}, "youthPolicyList": list(items)}}


def test_parse_reads_age_period_region_and_drops_unsafe_links() -> None:
    policy = parse_policy(_item())

    assert policy is not None
    assert (policy.min_age, policy.max_age) == (19, 34)
    assert (policy.apply_start, policy.apply_end) == (date(2026, 11, 1), date(2026, 11, 30))
    assert policy.nationwide and policy.category == "주거"  # duplicated category names are merged
    assert policy.summary == "월세를 지원해요.\n신청은 온라인"
    assert policy.apply_url == "https://apply.example.kr/1" and policy.ref_url == ""  # javascript: is not a link
    assert policy.modified_on == date(2026, 11, 3)


def test_parse_treats_zero_ages_unlimited_flag_and_missing_period_as_unknown() -> None:
    open_age = parse_policy(_item(sprtTrgtAgeLmtYn="N", sprtTrgtMinAge="0", sprtTrgtMaxAge="0", aplyYmd="", zipCd="11140,11200,26110"))
    zero_limit = parse_policy(_item(sprtTrgtMinAge="0", sprtTrgtMaxAge="0"))
    only_max = parse_policy(_item(sprtTrgtMinAge="0", sprtTrgtMaxAge="39"))

    assert open_age and (open_age.min_age, open_age.max_age, open_age.apply_end) == (None, None, None)
    assert open_age.regions == "11,26" and not open_age.nationwide
    assert zero_limit and (zero_limit.min_age, zero_limit.max_age) == (None, None)
    assert only_max and (only_max.min_age, only_max.max_age) == (None, 39)
    assert parse_policy(_item(no="", name="x")) is None


def test_a_local_government_that_ticked_every_region_is_local_but_a_ministry_stays_nationwide() -> None:
    hwasun = parse_policy(_item("H1", "화순군 만원임대주택 지원", sprvsnInstCdNm="전남광주통합특별시 화순군 인구청년정책과"))
    ministry = parse_policy(_item("M1", "청년 월세 한시 특별지원", sprvsnInstCdNm="국토교통부"))
    unclear = parse_policy(_item("U1", "청년 정착 지원", sprvsnInstCdNm="서산시"))
    small = parse_policy(_item("S1", "경기·인천 공동사업", sprvsnInstCdNm="경기도 청년정책과", zipCd="41110,28110,11110"))

    assert hwasun and (hwasun.regions, hwasun.nationwide) == ("12", False)
    assert ministry and ministry.nationwide  # a central ministry's policy is open everywhere
    assert unclear and unclear.nationwide  # a city name without its province cannot be placed, so the listed regions stand
    assert small and small.regions == "41,28,11" and not small.nationwide  # a few listed regions are kept as they are


def test_parse_page_rejects_error_payloads() -> None:
    policies, total = parse_page(_page(_item(), {"plcyNo": "", "plcyNm": ""}, total=3865))
    assert (len(policies), total) == (1, 3865)
    try:
        parse_page({"errorCode": "e001", "errorMsg": "invalid api key."})
    except YouthPolicyError as error:
        assert "invalid api key" in str(error)
    else:
        raise AssertionError("an error payload must raise")


def _save(client: TestClient, *items: dict[str, object]) -> None:
    with client.app.state.session_factory() as session:
        save_youth_policies(session, date(2026, 11, 4), [policy for item in items if (policy := parse_policy(item))])


def test_search_filters_by_keyword_age_region_and_open_applications(client: TestClient) -> None:
    _save(
        client,
        _item("P1", "청년 월세 지원"),
        _item("P2", "서울 청년 취업 수당", plcyKywdNm="취업", plcyExplnCn="구직 활동 지원", lclsfNm="일자리", sprtTrgtMaxAge="29", aplyYmd="20261201 ~ 20261231", zipCd="11110,11140"),
        _item("P3", "마감된 창업 지원", lclsfNm="창업", aplyYmd="20260101 ~ 20260131"),
        _item("P4", "상시 대출 이자 지원", sprtTrgtAgeLmtYn="N", aplyYmd="", zipCd="26110"),
    )

    def search(**body):
        response = client.post(URL, json=body)
        assert response.status_code == 200
        return response.json()

    everything = search()
    assert (everything["total"], everything["count"]) == (4, 3)  # the closed one is hidden by default
    assert [p["policyNo"] for p in everything["policies"]] == ["P1", "P2", "P4"]  # soonest deadline first, undated last
    assert search(openOnly=False)["count"] == 4
    assert [p["policyNo"] for p in search(keyword="취업")["policies"]] == ["P2"]
    assert [p["policyNo"] for p in search(keyword="구직")["policies"]] == ["P2"]  # matches the description too
    assert [p["policyNo"] for p in search(category="일자리")["policies"]] == ["P2"]
    assert [p["policyNo"] for p in search(region="26")["policies"]] == ["P1", "P4"]  # nationwide plus 부산
    assert [p["policyNo"] for p in search(region="11")["policies"]] == ["P1", "P2"]
    assert [p["policyNo"] for p in search(age=31)["policies"]] == ["P1", "P4"]  # P2 stops at 29; P4 lists no limit
    assert search(age=18)["policies"][0]["policyNo"] == "P4"
    assert search(keyword="100%_")["count"] == 0  # wildcard characters are plain text
    first = search(limit=1, offset=1)
    assert first["count"] == 3 and [p["policyNo"] for p in first["policies"]] == ["P2"]


def test_seoul_search_leaves_out_a_policy_of_another_regions_local_government(client: TestClient) -> None:
    _save(client, _item("H1", "화순군 만원임대주택 지원", sprvsnInstCdNm="전남광주통합특별시 화순군 인구청년정책과"), _item("M1", "청년 월세 특별지원", sprvsnInstCdNm="국토교통부"))

    seoul = client.post(URL, json={"region": "11"}).json()
    jeonnam = client.post(URL, json={"region": "12"}).json()

    assert [p["policyNo"] for p in seoul["policies"]] == ["M1"]
    assert sorted(p["policyNo"] for p in jeonnam["policies"]) == ["H1", "M1"]
    assert {p["policyNo"]: p["regionLabel"] for p in jeonnam["policies"]} == {"H1": "광주·전남", "M1": "전국"}


def test_search_rows_label_age_region_period_and_expose_filter_options(client: TestClient) -> None:
    _save(client, _item("P1"), _item("P4", "상시 지원", sprtTrgtAgeLmtYn="N", aplyYmd="", zipCd="11110,26110,27110,28110"))
    body = client.post(URL, json={"sort": "recent"}).json()
    rows = {row["policyNo"]: row for row in body["policies"]}

    assert rows["P1"]["ageLabel"] == "만 19~34세" and rows["P1"]["regionLabel"] == "전국"
    assert rows["P1"]["applyLabel"] == "2026.11.01 ~ 2026.11.30"
    assert rows["P4"]["ageLabel"] == "" and rows["P4"]["applyLabel"] == "신청 기간은 공고에서 확인하세요"
    assert rows["P4"]["regionLabel"] == "서울·부산·대구 외 1곳"
    assert rows["P1"]["category"] == "주거" and rows["P1"]["refUrl"] == ""
    assert body["categories"] == ["주거"] and ("12", "광주·전남") in {(r["code"], r["name"]) for r in body["regions"]}
    assert body["day"] == "2026-11-04" and body["sourceUrl"].startswith("https://www.youthcenter.go.kr")


def test_search_rejects_out_of_range_input(client: TestClient) -> None:
    for body in ({"age": 200}, {"limit": 201}, {"offset": -1}, {"sort": "popular"}, {"keyword": "가" * 51}):
        assert client.post(URL, json=body).status_code == 422


def test_collection_keeps_the_stored_list_when_the_api_fails_and_skips_without_a_key(client: TestClient) -> None:
    _save(client, _item("P1"))

    def broken(_key: str):
        raise YouthPolicyError("온통청년 API 요청이 4번 모두 실패했습니다(HTTP 403).")

    with client.app.state.session_factory() as session:
        skipped = JobResult("market")
        collect_youth_policies(Settings(_env_file=None), session, skipped, date(2026, 11, 5), broken)
        failed = JobResult("market")
        collect_youth_policies(Settings(_env_file=None, youth_api_key="x"), session, failed, date(2026, 11, 5), broken)
        ok = JobResult("market")
        collect_youth_policies(Settings(_env_file=None, youth_api_key="x"), session, ok, date(2026, 11, 5), lambda _key: [parse_policy(_item("P9", "새 정책"))])

    assert skipped.attempted == 0 and not skipped.failures
    assert failed.failures and failed.status == "failed"
    assert ok.notes == ["온통청년 청년정책 1건 저장"]
    assert [p["policyNo"] for p in client.post(URL, json={"openOnly": False}).json()["policies"]] == ["P9"]


def test_parse_keeps_condition_codes_and_drops_junk() -> None:
    policy = parse_policy(_item(jobCd="0013002,0013006, x,0013002", mrgSttsCd="0055001", schoolCd="0049010", earnCndSeCd="0043003"))
    assert (policy.job_codes, policy.marriage_code, policy.school_codes, policy.income_condition) == ("0013002,0013006", "0055001", "0049010", "0043003")
    empty = parse_policy(_item())
    assert (empty.job_codes, empty.marriage_code, empty.school_codes, empty.income_condition) == ("", "", "", "")


def test_search_by_my_situation_keeps_unrestricted_policies_and_says_why_each_fits(client: TestClient) -> None:
    _save(
        client,
        _item("ANY", "누구나 월세 지원", jobCd="0013010", mrgSttsCd="0055003", schoolCd="0049010", earnCndSeCd="0043001", earnEtcCn=""),
        _item("JOB", "미취업 청년 구직 수당", jobCd="0013003", mrgSttsCd="0055003", schoolCd="0049010", earnCndSeCd="0043002"),
        _item("WED", "신혼부부 이자 지원", jobCd="0013010", mrgSttsCd="0055001", schoolCd="0049010", earnCndSeCd="0043003", addAplyQlfcCndCn="무주택자"),
        _item("UNI", "대학생 장학금", jobCd="0013003,0013001", mrgSttsCd="0055003", schoolCd="0049005,0049006", earnCndSeCd="0043001", earnEtcCn=""),
    )

    def search(**body):
        response = client.post(URL, json=body)
        assert response.status_code == 200, response.text
        return response.json()

    def numbers(body):
        return sorted(policy["policyNo"] for policy in body["policies"])

    everything = search()
    assert everything["conditionsCollected"] is True
    assert {item["code"] for item in everything["profileOptions"]["jobs"]} == {
        "0013001", "0013002", "0013003", "0013004", "0013005", "0013006", "0013007", "0013008"}
    assert {item["name"] for item in everything["profileOptions"]["jobs"]} >= {"일용근로자", "단기근로자"}
    assert numbers(search(job="0013001")) == ["ANY", "UNI", "WED"]  # 재직자는 미취업자만 받는 정책에서 빠진다
    assert numbers(search(job="0013003")) == ["ANY", "JOB", "UNI", "WED"]
    assert numbers(search(marriage="0055002")) == ["ANY", "JOB", "UNI"]  # 미혼은 신혼부부 정책에서 빠진다
    assert numbers(search(school="0049007")) == ["ANY", "JOB", "WED"]  # 대학 졸업은 재학생 장학금에서 빠진다

    rows = {policy["policyNo"]: policy for policy in search(job="0013003", age=25, region="11")["policies"]}
    assert rows["JOB"]["fit"] == ["나이 만 19~34세 대상에 들어요", "전국 대상이에요", "취업 상태: 미취업자 대상에 들어요"]
    assert rows["ANY"]["fit"][-1] == "취업 상태 제한이 없어요"
    assert rows["JOB"]["toCheck"] == ["연소득 조건이 있어요(금액은 공고에서 확인)"]
    assert rows["WED"]["toCheck"] == ["결혼 여부: 기혼 대상", "소득 조건이 있어요(아래 소득 조건 참고)", "추가 자격 조건이 있어요(아래 추가 자격 참고)"]
    assert rows["UNI"]["toCheck"] == ["학력: 대학 재학, 대졸 예정 대상"]
    assert rows["ANY"]["toCheck"] == []
    # 내 상황을 고르지 않으면 맞는 이유는 비고, 확인할 조건만 보인다.
    plain = {policy["policyNo"]: policy for policy in search()["policies"]}
    assert plain["JOB"]["fit"] == [] and plain["JOB"]["toCheck"] == ["취업 상태: 미취업자 대상", "연소득 조건이 있어요(금액은 공고에서 확인)"]


def test_policies_saved_before_the_codes_were_collected_are_flagged(client: TestClient) -> None:
    _save(client, _item("OLD", "예전에 모은 정책"))
    body = client.post(URL, json={"job": "0013001", "marriage": "0055002"}).json()
    assert body["conditionsCollected"] is False
    old = body["policies"][0]
    assert old["policyNo"] == "OLD"  # 코드가 없으면 거르지 않는다
    # 코드가 없는 칸을 "제한이 없어요"라고 말하지 않고 확인할 조건으로 돌린다.
    assert not any("제한이 없어요" in line for line in old["fit"])
    assert old["toCheck"][:2] == ["취업 상태 조건은 공고에서 확인", "결혼 여부 조건은 공고에서 확인"]


def test_only_income_codes_do_not_count_as_collected_situation_codes(client: TestClient) -> None:
    _save(client, _item("INC", "소득 코드만 있는 정책", earnCndSeCd="0043001"))
    assert client.post(URL, json={}).json()["conditionsCollected"] is False


def test_a_day_worker_keeps_policies_listed_for_day_workers(client: TestClient) -> None:
    _save(
        client,
        _item("DAY", "일하는 청년 통장", jobCd="0013001,0013005,0013007"),
        _item("JOBLESS", "미취업 청년 수당", jobCd="0013003"),
    )
    for code in ("0013005", "0013007"):
        body = client.post(URL, json={"job": code}).json()
        assert [policy["policyNo"] for policy in body["policies"]] == ["DAY"]


def test_several_situations_apply_together(client: TestClient) -> None:
    _save(
        client,
        _item("ALL", "모두 제한 없음", jobCd="0013010", mrgSttsCd="0055003", schoolCd="0049010"),
        _item("WORK_SINGLE", "재직 미혼 대상", jobCd="0013001", mrgSttsCd="0055002", schoolCd="0049010"),
        _item("WORK_MARRIED", "재직 기혼 대상", jobCd="0013001", mrgSttsCd="0055001", schoolCd="0049010"),
        _item("WORK_UNI", "재직 대학 재학 대상", jobCd="0013001", mrgSttsCd="0055003", schoolCd="0049005"),
        _item("BLANK", "칸이 빈 정책", mrgSttsCd="0055003"),
    )
    body = client.post(URL, json={"job": "0013001", "marriage": "0055002", "school": "0049007"}).json()
    assert sorted(policy["policyNo"] for policy in body["policies"]) == ["ALL", "BLANK", "WORK_SINGLE"]


def test_situation_codes_must_be_the_right_kind(client: TestClient) -> None:
    for body in ({"job": "0055001"}, {"marriage": "x"}, {"school": "00490051"}, {"job": "0013001;--"}):
        assert client.post(URL, json=body).status_code == 422
