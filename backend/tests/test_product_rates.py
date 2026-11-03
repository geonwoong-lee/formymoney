from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.collectors.finlife import FinlifeError, ProductRate, parse_page
from app.core.config import Settings
from app.services import daily_jobs
from app.services.daily_jobs import JobResult, collect_product_rates
from app.services.product_rate_service import ProductRateService


def _payload(rate: str = "3.00", max_rate: str = "4.50", err: str = "000") -> dict[str, object]:
    return {"result": {
        "err_cd": err, "err_msg": "정상", "total_count": "1", "max_page_no": "1", "now_page_no": "1",
        "baseList": [{"dcls_month": "202610", "fin_co_no": "0010001", "kor_co_nm": "가나은행", "fin_prdt_cd": "P1", "fin_prdt_nm": "가나 적금"}],
        "optionList": [
            {"fin_prdt_cd": "P1", "intr_rate_type_nm": "단리", "rsrv_type_nm": "정액적립식", "save_trm": "12", "intr_rate": rate, "intr_rate2": max_rate},
            {"fin_prdt_cd": "P1", "intr_rate_type_nm": "단리", "rsrv_type_nm": "정액적립식", "save_trm": "24", "intr_rate": "3.10", "intr_rate2": None},
            {"fin_prdt_cd": "NOPE", "save_trm": "12", "intr_rate": "9"},
            {"fin_prdt_cd": "P1", "save_trm": "x", "intr_rate": "9"},
        ],
    }}


def _rate(rate: str, max_rate: str | None = "4.50", term: int = 12, code: str = "P1") -> ProductRate:
    return ProductRate(
        "saving", "은행", "가나은행", code, "가나 적금", term, "단리", "정액적립식", Decimal(rate),
        Decimal(max_rate) if max_rate else None, "202610",
    )


def test_parse_page_joins_options_to_products_and_skips_broken_rows() -> None:
    rates, max_page = parse_page(_payload(), "saving", "020000")

    assert max_page == 1
    assert [(rate.product_code, rate.term_months, rate.base_rate, rate.max_rate) for rate in rates] == [
        ("P1", 12, Decimal("3.00"), Decimal("4.50")), ("P1", 24, Decimal("3.10"), None),
    ]
    assert rates[0].group == "은행" and rates[0].reserve_type == "정액적립식" and rates[0].disclosed_month == "202610"
    with pytest.raises(FinlifeError, match="010"):
        parse_page(_payload(err="010"), "saving", "020000")
    with pytest.raises(FinlifeError):
        parse_page({"nope": 1}, "saving", "020000")


def test_parse_page_keeps_each_products_joining_terms() -> None:
    payload = _payload()
    payload["result"]["baseList"][0].update({
        "join_way": "인터넷,스마트폰", "join_member": "실명의 개인", "join_deny": "2",
        "spcl_cnd": "1. 급여 이체 시 0.2%p   \n2. 카드 사용 시 0.1%p", "max_limit": 30000000,
        "etc_note": "최소 1만원", "mtrt_int": "만기 후 1개월: 약정이율의 50%",
    })
    rates, _ = parse_page(payload, "deposit", "020000")
    info = rates[0].info

    assert rates[1].info is info  # one product, one set of terms for every term option
    assert (info.join_way, info.join_member, info.join_limit, info.max_limit) == ("인터넷,스마트폰", "실명의 개인", "서민 전용", 30_000_000)
    assert info.special_conditions == "1. 급여 이체 시 0.2%p\n2. 카드 사용 시 0.1%p"
    assert parse_page(_payload(), "deposit", "020000")[0][0].info.max_limit is None  # no limit disclosed


