from datetime import date
from decimal import Decimal

from fastapi.testclient import TestClient

from app.calculators.loan import equal_payment_cost, interest_only_cost
from app.collectors.finlife import FinlifeError
from app.collectors.finlife_loan import LoanRate, parse_loan_page
from app.core.config import Settings
from app.services.daily_jobs import JobResult, collect_loans
from app.services.loan_service import save_loans

URL = "/api/v1/loan-products"


def _loan(company="우리은행", code="1", repay="만기일시상환방식", rate_type="변동금리", low="3.5", high="4.5", group="은행", name="전세론") -> LoanRate:
    return LoanRate(
        group=group, company=company, product_code=code, product_name=name, repay_type=repay, rate_type=rate_type,
        rate_min=Decimal(low), rate_max=Decimal(high), loan_limit="최대 2억원", early_repay_fee="면제", delay_rate="+3%",
        join_way="영업점", disclosed_month="202610",
    )


def test_interest_only_cost_is_the_yearly_interest_spread_over_the_term() -> None:
    cost = interest_only_cost(100_000_000, 24, Decimal("4"))

    assert (cost.monthly, cost.total_interest) == (333_333, 8_000_000)
    assert interest_only_cost(100_000_000, 12, Decimal("-1")).total_interest == 0


def test_equal_payment_cost_matches_a_month_by_month_schedule() -> None:
    cost = equal_payment_cost(100_000_000, 12, Decimal("4"))

    balance, paid, monthly_rate = Decimal(100_000_000), Decimal(0), Decimal("4") / 1200
    for _ in range(12):
        interest = balance * monthly_rate
        paid += interest
        balance -= Decimal(cost.monthly) - interest
    assert abs(balance) < 20  # the monthly payment is rounded to the won
    assert abs(cost.total_interest - paid) < 20
    assert equal_payment_cost(12_000_000, 12, Decimal("0")).monthly == 1_000_000


def test_parse_keeps_one_row_per_option_with_both_rates() -> None:
    payload = {"result": {"err_cd": "000", "max_page_no": 1, "baseList": [
        {"fin_prdt_cd": "A", "kor_co_nm": "우리은행", "fin_prdt_nm": "전세론", "loan_lmt": "최대4억", "erly_rpay_fee": "면제", "dly_rate": "+3%", "join_way": "영업점", "dcls_month": "202610"},
    ], "optionList": [
        {"fin_prdt_cd": "A", "rpay_type_nm": "분할상환방식", "lend_rate_type_nm": "변동금리", "lend_rate_min": 4.04, "lend_rate_max": 4.74},
        {"fin_prdt_cd": "A", "rpay_type_nm": "분할상환방식", "lend_rate_type_nm": "고정금리", "lend_rate_min": None, "lend_rate_max": 5.1},
        {"fin_prdt_cd": "A", "rpay_type_nm": "분할상환방식", "lend_rate_type_nm": "고정금리", "lend_rate_min": None, "lend_rate_max": None},
        {"fin_prdt_cd": "ZZ", "rpay_type_nm": "x", "lend_rate_type_nm": "y", "lend_rate_min": 1, "lend_rate_max": 2},
    ]}}

    loans, pages = parse_loan_page(payload, "020000")

    assert pages == 1
    assert [(loan.rate_type, loan.rate_min, loan.rate_max) for loan in loans] == [
        ("변동금리", Decimal("4.04"), Decimal("4.74")), ("고정금리", Decimal("5.1"), Decimal("5.1")),
    ]
    assert loans[0].company == "우리은행" and loans[0].group == "은행"


def test_loan_products_cost_each_product_at_both_rates_and_sort_by_the_lowest_total(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        save_loans(session, date(2026, 11, 3), [
            _loan(code="1", low="4", high="5", name="높은 전세론"),
            _loan(code="2", low="3", high="3.5", name="낮은 전세론"),
            _loan(code="3", repay="분할상환방식", low="3.2", high="3.8", name="분할 전세론"),
            _loan(code="4", group="저축은행", company="OK저축은행", name="저축은행 전세론"),
        ])

    body = client.post(URL, json={"principal": 100_000_000, "months": 24}).json()

    assert body["count"] == 3 and body["day"] == "2026-11-03" and body["group"] == "은행"
    names = [row["productName"] for row in body["products"]]
    assert names == ["분할 전세론", "낮은 전세론", "높은 전세론"]  # paying the principal down costs less interest
    low = body["products"][1]
    assert (low["monthlyLabel"], low["monthlyMin"], low["monthlyMax"]) == ("월 이자", 250_000, 291_667)
    assert (low["totalInterestMin"], low["totalInterestMax"]) == (6_000_000, 7_000_000)
    assert body["products"][0]["monthlyLabel"] == "월 상환액"

    only_interest = client.post(URL, json={"principal": 100_000_000, "months": 24, "repay": "interest_only", "rateType": "fixed"}).json()
    assert only_interest["count"] == 0
    savings_bank = client.post(URL, json={"principal": 100_000_000, "months": 24, "group": "savings_bank"}).json()
    assert [row["company"] for row in savings_bank["products"]] == ["OK저축은행"]


def test_loan_products_reject_amounts_and_terms_out_of_range(client: TestClient) -> None:
    assert client.post(URL, json={"principal": 10, "months": 24}).status_code == 422
    assert client.post(URL, json={"principal": 100_000_000, "months": 600}).status_code == 422


def test_saving_loans_keeps_the_old_list_when_a_disclosure_comes_back_empty_or_a_group_fails(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        assert save_loans(session, date(2026, 11, 3), [_loan(), _loan()]) == 1
        assert save_loans(session, date(2026, 11, 4), []) == 0

        def fetch(_key: str, group: str) -> list[LoanRate]:
            if group == "030300":
                raise FinlifeError("down")
            return [_loan(code="9")]

        result = JobResult("news")
        collect_loans(Settings(finlife_api_key="x"), session, result, date(2026, 11, 5), fetch)
        assert result.failures and not any("전세자금대출" in note for note in result.notes)

    body = client.post(URL, json={"principal": 100_000_000, "months": 12}).json()
    assert body["count"] == 1 and body["day"] == "2026-11-03"


def test_guarantee_body_is_read_from_the_product_name_and_can_filter(client: TestClient) -> None:
    from app.services.loan_service import guarantee_of

    assert [guarantee_of(name) for name in (
        "NH전세대출(서울보증보험)", "우리전세론(주택금융보증)", "IBK전세대출 (HUG)", "카카오 HF 전월세보증금 대출", "SGI 전월세보증금 대출",
        "NH전세대출(주택도시보증공사)", "KB주택전세자금대출", "Sh전세금안심대출",
    )] == ["서울보증보험", "주택금융공사", "주택도시보증공사", "주택금융공사", "서울보증보험", "주택도시보증공사", "", ""]

    with client.app.state.session_factory() as session:
        save_loans(session, date(2026, 11, 3), [
            _loan(code="1", name="가전세(서울보증보험)"), _loan(code="2", name="나전세(주택금융공사)"), _loan(code="3", name="다전세"),
        ])
    everything = client.post(URL, json={"principal": 100_000_000, "months": 24}).json()["products"]
    assert {row["productName"]: row["guarantee"] for row in everything} == {"가전세(서울보증보험)": "서울보증보험", "나전세(주택금융공사)": "주택금융공사", "다전세": ""}
    only = client.post(URL, json={"principal": 100_000_000, "months": 24, "guarantee": "hf"}).json()
    assert [row["productName"] for row in only["products"]] == ["나전세(주택금융공사)"]