def test_changes_show_only_what_moved_since_the_previous_day_in_points(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        service = ProductRateService(session)
        assert service.changes()["latestDay"] is None
        service.save_snapshot(date(2026, 11, 1), [_rate("3.00"), _rate("3.10", None, 24), _rate("2.00", code="OLD")])
        assert service.changes()["previousDay"] is None
        service.save_snapshot(date(2026, 11, 2), [_rate("3.20", "4.40"), _rate("3.10", None, 24), _rate("2.50", code="NEW")])
        service.save_snapshot(date(2026, 11, 2), [_rate("3.20", "4.40"), _rate("3.10", None, 24), _rate("2.50", code="NEW")])  # same-day re-run
        body = service.changes()

    assert (body["latestDay"], body["previousDay"], body["productCount"], body["added"], body["removed"]) == ("2026-11-02", "2026-11-01", 3, 1, 1)
    assert [(item["fieldLabel"], item["before"], item["after"], item["changePoint"]) for item in body["changes"]] == [
        ("기본금리", "3.00", "3.20", "0.20"), ("최고 우대금리", "4.50", "4.40", "-0.10"),
    ]


def test_market_job_skips_product_rates_without_a_key_and_saves_them_with_one(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        quiet = JobResult("market")
        collect_product_rates(Settings(_env_file=None), session, quiet, date(2026, 11, 2))
        assert quiet.failures == [] and "VERY_RICH_FINLIFE_API_KEY" in quiet.notes[0]

        def fetch(key, kind, group):
            if group == "030300":
                raise FinlifeError("금감원 API에 연결하지 못했습니다.")
            return [_rate("3.00")] if kind == "saving" else []

        result = JobResult("market")
        collect_product_rates(Settings(_env_file=None, finlife_api_key="k" * 32), session, result, date(2026, 11, 2), fetch)

    assert result.attempted == 4 and len(result.failures) == 2 and result.collected == 1
    assert result.notes == ["금감원 공시 금리 1개 상품·기간 저장"]


def test_changes_endpoint_names_the_source(client: TestClient) -> None:
    body = client.get("/api/v1/market/product-rates/changes").json()
    assert body["latestDay"] is None and body["changes"] == []
    assert body["sourceName"] == "금융감독원 금융상품 한눈에" and body["sourceUrl"] == "https://finlife.fss.or.kr/"
    assert daily_jobs.FINLIFE_GROUPS == {"020000": "은행", "030300": "저축은행"}


def _bank_rate(company: str, code: str, rate: str, kind: str = "deposit") -> ProductRate:
    return ProductRate(kind, "은행", company, code, f"{code} 상품", 12, "단리", "", Decimal(rate), None, "202611")


def test_alerts_show_only_my_banks_moves_and_my_starred_products(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        service = ProductRateService(session)
        first = [_bank_rate("국민은행", "KB1", "3.00"), _bank_rate("주식회사 카카오뱅크", "KK1", "3.10"), _bank_rate("우리은행", "WR1", "2.90"),
                 _bank_rate("우리은행", "WR2", "2.80", "saving")]
        service.save_snapshot(date(2026, 11, 3), first)
        quiet = client.post("/api/v1/market/product-rates/alerts", json={"bankCode": "kb"}).json()
        assert (quiet["previousDay"], quiet["bank"]) == (None, {"bankCode": "kb", "company": "국민은행", "changes": []})
        service.save_snapshot(date(2026, 11, 4), [_bank_rate("국민은행", "KB1", "2.90"), _bank_rate("주식회사 카카오뱅크", "KK1", "3.20"),
                                                  _bank_rate("우리은행", "WR1", "3.00"), _bank_rate("우리은행", "WR2", "2.80", "saving")])

    body = client.post("/api/v1/market/product-rates/alerts", json={
        "bankCode": "kb", "watch": [{"kind": "deposit", "company": "카카오뱅크", "productCode": "KK1"}, {"kind": "saving", "company": "우리은행", "productCode": "WR2"}],
    }).json()
    assert (body["latestDay"], body["previousDay"]) == ("2026-11-04", "2026-11-03")
    assert [(item["productCode"], item["before"], item["after"], item["changePoint"]) for item in body["bank"]["changes"]] == [("KB1", "3.00", "2.90", "-0.10")]
    assert [item["productCode"] for item in body["watched"]] == ["KK1"]  # 우리은행 WR1 moved but is neither my bank nor starred
    assert client.post("/api/v1/market/product-rates/alerts", json={"bankCode": "post"}).json()["bank"] is None  # 우체국 is not disclosed
    assert client.post("/api/v1/market/product-rates/alerts", json={"watch": [{"kind": "x", "company": "a", "productCode": "b"}]}).status_code == 422
